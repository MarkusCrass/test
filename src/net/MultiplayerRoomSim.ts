import { ARENA_CONFIG, ArenaConfig } from '../config/arenaConfig';
import {
  AttackConfig,
  CLASS_ORDER,
  ClassAbilityConfig,
  KNIGHT_CLASSES,
  KnightClassId,
} from '../config/classes';
import { BotController } from '../core/BotAI';
import { CharacterBody } from '../core/CharacterBody';
import { CombatEvent, CombatSystem } from '../core/CombatSystem';
import {
  createEmptyIntent,
  Fighter,
  FighterInputIntent,
} from '../core/Fighter';
import {
  DEFAULT_MATCH_DURATION,
  FINAL_PHASE_THRESHOLD,
  KillFeedEntry,
  MatchManager,
  MatchState,
} from '../core/MatchManager';
import { angleDiff, clamp } from '../core/math';
import {
  ClientFighterPose,
  ClientInputPacket,
  FighterNetSnapshot,
  MAX_PLAYERS_PER_ROOM,
  WorldSnapshot,
} from './protocol';

const BOT_NAMES: Record<KnightClassId, string[]> = {
  sword: ['Сэр Роланд', 'Сир Гарет'],
  dual: ['Корвус Двуклинок', 'Весп Вихрь'],
  spear: ['Ульрих Пика', 'Лотар Копейщик'],
  hammer: ['Торвальд Молот', 'Брат Гром'],
  barbarian: ['Хальвар Лютый', 'Рагнар Секира'],
  duelist: ['Этьен де Валь', 'Сир Люциан'],
  skeleton_knight: ['Лорд Мортис', 'Страж Склепа'],
  skeleton_reaper: ['Тень Жнеца', 'Малакор Серп'],
  skeleton_berserker: ['Центурион Праха', 'Кратос Костяной'],
};

interface HumanInputSlot {
  latest: ClientInputPacket;
  pose: ClientFighterPose | null;
  poseAge: number;
  sawHeldSinceStep: boolean;
  consumedHeldTrueInStep: boolean;
  latchedLightTap: boolean;
  latchedJump: boolean;
  latchedDodge: boolean;
  latchedAb1: boolean;
  latchedAb2: boolean;
  latchedAb3: boolean;
  seenAttackSeq: number;
  seenJumpSeq: number;
  seenDodgeSeq: number;
  seenAb1Seq: number;
  seenAb2Seq: number;
  seenAb3Seq: number;
}

export interface SimTickResult {
  events: CombatEvent[];
  footsteps: string[];
  jumps: string[];
  dodges: string[];
  landings: Array<{ id: string; x: number; y: number; z: number }>;
  enteredFinalPhase: boolean;
  phaseChangedTo: 'InProgress' | 'MatchFinished' | null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Pure-TypeScript Authoritative Multiplayer Arena Simulation.
 * Supports 1..5 real human players plus optional tactical BotAI fighters.
 */
export class AuthoritativeMatchSim {
  public readonly arena: ArenaConfig;
  public fighters: Fighter[] = [];
  public readonly bots = new Map<string, BotController>();
  public readonly combatSystem = new CombatSystem();
  private readonly humanInputs = new Map<string, HumanInputSlot>();

  public phase: 'Countdown' | 'InProgress' | 'MatchFinished' = 'Countdown';
  public countdownTimer = 3.0;
  public matchTimeRemaining = DEFAULT_MATCH_DURATION;
  public matchElapsed = 0;
  public isFinalPhase = false;
  public winnerId: string | null = null;
  public finishReason: 'last_standing' | 'time_up' | 'draw' | null = null;

  public killFeed: KillFeedEntry[] = [];
  private nextKillFeedId = 1;
  private eliminationCounter = 0;
  private hazardTickAccum = 0;
  private readonly rng: () => number;

  constructor(
    arena: ArenaConfig = ARENA_CONFIG,
    rng: () => number = Math.random
  ) {
    this.arena = arena;
    this.rng = rng;
  }

  public start(
    humanPlayers: Array<{
      fighterId: string;
      name: string;
      classId: KnightClassId;
    }>,
    fillBots: boolean
  ): void {
    this.fighters = [];
    this.bots.clear();
    this.humanInputs.clear();
    this.combatSystem.reset();
    this.killFeed = [];
    this.nextKillFeedId = 1;
    this.eliminationCounter = 0;
    this.hazardTickAccum = 0;
    this.winnerId = null;
    this.finishReason = null;

    // Spread spawn order across opposite corners/tiers so 2-3 player matches start well separated
    const spawnOrder = [0, 2, 4, 1, 3];
    const usedNames = new Set<string>();

    const cappedHumans = humanPlayers.slice(0, MAX_PLAYERS_PER_ROOM);
    cappedHumans.forEach((hp, idx) => {
      const sp = this.arena.spawns[spawnOrder[idx % spawnOrder.length]];
      usedNames.add(hp.name);
      const fighter = new Fighter({
        id: hp.fighterId,
        displayName: hp.name,
        isHuman: true,
        classId: hp.classId,
        x: sp.x,
        y: sp.y ?? 0,
        z: sp.z,
        yaw: sp.yaw,
      });
      fighter.body.constrainToArena(this.arena);
      this.fighters.push(fighter);
      this.humanInputs.set(hp.fighterId, {
        latest: {
          moveX: 0,
          moveZ: 0,
          aimYaw: sp.yaw,
          sprint: false,
          attackHeld: false,
          blockHeld: false,
          jumpSeq: 0,
          dodgeSeq: 0,
          ability1Seq: 0,
          ability2Seq: 0,
          ability3Seq: 0,
        },
        pose: null,
        poseAge: 99,
        sawHeldSinceStep: false,
        consumedHeldTrueInStep: false,
        latchedLightTap: false,
        latchedJump: false,
        latchedDodge: false,
        latchedAb1: false,
        latchedAb2: false,
        latchedAb3: false,
        seenAttackSeq: 0,
        seenJumpSeq: 0,
        seenDodgeSeq: 0,
        seenAb1Seq: 0,
        seenAb2Seq: 0,
        seenAb3Seq: 0,
      });
    });

    // Determine bot count: fill up to 5 if fillBots=true, or add 1 duel bot if only 1 human started
    const desiredTotal = fillBots
      ? MAX_PLAYERS_PER_ROOM
      : Math.max(2, cappedHumans.length);
    const botCount = Math.max(0, desiredTotal - cappedHumans.length);

    const presentClasses = new Set(cappedHumans.map((h) => h.classId));
    const missingClasses = CLASS_ORDER.filter((c) => !presentClasses.has(c));
    const botPool: KnightClassId[] = [...missingClasses, ...CLASS_ORDER];

    for (let i = 0; i < botCount; i++) {
      const spawnIdx =
        spawnOrder[(cappedHumans.length + i) % spawnOrder.length];
      const sp = this.arena.spawns[spawnIdx];
      const cls = botPool[i % botPool.length];
      const names = BOT_NAMES[cls];
      let botName = names.find((n) => !usedNames.has(n)) ?? `${names[0]} ${i + 1}`;
      botName = `🤖 ${botName}`;
      usedNames.add(botName);

      const botId = `bot_${i + 1}`;
      const botFighter = new Fighter({
        id: botId,
        displayName: botName,
        isHuman: false,
        classId: cls,
        x: sp.x,
        y: sp.y ?? 0,
        z: sp.z,
        yaw: sp.yaw,
      });
      botFighter.body.constrainToArena(this.arena);
      this.fighters.push(botFighter);
      this.bots.set(botId, new BotController(botFighter, this.rng));
    }

    if (this.fighters.length > 1) {
      CharacterBody.resolveFighterCollisions(
        this.fighters.map((f) => f.body),
        this.arena
      );
    }

    this.phase = 'Countdown';
    this.countdownTimer = 3.0;
    this.matchTimeRemaining = DEFAULT_MATCH_DURATION;
    this.matchElapsed = 0;
    this.isFinalPhase = false;
  }

