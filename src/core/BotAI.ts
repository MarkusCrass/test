import { ArenaConfig, StairRamp } from '../config/arenaConfig';
import { ThrownProjectile } from './CombatSystem';
import {
  createEmptyIntent,
  Fighter,
  FighterInputIntent,
} from './Fighter';
import {
  angleDiff,
  clamp,
  distXZ,
  isLineBlockedByPillars,
  yawFromDir,
} from './math';

export type BotAIState =
  | 'SearchingTarget'
  | 'Approaching'
  | 'Flanking'
  | 'MaintainingDistance'
  | 'Retreating'
  | 'Attacking'
  | 'Blocking'
  | 'Dodging'
  | 'Recovering'
  | 'Stunned'
  | 'Dead';

interface IncomingThreat {
  yawToThreat: number;
  unblockable: boolean;
  dist: number;
  isProjectile: boolean;
  isNearImpact: boolean;
  attacker: Fighter | null;
}

interface CrowdAssessment {
  nearbyEnemies: number;
  crowdCenterX: number;
  crowdCenterZ: number;
  escapeDirX: number;
  escapeDirZ: number;
  nearestThirdParty: Fighter | null;
}

/**
 * Tactical Medieval Arena Bot Controller:
 * - Omni-directional threat perception (reacts to ANY swinging attacker or flying dagger, not only primary target)
 * - Anti-center-brawl & crowd-skirting positioning (avoids getting sandwiched in 3+ fighter pileups, uses pillars & Tier-2 bastions)
 * - Stamina & HP self-preservation (disengages to regenerate stamina or pop Sword [2] heal before re-entering)
 * - Whiff-punish, hyper-armor spacing, guard-break against turtles, and opportunistic low-HP finishers
 */
export class BotController {
  public readonly fighter: Fighter;
  public aiState: BotAIState = 'SearchingTarget';
  public targetId: string | null = null;

  private decisionTimer = 0;
  private retargetTimer = 0;
  private attackCooldown = 0.25;
  private defenseCooldown = 0.35;
  private activeBlockHoldTimer = 0;
  private comboBurstRemaining = 0;
  private queuedHeavy = false;
  private strafeSign = 1;
  private strafeSwitchTimer = 1.8;

  // Each bot has a preferred tactical zone bias so 4 bots spread naturally across outer wings & bastions
  private readonly homeAnchorAngle: number;
  private highGroundRetreatTimer = 0;

  // Observable threat perception (fair human-like reaction window)
  private observedThreatTime = 0;
  private reactionThreshold = 0.14;
  private lastDamagedById: string | null = null;
  private lastDamagedMemoryTimer = 0;

  private readonly rng: () => number;

  constructor(fighter: Fighter, rng: () => number = Math.random) {
    this.fighter = fighter;
    this.rng = rng;
    this.strafeSign = this.rng() < 0.5 ? 1 : -1;
    this.decisionTimer = 0.08 + this.rng() * 0.16;
    this.reactionThreshold = 0.11 + this.rng() * 0.09;
    this.homeAnchorAngle = this.rng() * Math.PI * 2;
  }

  public notifyDamagedBy(attackerId: string): void {
    this.lastDamagedById = attackerId;
    this.lastDamagedMemoryTimer = 5.5;
    this.retargetTimer = Math.min(this.retargetTimer, 0.16 + this.rng() * 0.16);
  }

