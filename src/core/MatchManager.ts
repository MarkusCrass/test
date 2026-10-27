import { ARENA_CONFIG, ArenaConfig } from '../config/arenaConfig';
import { CLASS_ORDER, KnightClassId } from '../config/classes';
import { BotController } from './BotAI';
import { CharacterBody } from './CharacterBody';
import { CombatEvent, CombatSystem } from './CombatSystem';
import {
  createEmptyIntent,
  Fighter,
  FighterInputIntent,
} from './Fighter';

export type MatchState =
  | 'MainMenu'
  | 'CharacterSelection'
  | 'Countdown'
  | 'InProgress'
  | 'PlayerEliminated'
  | 'MatchFinished';

export type MatchMode = 'ffa5' | 'duel_debug';

export interface KillFeedEntry {
  id: number;
  killerName: string | null;
  victimName: string;
  timestamp: number;
}

export interface MatchStanding {
  place: number;
  fighterId: string;
  name: string;
  classId: KnightClassId;
  isHuman: boolean;
  isAlive: boolean;
  hp: number;
  maxHp: number;
  kills: number;
  damageDealt: number;
  survivalTime: number;
}

export interface MatchStepOutput {
  events: CombatEvent[];
  footstepFighterIds: string[];
  jumpedFighterIds: string[];
  landedFighters: Array<{ id: string; x: number; y: number; z: number }>;
  stateChangedTo: MatchState | null;
}

const BOT_NAMES: Record<KnightClassId, string[]> = {
  sword: ['Сэр Роланд', 'Сир Гарет'],
  dual: ['Корвус Двуклинок', 'Весп Вихрь'],
  spear: ['Ульрих Пика', 'Лотар Копейщик'],
  hammer: ['Торвальд Молот', 'Брат Гром'],
};

export const DEFAULT_MATCH_DURATION = 150; // 2m 30s
export const FINAL_PHASE_THRESHOLD = 30; // Final 30s -> Sudden Death!

export class MatchManager {
  public state: MatchState = 'MainMenu';
  public mode: MatchMode = 'ffa5';
  public selectedPlayerClass: KnightClassId = 'sword';
  public paused = false;

  public readonly arena: ArenaConfig;
  public fighters: Fighter[] = [];
  public bots: Map<string, BotController> = new Map();
  public readonly combatSystem = new CombatSystem();

  public countdownTimer = 0;
  public matchTimeRemaining = DEFAULT_MATCH_DURATION;
  public matchElapsed = 0;
  public isFinalPhase = false;

  public winnerId: string | null = null;
  public finishReason: 'last_standing' | 'time_up' | 'draw' | null = null;
  public spectatorTargetId: string | null = null;

  public killFeed: KillFeedEntry[] = [];
  private nextKillFeedId = 1;
  private eliminationCounter = 0;
  private hazardTickAccum = 0;
  public matchGeneration = 0;

  private readonly rng: () => number;

  constructor(
    arena: ArenaConfig = ARENA_CONFIG,
    rng: () => number = Math.random
  ) {
    this.arena = arena;
    this.rng = rng;
  }

  public goToMainMenu(): void {
    this.clearMatchEntities();
    this.paused = false;
    this.state = 'MainMenu';
  }

  public goToCharacterSelection(): void {
    this.clearMatchEntities();
    this.paused = false;
    this.state = 'CharacterSelection';
  }

