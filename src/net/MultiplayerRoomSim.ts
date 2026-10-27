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
import { angleDiff } from '../core/math';
import {
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
};

interface HumanInputSlot {
  latest: ClientInputPacket;
  sawHeldSinceStep: boolean;
  consumedHeldTrueInStep: boolean;
  latchedLightTap: boolean;
  latchedJump: boolean;
  latchedDodge: boolean;
  latchedAb1: boolean;
  latchedAb2: boolean;
  seenJumpSeq: number;
  seenDodgeSeq: number;
  seenAb1Seq: number;
  seenAb2Seq: number;
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
        },
        sawHeldSinceStep: false,
        consumedHeldTrueInStep: false,
        latchedLightTap: false,
        latchedJump: false,
        latchedDodge: false,
        latchedAb1: false,
        latchedAb2: false,
        seenJumpSeq: 0,
        seenDodgeSeq: 0,
        seenAb1Seq: 0,
        seenAb2Seq: 0,
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
      countdownTimer: round3(this.countdownTimer),
      matchTimeRemaining: round3(this.matchTimeRemaining),
      matchElapsed: round3(this.matchElapsed),
      isFinalPhase: this.isFinalPhase,
      winnerId: this.winnerId,
      finishReason: this.finishReason,
      fighters: this.fighters.map((f): FighterNetSnapshot => ({
        id: f.id,
        displayName: f.displayName,
        classId: f.classId,
        isHuman: f.isHuman,
        x: round3(f.body.x),
        y: round3(f.body.y),
        z: round3(f.body.z),
        vx: round3(f.body.vx),
        vy: round3(f.body.vy),
        vz: round3(f.body.vz),
        yaw: round3(f.yaw),
        isGrounded: f.body.isGrounded,
        supportFloorY: round3(f.body.supportFloorY),
        hp: round3(f.hp),
        maxHp: f.maxHp,
        stamina: round3(f.stamina),
        maxStamina: f.maxStamina,
        state: f.state,
        isSprinting: f.isSprinting,
        attackId: f.activeAttack ? f.activeAttack.id : null,
        abilityId: f.activeAbility ? f.activeAbility.id : null,
        attackPhase: f.attackPhase,
        attackPhaseTimer: round3(f.attackPhaseTimer),
        swingInstanceId: f.swingInstanceId,
        activeComboStep: f.activeComboStep,
        abilityCooldowns: [
          round3(f.abilityCooldowns[0]),
          round3(f.abilityCooldowns[1]),
        ],
        defenseLockoutTimer: round3(f.defenseLockoutTimer),
        isChargingHeavy: f.isChargingHeavy,
        chargeTimer: round3(f.chargeTimer),
        blockElapsed: round3(f.blockElapsed),
        blockImpactTimer: round3(f.blockImpactTimer),
        hitFlashTimer: round3(f.hitFlashTimer),
        dodgeDirX: round3(f.dodgeDirX),
        dodgeDirZ: round3(f.dodgeDirZ),
        dodgeElapsed: round3(f.dodgeElapsed),
        damageAuraTimer: round3(f.damageAuraTimer),
        hasteTimer: round3(f.hasteTimer),
        ironBastionTimer: round3(f.ironBastionTimer),
        kills: f.stats.kills,
        damageDealt: round3(f.stats.damageDealt),
        damageTaken: round3(f.stats.damageTaken),
        blocksSucceeded: f.stats.blocksSucceeded,
        survivalTime: round3(f.stats.survivalTime),
        eliminatedOrder: f.stats.eliminatedOrder ?? undefined,
      })),
      projectiles: this.combatSystem.projectiles.map((p) => ({
        id: p.id,
        ownerId: p.ownerId,
        x: round3(p.x),
        y: round3(p.y),
        z: round3(p.z),
        vx: round3(p.vx),
        vz: round3(p.vz),
        yaw: round3(p.yaw),
        traveled: round3(15.5 - p.remainingDist),
        maxRange: 15.5,
      })),
      killFeed: [...this.killFeed],
    };
  }
}

// ============================================================================
// CLIENT-SIDE SNAPSHOT RECONCILIATION & 60 FPS SMOOTH INTERPOLATION
// ============================================================================

interface FighterInterpTarget {
  tx: number;
  ty: number;
  tz: number;
  vx: number;
  vy: number;
  vz: number;
  tyaw: number;
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

export class ClientNetWorldSync {
  private readonly targets = new Map<string, FighterInterpTarget>();
  private lastTick = -1;

