import { ArenaConfig } from '../config/arenaConfig';
import {
  AttackConfig,
  ClassAbilityConfig,
  KNIGHT_CLASSES,
  KnightClassConfig,
  KnightClassId,
} from '../config/classes';
import { CharacterBody } from './CharacterBody';
import { clamp, forwardFromYaw, rotateTowardsAngle, yawFromDir } from './math';

export type FighterState =
  | 'Idle'
  | 'Moving'
  | 'Attacking'
  | 'HeavyAttacking'
  | 'Blocking'
  | 'Dodging'
  | 'HitReaction'
  | 'Stunned'
  | 'Dead';

export type AttackPhase = 'None' | 'Windup' | 'Active' | 'Recovery';

export interface FighterInputIntent {
  moveX: number; // World X [-1..1]
  moveZ: number; // World Z [-1..1]
  aimYaw: number; // Desired horizontal facing (e.g. camera yaw or target yaw)
  hasAimOverride: boolean; // True when blocking/charging/aiming toward camera/target
  sprint: boolean;
  attackHeld: boolean; // Hold for heavy charge, release early for light attack
  lightAttackTap: boolean; // Immediate light attack request (used by bots or quick tap)
  heavyAttackRequest: boolean; // Explicit heavy attack request (used by bots/tests)
  blockHeld: boolean;
  dodgePressed: boolean;
  jumpPressed?: boolean;
  ability1Pressed?: boolean;
  ability2Pressed?: boolean;
}

export function createEmptyIntent(yaw = 0): FighterInputIntent {
  return {
    moveX: 0,
    moveZ: 0,
    aimYaw: yaw,
    hasAimOverride: false,
    sprint: false,
    attackHeld: false,
    lightAttackTap: false,
    heavyAttackRequest: false,
    blockHeld: false,
    dodgePressed: false,
    jumpPressed: false,
    ability1Pressed: false,
    ability2Pressed: false,
  };
}

export interface FighterStatsTracker {
  kills: number;
  damageDealt: number;
  damageTaken: number;
  blocksSucceeded: number;
  survivalTime: number;
  eliminatedOrder: number | null; // 1 = first eliminated, etc.
  killerId: string | null;
}

export class Fighter {
  public readonly id: string;
  public readonly displayName: string;
  public readonly isHuman: boolean;
  public readonly classId: KnightClassId;
  public readonly config: KnightClassConfig;
  public readonly body: CharacterBody;

  public yaw: number;
  public hp: number;
  public readonly maxHp: number;
  public stamina: number;
  public readonly maxStamina: number;

  public state: FighterState = 'Idle';
  public stateTimer = 0;

  // Stamina regen delay timer
  public staminaRegenTimer = 0;
  public isSprinting = false;

  // Charging LMB state (while still in Idle/Moving before committing to light/heavy)
  public isChargingHeavy = false;
  public chargeTimer = 0;
  private prevAttackHeld = false;
  private prevBlockHeld = false;

  // Attack & Class Ability execution data
  public activeAttack: AttackConfig | null = null;
  public activeAbility: ClassAbilityConfig | null = null;
  public readonly abilityCooldowns: [number, number] = [0, 0];
  public abilityPulseAccum = 0;
  public pendingDaggerProjectile = false;

  // Active class buff timers
  public damageAuraTimer = 0; // Sword [2]: +25% damage
  public hasteTimer = 0; // Dual [2]: +25% movement speed
  public ironBastionTimer = 0; // Hammer [2]: -35% incoming damage + hyper-armor

  public attackPhase: AttackPhase = 'None';
  public attackPhaseTimer = 0;
  public swingInstanceId = 0;
  public readonly hitTargetsThisSwing = new Set<string>();
  public comboIndex = 0;
  public activeComboStep = 0;
  public comboResetTimer = 0;

  // Defense / parry / deflect data
  public blockElapsed = 0;
  public blockImpactTimer = 0;
  public defenseLockoutTimer = 0;
  public deflectPulsePending = false;

  // Dodge / shield shove & Jump data
  public dodgeDirX = 0;
  public dodgeDirZ = 1;
  public dodgeElapsed = 0;
  public shoveHitIds = new Set<string>();
  public jumpCooldownTimer = 0;
  public landingTimer = 0;

  // Visual / feedback helpers
  public hitFlashTimer = 0;
  public footstepAccum = 0;
  public animTime = 0;
  public stats: FighterStatsTracker = {
    kills: 0,
    damageDealt: 0,
    damageTaken: 0,
    blocksSucceeded: 0,
    survivalTime: 0,
    eliminatedOrder: null,
    killerId: null,
  };

