import { ArenaConfig } from '../config/arenaConfig';
import { AbilityKind, AttackConfig } from '../config/classes';
import { Fighter } from './Fighter';
import {
  angleDiff,
  distXZ,
  forwardFromYaw,
  isLineBlockedByPillars,
  yawFromDir,
} from './math';

export type CombatEventType =
  | 'swing'
  | 'ability_cast'
  | 'warcry_nova'
  | 'quake_slam'
  | 'dagger_throw'
  | 'dagger_hit'
  | 'hit'
  | 'heavy_hit'
  | 'blocked'
  | 'parried'
  | 'guard_broken'
  | 'evaded'
  | 'deflect_push'
  | 'shield_shove'
  | 'ground_slam'
  | 'death';

export interface CombatEvent {
  type: CombatEventType;
  attackerId: string;
  victimId?: string;
  abilityId?: AbilityKind;
  x: number;
  y: number;
  z: number;
  damage?: number;
  isHeavy?: boolean;
}

export interface ThrownProjectile {
  id: number;
  ownerId: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  damage: number;
  knockback: number;
  remainingDist: number;
}

interface PendingStrike {
  attacker: Fighter;
  victim: Fighter;
  attack: AttackConfig;
  dirX: number;
  dirZ: number;
  impactX: number;
  impactZ: number;
}

const DEG2RAD = Math.PI / 180;

export class CombatSystem {
  private emittedSlamSwings = new Set<string>();
  public readonly projectiles: ThrownProjectile[] = [];
  private nextProjectileId = 1;

  public reset(): void {
    this.emittedSlamSwings.clear();
    this.projectiles.length = 0;
  }

  /**
   * Evaluates all active hitboxes, class abilities, projectiles, spear deflects & shield shoves.
   */
  public step(
    fighters: Fighter[],
    arena: ArenaConfig,
    damageMultiplier = 1.0,
    dt = 1 / 60
  ): CombatEvent[] {
    const events: CombatEvent[] = [];

    // 1. Handle Spear Deflect, Hammer Shove, Dagger Projectile Spawn & Nova/Quake Bursts
    for (const f of fighters) {
      if (!f.isAlive) continue;

      if (f.pendingDaggerProjectile) {
        f.pendingDaggerProjectile = false;
        const ab = f.config.abilities[1];
        const fwd = forwardFromYaw(f.yaw);
        const speed = ab.projectileSpeed ?? 23.0;
        const spawnX = f.body.x + fwd.x * 0.75;
        const spawnY = f.body.y + 1.18;
        const spawnZ = f.body.z + fwd.z * 0.75;
        this.projectiles.push({
          id: this.nextProjectileId++,
          ownerId: f.id,
          x: spawnX,
          y: spawnY,
          z: spawnZ,
          vx: fwd.x * speed,
          vz: fwd.z * speed,
          yaw: f.yaw,
          damage: ab.projectileDamage ?? 22,
          knockback: 5.2,
          remainingDist: ab.projectileRange ?? 15.5,
        });
        events.push({
          type: 'dagger_throw',
          attackerId: f.id,
          abilityId: 'dual_dagger',
          x: spawnX,
          y: spawnY,
          z: spawnZ,
        });
      }

      if (f.state === 'Blocking' && f.deflectPulsePending) {
        f.deflectPulsePending = false;
        this.resolveSpearDeflectPulse(f, fighters, arena, events);
      }

      if (
        f.state === 'Dodging' &&
        f.config.dodge.mode === 'shield_shove' &&
        f.dodgeElapsed <= f.config.dodge.duration * 0.85
      ) {
        this.resolveShieldShove(f, fighters, arena, events);
      }

      // Emit ground dust / ability nova bursts once when entering Active phase
      if (f.isHitboxActive && f.activeAttack) {
        const style = f.activeAttack.animStyle;
        if (
          style === 'hammer_slam' ||
          style === 'ability_hammer_quake' ||
          style === 'ability_sword_warcry'
        ) {
          const key = `${f.id}_${f.swingInstanceId}`;
          if (!this.emittedSlamSwings.has(key)) {
            this.emittedSlamSwings.add(key);
            const fwd = forwardFromYaw(f.yaw);
            if (style === 'ability_sword_warcry') {
              events.push({
                type: 'warcry_nova',
                attackerId: f.id,
                abilityId: 'sword_warcry',
                x: f.body.x,
                y: f.body.y + 0.25,
                z: f.body.z,
              });
            } else if (style === 'ability_hammer_quake') {
              events.push({
                type: 'quake_slam',
                attackerId: f.id,
                abilityId: 'hammer_quake',
                x: f.body.x + fwd.x * 1.1,
                y: f.body.y + 0.1,
                z: f.body.z + fwd.z * 1.1,
                isHeavy: true,
              });
            } else {
              events.push({
                type: 'ground_slam',
                attackerId: f.id,
                x: f.body.x + fwd.x * 1.7,
                y: f.body.y + 0.1,
                z: f.body.z + fwd.z * 1.7,
                isHeavy: true,
              });
            }
          }
        }
      }
    }

    // 1b. Advance flying Dagger Projectiles!
    this.stepProjectiles(dt, fighters, arena, damageMultiplier, events);

    // 2. Collect all valid weapon sector hits before mutating states
    const pendingStrikes: PendingStrike[] = [];

    for (const attacker of fighters) {
      if (!attacker.isHitboxActive || !attacker.activeAttack) continue;
      const attack = attacker.activeAttack;

      for (const victim of fighters) {
        if (victim.id === attacker.id || !victim.isAlive) continue;
        if (attacker.hitTargetsThisSwing.has(victim.id)) continue;

        const hitInfo = this.checkWeaponHit(attacker, victim, attack, arena);
        if (hitInfo) {
          // Mark target hit for this swing immediately so it can never hit twice
          attacker.hitTargetsThisSwing.add(victim.id);
          pendingStrikes.push({
            attacker,
            victim,
            attack,
            dirX: hitInfo.dirX,
            dirZ: hitInfo.dirZ,
            impactX: hitInfo.impactX,
            impactZ: hitInfo.impactZ,
          });
        }
      }
    }

    // 3. Resolve collected strikes
    for (const strike of pendingStrikes) {
      this.resolveStrike(strike, damageMultiplier, events);
    }

    return events;
  }