  public update(
    dt: number,
    allFighters: Fighter[],
    botTargetCounts: Map<string, number>,
    arena: ArenaConfig,
    combatEnabled: boolean,
    projectiles: ThrownProjectile[] = []
  ): FighterInputIntent {
    const self = this.fighter;
    const intent = createEmptyIntent(self.yaw);

    if (!self.isAlive) {
      this.aiState = 'Dead';
      this.targetId = null;
      return intent;
    }

    if (!combatEnabled) {
      this.aiState = 'SearchingTarget';
      return intent;
    }

    // Tick internal timers
    this.decisionTimer -= dt;
    this.retargetTimer -= dt;
    this.highGroundRetreatTimer = Math.max(0, this.highGroundRetreatTimer - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.defenseCooldown = Math.max(0, this.defenseCooldown - dt);
    this.activeBlockHoldTimer = Math.max(0, this.activeBlockHoldTimer - dt);
    this.lastDamagedMemoryTimer = Math.max(0, this.lastDamagedMemoryTimer - dt);
    if (this.lastDamagedMemoryTimer <= 0) {
      this.lastDamagedById = null;
    }

    this.strafeSwitchTimer -= dt;
    if (this.strafeSwitchTimer <= 0) {
      this.strafeSwitchTimer = 1.4 + this.rng() * 2.0;
      if (this.rng() < 0.65) {
        this.strafeSign *= -1;
      }
    }

    // Physical Stun / HitReaction sync
    if (self.state === 'Stunned' || self.state === 'HitReaction') {
      this.aiState = 'Stunned';
      this.comboBurstRemaining = 0;
      this.activeBlockHoldTimer = 0;
      return intent;
    }

    if (self.state === 'Dodging') {
      this.aiState = 'Dodging';
      return intent;
    }

    // Assess surrounding crowd & omni-directional incoming attacks/projectiles!
    const crowd = this.assessCrowd(allFighters);
    const threat = this.scanIncomingThreat(allFighters, arena, projectiles);

    if (threat) {
      this.observedThreatTime += dt;
    } else {
      this.observedThreatTime = 0;
    }

    // 1. Acquire / refresh best tactical target
    let target = this.findFighterById(allFighters, this.targetId);
    const urgentFinishable = this.findNearbyFinishableEnemy(allFighters, arena);
    if (urgentFinishable && urgentFinishable.id !== this.targetId) {
      target = urgentFinishable;
      this.targetId = urgentFinishable.id;
      this.retargetTimer = 1.6;
    } else if (!target || !target.isAlive || this.retargetTimer <= 0) {
      target = this.selectBestTarget(allFighters, botTargetCounts, arena);
      this.targetId = target ? target.id : null;
      this.retargetTimer = 1.35 + this.rng() * 1.15;
    }

    if (!target) {
      this.aiState = 'SearchingTarget';
      return intent;
    }

    // 2. Active Attack / Ability Steering (e.g. Dual Cyclone or Hammer Ram)
    if (self.state === 'Attacking' || self.state === 'HeavyAttacking') {
      this.aiState =
        self.attackPhase === 'Recovery' ? 'Recovering' : 'Attacking';
      const tDx = target.body.x - self.body.x;
      const tDz = target.body.z - self.body.z;
      const tDist = Math.hypot(tDx, tDz);
      intent.aimYaw = yawFromDir(tDx, tDz, self.yaw);
      intent.hasAimOverride = true;

      if (self.activeAbility?.id === 'dual_cyclone' && tDist > 0.35) {
        intent.moveX = tDx / tDist;
        intent.moveZ = tDz / tDist;
      }

      // Responsive late-recovery cancel into defensive/finisher ability if needed!
      if (
        self.attackPhase === 'Recovery' &&
        self.attackPhaseTimer <= 0.11 &&
        tDist <= 2.9
      ) {
        if (self.classId === 'spear' && crowd.nearbyEnemies >= 1 && self.canUseAbility(2)) {
          intent.ability2Pressed = true;
        } else if (
          self.classId === 'sword' &&
          self.hp < self.maxHp * 0.72 &&
          self.canUseAbility(2)
        ) {
          intent.ability2Pressed = true;
        }
      }
      return intent;
    }

    // 3. Immediate Omni-Threat Defense (Blocks, Parries, Deflects & Dodges against ANY attacker or dagger!)
    if (
      threat &&
      (this.observedThreatTime >= this.reactionThreshold || threat.isNearImpact) &&
      this.defenseCooldown <= 0
    ) {
      this.observedThreatTime = 0;
      intent.aimYaw = threat.yawToThreat;
      intent.hasAimOverride = true;

      const handled = this.executeSmartDefense(
        intent,
        threat,
        crowd,
        arena,
        allFighters
      );
      if (handled) {
        return intent;
      }
    }

    // Continue holding sustained shield/sword block while enemy is still actively swinging at us
    if (this.activeBlockHoldTimer > 0 && self.stamina > 14) {
      if (threat || distXZ(self.body.x, self.body.z, target.body.x, target.body.z) < 3.4) {
        this.aiState = 'Blocking';
        const guardYaw = threat
          ? threat.yawToThreat
          : yawFromDir(
              target.body.x - self.body.x,
              target.body.z - self.body.z,
              self.yaw
            );
        intent.aimYaw = guardYaw;
        intent.hasAimOverride = true;
        intent.blockHeld = true;

        // Back-strafe away from crowd while blocking to minimize surround damage!
        const awayX = -Math.sin(guardYaw) * 0.55 - Math.cos(guardYaw) * 0.45 * this.strafeSign;
        const awayZ = -Math.cos(guardYaw) * 0.55 + Math.sin(guardYaw) * 0.45 * this.strafeSign;
        const steered = this.steerAvoidObstacles(awayX, awayZ, arena, allFighters);
        intent.moveX = steered.x;
        intent.moveZ = steered.z;
        return intent;
      } else {
        // Enemy stopped swinging -> drop block immediately to save & regenerate stamina!
        this.activeBlockHoldTimer = 0;
      }
    }

    // 4. Emergency Self-Heal / Escape Ability Check before navigation!
    const hpRatio = self.hp / self.maxHp;
    const stamRatio = self.stamina / self.maxStamina;

    if (
      self.classId === 'sword' &&
      self.canUseAbility(2) &&
      (hpRatio < 0.76 || (stamRatio < 0.35 && crowd.nearbyEnemies >= 1))
    ) {
      this.aiState = 'Attacking';
      intent.ability2Pressed = true;
      this.attackCooldown = 0.3;
      return intent;
    }

    if (
      self.classId === 'spear' &&
      crowd.nearbyEnemies >= 2 &&
      self.canUseAbility(2)
    ) {
      this.aiState = 'Attacking';
      intent.ability2Pressed = true;
      this.attackCooldown = 0.35;
      return intent;
    }

    // 5. Tactical High-Ground Retreat when outnumbered & wounded in the lower courtyard!
    if (
      self.body.y < 1.2 &&
      arena.stairs.length > 0 &&
      crowd.nearbyEnemies >= 2 &&
      hpRatio < 0.52 &&
      this.highGroundRetreatTimer <= 0
    ) {
      this.highGroundRetreatTimer = 3.2;
    }
    if (this.highGroundRetreatTimer > 0 && self.body.y < 3.5 && arena.stairs.length > 0) {
      this.aiState = 'Retreating';
      const navUp = this.computeClimbToNearestBastion(arena, allFighters);
      intent.moveX = navUp.moveX;
      intent.moveZ = navUp.moveZ;
      intent.aimYaw = navUp.aimYaw;
      intent.hasAimOverride = true;
      intent.sprint = self.stamina > 26;
      if (this.shouldVaultLowBarrier(intent.moveX, intent.moveZ, arena)) {
        intent.jumpPressed = true;
      }
      return intent;
    }

    // 6. Multi-Tier Vertical Navigation toward Target (Staircases & Skybridge Drop-Off!)
    const verticalGap = target.body.y - self.body.y;
    if (Math.abs(verticalGap) > 1.55 && arena.stairs && arena.stairs.length > 0) {
      this.aiState = 'Approaching';
      this.comboBurstRemaining = 0;
      this.queuedHeavy = false;
      const nav = this.computeVerticalTierMove(target, arena, allFighters);
      intent.moveX = nav.moveX;
      intent.moveZ = nav.moveZ;
      intent.aimYaw = nav.aimYaw;
      intent.hasAimOverride = true;
      intent.sprint = self.stamina > self.maxStamina * 0.35;
      if (this.shouldVaultLowBarrier(intent.moveX, intent.moveZ, arena)) {
        intent.jumpPressed = true;
      }
      return intent;
    }

    const dx = target.body.x - self.body.x;
    const dz = target.body.z - self.body.z;
    const dist = Math.hypot(dx, dz);
    const yawToTarget = yawFromDir(dx, dz, self.yaw);
    const lineBlocked = isLineBlockedByPillars(
      self.body.x,
      self.body.z,
      target.body.x,
      target.body.z,
      arena,
      0.05,
      Math.min(self.body.y, target.body.y)
    );

    intent.aimYaw = yawToTarget;
    intent.hasAimOverride = true;

    // Analyze target's vulnerability & danger state
    const targetPunishable =
      target.state === 'Stunned' ||
      target.state === 'HitReaction' ||
      ((target.state === 'Attacking' || target.state === 'HeavyAttacking') &&
        target.attackPhase === 'Recovery') ||
      target.stamina < 14;

    const targetDangerousHyperArmor =
      ((target.state === 'Attacking' || target.state === 'HeavyAttacking') &&
        (target.attackPhase === 'Windup' || target.attackPhase === 'Active') &&
        target.activeAttack !== null &&
        !target.activeAttack.interruptible) ||
      target.activeAbility?.id === 'dual_cyclone';

    // 7. Continue multi-hit light combo burst ONLY if safe & within reach!
    if (
      this.comboBurstRemaining > 0 &&
      !lineBlocked &&
      !targetDangerousHyperArmor &&
      target.state !== 'Blocking' &&
      dist <= self.config.lightCombo[0].range + target.body.radius + 0.35 &&
      self.stamina >= self.config.lightCombo[0].staminaCost + 8
    ) {
      this.comboBurstRemaining -= 1;
      this.aiState = 'Attacking';
      intent.lightAttackTap = true;
      this.attackCooldown =
        this.comboBurstRemaining > 0 ? 0.06 : 0.32 + this.rng() * 0.28;
      return intent;
    } else if (target.state === 'Blocking' || targetDangerousHyperArmor) {
      // Stop mashing light attacks into a shield or hyper-armor!
      this.comboBurstRemaining = 0;
    }

    // 8. Instant Opportunistic Whiff-Punish & Guard-Break Offense!
    if (targetPunishable && !lineBlocked && Math.abs(angleDiff(self.yaw, yawToTarget)) < 0.92) {
      this.attackCooldown = 0; // Zero hesitation on exposed targets!
    }

    const { minPreferred, maxPreferred, engageRange } = this.getClassRanges();

    // Respect enemy hyper-armor / spinning cyclone: space outside their swing radius and wait to whiff-punish!
    const shouldOutspaceDanger =
      targetDangerousHyperArmor &&
      self.ironBastionTimer <= 0 &&
      dist < (target.activeAttack?.range ?? 2.8) + 1.15;

    // Self-preservation stamina breather: don't swing our last drop of stamina unless finishing a low-HP target!
    const needsStaminaBreather =
      self.stamina < 24 && target.hp > 32 && !targetPunishable;

    if (
      !lineBlocked &&
      !shouldOutspaceDanger &&
      !needsStaminaBreather &&
      (this.decisionTimer <= 0 || targetPunishable)
    ) {
      this.decisionTimer = 0.1 + this.rng() * 0.14;
      const facingDiff = Math.abs(angleDiff(self.yaw, yawToTarget));

      // 8a. Tactical Signature Abilities [1] & [2] (high priority for punishes, guard-breaks & ranged pokes)
      if (facingDiff < 0.78) {
        const slot = this.chooseSmartAbilitySlot(
          dist,
          target,
          targetPunishable,
          crowd.nearbyEnemies
        );
        if (slot === 1 && self.canUseAbility(1)) {
          this.aiState = 'Attacking';
          intent.ability1Pressed = true;
          this.attackCooldown = 0.38 + this.rng() * 0.28;
          return intent;
        }
        if (slot === 2 && self.canUseAbility(2)) {
          this.aiState = 'Attacking';
          intent.ability2Pressed = true;
          this.attackCooldown = 0.38 + this.rng() * 0.28;
          return intent;
        }
      }

      // 8b. Weapon Strikes (Guard-Break Heavies, Whiff-Punish Heavies, or Clean Combos)
      if (
        this.attackCooldown <= 0 &&
        facingDiff < 0.9 &&
        dist <= Math.max(engageRange, self.config.heavyAttack.range * 0.92) + target.body.radius
      ) {
        const reserveStam = target.hp <= 35 ? 0 : 12;
        const targetIsTurtling =
          target.state === 'Blocking' &&
          Math.abs(
            angleDiff(
              target.yaw,
              yawFromDir(-dx, -dz, target.yaw)
            )
          ) < 1.1;

        if (targetIsTurtling) {
          // Break enemy block with Heavy Attack or Hammer Shield Shove instead of bouncing light hits!
          if (
            self.classId === 'hammer' &&
            dist < 2.0 &&
            self.canSpendStamina(self.config.dodge.staminaCost + reserveStam)
          ) {
            this.aiState = 'Dodging';
            intent.moveX = dx / Math.max(0.1, dist);
            intent.moveZ = dz / Math.max(0.1, dist);
            intent.dodgePressed = true;
            this.attackCooldown = 0.25;
            return intent;
          }
          if (
            dist <= self.config.heavyAttack.range + target.body.radius &&
            self.canSpendStamina(self.config.heavyAttack.staminaCost + reserveStam) &&
            (self.classId !== 'dual' || this.rng() < 0.55)
          ) {
            this.queuedHeavy = true;
          }
        } else {
          // Target is open or punishable! Choose optimal max-damage strike
          const heavyProb = targetPunishable
            ? self.classId === 'dual'
              ? 0.38
              : 0.72
            : self.classId === 'hammer'
            ? 0.44
            : self.classId === 'spear'
            ? 0.32
            : 0.26;

          if (
            this.rng() < heavyProb &&
            dist <= self.config.heavyAttack.range + target.body.radius - 0.08 &&
            self.canSpendStamina(self.config.heavyAttack.staminaCost + reserveStam)
          ) {
            this.queuedHeavy = true;
          } else if (
            dist <= engageRange + target.body.radius &&
            self.canSpendStamina(self.config.lightCombo[0].staminaCost + reserveStam)
          ) {
            this.aiState = 'Attacking';
            intent.lightAttackTap = true;
            this.comboBurstRemaining =
              self.classId === 'dual'
                ? targetPunishable
                  ? 2
                  : this.rng() < 0.75
                  ? 2
                  : 1
                : targetPunishable || this.rng() < 0.68
                ? 1
                : 0;
            this.attackCooldown =
              this.comboBurstRemaining > 0 ? 0.06 : 0.34 + this.rng() * 0.32;
            return intent;
          }
        }
      }
    }

    if (this.queuedHeavy) {
      this.queuedHeavy = false;
      this.aiState = 'Attacking';
      intent.heavyAttackRequest = true;
      this.attackCooldown = 0.48 + this.rng() * 0.35;
      return intent;
    }

    // 9. Smart Tactical Footwork: Anti-Center-Brawl, Out-Spacing, Flanking & Kiting!
    // Bridge alignment when both fighters are on Tier 2 crossing Bastion <-> Bridge
    if (
      self.body.y >= 2.8 &&
      target.body.y >= 2.8 &&
      Math.abs(self.body.x) > 9.5 &&
      Math.sign(self.body.x) !== Math.sign(target.body.x) &&
      Math.abs(self.body.z) > 2.9
    ) {
      this.aiState = 'Approaching';
      const bridgeMouthX = self.body.x < 0 ? -9.5 : 9.5;
      const bDx = bridgeMouthX - self.body.x;
      const bDz = 0 - self.body.z;
      const bLen = Math.max(0.01, Math.hypot(bDx, bDz));
      intent.moveX = bDx / bLen;
      intent.moveZ = bDz / bLen;
      intent.sprint = self.stamina > self.maxStamina * 0.4;
      return intent;
    }

    // Orient strafe direction AWAY from any nearby third-party enemy ("sandwich the target, don't get sandwiched!")
    if (crowd.nearestThirdParty) {
      const tpDx = crowd.nearestThirdParty.body.x - self.body.x;
      const tpDz = crowd.nearestThirdParty.body.z - self.body.z;
      const rightDot = -dz * tpDx + dx * tpDz;
      this.strafeSign = rightDot > 0 ? -1 : 1;
    }

    const dirX = dist > 1e-4 ? dx / dist : 0;
    const dirZ = dist > 1e-4 ? dz / dist : 1;
    const perpX = -dirZ * this.strafeSign;
    const perpZ = dirX * this.strafeSign;

    let wantX = 0;
    let wantZ = 0;

    if (shouldOutspaceDanger) {
      // Step briskly out of enemy's uninterruptible heavy / cyclone radius!
      this.aiState = 'Retreating';
      wantX = -dirX * 1.15 + perpX * 0.45;
      wantZ = -dirZ * 1.15 + perpZ * 0.45;
      if (
        dist < 2.3 &&
        this.defenseCooldown <= 0 &&
        self.canSpendStamina(self.config.dodge.staminaCost + 6)
      ) {
        const steered = this.steerAvoidObstacles(wantX, wantZ, arena, allFighters);
        intent.moveX = steered.x;
        intent.moveZ = steered.z;
        intent.dodgePressed = true;
        this.defenseCooldown = 1.1;
        this.aiState = 'Dodging';
        return intent;
      }
    } else if (needsStaminaBreather || (crowd.nearbyEnemies >= 2 && hpRatio < 0.65)) {
      // Tactical Kite / Disengage from multi-fighter crossfire to recover stamina & avoid free damage!
      this.aiState = 'Retreating';
      wantX = crowd.escapeDirX * 1.1 + perpX * 0.55;
      wantZ = crowd.escapeDirZ * 1.1 + perpZ * 0.55;
    } else if (lineBlocked) {
      this.aiState = 'Flanking';
      wantX = dirX * 0.52 + perpX * 0.88;
      wantZ = dirZ * 0.52 + perpZ * 0.88;
    } else if (targetPunishable && dist > engageRange * 0.78) {
      // Burst straight in to punish a stunned/recovering target!
      this.aiState = 'Approaching';
      wantX = dirX;
      wantZ = dirZ;
      if (self.stamina > 28) {
        intent.sprint = true;
      }
    } else if (target.state === 'Blocking' && dist <= maxPreferred + 0.6) {
      // Circle fast around the opponent's shield/sword block cone to hit their exposed side!
      this.aiState = 'Flanking';
      wantX = dirX * 0.22 + perpX * 1.05;
      wantZ = dirZ * 0.22 + perpZ * 1.05;
    } else if (dist > maxPreferred) {
      this.aiState = 'Approaching';
      const flankBlend = self.classId === 'dual' ? 0.48 : 0.28;
      wantX = dirX + perpX * flankBlend;
      wantZ = dirZ + perpZ * flankBlend;

      const sprintDist = self.classId === 'dual' ? 4.2 : 5.8;
      if (dist > sprintDist && self.stamina > self.maxStamina * 0.5) {
        intent.sprint = true;
      }
    } else if (dist < minPreferred) {
      // Maintain optimal weapon spacing (especially Spear & Sword) so short weapons whiff!
      this.aiState = 'MaintainingDistance';
      const retreatWeight =
        self.classId === 'spear' ? 1.05 : self.classId === 'sword' ? 0.78 : 0.6;
      wantX = -dirX * retreatWeight + perpX * 0.62;
      wantZ = -dirZ * retreatWeight + perpZ * 0.62;

      if (
        self.classId === 'spear' &&
        dist < 1.65 &&
        this.defenseCooldown <= 0 &&
        self.canSpendStamina(self.config.dodge.staminaCost + 10)
      ) {
        intent.moveX = -dirX;
        intent.moveZ = -dirZ;
        intent.dodgePressed = true;
        this.defenseCooldown = 1.3;
        this.aiState = 'Dodging';
        return intent;
      }
    } else {
      // Footsies / Hit-and-Run weaving: step in when ready to strike, weave out while on cooldown!
      this.aiState = 'Flanking';
      const inOut = this.attackCooldown <= 0.08 ? 0.42 : -0.36;
      wantX = dirX * inOut + perpX * 0.92;
      wantZ = dirZ * inOut + perpZ * 0.92;
    }

    // Subtle anti-center-clustering drift: when 3+ fighters are alive and crowding courtyard (0,0),
    // pull the duel naturally toward outer courtyard lanes, pillars, and wings!
    if (self.body.y < 1.0 && allFighters.filter((f) => f.isAlive).length >= 3) {
      const centerDist = Math.hypot(self.body.x, self.body.z);
      if (centerDist < 6.8) {
        const pullStrength = ((6.8 - centerDist) / 6.8) * 0.48;
        const anchorX = Math.cos(this.homeAnchorAngle) * 11.5 - self.body.x;
        const anchorZ = Math.sin(this.homeAnchorAngle) * 11.5 - self.body.z;
        const aLen = Math.max(0.01, Math.hypot(anchorX, anchorZ));
        wantX += (anchorX / aLen) * pullStrength;
        wantZ += (anchorZ / aLen) * pullStrength;
      }
    }

    const steered = this.steerAvoidObstacles(wantX, wantZ, arena, allFighters);
    intent.moveX = steered.x;
    intent.moveZ = steered.z;

    if (this.shouldVaultLowBarrier(intent.moveX, intent.moveZ, arena)) {
      intent.jumpPressed = true;
    }

    return intent;
  }

  /**
   * Scans ALL living enemies and flying projectiles to detect any immediate attack aimed at this bot.
   */
  private scanIncomingThreat(
    allFighters: Fighter[],
    arena: ArenaConfig,
    projectiles: ThrownProjectile[]
  ): IncomingThreat | null {
    const self = this.fighter;

    // 1. Check incoming thrown daggers first!
    for (const p of projectiles) {
      if (p.ownerId === self.id) continue;
      if (Math.abs(p.y - (self.body.y + 1.1)) > 1.45) continue;
      const toMeX = self.body.x - p.x;
      const toMeZ = self.body.z - p.z;
      const d = Math.hypot(toMeX, toMeZ);
      if (d > 7.5 || d < 0.05) continue;

      const pSpd = Math.max(0.01, Math.hypot(p.vx, p.vz));
      const pDirX = p.vx / pSpd;
      const pDirZ = p.vz / pSpd;
      const forwardDot = toMeX * pDirX + toMeZ * pDirZ;
      if (forwardDot <= 0) continue;

      const perpDist = Math.abs(toMeX * -pDirZ + toMeZ * pDirX);
      if (perpDist <= self.body.radius + 0.65) {
        return {
          yawToThreat: yawFromDir(-pDirX, -pDirZ, self.yaw),
          unblockable: false,
          dist: d,
          isProjectile: true,
          isNearImpact: d < 4.5,
          attacker: null,
        };
      }
    }

    // 2. Check all nearby living enemies winding up or swinging toward us!
    let closestThreat: IncomingThreat | null = null;
    let bestDist = Infinity;

    for (const other of allFighters) {
      if (other.id === self.id || !other.isAlive) continue;
      if (Math.abs(other.body.y - self.body.y) > 1.65) continue;

      const isSwinging =
        (other.state === 'Attacking' || other.state === 'HeavyAttacking') &&
        (other.attackPhase === 'Windup' || other.attackPhase === 'Active') &&
        other.activeAttack !== null;
      const isCharging = other.isChargingHeavy && other.chargeRatio > 0.45;

      if (!isSwinging && !isCharging) continue;

      const dx = other.body.x - self.body.x;
      const dz = other.body.z - self.body.z;
      const dist = Math.hypot(dx, dz);

      const atk = isSwinging ? other.activeAttack! : other.config.heavyAttack;
      const dangerReach =
        atk.range + Math.max(0, atk.lungeSpeed * 0.25) + self.body.radius + 0.65;
      if (dist > dangerReach) continue;

      const yawFromEnemyToMe = yawFromDir(-dx, -dz, other.yaw);
      const halfCone =
        atk.hitAngleDeg >= 300
          ? Math.PI
          : Math.max(0.85, (atk.hitAngleDeg * 0.5 * Math.PI) / 180 + 0.35);

      if (Math.abs(angleDiff(other.yaw, yawFromEnemyToMe)) > halfCone) continue;

      if (
        isLineBlockedByPillars(
          self.body.x,
          self.body.z,
          other.body.x,
          other.body.z,
          arena,
          0.05,
          Math.min(self.body.y, other.body.y)
        )
      ) {
        continue;
      }

      const isNearImpact =
        isSwinging &&
        (other.attackPhase === 'Active' || other.attackPhaseTimer <= 0.11);

      if (dist < bestDist) {
        bestDist = dist;
        closestThreat = {
          yawToThreat: yawFromDir(dx, dz, self.yaw),
          unblockable: !atk.blockable,
          dist,
          isProjectile: false,
          isNearImpact,
          attacker: other,
        };
      }
    }

    return closestThreat;
  }

  /**
   * Executes class-appropriate defense (Block, Timed Parry, Spear Deflect, Counter-Ram, or Directional Dodge).
   */
  private executeSmartDefense(
    intent: FighterInputIntent,
    threat: IncomingThreat,
    crowd: CrowdAssessment,
    arena: ArenaConfig,
    allFighters: Fighter[]
  ): boolean {
    const self = this.fighter;

    // 1. Unblockable attacks MUST be dodged (or countered by Spear back-vault sweep)!
    if (threat.unblockable) {
      if (
        self.classId === 'spear' &&
        !threat.isProjectile &&
        threat.dist <= 3.2 &&
        self.canUseAbility(2)
      ) {
        this.aiState = 'Attacking';
        intent.ability2Pressed = true;
        this.defenseCooldown = 0.7;
        return true;
      }
      if (self.canSpendStamina(self.config.dodge.staminaCost)) {
        this.triggerBotDodge(
          intent,
          threat.yawToThreat,
          crowd,
          arena,
          allFighters,
          true
        );
        return true;
      }
      return false;
    }

    // 2. Blockable attacks / thrown daggers: use each knight's signature defensive mastery!
    const roll = this.rng();

    if (self.classId === 'dual') {
      // Duelist waits for near-impact to trigger Timed Parry (stunning melee attackers!), else side-dashes!
      if (!threat.isProjectile && threat.isNearImpact && roll < 0.62 && self.stamina > 16) {
        this.aiState = 'Blocking';
        intent.blockHeld = true;
        this.activeBlockHoldTimer = 0.14;
        this.defenseCooldown = 0.85 + this.rng() * 0.45;
        return true;
      }
      if (self.canSpendStamina(self.config.dodge.staminaCost)) {
        this.triggerBotDodge(
          intent,
          threat.yawToThreat,
          crowd,
          arena,
          allFighters,
          false
        );
        return true;
      }
    }

    if (self.classId === 'hammer') {
      // Siege Tank can counter-charge right through blockable attacks with [1] Siege Ram frontal guard!
      if (
        !threat.isProjectile &&
        threat.dist >= 1.8 &&
        threat.dist <= 4.5 &&
        roll < 0.35 &&
        self.canUseAbility(1)
      ) {
        this.aiState = 'Attacking';
        intent.ability1Pressed = true;
        this.defenseCooldown = 0.8;
        return true;
      }
      if (roll < 0.84 && self.stamina > 16) {
        this.aiState = 'Blocking';
        intent.blockHeld = true;
        this.activeBlockHoldTimer = 0.45 + this.rng() * 0.45;
        this.defenseCooldown = 0.85 + this.rng() * 0.55;
        return true;
      }
    }

    if (self.classId === 'spear') {
      // Spear uses shaft deflect pulse in close quarters or evasive backstep to maintain spacing!
      if (!threat.isProjectile && threat.dist < 2.6 && roll < 0.55 && self.stamina > 18) {
        this.aiState = 'Blocking';
        intent.blockHeld = true;
        this.activeBlockHoldTimer = 0.16;
        this.defenseCooldown = 0.9 + this.rng() * 0.5;
        return true;
      }
      if (self.canSpendStamina(self.config.dodge.staminaCost)) {
        this.triggerBotDodge(
          intent,
          threat.yawToThreat,
          crowd,
          arena,
          allFighters,
          false
        );
        return true;
      }
    }

    // Sword Paladin: balanced directional block + diagonal roll dodge!
    if (roll < 0.58 && self.stamina > 20) {
      this.aiState = 'Blocking';
      intent.blockHeld = true;
      this.activeBlockHoldTimer = 0.38 + this.rng() * 0.42;
      this.defenseCooldown = 0.85 + this.rng() * 0.55;
      return true;
    }
    if (self.canSpendStamina(self.config.dodge.staminaCost)) {
      this.triggerBotDodge(
        intent,
        threat.yawToThreat,
        crowd,
        arena,
        allFighters,
        false
      );
      return true;
    }

    return false;
  }

  private assessCrowd(allFighters: Fighter[]): CrowdAssessment {
    const self = this.fighter;
    let nearbyEnemies = 0;
    let sumX = 0;
    let sumZ = 0;
    let repulseX = 0;
    let repulseZ = 0;
    let nearestThirdParty: Fighter | null = null;
    let nearestTpDist = Infinity;

    for (const f of allFighters) {
      if (f.id === self.id || !f.isAlive) continue;
      if (Math.abs(f.body.y - self.body.y) > 1.8) continue;

      const dx = f.body.x - self.body.x;
      const dz = f.body.z - self.body.z;
      const d = Math.hypot(dx, dz);

      if (d < 5.8) {
        nearbyEnemies += 1;
        sumX += f.body.x;
        sumZ += f.body.z;
        const w = (5.8 - d) / Math.max(0.4, d);
        repulseX -= dx * w;
        repulseZ -= dz * w;
      }

      if (f.id !== this.targetId && d < 7.5 && d < nearestTpDist) {
        nearestTpDist = d;
        nearestThirdParty = f;
      }
    }

    const rLen = Math.hypot(repulseX, repulseZ);
    return {
      nearbyEnemies,
      crowdCenterX: nearbyEnemies > 0 ? sumX / nearbyEnemies : self.body.x,
      crowdCenterZ: nearbyEnemies > 0 ? sumZ / nearbyEnemies : self.body.z,
      escapeDirX: rLen > 1e-4 ? repulseX / rLen : -Math.sin(self.yaw),
      escapeDirZ: rLen > 1e-4 ? repulseZ / rLen : -Math.cos(self.yaw),
      nearestThirdParty,
    };
  }

  private chooseSmartAbilitySlot(
    dist: number,
    target: Fighter,
    targetPunishable: boolean,
    nearbyEnemies: number
  ): 1 | 2 | null {
    const self = this.fighter;
    const targetBlocking = target.state === 'Blocking';

    // Always allow instant ability usage for guard-breaking, punishing, or self-saving; slight pacing otherwise
    if (!targetPunishable && !targetBlocking && nearbyEnemies < 2 && this.rng() > 0.58) {
      return null;
    }

    switch (self.classId) {
      case 'sword': {
        // [2] Oath of Steel: heal +30 HP & +25% damage aura before/during engagement!
        if (
          self.canUseAbility(2) &&
          self.damageAuraTimer <= 0 &&
          (self.hp < self.maxHp - 24 || dist <= 3.3)
        ) {
          return 2;
        }
        // [1] Heroic Rush: pierce enemy block, punish recovery, or close 2.4..5.5m gap!
        if (
          self.canUseAbility(1) &&
          (targetBlocking ||
            targetPunishable ||
            target.hp <= 34 ||
            (dist >= 2.4 && dist <= 5.5))
        ) {
          return 1;
        }
        return null;
      }
      case 'dual': {
        // [2] Thrown Dagger: snipe at 3.6..13.5m (especially wounded foes!) + gain +25% Haste to engage/kite!
        if (
          self.canUseAbility(2) &&
          !targetBlocking &&
          dist >= 3.6 &&
          dist <= 13.5
        ) {
          return 2;
        }
        // [1] Blade Cyclone: 3-hit 360° shred on stunned/close enemies or when fighting 2+ foes!
        if (
          self.canUseAbility(1) &&
          dist <= 3.0 &&
          (!targetBlocking || nearbyEnemies >= 2)
        ) {
          return 1;
        }
        return null;
      }
      case 'spear': {
        // [2] 360° Sweep Vault: push enemies off when they get inside 2.8m and leap back to polearm range!
        if (self.canUseAbility(2) && dist <= 2.8) {
          return 2;
        }
        // [1] Dragon Lunge: unblockable 4.4m sniper thrust against blockers, recovering foes, or mid-range targets!
        if (
          self.canUseAbility(1) &&
          dist >= 2.3 &&
          dist <= 6.2 &&
          (targetBlocking || targetPunishable || target.hp <= 38 || this.rng() < 0.65)
        ) {
          return 1;
        }
        return null;
      }
      case 'hammer': {
        // [2] Titan Quake: unblockable 4.2m earthquake + Iron Bastion (-35% damage taken + hyper-armor)!
        if (
          self.canUseAbility(2) &&
          dist <= 3.9 &&
          (targetBlocking || nearbyEnemies >= 2 || self.ironBastionTimer <= 0)
        ) {
          return 2;
        }
        // [1] Siege Ram: frontal-shield charge applying full 1.15s Stunned state!
        if (self.canUseAbility(1) && dist >= 1.9 && dist <= 5.8 && !targetBlocking) {
          return 1;
        }
        return null;
      }
    }
  }

  private findNearbyFinishableEnemy(
    allFighters: Fighter[],
    arena: ArenaConfig
  ): Fighter | null {
    const self = this.fighter;
    let best: Fighter | null = null;
    let bestDist = 7.5;

    for (const f of allFighters) {
      if (f.id === self.id || !f.isAlive) continue;
      if (Math.abs(f.body.y - self.body.y) > 1.55) continue;
      if (f.hp > 32 && f.state !== 'Stunned') continue;

      const d = distXZ(self.body.x, self.body.z, f.body.x, f.body.z);
      if (d >= bestDist) continue;
      if (
        isLineBlockedByPillars(
          self.body.x,
          self.body.z,
          f.body.x,
          f.body.z,
          arena,
          0.05,
          self.body.y
        )
      ) {
        continue;
      }
      bestDist = d;
      best = f;
    }
    return best;
  }

  private computeClimbToNearestBastion(
    arena: ArenaConfig,
    allFighters: Fighter[]
  ): { moveX: number; moveZ: number; aimYaw: number } {
    const self = this.fighter;
    let bestStair: StairRamp = arena.stairs[0];
    let bestCost = Infinity;

    for (const s of arena.stairs) {
      const cx = (s.minX + s.maxX) * 0.5;
      // Check if we are already on this stair ramp!
      if (
        self.body.x >= s.minX - 0.35 &&
        self.body.x <= s.maxX + 0.35 &&
        self.body.z >= Math.min(s.entryZ, s.exitZ) - 0.6 &&
        self.body.z <= Math.max(s.entryZ, s.exitZ) + 0.6
      ) {
        const dx = cx - self.body.x;
        const dz = s.exitZ - self.body.z;
        const len = Math.max(0.01, Math.hypot(dx, dz));
        return {
          moveX: dx / len,
          moveZ: dz / len,
          aimYaw: yawFromDir(dx, dz, self.yaw),
        };
      }

      const d = distXZ(self.body.x, self.body.z, cx, s.entryZ);
      if (d < bestCost) {
        bestCost = d;
        bestStair = s;
      }
    }

    const stairCenterX = (bestStair.minX + bestStair.maxX) * 0.5;
    const distToMouth = distXZ(
      self.body.x,
      self.body.z,
      stairCenterX,
      bestStair.entryZ
    );
    const wpZ = distToMouth < 1.55 ? bestStair.exitZ : bestStair.entryZ;
    const steered = this.steerAvoidObstacles(
      stairCenterX - self.body.x,
      wpZ - self.body.z,
      arena,
      allFighters
    );
    return {
      moveX: steered.x,
      moveZ: steered.z,
      aimYaw: yawFromDir(steered.x, steered.z, self.yaw),
    };
  }

  /**
   * Computes smooth multi-tier pathfinding up Staircases to Tier 2 or down via Bridge Drop / Stairs!
   */
  private computeVerticalTierMove(
    target: Fighter,
    arena: ArenaConfig,
    allFighters: Fighter[]
  ): { moveX: number; moveZ: number; aimYaw: number } {
    const self = this.fighter;
    const goingUp = target.body.y > self.body.y;

    for (const s of arena.stairs) {
      const centerX = (s.minX + s.maxX) * 0.5;
      if (
        self.body.x >= s.minX - 0.35 &&
        self.body.x <= s.maxX + 0.35 &&
        self.body.z >= Math.min(s.entryZ, s.exitZ) - 0.6 &&
        self.body.z <= Math.max(s.entryZ, s.exitZ) + 0.6
      ) {
        const goalZ = goingUp ? s.exitZ : s.entryZ;
        const dx = centerX - self.body.x;
        const dz = goalZ - self.body.z;
        const len = Math.max(0.01, Math.hypot(dx, dz));
        const mx = dx / len;
        const mz = dz / len;
        return {
          moveX: mx,
          moveZ: mz,
          aimYaw: yawFromDir(mx, mz, self.yaw),
        };
      }
    }

    if (!goingUp && Math.abs(self.body.x) < 10.5) {
      const dropX = clamp(target.body.x, -1.6, 1.6);
      if (Math.abs(self.body.x - dropX) > 1.7) {
        const dx = dropX - self.body.x;
        const dz = 0 - self.body.z;
        const len = Math.max(0.01, Math.hypot(dx, dz));
        return {
          moveX: dx / len,
          moveZ: dz / len,
          aimYaw: yawFromDir(dx, dz, self.yaw),
        };
      } else {
        const dropZ = target.body.z >= 0 ? 5.5 : -5.5;
        const dx = dropX - self.body.x;
        const dz = dropZ - self.body.z;
        const len = Math.max(0.01, Math.hypot(dx, dz));
        return {
          moveX: dx / len,
          moveZ: dz / len,
          aimYaw: yawFromDir(dx, dz, self.yaw),
        };
      }
    }

    let bestStair: StairRamp = arena.stairs[0];
    let bestCost = Infinity;
    for (const s of arena.stairs) {
      const cx = (s.minX + s.maxX) * 0.5;
      const startZ = goingUp ? s.entryZ : s.exitZ;
      const endZ = goingUp ? s.exitZ : s.entryZ;
      const cost =
        distXZ(self.body.x, self.body.z, cx, startZ) +
        distXZ(cx, endZ, target.body.x, target.body.z) * 0.45;
      if (cost < bestCost) {
        bestCost = cost;
        bestStair = s;
      }
    }

    const stairCenterX = (bestStair.minX + bestStair.maxX) * 0.5;
    const mouthZ = goingUp ? bestStair.entryZ : bestStair.exitZ;
    const destZ = goingUp ? bestStair.exitZ : bestStair.entryZ;
    const distToMouth = distXZ(self.body.x, self.body.z, stairCenterX, mouthZ);

    const wpX = stairCenterX;
    const wpZ = distToMouth < 1.55 ? destZ : mouthZ;
    const rawDx = wpX - self.body.x;
    const rawDz = wpZ - self.body.z;
    const steered = this.steerAvoidObstacles(rawDx, rawDz, arena, allFighters);

    return {
      moveX: steered.x,
      moveZ: steered.z,
      aimYaw: yawFromDir(steered.x, steered.z, self.yaw),
    };
  }

  private triggerBotDodge(
    intent: FighterInputIntent,
    yawToThreat: number,
    crowd: CrowdAssessment,
    arena: ArenaConfig,
    allFighters: Fighter[],
    evadingUnblockable: boolean
  ): void {
    this.aiState = 'Dodging';
    const self = this.fighter;

    let dodgeX: number;
    let dodgeZ: number;
    if (self.classId === 'spear' || (evadingUnblockable && self.classId === 'hammer')) {
      // Backstep cleanly out of unblockable / close-range swing!
      dodgeX = -Math.sin(yawToThreat) * 0.85 + crowd.escapeDirX * 0.35;
      dodgeZ = -Math.cos(yawToThreat) * 0.85 + crowd.escapeDirZ * 0.35;
    } else if (self.classId === 'hammer' && !evadingUnblockable) {
      // Offensive shield-shove right into blockable melee attacker!
      dodgeX = Math.sin(yawToThreat);
      dodgeZ = Math.cos(yawToThreat);
    } else {
      // Diagonal flank/evade away from other nearby enemies!
      const sideAngle = evadingUnblockable ? Math.PI * 0.68 : Math.PI * 0.52;
      const sideYaw = yawToThreat + this.strafeSign * sideAngle;
      dodgeX = Math.sin(sideYaw) * 0.8 + crowd.escapeDirX * 0.3;
      dodgeZ = Math.cos(sideYaw) * 0.8 + crowd.escapeDirZ * 0.3;
    }

    const steered = this.steerAvoidObstacles(dodgeX, dodgeZ, arena, allFighters);
    intent.moveX = steered.x;
    intent.moveZ = steered.z;
    intent.dodgePressed = true;
    this.defenseCooldown = 1.05 + this.rng() * 0.65;
  }

  /**
   * Vaults over low wooden courtyard barriers (height <= 1.25m) with Space jump when moving straight across them!
   */
  private shouldVaultLowBarrier(
    moveX: number,
    moveZ: number,
    arena: ArenaConfig
  ): boolean {
    const self = this.fighter;
    if (!self.body.isGrounded || self.stamina < 28) return false;
    const mLen = Math.hypot(moveX, moveZ);
    if (mLen < 0.5) return false;

    const probeX = self.body.x + (moveX / mLen) * 1.15;
    const probeZ = self.body.z + (moveZ / mLen) * 1.15;

    for (const b of arena.boxes) {
      if (b.kind !== 'wood_barrier' || b.height > 1.3) continue;
      const bMinY = b.minY ?? 0;
      if (Math.abs(self.body.y - bMinY) > 0.35) continue;

      const cos = Math.cos(-b.rotationY);
      const sin = Math.sin(-b.rotationY);
      const lx = (probeX - b.x) * cos - (probeZ - b.z) * sin;
      const lz = (probeX - b.x) * sin + (probeZ - b.z) * cos;
      if (
        Math.abs(lx) <= b.halfWidth + 0.35 &&
        Math.abs(lz) <= b.halfDepth + 0.35
      ) {
        return true;
      }
    }
    return false;
  }

  private getClassRanges(): {
    minPreferred: number;
    maxPreferred: number;
    engageRange: number;
  } {
    switch (this.fighter.classId) {
      case 'spear':
        return { minPreferred: 2.55, maxPreferred: 3.45, engageRange: 3.6 };
      case 'dual':
        return { minPreferred: 1.15, maxPreferred: 2.0, engageRange: 2.2 };
      case 'hammer':
        return { minPreferred: 1.45, maxPreferred: 2.25, engageRange: 2.45 };
      case 'sword':
      default:
        return { minPreferred: 1.55, maxPreferred: 2.35, engageRange: 2.5 };
    }
  }

  /**
   * Smart Target Selection:
   * - Strongly favors isolated 1v1 opponents and low-HP / stunned / recovering targets ("max damage, min risk")
   * - Penalizes targets surrounded by multiple fighters in the center pit so bots spread across the whole fortress!
   */
  private selectBestTarget(
    allFighters: Fighter[],
    botTargetCounts: Map<string, number>,
    arena: ArenaConfig
  ): Fighter | null {
    const self = this.fighter;
    let best: Fighter | null = null;
    let bestScore = -Infinity;

    for (const candidate of allFighters) {
      if (candidate.id === self.id || !candidate.isAlive) continue;

      const d = distXZ(
        self.body.x,
        self.body.z,
        candidate.body.x,
        candidate.body.z
      );
      const dy = Math.abs(candidate.body.y - self.body.y);
      const hpRatio = clamp(candidate.hp / candidate.maxHp, 0, 1);
      const othersTargeting =
        (botTargetCounts.get(candidate.id) ?? 0) -
        (this.targetId === candidate.id ? 1 : 0);

      // Count how many OTHER enemies are clustered right around this candidate (crossfire risk!)
      let clusterAroundCandidate = 0;
      for (const third of allFighters) {
        if (
          third.id === self.id ||
          third.id === candidate.id ||
          !third.isAlive ||
          Math.abs(third.body.y - candidate.body.y) > 1.8
        ) {
          continue;
        }
        if (distXZ(third.body.x, third.body.z, candidate.body.x, candidate.body.z) < 4.8) {
          clusterAroundCandidate += 1;
        }
      }

      let score = 30.0 - d * 0.78 - dy * 1.9;

      // High priority for wounded / finishable foes!
      score += (1 - hpRatio) * 9.5;
      if (candidate.hp <= 42) score += 7.0;

      // Bonus for stunned or over-extended recovering foes
      if (candidate.state === 'Stunned') score += 8.0;
      else if (candidate.attackPhase === 'Recovery') score += 3.5;

      // Slight caution against active Iron Bastion tanks unless they are the only option
      if (candidate.ironBastionTimer > 0 && hpRatio > 0.4) {
        score -= 5.5;
      }

      // Respond to whoever is actively attacking us, unless we are outnumbered there
      if (this.lastDamagedById === candidate.id && clusterAroundCandidate <= 1) {
        score += 5.2;
      }
      if (this.targetId === candidate.id) {
        score += 2.0;
      }

      // Strong anti-dogpile & anti-cluster penalty: prefer clean 1v1 duels or flanking from outside!
      score -= Math.max(0, othersTargeting) * 8.5;
      score -= clusterAroundCandidate * 4.6;

      // Line-of-sight bonus
      if (
        dy < 1.5 &&
        !isLineBlockedByPillars(
          self.body.x,
          self.body.z,
          candidate.body.x,
          candidate.body.z,
          arena,
          0.05,
          self.body.y
        )
      ) {
        score += 2.2;
      }

      score += (this.rng() - 0.5) * 2.4;

      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    return best;
  }

  /**
   * Elevation-filtered context steering around pillars, barriers, railings, outer walls, and fighters.
   */
  private steerAvoidObstacles(
    wantX: number,
    wantZ: number,
    arena: ArenaConfig,
    allFighters: Fighter[]
  ): { x: number; z: number } {
    const self = this.fighter;
    let vx = wantX;
    let vz = wantZ;
    const len = Math.hypot(vx, vz);
    if (len < 1e-4) return { x: 0, z: 0 };
    vx /= len;
    vz /= len;

    const lookAhead = 1.85;
    const probeX = self.body.x + vx * lookAhead;
    const probeZ = self.body.z + vz * lookAhead;

    let pushX = 0;
    let pushZ = 0;

    // Avoid stone pillars at current tier elevation
    for (const c of arena.circles) {
      const cMinY = c.minY ?? 0;
      const cMaxY = cMinY + c.height;
      if (self.body.y + 1.8 <= cMinY || self.body.y >= cMaxY - 0.1) continue;

      const dx = probeX - c.x;
      const dz = probeZ - c.z;
      const safeR = c.radius + self.body.radius + 0.75;
      const d = Math.hypot(dx, dz);
      if (d < safeR && d > 1e-4) {
        const strength = ((safeR - d) / safeR) * 2.2;
        const nx = dx / d;
        const nz = dz / d;
        const tx = -nz * this.strafeSign;
        const tz = nx * this.strafeSign;
        pushX += (nx * 0.7 + tx * 0.7) * strength;
        pushZ += (nz * 0.7 + tz * 0.7) * strength;
      }
    }

    // Avoid barriers / railings ONLY on our current vertical tier!
    for (const b of arena.boxes) {
      const bMinY = b.minY ?? 0;
      const bMaxY = bMinY + b.height;
      if (self.body.y + 1.8 <= bMinY || self.body.y >= bMaxY - 0.1) continue;

      const approxR =
        Math.max(b.halfWidth, b.halfDepth) + self.body.radius + 0.45;
      const dx = probeX - b.x;
      const dz = probeZ - b.z;
      const d = Math.hypot(dx, dz);
      if (d < approxR && d > 1e-4) {
        const strength = ((approxR - d) / approxR) * 1.65;
        const nx = dx / d;
        const nz = dz / d;
        const tx = -nz * this.strafeSign;
        const tz = nx * this.strafeSign;
        pushX += (nx * 0.65 + tx * 0.75) * strength;
        pushZ += (nz * 0.65 + tz * 0.75) * strength;
      }
    }

    // Avoid rectangular fortress perimeter walls
    if (arena.boundsHalfX && arena.boundsHalfZ) {
      const marginX = arena.boundsHalfX - 1.8;
      const marginZ = arena.boundsHalfZ - 1.8;
      if (Math.abs(probeX) > marginX) {
        pushX -=
          Math.sign(probeX) * ((Math.abs(probeX) - marginX) / 1.8) * 2.2;
      }
      if (Math.abs(probeZ) > marginZ) {
        pushZ -=
          Math.sign(probeZ) * ((Math.abs(probeZ) - marginZ) / 1.8) * 2.2;
      }
    } else {
      const wallMargin = arena.radius - 1.8;
      const probeCenterDist = Math.hypot(probeX, probeZ);
      if (probeCenterDist > wallMargin && probeCenterDist > 1e-4) {
        const excess = (probeCenterDist - wallMargin) / 1.8;
        pushX -= (probeX / probeCenterDist) * excess * 2.1;
        pushZ -= (probeZ / probeCenterDist) * excess * 2.1;
      }
    }

    // Stronger separation from non-target same-tier fighters so bots never clump in a ball!
    for (const other of allFighters) {
      if (
        other.id === self.id ||
        !other.isAlive ||
        other.id === this.targetId ||
        Math.abs(other.body.y - self.body.y) > 1.7
      ) {
        continue;
      }
      const dx = self.body.x - other.body.x;
      const dz = self.body.z - other.body.z;
      const d = Math.hypot(dx, dz);
      const minSep = self.body.radius + other.body.radius + 1.65;
      if (d < minSep && d > 1e-4) {
        const s = ((minSep - d) / minSep) * 1.55;
        pushX += (dx / d) * s;
        pushZ += (dz / d) * s;
      }
    }

    let outX = vx + pushX;
    let outZ = vz + pushZ;
    const outLen = Math.hypot(outX, outZ);
    if (outLen > 1e-4) {
      outX /= outLen;
      outZ /= outLen;
    }
    return { x: outX, z: outZ };
  }

  private findFighterById(
    allFighters: Fighter[],
    id: string | null
  ): Fighter | null {
    if (!id) return null;
    for (const f of allFighters) {
      if (f.id === id) return f;
    }
    return null;
  }
}
