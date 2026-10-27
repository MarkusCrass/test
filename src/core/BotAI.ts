import { ArenaConfig, StairRamp } from '../config/arenaConfig';
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
  | 'MaintainingDistance'
  | 'Attacking'
  | 'Blocking'
  | 'Dodging'
  | 'Recovering'
  | 'Stunned'
  | 'Dead';

export class BotController {
  public readonly fighter: Fighter;
  public aiState: BotAIState = 'SearchingTarget';
  public targetId: string | null = null;

  private decisionTimer = 0;
  private retargetTimer = 0;
  private attackCooldown = 0.4;
  private defenseCooldown = 0.6;
  private activeBlockHoldTimer = 0;
  private comboBurstRemaining = 0;
  private queuedHeavy = false;
  private strafeSign = 1;
  private strafeSwitchTimer = 2.0;

  // Observable threat perception (with human-like reaction delay)
  private observedEnemyWindupTime = 0;
  private reactionThreshold = 0.21;
  private lastDamagedById: string | null = null;
  private lastDamagedMemoryTimer = 0;

  private readonly rng: () => number;

  constructor(fighter: Fighter, rng: () => number = Math.random) {
    this.fighter = fighter;
    this.rng = rng;
    this.strafeSign = this.rng() < 0.5 ? 1 : -1;
    this.decisionTimer = 0.1 + this.rng() * 0.22;
    this.reactionThreshold = 0.17 + this.rng() * 0.13;
  }

  public notifyDamagedBy(attackerId: string): void {
    this.lastDamagedById = attackerId;
    this.lastDamagedMemoryTimer = 5.0;
    this.retargetTimer = Math.min(this.retargetTimer, 0.22 + this.rng() * 0.2);
  }