  /**
   * Spatial hitbox query (sector + reach + hurtbox radius + pillar occlusion).
   */
  public checkWeaponHit(
    attacker: Fighter,
    victim: Fighter,
    attack: AttackConfig,
    arena: ArenaConfig
  ): { dirX: number; dirZ: number; impactX: number; impactZ: number } | null {
    // Vertical separation check: allows jump-slashes (<= 1.88m) while blocking under/over 4m bridge hits!
    if (Math.abs(victim.body.y - attacker.body.y) > 1.88) {
      return null;
    }

    const dx = victim.body.x - attacker.body.x;
    const dz = victim.body.z - attacker.body.z;
    const centerDist = Math.hypot(dx, dz);

    const maxCenterDist = attack.range + victim.body.radius;
    if (centerDist > maxCenterDist) return null;

    let dirX = 0;
    let dirZ = 1;
    if (centerDist > 1e-4) {
      dirX = dx / centerDist;
      dirZ = dz / centerDist;
    } else {
      const fwd = forwardFromYaw(attacker.yaw);
      dirX = fwd.x;
      dirZ = fwd.z;
    }

    const angleToVictim = yawFromDir(dirX, dirZ, attacker.yaw);
    const yawDelta = Math.abs(angleDiff(attacker.yaw, angleToVictim));
    const halfArcRad = attack.hitAngleDeg * 0.5 * DEG2RAD;

    // Slight close-quarters angular forgiveness when enemy hurtbox touches attacker's front chest
    const closeBonusRad = centerDist < attacker.body.radius + victim.body.radius + 0.35 ? 0.24 : 0;
    if (yawDelta > halfArcRad + closeBonusRad) {
      return null;
    }

    // Obstacle check: cannot strike through stone columns at current tier elevation
    if (
      isLineBlockedByPillars(
        attacker.body.x,
        attacker.body.z,
        victim.body.x,
        victim.body.z,
        arena,
        0.05,
        Math.min(attacker.body.y, victim.body.y)
      )
    ) {
      return null;
    }

    const impactX = victim.body.x - dirX * victim.body.radius * 0.6;
    const impactZ = victim.body.z - dirZ * victim.body.radius * 0.6;

    return { dirX, dirZ, impactX, impactZ };
  }