  public submitInput(fighterId: string, packet: ClientInputPacket): void {
    const slot = this.humanInputs.get(fighterId);
    if (!slot) return;

    if (packet.attackHeld) {
      slot.sawHeldSinceStep = true;
    } else if (slot.sawHeldSinceStep && !slot.consumedHeldTrueInStep) {
      // Sub-tick click-and-release (<16ms): guarantee light attack tap!
      slot.latchedLightTap = true;
      slot.sawHeldSinceStep = false;
    }

    slot.latest = packet;
    if (
      packet.pose &&
      Number.isFinite(packet.pose.x) &&
      Number.isFinite(packet.pose.y) &&
      Number.isFinite(packet.pose.z) &&
      Number.isFinite(packet.pose.vx) &&
      Number.isFinite(packet.pose.vy) &&
      Number.isFinite(packet.pose.vz) &&
      Number.isFinite(packet.pose.yaw)
    ) {
      slot.pose = { ...packet.pose };
      slot.poseAge = 0;
    }
    if (typeof packet.attackSeq === 'number' && packet.attackSeq > slot.seenAttackSeq) {
      slot.seenAttackSeq = packet.attackSeq;
      if (!packet.attackHeld) {
        slot.latchedLightTap = true;
      }
    }
    if (packet.jumpSeq > slot.seenJumpSeq) {
      slot.seenJumpSeq = packet.jumpSeq;
      slot.latchedJump = true;
    }
    if (packet.dodgeSeq > slot.seenDodgeSeq) {
      slot.seenDodgeSeq = packet.dodgeSeq;
      slot.latchedDodge = true;
    }
    if (packet.ability1Seq > slot.seenAb1Seq) {
      slot.seenAb1Seq = packet.ability1Seq;
      slot.latchedAb1 = true;
    }
    if (packet.ability2Seq > slot.seenAb2Seq) {
      slot.seenAb2Seq = packet.ability2Seq;
      slot.latchedAb2 = true;
    }
    if (
      typeof packet.ability3Seq === 'number' &&
      packet.ability3Seq > slot.seenAb3Seq
    ) {
      slot.seenAb3Seq = packet.ability3Seq;
      slot.latchedAb3 = true;
    }
  }

  public eliminateDisconnectedFighter(fighterId: string): CombatEvent | null {
    const fighter = this.fighters.find((f) => f.id === fighterId);
    this.humanInputs.delete(fighterId);
    if (!fighter || !fighter.isAlive || this.phase === 'MatchFinished') {
      return null;
    }

    fighter.takeRawDamage(9999, null);
    this.eliminationCounter += 1;
    fighter.stats.eliminatedOrder = this.eliminationCounter;
    this.killFeed.unshift({
      id: this.nextKillFeedId++,
      killerName: null,
      victimName: fighter.displayName,
      timestamp: this.matchElapsed,
    });
    if (this.killFeed.length > 6) {
      this.killFeed.length = 6;
    }

    this.evaluateMatchEnd();
    return {
      type: 'death',
      attackerId: fighter.id,
      victimId: fighter.id,
      x: fighter.body.x,
      y: fighter.body.y + 0.9,
      z: fighter.body.z,
    };
  }