  constructor(params: {
    id: string;
    displayName: string;
    isHuman: boolean;
    classId: KnightClassId;
    x: number;
    y?: number;
    z: number;
    yaw: number;
  }) {
    this.id = params.id;
    this.displayName = params.displayName;
    this.isHuman = params.isHuman;
    this.classId = params.classId;
    this.config = KNIGHT_CLASSES[params.classId];

    this.body = new CharacterBody(
      params.x,
      params.z,
      this.config.visual.capsuleRadius,
      params.y ?? 0
    );
    this.yaw = params.yaw;

    this.maxHp = this.config.maxHp;
    this.hp = this.maxHp;
    this.maxStamina = this.config.stamina.max;
    this.stamina = this.maxStamina;
  }

  public get isAlive(): boolean {
    return this.state !== 'Dead' && this.hp > 0;
  }

  public get isHitboxActive(): boolean {
    return (
      this.isAlive &&
      (this.state === 'Attacking' || this.state === 'HeavyAttacking') &&
      this.attackPhase === 'Active' &&
      this.activeAttack !== null
    );
  }

  public get hasDodgeIframes(): boolean {
    if (
      this.state === 'Dodging' &&
      this.dodgeElapsed <= this.config.dodge.iframesDuration
    ) {
      return true;
    }
    if (
      this.activeAbility?.id === 'spear_sweep' &&
      this.attackPhase === 'Recovery' &&
      this.attackPhaseTimer > 0.1
    ) {
      return true;
    }
    return false;
  }

  public get hasFrontalAbilityGuard(): boolean {
    return Boolean(
      this.isAlive &&
        this.activeAbility?.frontalGuardDuringActive &&
        (this.attackPhase === 'Windup' || this.attackPhase === 'Active')
    );
  }

  public canUseAbility(slot: 1 | 2): boolean {
    const ab = this.config.abilities[slot - 1];
    return (
      this.isAlive &&
      this.abilityCooldowns[slot - 1] <= 0 &&
      this.canSpendStamina(ab.staminaCost)
    );
  }

  public get chargeRatio(): number {
    if (!this.isChargingHeavy) return 0;
    return clamp(this.chargeTimer / this.config.heavyChargeThreshold, 0, 1);
  }

  public canSpendStamina(cost: number): boolean {
    return this.stamina >= cost - 1e-4;
  }

  public spendStamina(cost: number): boolean {
    if (cost <= 0) return true;
    if (this.stamina < cost - 1e-4) return false;
    this.stamina = Math.max(0, this.stamina - cost);
    this.staminaRegenTimer = this.config.stamina.regenDelay;
    return true;
  }

  public drainStaminaClamped(amount: number): void {
    if (amount <= 0) return;
    this.stamina = Math.max(0, this.stamina - amount);
    this.staminaRegenTimer = this.config.stamina.regenDelay;
  }

  /**
   * Main per-tick simulation update for this fighter.
   */
  public update(
    dt: number,
    intent: FighterInputIntent,
    arena: ArenaConfig,
    combatEnabled: boolean
  ): {
    stepped: boolean;
    jumped: boolean;
    landed: boolean;
    swungAttack: AttackConfig | null;
    usedAbility: ClassAbilityConfig | null;
  } {
    let stepped = false;
    let jumped = false;
    let swungAttack: AttackConfig | null = null;
    let usedAbility: ClassAbilityConfig | null = null;

    this.animTime += dt;
    if (this.abilityCooldowns[0] > 0) {
      this.abilityCooldowns[0] = Math.max(0, this.abilityCooldowns[0] - dt);
    }
    if (this.abilityCooldowns[1] > 0) {
      this.abilityCooldowns[1] = Math.max(0, this.abilityCooldowns[1] - dt);
    }
    if (this.damageAuraTimer > 0) {
      this.damageAuraTimer = Math.max(0, this.damageAuraTimer - dt);
    }
    if (this.hasteTimer > 0) {
      this.hasteTimer = Math.max(0, this.hasteTimer - dt);
    }
    if (this.ironBastionTimer > 0) {
      this.ironBastionTimer = Math.max(0, this.ironBastionTimer - dt);
    }
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
    }
    if (this.blockImpactTimer > 0) {
      this.blockImpactTimer = Math.max(0, this.blockImpactTimer - dt);
    }
    if (this.jumpCooldownTimer > 0) {
      this.jumpCooldownTimer = Math.max(0, this.jumpCooldownTimer - dt);
    }
    if (this.landingTimer > 0) {
      this.landingTimer = Math.max(0, this.landingTimer - dt);
    }
    if (this.defenseLockoutTimer > 0) {
      this.defenseLockoutTimer = Math.max(0, this.defenseLockoutTimer - dt);
    }
    if (this.comboResetTimer > 0) {
      this.comboResetTimer = Math.max(0, this.comboResetTimer - dt);
      if (this.comboResetTimer <= 0) {
        this.comboIndex = 0;
      }
    }