  private resolveStrike(
    strike: PendingStrike,
    damageMultiplier: number,
    events: CombatEvent[]
  ): void {
    const { attacker, victim, attack, dirX, dirZ, impactX, impactZ } = strike;
    if (!victim.isAlive) return;
    const baseY = victim.body.y;

    const attackerAuraMult = attacker.damageAuraTimer > 0 ? 1.25 : 1.0;
    const victimBastionMult = victim.ironBastionTimer > 0 ? 0.65 : 1.0;
    const totalDamageMult =
      damageMultiplier * attackerAuraMult * victimBastionMult;

    // 1. Dodge invulnerability frames
    if (victim.hasDodgeIframes) {
      events.push({
        type: 'evaded',
        attackerId: attacker.id,
        victimId: victim.id,
        x: victim.body.x,
        y: baseY + 1.0,
        z: victim.body.z,
      });
      return;
    }

    // 2. Check directional defense (Block / Timed Parry / Spear Deflect / Shield Charge Guard)
    if (victim.state === 'Blocking' || victim.hasFrontalAbilityGuard) {
      const angleToAttacker = yawFromDir(
        attacker.body.x - victim.body.x,
        attacker.body.z - victim.body.z,
        victim.yaw
      );
      const blockHalfRad = victim.config.defense.blockAngleDeg * 0.5 * DEG2RAD;
      const isFacingAttacker =
        Math.abs(angleDiff(victim.yaw, angleToAttacker)) <= blockHalfRad;

      if (isFacingAttacker) {
        const def = victim.config.defense;

        // Class B: Timed Parry!
        if (def.mode === 'timed_parry') {
          victim.stats.blocksSucceeded += 1;
          victim.blockImpactTimer = 0.28;
          // Push & stun attacker!
          attacker.body.applyImpulse(
            -dirX * def.deflectPushback,
            -dirZ * def.deflectPushback
          );
          if (attacker.isAlive) {
            attacker.applyStun(def.parryStunDuration);
          }
          events.push({
            type: 'parried',
            attackerId: attacker.id,
            victimId: victim.id,
            x: impactX,
            y: baseY + 1.15,
            z: impactZ,
            damage: 0,
          });
          return;
        }

        // Standard directional block / heavy shield / spear deflect (if attack is blockable)
        if (attack.blockable) {
          const staminaHitCost =
            attack.guardStaminaDamage * def.blockedHitStaminaFactor;

          if (victim.stamina >= staminaHitCost) {
            victim.drainStaminaClamped(staminaHitCost);
            victim.stats.blocksSucceeded += 1;
            victim.blockImpactTimer = 0.28;

            const rawChip =
              attack.damage *
              totalDamageMult *
              (1 - def.damageReduction) *
              (1 - victim.config.armorReduction);
            const chipDamage = Math.round(rawChip * 10) / 10;

            victim.body.applyImpulse(
              dirX * attack.knockback * 0.42,
              dirZ * attack.knockback * 0.42
            );
            attacker.body.applyImpulse(-dirX * 2.2, -dirZ * 2.2);

            if (chipDamage >= 0.5) {
              const died = victim.takeRawDamage(chipDamage, attacker.id);
              attacker.stats.damageDealt += chipDamage;
              if (died) {
                attacker.stats.kills += 1;
                events.push({
                  type: 'death',
                  attackerId: attacker.id,
                  victimId: victim.id,
                  x: victim.body.x,
                  y: baseY + 0.9,
                  z: victim.body.z,
                });
                return;
              }
            }

            events.push({
              type: 'blocked',
              attackerId: attacker.id,
              victimId: victim.id,
              x: impactX,
              y: baseY + 1.1,
              z: impactZ,
              damage: chipDamage,
            });
            return;
          } else {
            // Guard Broken! Defender lacked stamina to hold the block
            victim.drainStaminaClamped(victim.stamina);
            const breakDmg = Math.round(
              attack.damage *
                totalDamageMult *
                0.5 *
                (1 - victim.config.armorReduction)
            );
            victim.body.applyImpulse(
              dirX * attack.knockback * 0.85,
              dirZ * attack.knockback * 0.85
            );
            const died = victim.takeRawDamage(breakDmg, attacker.id);
            attacker.stats.damageDealt += breakDmg;

            if (died) {
              attacker.stats.kills += 1;
              events.push({
                type: 'death',
                attackerId: attacker.id,
                victimId: victim.id,
                x: victim.body.x,
                y: baseY + 0.9,
                z: victim.body.z,
              });
            } else {
              victim.applyStun(0.9);
              events.push({
                type: 'guard_broken',
                attackerId: attacker.id,
                victimId: victim.id,
                x: impactX,
                y: baseY + 1.15,
                z: impactZ,
                damage: breakDmg,
              });
            }
            return;
          }
        }
      }
    }

    // 3. Direct Unblocked Hit!
    const mitigated =
      attack.damage * totalDamageMult * (1 - victim.config.armorReduction);
    const finalDamage = Math.max(1, Math.round(mitigated));

    victim.body.applyImpulse(dirX * attack.knockback, dirZ * attack.knockback);
    const killed = victim.takeRawDamage(finalDamage, attacker.id);
    attacker.stats.damageDealt += finalDamage;

    events.push({
      type: attack.isHeavy ? 'heavy_hit' : 'hit',
      attackerId: attacker.id,
      victimId: victim.id,
      x: impactX,
      y: baseY + 1.1,
      z: impactZ,
      damage: finalDamage,
      isHeavy: attack.isHeavy,
    });

    if (killed) {
      attacker.stats.kills += 1;
      events.push({
        type: 'death',
        attackerId: attacker.id,
        victimId: victim.id,
        x: victim.body.x,
        y: baseY + 0.9,
        z: victim.body.z,
      });
    } else if (attacker.activeAbility?.appliesFullStun) {
      // Hammer [1] Siege Ram applies a full Stunned state with overhead stars!
      victim.applyStun(attack.stunDurationOnHit);
    } else {
      victim.applyHitReaction(attack.stunDurationOnHit, attack.isHeavy);
    }
  }