  public step(dt: number): SimTickResult {
    const out: SimTickResult = {
      events: [],
      footsteps: [],
      jumps: [],
      dodges: [],
      landings: [],
      enteredFinalPhase: false,
      phaseChangedTo: null,
    };

    if (this.phase === 'MatchFinished') {
      return out;
    }

    if (this.phase === 'Countdown') {
      this.countdownTimer -= dt;
      const idle = createEmptyIntent();
      for (const f of this.fighters) {
        const slot = this.humanInputs.get(f.id);
        const aimYaw = slot ? slot.latest.aimYaw : f.yaw;
        f.update(dt, { ...idle, aimYaw }, this.arena, false);
      }
      if (this.countdownTimer <= 0) {
        this.countdownTimer = 0;
        this.phase = 'InProgress';
        out.phaseChangedTo = 'InProgress';
      }
      return out;
    }

    // Active Combat
    this.matchElapsed += dt;
    this.matchTimeRemaining = Math.max(0, this.matchTimeRemaining - dt);
    const prevFinal = this.isFinalPhase;
    this.isFinalPhase = this.matchTimeRemaining <= FINAL_PHASE_THRESHOLD;
    if (!prevFinal && this.isFinalPhase) {
      out.enteredFinalPhase = true;
    }

    const botTargetCounts = new Map<string, number>();
    for (const bot of this.bots.values()) {
      if (bot.fighter.isAlive && bot.targetId) {
        botTargetCounts.set(
          bot.targetId,
          (botTargetCounts.get(bot.targetId) ?? 0) + 1
        );
      }
    }

    const wasAlive = new Set(
      this.fighters.filter((f) => f.isAlive).map((f) => f.id)
    );

    for (const fighter of this.fighters) {
      let intent: FighterInputIntent;
      const slot = this.humanInputs.get(fighter.id);
      if (fighter.isHuman) {
        if (fighter.isAlive && slot) {
          const attackHeld = Boolean(slot.latest.attackHeld);
          intent = {
            moveX: Number.isFinite(slot.latest.moveX) ? slot.latest.moveX : 0,
            moveZ: Number.isFinite(slot.latest.moveZ) ? slot.latest.moveZ : 0,
            aimYaw: Number.isFinite(slot.latest.aimYaw)
              ? slot.latest.aimYaw
              : fighter.yaw,
            aimPitch: Number.isFinite(slot.latest.aimPitch)
              ? slot.latest.aimPitch
              : 0,
            hasAimOverride: true,
            sprint: Boolean(slot.latest.sprint),
            attackHeld,
            lightAttackTap: slot.latchedLightTap,
            heavyAttackRequest: false,
            blockHeld: Boolean(slot.latest.blockHeld),
            jumpPressed: slot.latchedJump,
            dodgePressed: slot.latchedDodge,
            ability1Pressed: slot.latchedAb1,
            ability2Pressed: slot.latchedAb2,
            ability3Pressed: slot.latchedAb3,
          };
          slot.consumedHeldTrueInStep = attackHeld;
          if (!attackHeld) {
            slot.sawHeldSinceStep = false;
          }
          slot.latchedLightTap = false;
          slot.latchedJump = false;
          slot.latchedDodge = false;
          slot.latchedAb1 = false;
          slot.latchedAb2 = false;
          slot.latchedAb3 = false;
        } else {
          intent = createEmptyIntent(fighter.yaw);
        }
      } else {
        const bot = this.bots.get(fighter.id);
        intent = bot
          ? bot.update(
              dt,
              this.fighters,
              botTargetCounts,
              this.arena,
              true,
              this.combatSystem.projectiles
            )
          : createEmptyIntent(fighter.yaw);
      }

      const prevState = fighter.state;
      const stepRes = fighter.update(dt, intent, this.arena, true);

      // Smoothly align Guest's server body with Guest's real client pose across all 60 Hz ticks
      // so neither Host nor Guest sees stepping or position divergence!
      if (
        fighter.isHuman &&
        fighter.isAlive &&
        slot?.pose &&
        slot.poseAge < 0.24 &&
        fighter.state !== 'HitReaction' &&
        fighter.state !== 'Stunned'
      ) {
        slot.poseAge += dt;
        const p = slot.pose;
        p.x += p.vx * dt;
        p.z += p.vz * dt;
        if (!p.isGrounded || Math.abs(p.vy) > 0.05) {
          p.vy -= 26.0 * dt;
          p.y += p.vy * dt;
          if (p.y <= p.supportFloorY) {
            p.y = p.supportFloorY;
            p.vy = 0;
            p.isGrounded = true;
          }
        }
        const dist = Math.hypot(p.x - fighter.body.x, p.z - fighter.body.z);
        if (dist < 8.5) {
          const inAction =
            fighter.state === 'Attacking' ||
            fighter.state === 'HeavyAttacking' ||
            fighter.state === 'Dodging';
          const blend = 1 - Math.exp((inAction ? -10 : -18) * dt);
          fighter.body.x += (p.x - fighter.body.x) * blend;
          fighter.body.y += (p.y - fighter.body.y) * blend;
          fighter.body.z += (p.z - fighter.body.z) * blend;
          fighter.body.vx = p.vx;
          fighter.body.vy = p.vy;
          fighter.body.vz = p.vz;
          fighter.body.isGrounded = p.isGrounded;
          fighter.body.supportFloorY = p.supportFloorY;
          if (!inAction) {
            fighter.yaw += angleDiff(fighter.yaw, p.yaw) * (1 - Math.exp(-22 * dt));
          }
          fighter.body.constrainToArena(this.arena);
        } else {
          // Reject impossible teleport >8.5m
          slot.pose = null;
        }
      }

      if (prevState !== 'Dodging' && fighter.state === 'Dodging') {
        out.dodges.push(fighter.id);
      }
      if (stepRes.stepped) {
        out.footsteps.push(fighter.id);
      }
      if (stepRes.jumped) {
        out.jumps.push(fighter.id);
      }
      if (stepRes.landed) {
        out.landings.push({
          id: fighter.id,
          x: round3(fighter.body.x),
          y: round3(fighter.body.y),
          z: round3(fighter.body.z),
        });
      }
      if (stepRes.usedAbility) {
        out.events.push({
          type: 'ability_cast',
          attackerId: fighter.id,
          abilityId: stepRes.usedAbility.id,
          x: round3(fighter.body.x),
          y: round3(fighter.body.y + 1.15),
          z: round3(fighter.body.z),
          isHeavy: stepRes.usedAbility.attackProfile.isHeavy,
        });
      } else if (stepRes.swungAttack) {
        out.events.push({
          type: 'swing',
          attackerId: fighter.id,
          x: round3(fighter.body.x),
          y: round3(fighter.body.y + 1.15),
          z: round3(fighter.body.z),
          isHeavy: stepRes.swungAttack.isHeavy,
        });
      }
    }

    const livingBodies = this.fighters
      .filter((f) => f.isAlive)
      .map((f) => f.body);
    CharacterBody.resolveFighterCollisions(livingBodies, this.arena);

    const dmgMult = this.isFinalPhase ? 1.45 : 1.0;
    const combatEvents = this.combatSystem.step(
      this.fighters,
      this.arena,
      dmgMult,
      dt
    );
    out.events.push(...combatEvents);

    for (const ev of combatEvents) {
      if (
        (ev.type === 'hit' ||
          ev.type === 'heavy_hit' ||
          ev.type === 'guard_broken' ||
          ev.type === 'shield_shove') &&
        ev.victimId
      ) {
        this.bots.get(ev.victimId)?.notifyDamagedBy(ev.attackerId);
      }
    }

    if (this.isFinalPhase) {
      this.hazardTickAccum += dt;
      if (this.hazardTickAccum >= 0.5) {
        this.hazardTickAccum -= 0.5;
        for (const f of this.fighters) {
          if (!f.isAlive) continue;
          if (Math.hypot(f.body.x, f.body.z) > 16.5) {
            const died = f.takeRawDamage(4, null);
            if (died) {
              out.events.push({
                type: 'death',
                attackerId: f.id,
                victimId: f.id,
                x: round3(f.body.x),
                y: round3(f.body.y + 0.9),
                z: round3(f.body.z),
              });
            }
          }
        }
      }
    }

    for (const f of this.fighters) {
      if (wasAlive.has(f.id) && !f.isAlive) {
        this.eliminationCounter += 1;
        f.stats.eliminatedOrder = this.eliminationCounter;
        const killer = f.stats.killerId
          ? this.fighters.find((k) => k.id === f.stats.killerId) ?? null
          : null;
        this.killFeed.unshift({
          id: this.nextKillFeedId++,
          killerName: killer ? killer.displayName : null,
          victimName: f.displayName,
          timestamp: round3(this.matchElapsed),
        });
        if (this.killFeed.length > 6) {
          this.killFeed.length = 6;
        }
      }
    }

    if (this.evaluateMatchEnd()) {
      out.phaseChangedTo = 'MatchFinished';
    }

    return out;
  }