    if (this.state === 'Dead') {
      this.body.vx = 0;
      this.body.vz = 0;
      this.body.moveAndSlide(dt, arena);
      return {
        stepped: false,
        jumped: false,
        landed: false,
        swungAttack: null,
        usedAbility: null,
      };
    }

    if (combatEnabled) {
      this.stats.survivalTime += dt;
    }

    const effectiveIntent = combatEnabled ? intent : createEmptyIntent(this.yaw);

    // Normalize input movement vector
    let mx = effectiveIntent.moveX;
    let mz = effectiveIntent.moveZ;
    const mLen = Math.hypot(mx, mz);
    if (mLen > 1) {
      mx /= mLen;
      mz /= mLen;
    }
    const hasMove = mLen > 0.08;

    // Handle state transitions & per-state logic
    switch (this.state) {
      case 'Idle':
      case 'Moving': {
        if (effectiveIntent.ability1Pressed && this.canUseAbility(1)) {
          usedAbility = this.startAbility(
            1,
            effectiveIntent.aimYaw,
            effectiveIntent.hasAimOverride
          );
          if (usedAbility) {
            swungAttack = usedAbility.attackProfile;
          }
          break;
        }
        if (effectiveIntent.ability2Pressed && this.canUseAbility(2)) {
          usedAbility = this.startAbility(
            2,
            effectiveIntent.aimYaw,
            effectiveIntent.hasAimOverride
          );
          if (usedAbility) {
            swungAttack = usedAbility.attackProfile;
          }
          break;
        }

        const started = this.handleNeutralInput(
          dt,
          effectiveIntent,
          mx,
          mz,
          hasMove
        );
        if (started) {
          swungAttack = started;
        }
        break;
      }

      case 'Blocking': {
        if (effectiveIntent.ability1Pressed && this.canUseAbility(1)) {
          usedAbility = this.startAbility(
            1,
            effectiveIntent.aimYaw,
            effectiveIntent.hasAimOverride
          );
          if (usedAbility) swungAttack = usedAbility.attackProfile;
          break;
        }
        if (effectiveIntent.ability2Pressed && this.canUseAbility(2)) {
          usedAbility = this.startAbility(
            2,
            effectiveIntent.aimYaw,
            effectiveIntent.hasAimOverride
          );
          if (usedAbility) swungAttack = usedAbility.attackProfile;
          break;
        }
        this.updateBlockingState(dt, effectiveIntent, mx, mz, hasMove);
        break;
      }

      case 'Dodging': {
        this.updateDodgingState(dt);
        break;
      }

      case 'Attacking':
      case 'HeavyAttacking': {
        // Allow responsive combo-cancel into an Ability [1]/[2] during late Recovery!
        if (this.attackPhase === 'Recovery' && this.attackPhaseTimer <= 0.12) {
          if (effectiveIntent.ability1Pressed && this.canUseAbility(1)) {
            usedAbility = this.startAbility(
              1,
              effectiveIntent.aimYaw,
              effectiveIntent.hasAimOverride
            );
            if (usedAbility) swungAttack = usedAbility.attackProfile;
            break;
          }
          if (effectiveIntent.ability2Pressed && this.canUseAbility(2)) {
            usedAbility = this.startAbility(
              2,
              effectiveIntent.aimYaw,
              effectiveIntent.hasAimOverride
            );
            if (usedAbility) swungAttack = usedAbility.attackProfile;
            break;
          }
        }
        this.updateAttackState(dt, effectiveIntent, mx, mz, hasMove);
        break;
      }

      case 'HitReaction':
      case 'Stunned': {
        this.isSprinting = false;
        this.isChargingHeavy = false;
        this.body.vx = 0;
        this.body.vz = 0;
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          this.state = 'Idle';
          this.stateTimer = 0;
        }
        break;
      }
    }

    // Regenerate stamina smoothly when allowed
    const blockingHoldDrain =
      this.state === 'Blocking' && this.config.defense.holdStaminaPerSec > 0;
    if (!this.isSprinting && !blockingHoldDrain && !this.isChargingHeavy) {
      let regenDt = dt;
      if (this.staminaRegenTimer > 0) {
        if (dt <= this.staminaRegenTimer) {
          this.staminaRegenTimer -= dt;
          regenDt = 0;
        } else {
          regenDt = dt - this.staminaRegenTimer;
          this.staminaRegenTimer = 0;
        }
      }
      if (regenDt > 0 && this.stamina < this.maxStamina) {
        this.stamina = Math.min(
          this.maxStamina,
          this.stamina + this.config.stamina.regenPerSec * regenDt
        );
      }
    }

    // Optional athletic Jump (Space) from Idle, Moving, or Blocking!
    if (
      effectiveIntent.jumpPressed &&
      this.body.isGrounded &&
      this.jumpCooldownTimer <= 0 &&
      (this.state === 'Idle' ||
        this.state === 'Moving' ||
        this.state === 'Blocking') &&
      this.spendStamina(9)
    ) {
      const jumpVel =
        this.classId === 'dual'
          ? 9.8
          : this.classId === 'hammer'
          ? 8.9
          : 9.4;
      if (this.body.jump(jumpVel)) {
        this.jumpCooldownTimer = 0.18;
        this.landingTimer = 0;
        jumped = true;
      }
    }

    // Integrate CharacterBody movement & vertical physics
    const prevX = this.body.x;
    const prevZ = this.body.z;
    this.body.moveAndSlide(dt, arena);

    const landed = this.body.justLanded;
    if (landed) {
      this.landingTimer = 0.24;
    }

    if (this.state === 'Moving' && this.body.isGrounded) {
      const moved = Math.hypot(this.body.x - prevX, this.body.z - prevZ);
      this.footstepAccum += moved;
      const stepStride = this.isSprinting ? 2.1 : 1.75;
      if (this.footstepAccum >= stepStride) {
        this.footstepAccum = 0;
        stepped = true;
      }
    } else {
      this.footstepAccum = 0;
    }

    this.prevAttackHeld = effectiveIntent.attackHeld;
    this.prevBlockHeld = effectiveIntent.blockHeld;

    return { stepped, jumped, landed, swungAttack, usedAbility };
  }

  private handleNeutralInput(
    dt: number,
    intent: FighterInputIntent,
    mx: number,
    mz: number,
    hasMove: boolean
  ): AttackConfig | null {
    // 1. Dodge check (Space) — highest priority escape
    if (intent.dodgePressed && this.canSpendStamina(this.config.dodge.staminaCost)) {
      this.isChargingHeavy = false;
      this.chargeTimer = 0;
      this.startDodge(mx, mz, hasMove, intent.aimYaw, intent.hasAimOverride);
      return null;
    }

    // 2. Block / Parry / Deflect check (RMB)
    const def = this.config.defense;
    const isTimedDefense =
      def.mode === 'timed_parry' || def.mode === 'spear_deflect';
    const wantsDefense = isTimedDefense
      ? intent.blockHeld && !this.prevBlockHeld
      : intent.blockHeld;

    if (
      wantsDefense &&
      this.defenseLockoutTimer <= 0 &&
      this.canSpendStamina(Math.max(def.entryStaminaCost, 2))
    ) {
      this.isChargingHeavy = false;
      this.chargeTimer = 0;
      this.startBlocking(intent.aimYaw, intent.hasAimOverride);
      return null;
    }

    // 3. Direct Heavy or Light requests (from AI or explicit tap)
    if (intent.heavyAttackRequest) {
      if (this.canSpendStamina(this.config.heavyAttack.staminaCost)) {
        this.isChargingHeavy = false;
        this.chargeTimer = 0;
        return this.startAttack(
          this.config.heavyAttack,
          intent.aimYaw,
          intent.hasAimOverride
        );
      }
    }

    if (intent.lightAttackTap) {
      const nextLight = this.peekNextLightAttack();
      if (this.canSpendStamina(nextLight.staminaCost)) {
        this.isChargingHeavy = false;
        this.chargeTimer = 0;
        return this.startLightComboAttack(intent.aimYaw, intent.hasAimOverride);
      }
    }

    // 4. LMB Hold-vs-Release Charge handling
    const attackJustPressed = intent.attackHeld && !this.prevAttackHeld;
    if (attackJustPressed) {
      // Begin charge evaluation if fighter has stamina for at least light attack
      const minCost = Math.min(
        this.peekNextLightAttack().staminaCost,
        this.config.heavyAttack.staminaCost
      );
      if (this.canSpendStamina(minCost)) {
        this.isChargingHeavy = true;
        this.chargeTimer = 0;
      }
    }

    if (this.isChargingHeavy) {
      if (intent.attackHeld) {
        this.chargeTimer += dt;
        // If held past heavy threshold & enough stamina -> launch Heavy Attack!
        if (this.chargeTimer >= this.config.heavyChargeThreshold) {
          this.isChargingHeavy = false;
          this.chargeTimer = 0;
          if (this.canSpendStamina(this.config.heavyAttack.staminaCost)) {
            return this.startAttack(
              this.config.heavyAttack,
              intent.aimYaw,
              intent.hasAimOverride
            );
          } else {
            const nextLight = this.peekNextLightAttack();
            if (this.canSpendStamina(nextLight.staminaCost)) {
              return this.startLightComboAttack(
                intent.aimYaw,
                intent.hasAimOverride
              );
            }
          }
        }
      } else {
        // Released before heavy threshold -> fast Light Attack!
        this.isChargingHeavy = false;
        this.chargeTimer = 0;
        const nextLight = this.peekNextLightAttack();
        if (this.canSpendStamina(nextLight.staminaCost)) {
          return this.startLightComboAttack(intent.aimYaw, intent.hasAimOverride);
        }
      }
    }

    // 5. Standard Locomotion + Sprinting
    const canSprint =
      intent.sprint &&
      hasMove &&
      !this.isChargingHeavy &&
      this.stamina > 1.5;

    this.isSprinting = canSprint;
    if (canSprint) {
      this.drainStaminaClamped(this.config.stamina.sprintCostPerSec * dt);
      if (this.stamina <= 0.1) {
        this.isSprinting = false;
      }
    }

    let speed = this.isSprinting
      ? this.config.sprintSpeed
      : this.config.moveSpeed;
    if (this.hasteTimer > 0) {
      speed *= 1.25; // Dual [2] Haste buff!
    }
    if (this.isChargingHeavy) {
      speed *= 0.62; // Slowed footwork while drawing weapon back for heavy strike
    }

    if (hasMove) {
      this.body.vx = mx * speed;
      this.body.vz = mz * speed;
      this.state = 'Moving';
    } else {
      this.body.vx = 0;
      this.body.vz = 0;
      this.state = 'Idle';
    }

    // Facing rotation: aim toward camera when charging, otherwise toward movement direction
    let targetYaw = this.yaw;
    if (this.isChargingHeavy && intent.hasAimOverride) {
      targetYaw = intent.aimYaw;
    } else if (hasMove) {
      targetYaw = yawFromDir(mx, mz, this.yaw);
    } else if (intent.hasAimOverride) {
      // Subtle idle alignment only if explicitly aiming
      targetYaw = this.yaw;
    }
    this.yaw = rotateTowardsAngle(
      this.yaw,
      targetYaw,
      this.config.turnSpeed * dt
    );

    return null;
  }

  private peekNextLightAttack(): AttackConfig {
    const combo = this.config.lightCombo;
    const idx = this.comboIndex % combo.length;
    return combo[idx];
  }

  private startLightComboAttack(
    aimYaw: number,
    hasAimOverride: boolean
  ): AttackConfig | null {
    const stepIdx = this.comboIndex % this.config.lightCombo.length;
    const attack = this.config.lightCombo[stepIdx];
    const res = this.startAttack(attack, aimYaw, hasAimOverride);
    if (res) {
      this.activeComboStep = stepIdx;
      this.comboIndex = (this.comboIndex + 1) % this.config.lightCombo.length;
    }
    return res;
  }

  public startAbility(
    slot: 1 | 2,
    aimYaw: number,
    hasAimOverride: boolean
  ): ClassAbilityConfig | null {
    const ab = this.config.abilities[slot - 1];
    if (this.abilityCooldowns[slot - 1] > 0) return null;
    if (!this.spendStamina(ab.staminaCost)) return null;

    this.abilityCooldowns[slot - 1] = ab.cooldown;

    if (hasAimOverride) {
      this.yaw = rotateTowardsAngle(this.yaw, aimYaw, 2.2);
    }

    this.isSprinting = false;
    this.isChargingHeavy = false;
    this.chargeTimer = 0;
    this.deflectPulsePending = false;

    this.activeAbility = ab;
    this.abilityPulseAccum = 0;
    this.pendingDaggerProjectile = false;

    const atk = ab.attackProfile;
    this.state = atk.isHeavy ? 'HeavyAttacking' : 'Attacking';
    this.activeAttack = atk;
    this.attackPhase = 'Windup';
    this.attackPhaseTimer = atk.windupDuration;
    this.swingInstanceId += 1;
    this.hitTargetsThisSwing.clear();

    this.body.vx = 0;
    this.body.vz = 0;
    return ab;
  }

  public startAttack(
    attack: AttackConfig,
    aimYaw: number,
    hasAimOverride: boolean
  ): AttackConfig | null {
    if (!this.spendStamina(attack.staminaCost)) {
      return null;
    }

    // Align slightly toward aim direction at the start of windup (capped to avoid 180 snap on heavy)
    if (hasAimOverride) {
      const initialSnapLimit = attack.isHeavy ? 0.65 : 1.35;
      this.yaw = rotateTowardsAngle(this.yaw, aimYaw, initialSnapLimit);
    }

    this.isSprinting = false;
    this.isChargingHeavy = false;
    this.chargeTimer = 0;
    this.activeAbility = null;
    this.abilityPulseAccum = 0;

    this.state = attack.isHeavy ? 'HeavyAttacking' : 'Attacking';
    this.activeAttack = attack;
    this.attackPhase = 'Windup';
    this.attackPhaseTimer = attack.windupDuration;
    this.swingInstanceId += 1;
    this.hitTargetsThisSwing.clear();

    this.body.vx = 0;
    this.body.vz = 0;
    return attack;
  }

  private updateAttackState(
    dt: number,
    intent: FighterInputIntent,
    mx = 0,
    mz = 0,
    hasMove = false
  ): void {
    const attack = this.activeAttack;
    if (!attack) {
      this.activeAbility = null;
      this.state = 'Idle';
      this.attackPhase = 'None';
      return;
    }

    const ab = this.activeAbility;
    this.attackPhaseTimer -= dt;

    if (this.attackPhase === 'Windup') {
      // Controlled, strictly rate-limited turning only during Windup!
      if (intent.hasAimOverride) {
        this.yaw = rotateTowardsAngle(
          this.yaw,
          intent.aimYaw,
          attack.maxTurnRateWindup * dt
        );
      }
      const fwd = forwardFromYaw(this.yaw);
      this.body.vx = fwd.x * (attack.lungeSpeed * 0.22);
      this.body.vz = fwd.z * (attack.lungeSpeed * 0.22);

      if (this.attackPhaseTimer <= 0) {
        const overflow = -this.attackPhaseTimer;
        this.attackPhase = 'Active';
        this.attackPhaseTimer = Math.max(0.01, attack.activeDuration - overflow);

        // Apply on-activation Class Ability effects!
        if (ab) {
          if (ab.healAmount) {
            this.hp = clamp(this.hp + ab.healAmount, 0, this.maxHp);
          }
          if (ab.staminaRestore) {
            this.stamina = clamp(
              this.stamina + ab.staminaRestore,
              0,
              this.maxStamina
            );
          }
          if (ab.buffKind === 'damage_aura') {
            this.damageAuraTimer = ab.buffDuration ?? 5.0;
          } else if (ab.buffKind === 'haste') {
            this.hasteTimer = ab.buffDuration ?? 3.5;
          } else if (ab.buffKind === 'iron_bastion') {
            this.ironBastionTimer = ab.buffDuration ?? 5.5;
          }
          if (ab.spawnsProjectile) {
            this.pendingDaggerProjectile = true;
          }
        }
      }
    } else if (this.attackPhase === 'Active') {
      // Normal attacks lock facing & trajectory; steerable abilities allow controlled steering!
      if (ab?.steerableDuringActive) {
        if (ab.id === 'dual_cyclone') {
          if (hasMove) {
            this.body.vx = mx * attack.lungeSpeed;
            this.body.vz = mz * attack.lungeSpeed;
          } else {
            const fwd = forwardFromYaw(this.yaw);
            this.body.vx = fwd.x * (attack.lungeSpeed * 0.55);
            this.body.vz = fwd.z * (attack.lungeSpeed * 0.55);
          }
        } else {
          // Hammer Siege Ram: slight steering while charging forward!
          if (intent.hasAimOverride) {
            this.yaw = rotateTowardsAngle(this.yaw, intent.aimYaw, 1.9 * dt);
          }
          const fwd = forwardFromYaw(this.yaw);
          this.body.vx = fwd.x * attack.lungeSpeed;
          this.body.vz = fwd.z * attack.lungeSpeed;
        }
      } else {
        const fwd = forwardFromYaw(this.yaw);
        this.body.vx = fwd.x * attack.lungeSpeed;
        this.body.vz = fwd.z * attack.lungeSpeed;
      }

      // Multi-hit spinning ability pulse (Dual [1] Blade Cyclone)
      if (ab?.multiHitTicks && ab.multiHitTicks > 1) {
        const tickInterval = attack.activeDuration / ab.multiHitTicks;
        this.abilityPulseAccum += dt;
        if (this.abilityPulseAccum >= tickInterval) {
          this.abilityPulseAccum -= tickInterval;
          this.hitTargetsThisSwing.clear();
        }
      }

      if (this.attackPhaseTimer <= 0) {
        const overflow = -this.attackPhaseTimer;
        this.attackPhase = 'Recovery';
        this.attackPhaseTimer = Math.max(0.01, attack.recoveryDuration - overflow);
      }
    } else if (this.attackPhase === 'Recovery') {
      const remRatio = clamp(
        this.attackPhaseTimer / Math.max(0.05, attack.recoveryDuration),
        0,
        1
      );
      const fwd = forwardFromYaw(this.yaw);

      if (ab?.backVaultSpeed) {
        // Spear [2] Sweep Vault: spring backward onto safe polearm spacing!
        const vaultVel = ab.backVaultSpeed * (0.4 + 0.6 * remRatio);
        this.body.vx = -fwd.x * vaultVel;
        this.body.vz = -fwd.z * vaultVel;
      } else {
        const glideSpeed = attack.lungeSpeed * 0.28 * remRatio * remRatio;
        this.body.vx = fwd.x * glideSpeed;
        this.body.vz = fwd.z * glideSpeed;
      }

      if (this.attackPhaseTimer <= 0) {
        this.activeAttack = null;
        this.activeAbility = null;
        this.attackPhase = 'None';
        this.state = 'Idle';
        this.comboResetTimer = this.config.comboWindow;
      }
    }
  }

  private startBlocking(aimYaw: number, hasAimOverride: boolean): void {
    const def = this.config.defense;
    if (def.entryStaminaCost > 0 && !this.spendStamina(def.entryStaminaCost)) {
      return;
    }

    if (hasAimOverride) {
      this.yaw = rotateTowardsAngle(this.yaw, aimYaw, 1.8);
    }

    this.isSprinting = false;
    this.state = 'Blocking';
    this.blockElapsed = 0;
    this.deflectPulsePending = def.mode === 'spear_deflect';
  }

  private updateBlockingState(
    dt: number,
    intent: FighterInputIntent,
    mx: number,
    mz: number,
    hasMove: boolean
  ): void {
    const def = this.config.defense;
    this.blockElapsed += dt;

    // Allow dodge cancel out of sustained block
    if (intent.dodgePressed && this.canSpendStamina(this.config.dodge.staminaCost)) {
      this.startDodge(mx, mz, hasMove, intent.aimYaw, intent.hasAimOverride);
      return;
    }

    // Rotate guard toward aim direction
    if (intent.hasAimOverride) {
      this.yaw = rotateTowardsAngle(
        this.yaw,
        intent.aimYaw,
        this.config.turnSpeed * 0.75 * dt
      );
    } else if (hasMove) {
      this.yaw = rotateTowardsAngle(
        this.yaw,
        yawFromDir(mx, mz, this.yaw),
        this.config.turnSpeed * 0.65 * dt
      );
    }

    // Cautious strafe movement while blocking
    const moveFactor =
      def.mode === 'timed_parry' || def.mode === 'spear_deflect' ? 0.25 : 0.45;
    if (hasMove) {
      this.body.vx = mx * this.config.moveSpeed * moveFactor;
      this.body.vz = mz * this.config.moveSpeed * moveFactor;
    } else {
      this.body.vx = 0;
      this.body.vz = 0;
    }

    if (def.holdStaminaPerSec > 0) {
      this.drainStaminaClamped(def.holdStaminaPerSec * dt);
      if (this.stamina <= 0.2) {
        this.exitBlocking();
        return;
      }
    }

    const isFiniteWindow = Number.isFinite(def.activeWindow);
    if (isFiniteWindow) {
      if (this.blockElapsed >= def.activeWindow) {
        this.exitBlocking();
      }
    } else if (!intent.blockHeld) {
      this.exitBlocking();
    }
  }

  private exitBlocking(): void {
    this.state = 'Idle';
    this.defenseLockoutTimer = this.config.defense.recoveryLockout;
    this.deflectPulsePending = false;
  }

  private startDodge(
    mx: number,
    mz: number,
    hasMove: boolean,
    aimYaw: number,
    hasAimOverride: boolean
  ): void {
    const dodge = this.config.dodge;
    if (!this.spendStamina(dodge.staminaCost)) return;

    this.isSprinting = false;
    this.activeAttack = null;
    this.activeAbility = null;
    this.attackPhase = 'None';
    this.state = 'Dodging';
    this.dodgeElapsed = 0;
    this.shoveHitIds.clear();

    if (hasMove) {
      this.dodgeDirX = mx;
      this.dodgeDirZ = mz;
      if (dodge.mode !== 'backstep') {
        this.yaw = yawFromDir(mx, mz, this.yaw);
      }
    } else {
      const refYaw = hasAimOverride ? aimYaw : this.yaw;
      const fwd = forwardFromYaw(refYaw);
      if (dodge.defaultBackward) {
        // Spear's signature backstep!
        this.dodgeDirX = -fwd.x;
        this.dodgeDirZ = -fwd.z;
        this.yaw = refYaw;
      } else {
        this.dodgeDirX = fwd.x;
        this.dodgeDirZ = fwd.z;
        this.yaw = refYaw;
      }
    }
  }

  private updateDodgingState(dt: number): void {
    const dodge = this.config.dodge;
    this.dodgeElapsed += dt;

    // Smooth burst curve (fast initial burst, slight taper at end)
    const t = clamp(this.dodgeElapsed / dodge.duration, 0, 1);
    const speedCurve = 1.18 - 0.55 * t;
    this.body.vx = this.dodgeDirX * dodge.speed * speedCurve;
    this.body.vz = this.dodgeDirZ * dodge.speed * speedCurve;

    if (this.dodgeElapsed >= dodge.duration) {
      this.body.vx = 0;
      this.body.vz = 0;
      this.state = 'Idle';
    }
  }

  public applyStun(duration: number): void {
    if (!this.isAlive) return;
    this.activeAttack = null;
    this.activeAbility = null;
    this.attackPhase = 'None';
    this.isChargingHeavy = false;
    this.isSprinting = false;
    this.body.vx = 0;
    this.body.vz = 0;
    this.state = 'Stunned';
    this.stateTimer = Math.max(this.stateTimer, duration);
  }

  public applyHitReaction(duration: number, canInterrupt: boolean): void {
    if (!this.isAlive) return;
    if (this.ironBastionTimer > 0) {
      // Iron Bastion buff prevents hit-stagger!
      return;
    }
    if (
      (this.state === 'Attacking' || this.state === 'HeavyAttacking') &&
      this.activeAttack &&
      !this.activeAttack.interruptible &&
      !canInterrupt
    ) {
      // Uninterruptible hyperarmor continues swinging!
      return;
    }

    if (this.state === 'Stunned') {
      return;
    }

    this.activeAttack = null;
    this.activeAbility = null;
    this.attackPhase = 'None';
    this.isChargingHeavy = false;
    this.isSprinting = false;
    this.body.vx = 0;
    this.body.vz = 0;
    this.state = 'HitReaction';
    this.stateTimer = duration;
  }

  public takeRawDamage(amount: number, attackerId: string | null): boolean {
    if (!this.isAlive) return false;
    const clampedDamage = Math.max(0, amount);
    this.hp = clamp(this.hp - clampedDamage, 0, this.maxHp);
    this.stats.damageTaken += clampedDamage;
    this.hitFlashTimer = 0.16;

    if (this.hp <= 0) {
      this.hp = 0;
      this.state = 'Dead';
      this.activeAttack = null;
      this.activeAbility = null;
      this.attackPhase = 'None';
      this.isChargingHeavy = false;
      this.isSprinting = false;
      this.body.vx = 0;
      this.body.vz = 0;
      this.stats.killerId = attackerId;
      return true;
    }
    return false;
  }
}