  public reset(): void {
    this.targets.clear();
    this.lastTick = -1;
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
    snapPositions = false
  ): MatchState | null {
    if (!snapPositions && snapshot.serverTick < this.lastTick) {
      return null;
    }
    this.lastTick = snapshot.serverTick;

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

      f.hp = fs.hp;
      f.stamina = fs.stamina;
      f.state = fs.state;
      f.isSprinting = fs.isSprinting;
      f.body.vx = fs.vx;
      f.body.vy = fs.vy;
      f.body.vz = fs.vz;
      f.body.isGrounded = fs.isGrounded;
      f.body.supportFloorY = fs.supportFloorY;

      f.activeAttack = resolveAttackConfig(f.classId, fs.attackId);
      f.activeAbility = resolveAbilityConfig(f.classId, fs.abilityId);
      f.attackPhase = fs.attackPhase;
      f.attackPhaseTimer = fs.attackPhaseTimer;
      f.swingInstanceId = fs.swingInstanceId;
      f.activeComboStep = fs.activeComboStep;
      f.abilityCooldowns[0] = fs.abilityCooldowns[0];
      f.abilityCooldowns[1] = fs.abilityCooldowns[1];
      f.defenseLockoutTimer = fs.defenseLockoutTimer;
      f.isChargingHeavy = fs.isChargingHeavy;
      f.chargeTimer = fs.chargeTimer;
      f.blockElapsed = fs.blockElapsed;
      f.blockImpactTimer = fs.blockImpactTimer;
      f.hitFlashTimer = fs.hitFlashTimer;
      f.dodgeDirX = fs.dodgeDirX;
      f.dodgeDirZ = fs.dodgeDirZ;
      f.dodgeElapsed = fs.dodgeElapsed;
      f.damageAuraTimer = fs.damageAuraTimer;
      f.hasteTimer = fs.hasteTimer;
      f.ironBastionTimer = fs.ironBastionTimer;

      f.stats.kills = fs.kills;
      f.stats.damageDealt = fs.damageDealt;
      f.stats.damageTaken = fs.damageTaken;
      f.stats.blocksSucceeded = fs.blocksSucceeded;
      f.stats.survivalTime = fs.survivalTime;
      f.stats.eliminatedOrder = fs.eliminatedOrder ?? null;

      const distErr = Math.hypot(
        fs.x - f.body.x,
        fs.y - f.body.y,
        fs.z - f.body.z
      );
      if (snapPositions || distErr > 4.2 || !this.targets.has(f.id)) {
        f.body.x = fs.x;
        f.body.y = fs.y;
        f.body.z = fs.z;
        f.yaw = fs.yaw;
      }

      this.targets.set(f.id, {
        tx: fs.x,
        ty: fs.y,
        tz: fs.z,
        vx: fs.vx,
        vy: fs.vy,
        vz: fs.vz,
        tyaw: fs.yaw,
      });
    }

    // Sync active projectiles
    match.combatSystem.projectiles.length = 0;
    for (const ps of snapshot.projectiles) {
      match.combatSystem.projectiles.push({
        id: ps.id,
        ownerId: ps.ownerId,
        x: ps.x,
        y: ps.y,
        z: ps.z,
        vx: ps.vx,
        vz: ps.vz,
        yaw: ps.yaw,
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
   * Advances smooth 60/120 FPS client-side position, yaw, projectile, and animation timers
   * between server snapshots.
   */
  public interpolateFrame(match: MatchManager, dt: number): void {
    const posBlend = 1 - Math.exp(-22 * dt);
    const yawBlend = 1 - Math.exp(-24 * dt);

    for (const f of match.fighters) {
      f.animTime += dt;
      if (f.hitFlashTimer > 0) {
        f.hitFlashTimer = Math.max(0, f.hitFlashTimer - dt);
      }
      if (f.blockImpactTimer > 0) {
        f.blockImpactTimer = Math.max(0, f.blockImpactTimer - dt);
      }
      if (f.attackPhase !== 'None' && f.attackPhaseTimer > 0) {
        f.attackPhaseTimer = Math.max(0, f.attackPhaseTimer - dt);
      }

      const tgt = this.targets.get(f.id);
      if (!tgt) continue;

      if (f.isAlive && match.state === 'InProgress') {
        tgt.tx += tgt.vx * dt * 0.45;
        tgt.tz += tgt.vz * dt * 0.45;
      }

      f.body.x += (tgt.tx - f.body.x) * posBlend;
      f.body.y += (tgt.ty - f.body.y) * posBlend;
      f.body.z += (tgt.tz - f.body.z) * posBlend;
      f.yaw += angleDiff(f.yaw, tgt.tyaw) * yawBlend;
    }
  }
}