  private evaluateMatchEnd(): boolean {
    if (this.phase === 'MatchFinished') return false;
    const alive = this.fighters.filter((f) => f.isAlive);

    if (alive.length <= 1) {
      if (alive.length === 1) {
        this.winnerId = alive[0].id;
        this.finishReason = 'last_standing';
      } else {
        const best = [...this.fighters].sort(
          (a, b) => b.stats.damageDealt - a.stats.damageDealt
        )[0];
        this.winnerId = best ? best.id : null;
        this.finishReason = 'draw';
      }
      this.phase = 'MatchFinished';
      return true;
    }

    if (this.matchTimeRemaining <= 0) {
      const rankedAlive = [...alive].sort((a, b) => {
        const hpDiff = b.hp / b.maxHp - a.hp / a.maxHp;
        if (Math.abs(hpDiff) > 0.01) return hpDiff;
        if (b.stats.damageDealt !== a.stats.damageDealt) {
          return b.stats.damageDealt - a.stats.damageDealt;
        }
        return b.stats.kills - a.stats.kills;
      });
      this.winnerId = rankedAlive[0].id;
      this.finishReason = 'time_up';
      this.phase = 'MatchFinished';
      return true;
    }

    return false;
  }

  public buildSnapshot(serverTick: number): WorldSnapshot {
    return {
      serverTick,
      phase: this.phase,
      countdownTimer: round2(this.countdownTimer),
      matchTimeRemaining: round2(this.matchTimeRemaining),
      matchElapsed: round2(this.matchElapsed),
      isFinalPhase: this.isFinalPhase,
      winnerId: this.winnerId,
      finishReason: this.finishReason,
      fighters: this.fighters.map((f): FighterNetSnapshot => ({
        id: f.id,
        displayName: f.displayName,
        classId: f.classId,
        isHuman: f.isHuman,
        x: round2(f.body.x),
        y: round2(f.body.y),
        z: round2(f.body.z),
        vx: round2(f.body.vx),
        vy: round2(f.body.vy),
        vz: round2(f.body.vz),
        yaw: round3(f.yaw),
        isGrounded: f.body.isGrounded,
        supportFloorY: round2(f.body.supportFloorY),
        hp: round2(f.hp),
        maxHp: f.maxHp,
        stamina: round2(f.stamina),
        maxStamina: f.maxStamina,
        state: f.state,
        isSprinting: f.isSprinting,
        attackId: f.activeAttack ? f.activeAttack.id : null,
        abilityId: f.activeAbility ? f.activeAbility.id : null,
        attackPhase: f.attackPhase,
        attackPhaseTimer: round2(f.attackPhaseTimer),
        swingInstanceId: f.swingInstanceId,
        activeComboStep: f.activeComboStep,
        abilityCooldowns: [
          round2(f.abilityCooldowns[0]),
          round2(f.abilityCooldowns[1]),
          round2(f.abilityCooldowns[2]),
        ],
        defenseLockoutTimer: round2(f.defenseLockoutTimer),
        isChargingHeavy: f.isChargingHeavy,
        chargeTimer: round2(f.chargeTimer),
        blockElapsed: round2(f.blockElapsed),
        blockImpactTimer: round2(f.blockImpactTimer),
        hitFlashTimer: round2(f.hitFlashTimer),
        dodgeDirX: round2(f.dodgeDirX),
        dodgeDirZ: round2(f.dodgeDirZ),
        dodgeElapsed: round2(f.dodgeElapsed),
        damageAuraTimer: round2(f.damageAuraTimer),
        hasteTimer: round2(f.hasteTimer),
        ironBastionTimer: round2(f.ironBastionTimer),
        kills: f.stats.kills,
        damageDealt: Math.round(f.stats.damageDealt),
        damageTaken: Math.round(f.stats.damageTaken),
        blocksSucceeded: f.stats.blocksSucceeded,
        survivalTime: round2(f.stats.survivalTime),
        eliminatedOrder: f.stats.eliminatedOrder ?? undefined,
      })),
      projectiles: this.combatSystem.projectiles.map((p) => ({
        id: p.id,
        ownerId: p.ownerId,
        kind: p.kind ?? 'dagger',
        x: round2(p.x),
        y: round2(p.y),
        z: round2(p.z),
        vx: round2(p.vx),
        vy: round2(p.vy || 0),
        vz: round2(p.vz),
        yaw: round2(p.yaw),
        pitch: round3(p.pitch || 0),
        traveled: round2(Math.max(0, 18.0 - p.remainingDist)),
        maxRange: 18.0,
      })),
      killFeed: [...this.killFeed],
    };
  }
}

// ============================================================================
// CLIENT-SIDE PREDICTION, HISTORICAL RECONCILIATION & 60 FPS DEAD-RECKONING
// ============================================================================

export interface LocalPredictionEffects {
  footstepIds: string[];
  jumpedIds: string[];
  dodgedIds: string[];
  landedFighters: Array<{ id: string; x: number; y: number; z: number }>;
  events: CombatEvent[];
}

export interface ApplySnapshotOptions {
  predictLocalPlayer?: boolean;
  rttMs?: number;
}

function resolveAttackConfig(
  classId: KnightClassId,
  attackId: string | null
): AttackConfig | null {
  if (!attackId) return null;
  const cfg = KNIGHT_CLASSES[classId];
  for (const lc of cfg.lightCombo) {
    if (lc.id === attackId) return lc;
  }
  if (cfg.heavyAttack.id === attackId) return cfg.heavyAttack;
  for (const ab of cfg.abilities) {
    if (ab.attackProfile.id === attackId) return ab.attackProfile;
  }
  return null;
}

function resolveAbilityConfig(
  classId: KnightClassId,
  abilityId: string | null
): ClassAbilityConfig | null {
  if (!abilityId) return null;
  const cfg = KNIGHT_CLASSES[classId];
  for (const ab of cfg.abilities) {
    if (ab.id === abilityId) return ab;
  }
  return null;
}

interface SampledFighterPose {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  isGrounded: boolean;
  supportFloorY: number;
}

export class ClientNetWorldSync {
  private readonly snapBuffer: WorldSnapshot[] = [];
  private readonly remoteLastSwingId = new Map<string, number>();
  private readonly remoteIdleHold = new Map<string, number>();
  private renderTime = 0;
  private clockInitialized = false;
  private readonly interpDelaySec = 0.095;
  private reconcileErrX = 0;
  private reconcileErrY = 0;
  private reconcileErrZ = 0;
  private lastTick = -1;

  public reset(): void {
    this.snapBuffer.length = 0;
    this.remoteLastSwingId.clear();
    this.remoteIdleHold.clear();
    this.renderTime = 0;
    this.clockInitialized = false;
    this.reconcileErrX = 0;
    this.reconcileErrY = 0;
    this.reconcileErrZ = 0;
    this.lastTick = -1;
  }

