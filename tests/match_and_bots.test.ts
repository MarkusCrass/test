import { describe, expect, it } from 'vitest';
import { createEmptyIntent } from '../src/core/Fighter';
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
});
