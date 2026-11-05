import { describe, expect, it } from 'vitest';
import { createEmptyIntent } from '../src/core/Fighter';
import { MatchManager } from '../src/core/MatchManager';
import { yawFromDir } from '../src/core/math';
import type { SoloAssistTier } from '../src/config/soloBotProgress';

function seededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => ((state = (state * 1664525 + 1013904223) >>> 0) / 0x100000000);
}

/** A novice who chases the nearest opponent and presses attack regularly, without dodging/parrying. */
function playNoviceMatch(seed: number, tier: SoloAssistTier): number {
  const match = new MatchManager(undefined, seededRng(seed * 9253));
  match.startMatch('dual', 'ffa5', tier);
  const player = match.getPlayer()!;

  for (let tick = 0; tick < 3850 && match.state !== 'MatchFinished'; tick++) {
    const intent = createEmptyIntent(player.yaw);
    const target = match.fighters
      .filter(f => f.id !== player.id && f.isAlive)
      .sort((a, b) =>
        Math.hypot(a.body.x - player.body.x, a.body.z - player.body.z) -
        Math.hypot(b.body.x - player.body.x, b.body.z - player.body.z)
      )[0];
    if (target && player.isAlive && match.state === 'InProgress') {
      const dx = target.body.x - player.body.x;
      const dz = target.body.z - player.body.z;
      const dist = Math.hypot(dx, dz);
      intent.moveX = dist > 2.3 ? dx / dist : 0;
      intent.moveZ = dist > 2.3 ? dz / dist : 0;
      intent.aimYaw = yawFromDir(dx, dz, player.yaw);
      intent.hasAimOverride = true;
      intent.sprint = dist > 6;
      intent.lightAttackTap = dist < 4 && tick % 10 === 0;
      intent.ability1Pressed = dist < 5 && tick % 80 === 0;
    }
    match.update(0.05, intent);
  }
  // Read the ordinary combat result; no synthetic eliminations or placements.
  return match.getMatchRewards().place;
}

describe('solo comeback playtest', () => {
  it('gives an aggressive novice more genuine near-misses and wins as the bots ease off', () => {
    const baseline = Array.from({ length: 12 }, (_, index) => playNoviceMatch(index + 1, 0));
    const gentle = Array.from({ length: 12 }, (_, index) => playNoviceMatch(index + 1, 1));
    const comeback = Array.from({ length: 12 }, (_, index) => playNoviceMatch(index + 1, 3));
    const topThree = (places: number[]) => places.filter(place => place <= 3).length;
    const wins = (places: number[]) => places.filter(place => place === 1).length;

    expect(topThree(gentle)).toBeGreaterThan(topThree(baseline));
    expect(topThree(comeback)).toBeGreaterThan(topThree(gentle));
    expect(wins(comeback)).toBeGreaterThan(wins(baseline));
    expect(comeback.some(place => place === 2 || place === 3)).toBe(true);
    expect(comeback.some(place => place > 3)).toBe(true); // Never a guaranteed placement.
  });
});