  private pushSnapshotToBuffer(
    snapshot: WorldSnapshot,
    resetBuffer: boolean
  ): void {
    if (resetBuffer) {
      this.snapBuffer.length = 0;
      this.snapBuffer.push(snapshot);
      this.renderTime = Math.max(0, snapshot.matchElapsed - this.interpDelaySec);
      this.clockInitialized = true;
      return;
    }

    // Deduplicate same serverTick
    const n = this.snapBuffer.length;
    if (n > 0 && this.snapBuffer[n - 1].serverTick === snapshot.serverTick) {
      this.snapBuffer[n - 1] = snapshot;
    } else {
      this.snapBuffer.push(snapshot);
      if (this.snapBuffer.length > 14) {
        this.snapBuffer.shift();
      }
    }

    if (!this.clockInitialized) {
      this.renderTime = Math.max(0, snapshot.matchElapsed - this.interpDelaySec);
      this.clockInitialized = true;
    }
  }

  private sampleRemotePose(
    fighterId: string,
    arenaHalfX: number,
    arenaHalfZ: number,
    radius: number
  ): SampledFighterPose | null {
    const count = this.snapBuffer.length;
    if (count === 0) return null;

    const latest = this.snapBuffer[count - 1];
    const oldest = this.snapBuffer[0];

    const findFs = (snap: WorldSnapshot): FighterNetSnapshot | undefined =>
      snap.fighters.find((item) => item.id === fighterId);

    // 1. Before oldest buffered snapshot
    if (count === 1 || this.renderTime <= oldest.matchElapsed) {
      const f0 = findFs(count === 1 ? latest : oldest);
      if (!f0) return null;
      if (count === 1 && this.renderTime > latest.matchElapsed) {
        const over = clamp(this.renderTime - latest.matchElapsed, 0, 0.085);
        const damped = over * Math.exp(-8.0 * over);
        const halfW = arenaHalfX - radius;
        const halfD = arenaHalfZ - radius;
        let ny = f0.y;
        let nvy = f0.vy;
        let grounded = f0.isGrounded;
        if (!grounded || Math.abs(nvy) > 0.05) {
          ny = Math.max(f0.supportFloorY, f0.y + nvy * damped - 13.0 * damped * damped);
          if (ny <= f0.supportFloorY) {
            ny = f0.supportFloorY;
            nvy = 0;
            grounded = true;
          }
        }
        return {
          x: clamp(f0.x + f0.vx * damped, -halfW, halfW),
          y: ny,
          z: clamp(f0.z + f0.vz * damped, -halfD, halfD),
          vx: f0.vx,
          vy: nvy,
          vz: f0.vz,
          yaw: f0.yaw,
          isGrounded: grounded,
          supportFloorY: f0.supportFloorY,
        };
      }
      return {
        x: f0.x,
        y: f0.y,
        z: f0.z,
        vx: f0.vx,
        vy: f0.vy,
        vz: f0.vz,
        yaw: f0.yaw,
        isGrounded: f0.isGrounded,
        supportFloorY: f0.supportFloorY,
      };
    }

    // 2. Exact 2-Snapshot Interpolation between [snapA, snapB] (ZERO overshoot!)
    if (this.renderTime <= latest.matchElapsed) {
      for (let i = count - 1; i >= 1; i--) {
        const snapB = this.snapBuffer[i];
        const snapA = this.snapBuffer[i - 1];
        if (
          this.renderTime >= snapA.matchElapsed &&
          this.renderTime <= snapB.matchElapsed
        ) {
          const fa = findFs(snapA);
          const fb = findFs(snapB);
          if (!fb) return null;
          if (!fa) {
            return {
              x: fb.x,
              y: fb.y,
              z: fb.z,
              vx: fb.vx,
              vy: fb.vy,
              vz: fb.vz,
              yaw: fb.yaw,
              isGrounded: fb.isGrounded,
              supportFloorY: fb.supportFloorY,
            };
          }
          const jumpDist = Math.hypot(fb.x - fa.x, fb.y - fa.y, fb.z - fa.z);
          if (jumpDist > 7.0) {
            return {
              x: fb.x,
              y: fb.y,
              z: fb.z,
              vx: fb.vx,
              vy: fb.vy,
              vz: fb.vz,
              yaw: fb.yaw,
              isGrounded: fb.isGrounded,
              supportFloorY: fb.supportFloorY,
            };
          }
          const span = snapB.matchElapsed - snapA.matchElapsed;
          const alpha =
            span > 1e-4 ? clamp((this.renderTime - snapA.matchElapsed) / span, 0, 1) : 1;
          return {
            x: fa.x + (fb.x - fa.x) * alpha,
            y: fa.y + (fb.y - fa.y) * alpha,
            z: fa.z + (fb.z - fa.z) * alpha,
            vx: fa.vx + (fb.vx - fa.vx) * alpha,
            vy: fa.vy + (fb.vy - fa.vy) * alpha,
            vz: fa.vz + (fb.vz - fa.vz) * alpha,
            yaw: fa.yaw + angleDiff(fa.yaw, fb.yaw) * alpha,
            isGrounded: alpha < 0.5 ? fa.isGrounded : fb.isGrounded,
            supportFloorY:
              fa.supportFloorY + (fb.supportFloorY - fa.supportFloorY) * alpha,
          };
        }
      }
    }

    // 3. Severe jitter spike (>95ms gap): heavily damped short continuation (<= 42ms max)
    const fl = findFs(latest);
    if (!fl) return null;
    const over = clamp(this.renderTime - latest.matchElapsed, 0, 0.085);
    const damped = over * Math.exp(-8.5 * over);
    const halfW = arenaHalfX - radius;
    const halfD = arenaHalfZ - radius;
    let ny = fl.y;
    let nvy = fl.vy;
    let grounded = fl.isGrounded;
    if (!grounded || Math.abs(nvy) > 0.05) {
      ny = Math.max(fl.supportFloorY, fl.y + nvy * damped - 13.0 * damped * damped);
      if (ny <= fl.supportFloorY) {
        ny = fl.supportFloorY;
        nvy = 0;
        grounded = true;
      }
    }
    return {
      x: clamp(fl.x + fl.vx * damped, -halfW, halfW),
      y: ny,
      z: clamp(fl.z + fl.vz * damped, -halfD, halfD),
      vx: fl.vx * Math.exp(-6.0 * over),
      vy: nvy,
      vz: fl.vz * Math.exp(-6.0 * over),
      yaw: fl.yaw,
      isGrounded: grounded,
      supportFloorY: fl.supportFloorY,
    };
  }