  public update(
    dt: number,
    allFighters: Fighter[],
    botTargetCounts: Map<string, number>,
    arena: ArenaConfig,
    combatEnabled: boolean
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

    // Tick timers
    this.decisionTimer -= dt;
    this.retargetTimer -= dt;
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.defenseCooldown = Math.max(0, this.defenseCooldown - dt);
    this.activeBlockHoldTimer = Math.max(0, this.activeBlockHoldTimer - dt);
    this.lastDamagedMemoryTimer = Math.max(0, this.lastDamagedMemoryTimer - dt);
    if (this.lastDamagedMemoryTimer <= 0) {
      this.lastDamagedById = null;
    }

    this.strafeSwitchTimer -= dt;
    if (this.strafeSwitchTimer <= 0) {
      this.strafeSwitchTimer = 1.6 + this.rng() * 2.2;
      if (this.rng() < 0.65) {
        this.strafeSign *= -1;
      }
    }

    // Sync stunned / recovering states with Fighter's real physical state
    if (self.state === 'Stunned' || self.state === 'HitReaction') {
      this.aiState = 'Stunned';
      this.comboBurstRemaining = 0;
      this.activeBlockHoldTimer = 0;
      return intent;
    }

    if (
      (self.state === 'Attacking' || self.state === 'HeavyAttacking') &&
      self.attackPhase === 'Recovery'
    ) {
      this.aiState = 'Recovering';
    }

    // 1. Acquire / refresh target
    let target = this.findFighterById(allFighters, this.targetId);
    if (!target || !target.isAlive || this.retargetTimer <= 0) {
      target = this.selectBestTarget(allFighters, botTargetCounts);
      this.targetId = target ? target.id : null;
      this.retargetTimer = 1.7 + this.rng() * 1.4;
    }

    if (!target) {
      this.aiState = 'SearchingTarget';
      return intent;
    }

    // 2. Multi-Tier Vertical Navigation (Staircases & Skybridge Drop-Off!)
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

    // Track observable enemy windup (only on same tier!)
    const enemyAttackingUs =
      Math.abs(verticalGap) <= 1.55 &&
      (target.state === 'Attacking' || target.state === 'HeavyAttacking') &&
      (target.attackPhase === 'Windup' || target.attackPhase === 'Active') &&
      dist <= (target.activeAttack?.range ?? 2.8) + 1.25 &&
      Math.abs(
        angleDiff(
          target.yaw,
          yawFromDir(
            self.body.x - target.body.x,
            self.body.z - target.body.z,
            target.yaw
          )
        )
      ) < 1.35;

    if (enemyAttackingUs && !lineBlocked) {
      this.observedEnemyWindupTime += dt;
    } else {
      this.observedEnemyWindupTime = 0;
    }

    // Continue holding sustained block if committed
    if (this.activeBlockHoldTimer > 0 && self.stamina > 12) {
      this.aiState = 'Blocking';
      intent.blockHeld = true;
      const perpX = -Math.sin(yawToTarget) * 0.45 * this.strafeSign;
      const perpZ = Math.cos(yawToTarget) * 0.45 * this.strafeSign;
      const steered = this.steerAvoidObstacles(perpX, perpZ, arena, allFighters);
      intent.moveX = steered.x;
      intent.moveZ = steered.z;
      return intent;
    }

    if (self.state === 'Dodging') {
      this.aiState = 'Dodging';
      return intent;
    }

    // 3. Defensive Reaction
    if (
      this.observedEnemyWindupTime >= this.reactionThreshold &&
      this.defenseCooldown <= 0 &&
      self.state !== 'Attacking' &&
      self.state !== 'HeavyAttacking'
    ) {
      this.observedEnemyWindupTime = 0;
      const incomingUnblockable =
        target.activeAttack && !target.activeAttack.blockable;
      const roll = this.rng();

      if (incomingUnblockable) {
        if (roll < 0.72 && self.canSpendStamina(self.config.dodge.staminaCost)) {
          this.triggerBotDodge(intent, yawToTarget, arena, allFighters);
          return intent;
        }
      } else {
        const blockPref =
          self.classId === 'hammer'
            ? 0.68
            : self.classId === 'sword'
            ? 0.48
            : self.classId === 'dual'
            ? 0.34
            : 0.38;

        if (roll < blockPref && self.stamina > 18) {
          this.aiState = 'Blocking';
          intent.blockHeld = true;
          const isSustained =
            self.config.defense.mode === 'directional_block' ||
            self.config.defense.mode === 'heavy_shield';
          this.activeBlockHoldTimer = isSustained
            ? 0.48 + this.rng() * 0.55
            : 0.12;
          this.defenseCooldown = 1.35 + this.rng() * 1.25;
          return intent;
        } else if (
          roll < blockPref + 0.32 &&
          self.canSpendStamina(self.config.dodge.staminaCost)
        ) {
          this.triggerBotDodge(intent, yawToTarget, arena, allFighters);
          return intent;
        }
      }
      this.defenseCooldown = 0.65 + this.rng() * 0.6;
    }

    // 4. Continue multi-hit light combo burst
    if (
      this.comboBurstRemaining > 0 &&
      (self.state === 'Idle' || self.state === 'Moving') &&
      !lineBlocked &&
      dist <= self.config.lightCombo[0].range + target.body.radius + 0.35
    ) {
      this.comboBurstRemaining -= 1;
      this.aiState = 'Attacking';
      intent.lightAttackTap = true;
      this.attackCooldown =
        this.comboBurstRemaining > 0 ? 0.08 : 0.48 + this.rng() * 0.45;
      return intent;
    }

    // 5. Class-specific Preferred Engagement Distances
    const { minPreferred, maxPreferred, engageRange } = this.getClassRanges();

    if (this.decisionTimer <= 0) {
      this.decisionTimer = 0.14 + this.rng() * 0.18;

      if (
        !lineBlocked &&
        this.attackCooldown <= 0 &&
        (self.state === 'Idle' || self.state === 'Moving') &&
        dist <= engageRange + target.body.radius
      ) {
        const facingDiff = Math.abs(angleDiff(self.yaw, yawToTarget));
        if (facingDiff < 0.95) {
          const targetVulnerable =
            target.state === 'Stunned' ||
            target.state === 'Blocking' ||
            target.attackPhase === 'Recovery';

          const heavyChance =
            self.classId === 'hammer'
              ? targetVulnerable
                ? 0.72
                : 0.42
              : self.classId === 'spear'
              ? 0.28
              : self.classId === 'sword'
              ? 0.3
              : 0.22;

          if (
            this.rng() < heavyChance &&
            self.canSpendStamina(self.config.heavyAttack.staminaCost + 6) &&
            dist <= self.config.heavyAttack.range + target.body.radius - 0.1
          ) {
            this.queuedHeavy = true;
          } else if (
            self.canSpendStamina(self.config.lightCombo[0].staminaCost + 4)
          ) {
            this.aiState = 'Attacking';
            intent.lightAttackTap = true;
            this.comboBurstRemaining =
              self.classId === 'dual'
                ? this.rng() < 0.7
                  ? 2
                  : 1
                : this.rng() < 0.55
                ? 1
                : 0;
            this.attackCooldown =
              this.comboBurstRemaining > 0 ? 0.08 : 0.45 + this.rng() * 0.5;
            return intent;
          }
        }
      }

      if (
        self.classId === 'spear' &&
        dist < 1.65 &&
        !lineBlocked &&
        this.defenseCooldown <= 0
      ) {
        if (this.rng() < 0.5 && self.canSpendStamina(self.config.dodge.staminaCost)) {
          this.aiState = 'Dodging';
          intent.moveX = -dx / Math.max(0.1, dist);
          intent.moveZ = -dz / Math.max(0.1, dist);
          intent.dodgePressed = true;
          this.defenseCooldown = 1.5 + this.rng();
          return intent;
        } else if (self.canSpendStamina(self.config.defense.entryStaminaCost)) {
          this.aiState = 'Blocking';
          intent.blockHeld = true;
          this.defenseCooldown = 1.4 + this.rng();
          return intent;
        }
      }

      if (
        self.classId === 'hammer' &&
        dist < 1.55 &&
        !lineBlocked &&
        this.defenseCooldown <= 0 &&
        this.rng() < 0.4 &&
        self.canSpendStamina(self.config.dodge.staminaCost)
      ) {
        this.aiState = 'Dodging';
        intent.moveX = dx / Math.max(0.1, dist);
        intent.moveZ = dz / Math.max(0.1, dist);
        intent.dodgePressed = true;
        this.defenseCooldown = 1.8 + this.rng();
        return intent;
      }
    }

    if (this.queuedHeavy) {
      this.queuedHeavy = false;
      this.aiState = 'Attacking';
      intent.heavyAttackRequest = true;
      this.attackCooldown = 0.65 + this.rng() * 0.55;
      return intent;
    }

    if (self.state === 'Attacking' || self.state === 'HeavyAttacking') {
      this.aiState =
        self.attackPhase === 'Recovery' ? 'Recovering' : 'Attacking';
      return intent;
    }

    // 6. Same-Tier Movement: Bridge Funneling + Approaching vs MaintainingDistance
    // If both fighters are up on Tier 2 and crossing between Bastion <-> Bridge, align Z toward bridge mouth
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

    const dirX = dist > 1e-4 ? dx / dist : 0;
    const dirZ = dist > 1e-4 ? dz / dist : 1;
    const perpX = -dirZ * this.strafeSign;
    const perpZ = dirX * this.strafeSign;

    let wantX = 0;
    let wantZ = 0;

    if (lineBlocked) {
      this.aiState = 'Approaching';
      wantX = dirX * 0.55 + perpX * 0.85;
      wantZ = dirZ * 0.55 + perpZ * 0.85;
    } else if (dist > maxPreferred) {
      this.aiState = 'Approaching';
      const flankBlend = self.classId === 'dual' ? 0.34 : 0.18;
      wantX = dirX + perpX * flankBlend;
      wantZ = dirZ + perpZ * flankBlend;

      const sprintDist = self.classId === 'dual' ? 4.0 : 5.6;
      if (dist > sprintDist && self.stamina > self.maxStamina * 0.45) {
        intent.sprint = true;
      }
    } else if (dist < minPreferred) {
      this.aiState = 'MaintainingDistance';
      const retreatWeight = self.classId === 'spear' ? 0.92 : 0.65;
      wantX = -dirX * retreatWeight + perpX * 0.55;
      wantZ = -dirZ * retreatWeight + perpZ * 0.55;
    } else {
      this.aiState = 'MaintainingDistance';
      const pushPull = this.attackCooldown <= 0.1 ? 0.35 : -0.1;
      wantX = dirX * pushPull + perpX * 0.82;
      wantZ = dirZ * pushPull + perpZ * 0.82;
    }

    const steered = this.steerAvoidObstacles(wantX, wantZ, arena, allFighters);
    intent.moveX = steered.x;
    intent.moveZ = steered.z;

    return intent;
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

    // A) Check if bot is already inside a StairRamp corridor — keep driving straight along the stairs!
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

    // B) If bot is UP on the Central Skybridge and target is DOWN in the Courtyard -> Leap off the open center gap!
    if (!goingUp && Math.abs(self.body.x) < 10.5) {
      const dropX = clamp(target.body.x, -1.6, 1.6);
      if (Math.abs(self.body.x - dropX) > 1.7) {
        // Run along bridge deck to the unrailed center opening first
        const dx = dropX - self.body.x;
        const dz = 0 - self.body.z;
        const len = Math.max(0.01, Math.hypot(dx, dz));
        return {
          moveX: dx / len,
          moveZ: dz / len,
          aimYaw: yawFromDir(dx, dz, self.yaw),
        };
      } else {
        // Sprint right off the center Skybridge ledge toward the target below!
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

    // C) Pick optimal Staircase (closest to bot + aligned toward target)
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
    yawToTarget: number,
    arena: ArenaConfig,
    allFighters: Fighter[]
  ): void {
    this.aiState = 'Dodging';
    const self = this.fighter;

    let dodgeX: number;
    let dodgeZ: number;
    if (self.classId === 'spear') {
      dodgeX = -Math.sin(yawToTarget);
      dodgeZ = -Math.cos(yawToTarget);
    } else if (self.classId === 'hammer') {
      dodgeX = Math.sin(yawToTarget);
      dodgeZ = Math.cos(yawToTarget);
    } else {
      const sideYaw = yawToTarget + this.strafeSign * (Math.PI * 0.55);
      dodgeX = Math.sin(sideYaw);
      dodgeZ = Math.cos(sideYaw);
    }

    const steered = this.steerAvoidObstacles(dodgeX, dodgeZ, arena, allFighters);
    intent.moveX = steered.x;
    intent.moveZ = steered.z;
    intent.dodgePressed = true;
    this.defenseCooldown = 1.45 + this.rng() * 1.1;
  }

  private getClassRanges(): {
    minPreferred: number;
    maxPreferred: number;
    engageRange: number;
  } {
    switch (this.fighter.classId) {
      case 'spear':
        return { minPreferred: 2.35, maxPreferred: 3.35, engageRange: 3.55 };
      case 'dual':
        return { minPreferred: 1.05, maxPreferred: 1.9, engageRange: 2.15 };
      case 'hammer':
        return { minPreferred: 1.35, maxPreferred: 2.2, engageRange: 2.4 };
      case 'sword':
      default:
        return { minPreferred: 1.4, maxPreferred: 2.25, engageRange: 2.45 };
    }
  }

  private selectBestTarget(
    allFighters: Fighter[],
    botTargetCounts: Map<string, number>
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

      let score = 28.0 - d * 0.85 - dy * 2.1;
      score += (1 - hpRatio) * 3.8;
      if (this.lastDamagedById === candidate.id) {
        score += 5.5;
      }
      if (this.targetId === candidate.id) {
        score += 1.8;
      }
      score -= Math.max(0, othersTargeting) * 6.8;
      score += (this.rng() - 0.5) * 3.2;

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

      const approxR = Math.max(b.halfWidth, b.halfDepth) + self.body.radius + 0.45;
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
        pushX -= Math.sign(probeX) * ((Math.abs(probeX) - marginX) / 1.8) * 2.2;
      }
      if (Math.abs(probeZ) > marginZ) {
        pushZ -= Math.sign(probeZ) * ((Math.abs(probeZ) - marginZ) / 1.8) * 2.2;
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

    // Soft separation from other same-tier fighters
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
      const minSep = self.body.radius + other.body.radius + 0.85;
      if (d < minSep && d > 1e-4) {
        const s = ((minSep - d) / minSep) * 1.1;
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