  private stepProjectiles(
    dt: number,
    fighters: Fighter[],
    arena: ArenaConfig,
    damageMultiplier: number,
    events: CombatEvent[]
  ): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const prevX = p.x;
      const prevZ = p.z;
      const stepDist = Math.hypot(p.vx * dt, p.vz * dt);
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.remainingDist -= stepDist;

      // Check outer wall or stone column impact
      const outOfBounds =
        (arena.boundsHalfX &&
          (Math.abs(p.x) >= arena.boundsHalfX ||
            Math.abs(p.z) >= arena.boundsHalfZ)) ||
        Math.hypot(p.x, p.z) >= arena.radius - 0.2;

      const hitPillar = isLineBlockedByPillars(
        prevX,
        prevZ,
        p.x,
        p.z,
        arena,
        0.1,
        Math.max(0, p.y - 1.1)
      );

      if (outOfBounds || hitPillar || p.remainingDist <= 0) {
        if (outOfBounds || hitPillar) {
          events.push({
            type: 'blocked',
            attackerId: p.ownerId,
            x: p.x,
            y: p.y,
            z: p.z,
            damage: 0,
          });
        }
        this.projectiles.splice(i, 1);
        continue;
      }

      // Check fighter collision along projectile path
      const owner = fighters.find((f) => f.id === p.ownerId) ?? null;
      let consumed = false;

      for (const victim of fighters) {
        if (victim.id === p.ownerId || !victim.isAlive) continue;
        if (Math.abs(victim.body.y + 1.05 - p.y) > 1.35) continue;

        const d = distXZ(p.x, p.z, victim.body.x, victim.body.z);
        if (d > victim.body.radius + 0.32) continue;

        consumed = true;
        if (victim.hasDodgeIframes) {
          events.push({
            type: 'evaded',
            attackerId: p.ownerId,
            victimId: victim.id,
            x: victim.body.x,
            y: victim.body.y + 1.0,
            z: victim.body.z,
          });
          break;
        }

        const spd = Math.max(0.01, Math.hypot(p.vx, p.vz));
        const dirX = p.vx / spd;
        const dirZ = p.vz / spd;

        // Check if victim is blocking toward incoming dagger
        if (victim.state === 'Blocking' || victim.hasFrontalAbilityGuard) {
          const angToDagger = yawFromDir(-dirX, -dirZ, victim.yaw);
          const halfArc = victim.config.defense.blockAngleDeg * 0.5 * DEG2RAD;
          if (Math.abs(angleDiff(victim.yaw, angToDagger)) <= halfArc) {
            victim.blockImpactTimer = 0.24;
            victim.stats.blocksSucceeded += 1;
            events.push({
              type: 'blocked',
              attackerId: p.ownerId,
              victimId: victim.id,
              x: p.x,
              y: p.y,
              z: p.z,
              damage: 0,
            });
            break;
          }
        }

        const auraMult = owner && owner.damageAuraTimer > 0 ? 1.25 : 1.0;
        const bastionMult = victim.ironBastionTimer > 0 ? 0.65 : 1.0;
        const dmg = Math.max(
          1,
          Math.round(
            p.damage *
              damageMultiplier *
              auraMult *
              bastionMult *
              (1 - victim.config.armorReduction)
          )
        );

        victim.body.applyImpulse(dirX * p.knockback, dirZ * p.knockback);
        const killed = victim.takeRawDamage(dmg, p.ownerId);
        if (owner) owner.stats.damageDealt += dmg;

        events.push({
          type: 'dagger_hit',
          attackerId: p.ownerId,
          victimId: victim.id,
          x: p.x,
          y: p.y,
          z: p.z,
          damage: dmg,
        });

        if (killed) {
          if (owner) owner.stats.kills += 1;
          events.push({
            type: 'death',
            attackerId: p.ownerId,
            victimId: victim.id,
            x: victim.body.x,
            y: victim.body.y + 0.9,
            z: victim.body.z,
          });
        } else {
          victim.applyHitReaction(0.36, false);
        }
        break;
      }