  /**
   * Applies authoritative combat events ONCE to the Guest's predicted local fighter
   * so hits, parries, guard breaks & shoves feel crisp without multi-snapshot rubber-banding.
   */
  public applyAuthoritativeCombatEvents(
    match: MatchManager,
    events: CombatEvent[],
    predictLocalPlayer: boolean
  ): void {
    if (!predictLocalPlayer || events.length === 0) return;
    const me = match.getPlayer();
    if (!me || !me.isAlive) return;

    for (const ev of events) {
      if (ev.victimId === me.id) {
        const attacker = ev.attackerId
          ? match.fighters.find((f) => f.id === ev.attackerId)
          : undefined;
        let kx = 0;
        let kz = 0;
        if (attacker) {
          const dx = me.body.x - attacker.body.x;
          const dz = me.body.z - attacker.body.z;
          const d = Math.hypot(dx, dz);
          if (d > 1e-3) {
            kx = dx / d;
            kz = dz / d;
          } else {
            kx = Math.sin(attacker.yaw);
            kz = Math.cos(attacker.yaw);
          }
        }

        if (
          ev.type === 'hit' ||
          ev.type === 'heavy_hit' ||
          ev.type === 'dagger_hit' ||
          ev.type === 'quake_slam'
        ) {
          me.hitFlashTimer = 0.18;
          const kbSpeed =
            ev.type === 'heavy_hit' || ev.type === 'quake_slam' ? 6.8 : 4.2;
          if (me.ironBastionTimer <= 0) {
            me.state = 'HitReaction';
            me.stateTimer =
              ev.type === 'heavy_hit' || ev.type === 'quake_slam' ? 0.28 : 0.19;
            me.attackPhase = 'None';
            me.attackPhaseTimer = 0;
            me.activeAttack = null;
            me.activeAbility = null;
            me.isChargingHeavy = false;
            me.body.vx += kx * kbSpeed;
            me.body.vz += kz * kbSpeed;
          }
        } else if (
          ev.type === 'guard_broken' ||
          ev.type === 'shield_shove' ||
          ev.type === 'deflect_push'
        ) {
          me.blockImpactTimer = 0.22;
          me.state = 'Stunned';
          me.stateTimer = ev.type === 'guard_broken' ? 0.82 : 0.42;
          me.attackPhase = 'None';
          me.attackPhaseTimer = 0;
          me.activeAttack = null;
          me.activeAbility = null;
          me.isChargingHeavy = false;
          me.body.vx += kx * 6.0;
          me.body.vz += kz * 6.0;
        } else if (ev.type === 'blocked') {
          me.blockImpactTimer = 0.18;
          me.body.vx += kx * 2.4;
          me.body.vz += kz * 2.4;
        }
      } else if (ev.attackerId === me.id && ev.type === 'parried') {
        me.state = 'Stunned';
        me.stateTimer = 0.72;
        me.attackPhase = 'None';
        me.attackPhaseTimer = 0;
        me.activeAttack = null;
        me.activeAbility = null;
        me.isChargingHeavy = false;
      }
    }
  }

  public initMatchFromSnapshot(
    match: MatchManager,
    yourFighterId: string,
    matchGeneration: number,
    snapshot: WorldSnapshot
  ): void {
    this.reset();
    match.fighters = snapshot.fighters.map((fs) => {
      const f = new Fighter({
        id: fs.id,
        displayName: fs.displayName,
        isHuman: fs.isHuman,
        classId: fs.classId,
        x: fs.x,
        y: fs.y,
        z: fs.z,
        yaw: fs.yaw,
      });
      return f;
    });
    match.bots.clear();
    match.combatSystem.reset();
    match.isOnlineMatch = true;
    match.localPlayerId = yourFighterId;
    match.spectatorTargetId = yourFighterId;
    match.matchGeneration = Math.max(match.matchGeneration + 1, matchGeneration);
    match.paused = false;

    const myFighter = match.getPlayer();
    if (myFighter) {
      match.selectedPlayerClass = myFighter.classId;
    }

    this.applySnapshot(match, snapshot, true);
  }