  /**
   * Cleanly initializes a brand-new match, guaranteeing zero leftover fighters/timers.
   */
  public startMatch(
    playerClass: KnightClassId = this.selectedPlayerClass,
    mode: MatchMode = this.mode
  ): void {
    this.clearMatchEntities();
    this.matchGeneration += 1;
    this.selectedPlayerClass = playerClass;
    this.mode = mode;
    this.paused = false;

    const botCount = mode === 'duel_debug' ? 1 : 4;
    const totalCount = 1 + botCount;

    // Pick evenly spaced spawn indices
    const spawnIndices =
      mode === 'duel_debug' ? [0, 2] : [0, 1, 2, 3, 4];

    // Human player at spawn 0
    const pSpawn = this.arena.spawns[spawnIndices[0]];
    const human = new Fighter({
      id: 'player',
      displayName: 'Вы (Рыцарь)',
      isHuman: true,
      classId: playerClass,
      x: pSpawn.x,
      y: pSpawn.y ?? 0,
      z: pSpawn.z,
      yaw: pSpawn.yaw,
    });
    human.body.constrainToArena(this.arena);
    this.fighters.push(human);

    // Build bot roster (covering all 4 classes in FFA so every class is showcased!)
    const botClasses: KnightClassId[] =
      mode === 'duel_debug'
        ? [this.pickDuelBotClass(playerClass)]
        : [...CLASS_ORDER];

    // Lightly shuffle bot spawn order
    for (let i = botClasses.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      const tmp = botClasses[i];
      botClasses[i] = botClasses[j];
      botClasses[j] = tmp;
    }

    const usedNames = new Set<string>();
    for (let i = 0; i < botCount; i++) {
      const cls = botClasses[i % botClasses.length];
      const sp = this.arena.spawns[spawnIndices[i + 1]];
      const pool = BOT_NAMES[cls];
      let bName = pool[0];
      for (const candidate of pool) {
        if (!usedNames.has(candidate)) {
          bName = candidate;
          break;
        }
      }
      if (usedNames.has(bName)) {
        bName = `${bName} ${i + 1}`;
      }
      usedNames.add(bName);

      const botId = `bot_${i + 1}`;
      const botFighter = new Fighter({
        id: botId,
        displayName: bName,
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

    // Ensure zero initial overlap
    if (totalCount > 1) {
      CharacterBody.resolveFighterCollisions(
        this.fighters.map((f) => f.body),
        this.arena
      );
    }

    this.countdownTimer = 3.0;
    this.matchTimeRemaining = DEFAULT_MATCH_DURATION;
    this.matchElapsed = 0;
    this.isFinalPhase = false;
    this.winnerId = null;
    this.finishReason = null;
    this.spectatorTargetId = 'player';
    this.state = 'Countdown';
  }

  public restartMatch(): void {
    this.startMatch(this.selectedPlayerClass, this.mode);
  }

  public getPlayer(): Fighter | null {
    return this.fighters.find((f) => f.isHuman) ?? null;
  }

  public getLivingFighters(): Fighter[] {
    return this.fighters.filter((f) => f.isAlive);
  }

  public getObservedFighter(): Fighter | null {
    const player = this.getPlayer();
    if (player && player.isAlive) return player;

    if (this.spectatorTargetId) {
      const found = this.fighters.find(
        (f) => f.id === this.spectatorTargetId && f.isAlive
      );
      if (found) return found;
    }

    const alive = this.getLivingFighters();
    if (alive.length > 0) {
      this.spectatorTargetId = alive[0].id;
      return alive[0];
    }
    return player;
  }

  public cycleSpectatorTarget(delta: 1 | -1): Fighter | null {
    const alive = this.getLivingFighters();
    if (alive.length === 0) return null;
    const currentIdx = alive.findIndex((f) => f.id === this.spectatorTargetId);
    const nextIdx =
      currentIdx < 0
        ? 0
        : (currentIdx + delta + alive.length) % alive.length;
    this.spectatorTargetId = alive[nextIdx].id;
    return alive[nextIdx];
  }

  /**
   * Advances the match simulation by dt seconds.
   */
  public update(dt: number, humanIntent: FighterInputIntent): MatchStepOutput {
    const output: MatchStepOutput = {
      events: [],
      footstepFighterIds: [],
      jumpedFighterIds: [],
      landedFighters: [],
      stateChangedTo: null,
    };

    if (
      this.paused ||
      this.state === 'MainMenu' ||
      this.state === 'CharacterSelection' ||
      this.state === 'MatchFinished'
    ) {
      return output;
    }

    // 1. Countdown Phase
    if (this.state === 'Countdown') {
      this.countdownTimer -= dt;
      // Keep fighters idle at spawns during countdown
      const empty = createEmptyIntent();
      for (const f of this.fighters) {
        f.update(dt, { ...empty, aimYaw: f.yaw }, this.arena, false);
      }
      if (this.countdownTimer <= 0) {
        this.countdownTimer = 0;
        this.state = 'InProgress';
        output.stateChangedTo = 'InProgress';
      }
      return output;
    }

    // 2. Active Combat (InProgress or PlayerEliminated spectator continuation)
    this.matchElapsed += dt;
    this.matchTimeRemaining = Math.max(0, this.matchTimeRemaining - dt);
    this.isFinalPhase = this.matchTimeRemaining <= FINAL_PHASE_THRESHOLD;

    // Count how many bots currently target each fighter (anti-dogpile input)
    const botTargetCounts = new Map<string, number>();
    for (const bot of this.bots.values()) {
      if (bot.fighter.isAlive && bot.targetId) {
        botTargetCounts.set(
          bot.targetId,
          (botTargetCounts.get(bot.targetId) ?? 0) + 1
        );
      }
    }

    // Snapshot who was alive before this frame
    const wasAlive = new Set(
      this.fighters.filter((f) => f.isAlive).map((f) => f.id)
    );

    // Step each fighter with either human intent or BotController intent
    for (const fighter of this.fighters) {
      let intent: FighterInputIntent;
      if (fighter.isHuman) {
        // Dead player cannot influence the match!
        intent = fighter.isAlive
          ? humanIntent
          : createEmptyIntent(fighter.yaw);
      } else {
        const bot = this.bots.get(fighter.id);
        intent = bot
          ? bot.update(dt, this.fighters, botTargetCounts, this.arena, true)
          : createEmptyIntent(fighter.yaw);
      }

      const stepRes = fighter.update(dt, intent, this.arena, true);
      if (stepRes.stepped) {
        output.footstepFighterIds.push(fighter.id);
      }
      if (stepRes.jumped) {
        output.jumpedFighterIds.push(fighter.id);
      }
      if (stepRes.landed) {
        output.landedFighters.push({
          id: fighter.id,
          x: fighter.body.x,
          y: fighter.body.y,
          z: fighter.body.z,
        });
      }
      if (stepRes.usedAbility) {
        output.events.push({
          type: 'ability_cast',
          attackerId: fighter.id,
          abilityId: stepRes.usedAbility.id,
          x: fighter.body.x,
          y: fighter.body.y + 1.15,
          z: fighter.body.z,
          isHeavy: stepRes.usedAbility.attackProfile.isHeavy,
        });
      } else if (stepRes.swungAttack) {
        output.events.push({
          type: 'swing',
          attackerId: fighter.id,
          x: fighter.body.x,
          y: fighter.body.y + 1.15,
          z: fighter.body.z,
          isHeavy: stepRes.swungAttack.isHeavy,
        });
      }
    }

    // Resolve body-vs-body separation among living fighters
    const livingBodies = this.fighters
      .filter((f) => f.isAlive)
      .map((f) => f.body);
    CharacterBody.resolveFighterCollisions(livingBodies, this.arena);

    // Evaluate spatial weapon hits, blocks, parries, deflects, shoves & projectiles
    const dmgMult = this.isFinalPhase ? 1.45 : 1.0;
    const combatEvents = this.combatSystem.step(
      this.fighters,
      this.arena,
      dmgMult,
      dt
    );
    output.events.push(...combatEvents);

    // Feed aggro notifications to bots that took hits
    for (const ev of combatEvents) {
      if (
        (ev.type === 'hit' ||
          ev.type === 'heavy_hit' ||
          ev.type === 'guard_broken' ||
          ev.type === 'shield_shove') &&
        ev.victimId
      ) {
        const victimBot = this.bots.get(ev.victimId);
        if (victimBot) {
          victimBot.notifyDamagedBy(ev.attackerId);
        }
      }
    }

    // Final Phase Perimeter Pressure: outside 16.5m ring deals gradual heat damage so fights converge onto the Skybridge & central pit
    if (this.isFinalPhase) {
      this.hazardTickAccum += dt;
      if (this.hazardTickAccum >= 0.5) {
        this.hazardTickAccum -= 0.5;
        for (const f of this.fighters) {
          if (!f.isAlive) continue;
          const r = Math.hypot(f.body.x, f.body.z);
          if (r > 16.5) {
            const died = f.takeRawDamage(4, null);
            if (died) {
              output.events.push({
                type: 'death',
                attackerId: f.id,
                victimId: f.id,
                x: f.body.x,
                y: f.body.y + 0.9,
                z: f.body.z,
              });
            }
          }
        }
      }
    }

    // Record newly eliminated fighters & kill feed
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
          timestamp: this.matchElapsed,
        });
        if (this.killFeed.length > 6) {
          this.killFeed.length = 6;
        }
      }
    }