      if (consumed) {
        this.projectiles.splice(i, 1);
      }
    }
  }

  private resolveSpearDeflectPulse(
    defender: Fighter,
    fighters: Fighter[],
    arena: ArenaConfig,
    events: CombatEvent[]
  ): void {
    const pushRange = 2.45;
    const halfArc = 68 * DEG2RAD;

    for (const other of fighters) {
      if (other.id === defender.id || !other.isAlive) continue;
      if (Math.abs(other.body.y - defender.body.y) > 1.65) continue;
      const dist = distXZ(
        defender.body.x,
        defender.body.z,
        other.body.x,
        other.body.z
      );
      if (dist > pushRange + other.body.radius) continue;

      const dx = other.body.x - defender.body.x;
      const dz = other.body.z - defender.body.z;
      const ang = yawFromDir(dx, dz, defender.yaw);
      if (Math.abs(angleDiff(defender.yaw, ang)) > halfArc) continue;
      if (
        isLineBlockedByPillars(
          defender.body.x,
          defender.body.z,
          other.body.x,
          other.body.z,
          arena,
          0.05,
          Math.min(defender.body.y, other.body.y)
        )
      ) {
        continue;
      }

      const d = Math.max(0.01, dist);
      const nx = dx / d;
      const nz = dz / d;
      other.body.applyImpulse(
        nx * defender.config.defense.deflectPushback,
        nz * defender.config.defense.deflectPushback
      );
      other.applyHitReaction(0.28, false);

      events.push({
        type: 'deflect_push',
        attackerId: defender.id,
        victimId: other.id,
        x: (defender.body.x + other.body.x) * 0.5,
        y: other.body.y + 1.05,
        z: (defender.body.z + other.body.z) * 0.5,
      });
    }
  }

  private resolveShieldShove(
    basher: Fighter,
    fighters: Fighter[],
    arena: ArenaConfig,
    events: CombatEvent[]
  ): void {
    const dodge = basher.config.dodge;
    const halfArc = 65 * DEG2RAD;

    for (const other of fighters) {
      if (other.id === basher.id || !other.isAlive) continue;
      if (Math.abs(other.body.y - basher.body.y) > 1.65) continue;
      if (basher.shoveHitIds.has(other.id)) continue;

      const dist = distXZ(
        basher.body.x,
        basher.body.z,
        other.body.x,
        other.body.z
      );
      if (dist > dodge.shoveRadius + other.body.radius) continue;

      const dx = other.body.x - basher.body.x;
      const dz = other.body.z - basher.body.z;
      const ang = yawFromDir(dx, dz, basher.yaw);
      if (Math.abs(angleDiff(basher.yaw, ang)) > halfArc) continue;
      if (
        isLineBlockedByPillars(
          basher.body.x,
          basher.body.z,
          other.body.x,
          other.body.z,
          arena,
          0.05,
          Math.min(basher.body.y, other.body.y)
        )
      ) {
        continue;
      }

      basher.shoveHitIds.add(other.id);
      if (other.hasDodgeIframes) continue;

      const d = Math.max(0.01, dist);
      const nx = dx / d;
      const nz = dz / d;
      other.body.applyImpulse(
        nx * dodge.shoveKnockback,
        nz * dodge.shoveKnockback
      );
      const dmg = dodge.shoveDamage;
      const killed = other.takeRawDamage(dmg, basher.id);
      basher.stats.damageDealt += dmg;

      events.push({
        type: 'shield_shove',
        attackerId: basher.id,
        victimId: other.id,
        x: (basher.body.x + other.body.x) * 0.5,
        y: other.body.y + 1.0,
        z: (basher.body.z + other.body.z) * 0.5,
        damage: dmg,
      });

      if (killed) {
        basher.stats.kills += 1;
        events.push({
          type: 'death',
          attackerId: basher.id,
          victimId: other.id,
          x: other.body.x,
          y: other.body.y + 0.9,
          z: other.body.z,
        });
      } else {
        other.applyHitReaction(0.32, false);
      }
    }
  }
}