  public applySnapshot(
    match: MatchManager,
    snapshot: WorldSnapshot,
    snapPositions = false,
    opts?: ApplySnapshotOptions
  ): MatchState | null {
    if (!snapPositions && snapshot.serverTick < this.lastTick) {
      return null;
    }
    this.lastTick = snapshot.serverTick;
    this.pushSnapshotToBuffer(snapshot, snapPositions);

    const predictLocal = Boolean(opts?.predictLocalPlayer);
    const prevState = match.state;

    match.countdownTimer = snapshot.countdownTimer;
    match.matchTimeRemaining = snapshot.matchTimeRemaining;
    match.matchElapsed = snapshot.matchElapsed;
    match.isFinalPhase = snapshot.isFinalPhase;
    match.winnerId = snapshot.winnerId;
    match.finishReason = snapshot.finishReason;
    match.killFeed = snapshot.killFeed;

    for (const fs of snapshot.fighters) {
      let f = match.fighters.find((item) => item.id === fs.id);
      if (!f) {
        f = new Fighter({
          id: fs.id,
          displayName: fs.displayName,
          isHuman: fs.isHuman,
          classId: fs.classId,
          x: fs.x,
          y: fs.y,
          z: fs.z,
          yaw: fs.yaw,
        });
        match.fighters.push(f);
      }

      // Authoritative health, buffs & scoreboard stats always come from Host/Server
      f.hp = fs.hp;
      f.damageAuraTimer = fs.damageAuraTimer;
      f.hasteTimer = fs.hasteTimer;
      f.ironBastionTimer = fs.ironBastionTimer;
      f.hitFlashTimer = Math.max(f.hitFlashTimer, fs.hitFlashTimer);
      f.blockImpactTimer = Math.max(f.blockImpactTimer, fs.blockImpactTimer);

      f.stats.kills = fs.kills;
      f.stats.damageDealt = fs.damageDealt;
      f.stats.damageTaken = fs.damageTaken;
      f.stats.blocksSucceeded = fs.blocksSucceeded;
      f.stats.survivalTime = fs.survivalTime;
      f.stats.eliminatedOrder = fs.eliminatedOrder ?? null;

      const isLocalPredictedFighter =
        predictLocal &&
        !snapPositions &&
        f.id === match.localPlayerId &&
        snapshot.phase === 'InProgress';

      if (isLocalPredictedFighter) {
        if (fs.state === 'Dead') {
          f.state = 'Dead';
          f.attackPhase = 'None';
          f.attackPhaseTimer = 0;
          f.activeAttack = null;
          f.activeAbility = null;
          f.body.x = fs.x;
          f.body.y = fs.y;
          f.body.z = fs.z;
          f.body.vx = 0;
          f.body.vy = 0;
          f.body.vz = 0;
          this.reconcileErrX = 0;
          this.reconcileErrY = 0;
          this.reconcileErrZ = 0;
          continue;
        }

        // Pure 0-yank client authority for Guest's own movement, jumps, dodges & swings!
        // Host tracks our streamed ClientFighterPose, so delayed snapshots NEVER yank us back.
        // Only apply a gentle safety-net glide if a massive >9.0m desync ever occurred.
        const catastrophicDist = Math.hypot(fs.x - f.body.x, fs.z - f.body.z);
        if (catastrophicDist > 9.0) {
          this.reconcileErrX = clamp((fs.x - f.body.x) * 0.5, -4.0, 4.0);
          this.reconcileErrY = clamp((fs.y - f.body.y) * 0.5, -2.5, 2.5);
          this.reconcileErrZ = clamp((fs.z - f.body.z) * 0.5, -4.0, 4.0);
        }
        continue;
      }

      // Remote fighter (or Countdown / Spectating): sync combat state with monotonic swing progression
      f.stamina = fs.stamina;
      f.isSprinting = fs.isSprinting;
      f.abilityCooldowns[0] = fs.abilityCooldowns[0];
      f.abilityCooldowns[1] = fs.abilityCooldowns[1];
      f.abilityCooldowns[2] = fs.abilityCooldowns[2] ?? 0;
      f.defenseLockoutTimer = fs.defenseLockoutTimer;
      f.isChargingHeavy = fs.isChargingHeavy;
      f.chargeTimer = fs.chargeTimer;
      f.blockElapsed = fs.blockElapsed;
      f.dodgeDirX = fs.dodgeDirX;
      f.dodgeDirZ = fs.dodgeDirZ;
      f.dodgeElapsed = fs.dodgeElapsed;

      const lastSwingId = this.remoteLastSwingId.get(f.id) ?? -1;
      const interrupted =
        fs.state === 'Dead' ||
        fs.state === 'HitReaction' ||
        fs.state === 'Stunned';

      if (interrupted) {
        const prevFighterState = f.state;
        f.state = fs.state;
        if (prevFighterState !== fs.state) {
          f.stateTimer = fs.state === 'Stunned' ? 0.48 : 0.22;
        }
        f.attackPhase = 'None';
        f.attackPhaseTimer = 0;
        f.activeAttack = null;
        f.activeAbility = null;
        f.swingInstanceId = fs.swingInstanceId;
        this.remoteLastSwingId.set(f.id, fs.swingInstanceId);
      } else if (
        fs.attackPhase !== 'None' &&
        fs.attackId &&
        fs.swingInstanceId !== lastSwingId
      ) {
        // Brand-new remote swing started -> trigger once and advance smoothly at 60/120 FPS!
        f.state = fs.state;
        f.activeAttack = resolveAttackConfig(f.classId, fs.attackId);
        f.activeAbility = resolveAbilityConfig(f.classId, fs.abilityId);
        f.attackPhase = fs.attackPhase;
        f.attackPhaseTimer = fs.attackPhaseTimer;
        f.swingInstanceId = fs.swingInstanceId;
        f.activeComboStep = fs.activeComboStep;
        this.remoteLastSwingId.set(f.id, fs.swingInstanceId);
      } else if (f.attackPhase === 'None') {
        // Not currently animating an active local swing -> sync locomotion / block / dodge state
        // Apply 85ms hysteresis on Moving -> Idle to eliminate walk/idle animation micro-flicker
        if (f.state === 'Moving' && fs.state === 'Idle') {
          const hold = this.remoteIdleHold.get(f.id) ?? 0.085;
          if (hold <= 0) {
            f.state = 'Idle';
          }
        } else {
          f.state = fs.state;
          if (fs.state === 'Moving') {
            this.remoteIdleHold.set(f.id, 0.085);
          }
        }
      }

      if (snapPositions) {
        f.body.x = fs.x;
        f.body.y = fs.y;
        f.body.z = fs.z;
        f.body.vx = fs.vx;
        f.body.vy = fs.vy;
        f.body.vz = fs.vz;
        f.body.isGrounded = fs.isGrounded;
        f.body.supportFloorY = fs.supportFloorY;
        f.yaw = fs.yaw;
      }
    }

    // Sync active projectiles
    match.combatSystem.projectiles.length = 0;
    for (const ps of snapshot.projectiles) {
      match.combatSystem.projectiles.push({
        id: ps.id,
        ownerId: ps.ownerId,
        kind: ps.kind ?? 'dagger',
        x: ps.x,
        y: ps.y,
        z: ps.z,
        vx: ps.vx,
        vy: ps.vy ?? 0,
        vz: ps.vz,
        yaw: ps.yaw,
        pitch: ps.pitch ?? 0,
        damage: 22,
        knockback: 6.5,
        remainingDist: Math.max(0.1, ps.maxRange - ps.traveled),
      });
    }

    // Map authoritative phase to client MatchState (with automatic Spectator transition)
    let nextState: MatchState = snapshot.phase;
    if (snapshot.phase === 'InProgress') {
      const localPlayer = match.getPlayer();
      const livingCount = match.getLivingFighters().length;
      if (localPlayer && !localPlayer.isAlive && livingCount >= 2) {
        nextState = 'PlayerEliminated';
      }
    }
    match.state = nextState;

    return nextState !== prevState ? nextState : null;
  }

  /**
   * Advances remote swing phases monotonically at 60/120 FPS so remote sword/spear/hammer
   * swings never rewind or stutter between HTTP snapshots.
   */
  private advanceRemoteSwingAnim(f: Fighter, dt: number): void {
    if (f.attackPhase === 'None' || !f.activeAttack) return;
    const atk = f.activeAttack;
    const speedMult = f.hasteTimer > 0 ? 1.25 : 1.0;
    f.attackPhaseTimer -= dt * speedMult;
    if (f.attackPhaseTimer > 0) return;

    if (f.attackPhase === 'Windup') {
      f.attackPhase = 'Active';
      f.attackPhaseTimer = Math.max(
        0.04,
        atk.activeDuration + f.attackPhaseTimer
      );
    } else if (f.attackPhase === 'Active') {
      f.attackPhase = 'Recovery';
      f.attackPhaseTimer = Math.max(
        0.04,
        atk.recoveryDuration + f.attackPhaseTimer
      );
    } else {
      f.attackPhase = 'None';
      f.attackPhaseTimer = 0;
      f.activeAttack = null;
      f.activeAbility = null;
      if (f.state === 'Attacking' || f.state === 'HeavyAttacking') {
        const speed = Math.hypot(f.body.vx, f.body.vz);
        f.state = speed > 0.45 ? 'Moving' : 'Idle';
      }
    }
  }