    // Check match state transitions
    const alive = this.getLivingFighters();
    const player = this.getPlayer();

    if (alive.length <= 1) {
      // Match has a winner (or rare simultaneous double-KO draw)!
      if (alive.length === 1) {
        this.winnerId = alive[0].id;
        this.finishReason = 'last_standing';
      } else {
        // Simultaneous mutual KO: pick fighter with higher damage dealt
        const best = [...this.fighters].sort(
          (a, b) => b.stats.damageDealt - a.stats.damageDealt
        )[0];
        this.winnerId = best ? best.id : null;
        this.finishReason = 'draw';
      }
      this.state = 'MatchFinished';
      output.stateChangedTo = 'MatchFinished';
      return output;
    }

    if (this.matchTimeRemaining <= 0) {
      // Time expired: rank living knights by HP ratio, then damage dealt, then kills
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
      this.state = 'MatchFinished';
      output.stateChangedTo = 'MatchFinished';
      return output;
    }

    // If human died while 2+ bots remain -> enter PlayerEliminated spectator mode
    if (
      this.state === 'InProgress' &&
      player &&
      !player.isAlive &&
      alive.length >= 2
    ) {
      this.state = 'PlayerEliminated';
      this.spectatorTargetId = alive[0].id;
      output.stateChangedTo = 'PlayerEliminated';
    }

