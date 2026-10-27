import { describe, expect, it } from 'vitest';
import { ARENA_CONFIG } from '../src/config/arenaConfig';
import { KNIGHT_CLASSES } from '../src/config/classes';
import { BotController } from '../src/core/BotAI';
import { createEmptyIntent, Fighter } from '../src/core/Fighter';
import { MatchManager } from '../src/core/MatchManager';

function createSeededRng(seed = 42): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('MatchManager & 4-Bot Free-for-All Simulation', () => {
  it('spawns 5 non-overlapping fighters in FFA mode and 2 in Duel Debug mode', () => {
    const mm = new MatchManager(undefined, createSeededRng(10));
    expect(mm.state).toBe('MainMenu');

    mm.startMatch('spear', 'ffa5');
    expect(mm.state).toBe('Countdown');
    expect(mm.fighters.length).toBe(5);
    expect(mm.bots.size).toBe(4);

    // Check zero overlap among spawns and inside arena radius
    for (let i = 0; i < mm.fighters.length; i++) {
      const a = mm.fighters[i];
      expect(Math.hypot(a.body.x, a.body.z)).toBeLessThan(mm.arena.radius);
      for (let j = i + 1; j < mm.fighters.length; j++) {
        const b = mm.fighters[j];
        const d = Math.hypot(b.body.x - a.body.x, b.body.z - a.body.z);
        expect(d).toBeGreaterThan(a.body.radius + b.body.radius);
      }
    }

    // Switch cleanly to 1v1 debug duel mode without leftover entities
    mm.startMatch('hammer', 'duel_debug');
    expect(mm.fighters.length).toBe(2);
    expect(mm.bots.size).toBe(1);
  });

  it('transitions Countdown -> InProgress -> PlayerEliminated -> MatchFinished cleanly', () => {
    const mm = new MatchManager(undefined, createSeededRng(77));
    mm.startMatch('sword', 'ffa5');

    // Step past 3s countdown
    for (let i = 0; i < 65; i++) {
      mm.update(0.05, createEmptyIntent(0));
    }
    expect(mm.state).toBe('InProgress');

    // Eliminate human player while 4 bots remain -> enters PlayerEliminated spectator state!
    const player = mm.getPlayer()!;
    player.takeRawDamage(500, 'bot_1');
    mm.update(0.05, createEmptyIntent(0));
    expect(mm.state).toBe('PlayerEliminated');

    // Simulate bots fighting each other until a single Last Standing knight wins!
    let ticks = 0;
    while (mm.state !== 'MatchFinished' && ticks < 4000) {
      mm.update(0.05, createEmptyIntent(0));
      ticks += 1;
    }

    expect(mm.state).toBe('MatchFinished');
    expect(mm.winnerId).not.toBeNull();
    const standings = mm.getStandings();
    expect(standings.length).toBe(5);
    expect(standings[0].fighterId).toBe(mm.winnerId);

    // Restart match and verify clean reset
    const prevGen = mm.matchGeneration;
    mm.restartMatch();
    expect(mm.matchGeneration).toBe(prevGen + 1);
    expect(mm.state).toBe('Countdown');
    expect(mm.getLivingFighters().length).toBe(5);
    expect(mm.winnerId).toBeNull();
  });

  it('configures higher durability HP pools for all 4 knight classes for longer tactical fights', () => {
    expect(KNIGHT_CLASSES.sword.maxHp).toBe(185);
    expect(KNIGHT_CLASSES.dual.maxHp).toBe(155);
    expect(KNIGHT_CLASSES.spear.maxHp).toBe(165);
    expect(KNIGHT_CLASSES.hammer.maxHp).toBe(225);
  });

  it('tactical BotAI defends against off-target ambushers, retreats when outnumbered/wounded, and breaks blocks', () => {
    const rng = createSeededRng(123);
    const botFighter = new Fighter({
      id: 'smart_bot',
      displayName: 'Smart Bot',
      classId: 'sword',
      isHuman: false,
      x: -4,
      z: 0,
      yaw: 0,
    });
    const bot = new BotController(botFighter, rng);

    const distantTarget = new Fighter({
      id: 'far_target',
      displayName: 'Far Enemy',
      classId: 'spear',
      isHuman: true,
      x: -4,
      z: 9.0,
      yaw: Math.PI,
    });
    const flanker = new Fighter({
      id: 'flanker',
      displayName: 'Flanker',
      classId: 'hammer',
      isHuman: false,
      x: -2.0,
      z: 0,
      yaw: -Math.PI / 2, // facing -X straight toward smart_bot!
    });

    bot.targetId = 'far_target';

    // Flanker winds up an unblockable Heavy Slam right next to smart_bot!
    const heavyReq = createEmptyIntent(-Math.PI / 2);
    heavyReq.heavyAttackRequest = true;
    flanker.update(0.02, heavyReq, ARENA_CONFIG, true);

    let defendedAgainstFlanker = false;
    for (let i = 0; i < 18; i++) {
      const intent = bot.update(
        0.02,
        [botFighter, distantTarget, flanker],
        new Map(),
        ARENA_CONFIG,
        true
      );
      if (intent.dodgePressed || intent.blockHeld) {
        defendedAgainstFlanker = true;
        break;
      }
    }
    expect(defendedAgainstFlanker).toBe(true);

    // When wounded, Sword bot uses [2] Oath of Steel to self-heal +30 HP before trading!
    botFighter.hp = 90;
    flanker.state = 'Idle';
    flanker.activeAttack = null;
    const healIntent = bot.update(
      0.05,
      [botFighter, distantTarget],
      new Map(),
      ARENA_CONFIG,
      true
    );
    expect(healIntent.ability2Pressed).toBe(true);

    // Against a turtling Blocking foe in range, bot uses unblockable [1] Heroic Rush or Heavy Guard-Break!
    botFighter.hp = botFighter.maxHp;
    botFighter.abilityCooldowns[1] = 10; // [2] on cooldown so it focuses offense
    distantTarget.body.x = -4;
    distantTarget.body.z = 3.0;
    const blk = createEmptyIntent(Math.PI);
    blk.blockHeld = true;
    distantTarget.update(0.05, blk, ARENA_CONFIG, true);

    let guardBreakUsed = false;
    for (let i = 0; i < 12; i++) {
      const offIntent = bot.update(
        0.05,
        [botFighter, distantTarget],
        new Map(),
        ARENA_CONFIG,
        true
      );
      if (offIntent.ability1Pressed || offIntent.heavyAttackRequest) {
        guardBreakUsed = true;
        break;
      }
    }
    expect(guardBreakUsed).toBe(true);
  });
});