  /**
   * Runs pure 0ms local prediction for the Guest's own fighter AND PLL-synchronized
   * 2-snapshot interpolation for all remote fighters at 60/120/144 FPS.
   */
  public predictAndInterpolateFrame(
    match: MatchManager,
    dt: number,
    localIntent?: FighterInputIntent,
    predictLocalPlayer = false
  ): LocalPredictionEffects {
    const effects: LocalPredictionEffects = {
      footstepIds: [],
      jumpedIds: [],
      dodgedIds: [],
      landedFighters: [],
      events: [],
    };

    // 1. Advance Phase-Locked Loop (PLL) playback clock smoothly
    if (this.snapBuffer.length > 0) {
      const latest = this.snapBuffer[this.snapBuffer.length - 1];
      if (latest.phase === 'InProgress') {
        const targetTime = Math.max(0, latest.matchElapsed - this.interpDelaySec);
        const drift = targetTime - this.renderTime;
        if (Math.abs(drift) > 0.7) {
          this.renderTime = targetTime;
        } else {
          const clockRate = clamp(1.0 + drift * 2.4, 0.82, 1.22);
          this.renderTime += dt * clockRate;
        }
      } else {
        this.renderTime = latest.matchElapsed;
      }
    }

    const visualPosBlend = 1 - Math.exp(-26 * dt);
    const visualYawBlend = 1 - Math.exp(-24 * dt);
    const velBlend = 1 - Math.exp(-18 * dt);
    const reconcileBlend = 1 - Math.exp(-10 * dt);

    // 2. Advance projectiles smoothly between snapshots
    for (const p of match.combatSystem.projectiles) {
      const vy = p.vy || 0;
      const stepDist = Math.hypot(p.vx, vy, p.vz) * dt;
      p.x += p.vx * dt;
      p.y += vy * dt;
      p.z += p.vz * dt;
      p.remainingDist = Math.max(0, p.remainingDist - stepDist);
    }

    // 3. Step local player prediction (when Guest) & sample PLL timeline for remote fighters
    for (const f of match.fighters) {
      const isPredictedLocal =
        predictLocalPlayer &&
        Boolean(localIntent) &&
        f.id === match.localPlayerId &&
        f.isAlive &&
        (match.state === 'InProgress' || match.state === 'Countdown');

      if (isPredictedLocal && localIntent) {
        const wasDodging = f.state === 'Dodging';
        const combatEnabled = match.state === 'InProgress';
        const stepRes = f.update(dt, localIntent, match.arena, combatEnabled);

        if (
          Math.abs(this.reconcileErrX) > 1e-3 ||
          Math.abs(this.reconcileErrY) > 1e-3 ||
          Math.abs(this.reconcileErrZ) > 1e-3
        ) {
          const dx = this.reconcileErrX * reconcileBlend;
          const dy = this.reconcileErrY * reconcileBlend;
          const dz = this.reconcileErrZ * reconcileBlend;
          f.body.x += dx;
          f.body.y += dy;
          f.body.z += dz;
          this.reconcileErrX -= dx;
          this.reconcileErrY -= dy;
          this.reconcileErrZ -= dz;
          f.body.constrainToArena(match.arena);
        }

        // Smooth body separation against remote fighters
        for (const other of match.fighters) {
          if (other === f || !other.isAlive) continue;
          const dy = Math.abs(f.body.y - other.body.y);
          if (dy > 1.55) continue;
          const ox = f.body.x - other.body.x;
          const oz = f.body.z - other.body.z;
          const dist = Math.hypot(ox, oz);
          const minSep = f.body.radius + other.body.radius;
          if (dist < minSep && dist > 1e-4) {
            const push = (minSep - dist) * 0.85;
            f.body.x += (ox / dist) * push;
            f.body.z += (oz / dist) * push;
            f.body.constrainToArena(match.arena);
          }
        }

        // Immediate 0ms audio/visual feedback for the Guest's own actions
        if (stepRes.stepped) {
          effects.footstepIds.push(f.id);
        }
        if (stepRes.jumped) {
          effects.jumpedIds.push(f.id);
        }
        if (!wasDodging && f.state === 'Dodging') {
          effects.dodgedIds.push(f.id);
        }
        if (stepRes.landed) {
          effects.landedFighters.push({
            id: f.id,
            x: f.body.x,
            y: f.body.y,
            z: f.body.z,
          });
        }
        if (stepRes.usedAbility) {
          effects.events.push({
            type: 'ability_cast',
            attackerId: f.id,
            abilityId: stepRes.usedAbility.id,
            x: f.body.x,
            y: f.body.y + 1.15,
            z: f.body.z,
            isHeavy: stepRes.usedAbility.attackProfile.isHeavy,
          });
        } else if (stepRes.swungAttack) {
          effects.events.push({
            type: 'swing',
            attackerId: f.id,
            x: f.body.x,
            y: f.body.y + 1.15,
            z: f.body.z,
            isHeavy: stepRes.swungAttack.isHeavy,
          });
        }
        continue;
      }

      // Remote fighter (or dead/spectated local fighter): monotonic anim + PLL 2-snapshot interpolation
      f.animTime += dt;
      if (f.hitFlashTimer > 0) {
        f.hitFlashTimer = Math.max(0, f.hitFlashTimer - dt);
      }
      if (f.blockImpactTimer > 0) {
        f.blockImpactTimer = Math.max(0, f.blockImpactTimer - dt);
      }
      if (f.state === 'HitReaction' || f.state === 'Stunned') {
        f.stateTimer = Math.max(0, f.stateTimer - dt);
        if (f.stateTimer <= 0) {
          const spd = Math.hypot(f.body.vx, f.body.vz);
          f.state = spd > 0.45 ? 'Moving' : 'Idle';
        }
      }

      const idleHold = this.remoteIdleHold.get(f.id) ?? 0;
      if (idleHold > 0) {
        const nextHold = Math.max(0, idleHold - dt);
        this.remoteIdleHold.set(f.id, nextHold);
        if (
          nextHold <= 0 &&
          f.state === 'Moving' &&
          Math.hypot(f.body.vx, f.body.vz) < 0.35
        ) {
          f.state = 'Idle';
        }
      }

      this.advanceRemoteSwingAnim(f, dt);

      const sampled = this.sampleRemotePose(
        f.id,
        match.arena.boundsHalfX,
        match.arena.boundsHalfZ,
        f.body.radius
      );
      if (!sampled) continue;

      const distErr = Math.hypot(
        sampled.x - f.body.x,
        sampled.y - f.body.y,
        sampled.z - f.body.z
      );
      if (distErr > 6.5) {
        f.body.x = sampled.x;
        f.body.y = sampled.y;
        f.body.z = sampled.z;
        f.yaw = sampled.yaw;
      } else {
        f.body.x += (sampled.x - f.body.x) * visualPosBlend;
        f.body.y += (sampled.y - f.body.y) * visualPosBlend;
        f.body.z += (sampled.z - f.body.z) * visualPosBlend;
        f.yaw += angleDiff(f.yaw, sampled.yaw) * visualYawBlend;
      }
      f.body.vx += (sampled.vx - f.body.vx) * velBlend;
      f.body.vy += (sampled.vy - f.body.vy) * velBlend;
      f.body.vz += (sampled.vz - f.body.vz) * velBlend;
      f.body.isGrounded = sampled.isGrounded;
      f.body.supportFloorY = sampled.supportFloorY;
    }

    return effects;
  }

  public interpolateFrame(match: MatchManager, dt: number): void {
    this.predictAndInterpolateFrame(match, dt, undefined, false);
  }
}