    return output;
  }

  public getStandings(): MatchStanding[] {
    const sorted = [...this.fighters].sort((a, b) => {
      if (a.id === this.winnerId) return -1;
      if (b.id === this.winnerId) return 1;
      if (a.isAlive !== b.isAlive) return a.isAlive ? -1 : 1;
      if (a.isAlive && b.isAlive) {
        const hpDiff = b.hp / b.maxHp - a.hp / a.maxHp;
        if (Math.abs(hpDiff) > 0.005) return hpDiff;
        return b.stats.damageDealt - a.stats.damageDealt;
      }
      // Both dead: later elimination = higher placement!
      const orderA = a.stats.eliminatedOrder ?? 0;
      const orderB = b.stats.eliminatedOrder ?? 0;
      if (orderA !== orderB) return orderB - orderA;
      return b.stats.damageDealt - a.stats.damageDealt;
    });

    return sorted.map((f, idx) => ({
      place: idx + 1,
      fighterId: f.id,
      name: f.displayName,
      classId: f.classId,
      isHuman: f.isHuman,
      isAlive: f.isAlive,
      hp: Math.round(f.hp),
      maxHp: f.maxHp,
      kills: f.stats.kills,
      damageDealt: Math.round(f.stats.damageDealt),
      survivalTime: f.stats.survivalTime,
    }));
  }

  private pickDuelBotClass(playerClass: KnightClassId): KnightClassId {
    const others = CLASS_ORDER.filter((c) => c !== playerClass);
    return others[Math.floor(this.rng() * others.length)];
  }

  private clearMatchEntities(): void {
    this.fighters = [];
    this.bots.clear();
    this.killFeed = [];
    this.eliminationCounter = 0;
    this.hazardTickAccum = 0;
    this.winnerId = null;
    this.finishReason = null;
    this.spectatorTargetId = null;
    this.combatSystem.reset();
  }
}
