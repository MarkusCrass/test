import { describe, expect, it } from 'vitest';
import { ARENA_CONFIG } from '../src/config/arenaConfig';
import { BotController } from '../src/core/BotAI';
import { CharacterBody } from '../src/core/CharacterBody';
import { CombatSystem } from '../src/core/CombatSystem';
import { createEmptyIntent, Fighter } from '../src/core/Fighter';
import { DUNGEON_MODEL_FILES } from '../src/render/DungeonAssetCache';

describe('Two-Tier Skybridge Arena & Modular 3D Assets', () => {
  it('climbs wide stone staircase smoothly from Courtyard (y=0) to Upper Bastion (y=4.0m) and descends opposite stairs', () => {
    const knight = new Fighter({
      id: 'climber',
      displayName: 'Climber',
      isHuman: true,
      classId: 'sword',
      x: -14.0,
      y: 0,
      z: 11.4,
      yaw: Math.PI,
    });

    const dt = 1 / 60;
    // Phase 1: Sprint ~11m North up SW Stairs onto West Upper Bastion (z ~ 0)
    for (let i = 0; i < 95; i++) {
      const intent = createEmptyIntent(Math.PI);
      intent.moveZ = -1;
      intent.sprint = true;
      knight.update(dt, intent, ARENA_CONFIG, true);
    }

    expect(knight.body.z).toBeGreaterThan(-4.5);
    expect(knight.body.z).toBeLessThan(4.5);
    expect(knight.body.y).toBeCloseTo(ARENA_CONFIG.tierHeight, 2);
    expect(knight.body.isGrounded).toBe(true);

    // Phase 2: Keep moving North across Bastion and descend NW Stairs back to y = 0.0m!
    for (let i = 0; i < 130; i++) {
      const intent = createEmptyIntent(Math.PI);
      intent.moveZ = -1;
      knight.update(dt, intent, ARENA_CONFIG, true);
    }

    expect(knight.body.z).toBeLessThan(-10.2);
    expect(knight.body.y).toBeCloseTo(0.0, 2);
    expect(knight.body.isGrounded).toBe(true);
  });

  it('supports simultaneous walk-over (y=4m) and walk-under (y=0m) on the Central Skybridge without interference', () => {
    const upperKnight = new Fighter({
      id: 'upper',
      displayName: 'Bridge Knight',
      isHuman: true,
      classId: 'sword',
      x: -11.0,
      y: 4.0,
      z: 0.0,
      yaw: Math.PI * 0.5,
    });

    const lowerKnight = new Fighter({
      id: 'lower',
      displayName: 'Underpass Knight',
      isHuman: false,
      classId: 'spear',
      x: 0.0,
      y: 0.0,
      z: 8.0,
      yaw: Math.PI,
    });

    const dt = 1 / 60;
    for (let i = 0; i < 200; i++) {
      const iUpper = createEmptyIntent(Math.PI * 0.5);
      iUpper.moveX = 1;
      upperKnight.update(dt, iUpper, ARENA_CONFIG, true);

      const iLower = createEmptyIntent(Math.PI);
      iLower.moveZ = -1;
      lowerKnight.update(dt, iLower, ARENA_CONFIG, true);

      CharacterBody.resolveFighterCollisions(
        [upperKnight.body, lowerKnight.body],
        ARENA_CONFIG
      );
    }

    // Upper knight crossed across the Skybridge staying at y = 4.0m
    expect(upperKnight.body.x).toBeGreaterThan(-2.0);
    expect(upperKnight.body.y).toBeCloseTo(4.0, 2);

    // Lower knight walked straight underneath the Skybridge staying at y = 0.0m
    expect(lowerKnight.body.z).toBeLessThan(-1.0);
    expect(lowerKnight.body.y).toBeCloseTo(0.0, 2);
  });

  it('applies gravity drop-off when stepping or knocked off the Skybridge open center ledge', () => {
    const jumper = new Fighter({
      id: 'jumper',
      displayName: 'Jumper',
      isHuman: true,
      classId: 'dual',
      x: 0.0,
      y: 4.0,
      z: 2.8,
      yaw: 0,
    });

    const dt = 1 / 60;
    let sawAirborne = false;
    for (let i = 0; i < 120; i++) {
      const intent = createEmptyIntent(0);
      intent.moveZ = 1;
      jumper.update(dt, intent, ARENA_CONFIG, true);
      if (!jumper.body.isGrounded) {
        sawAirborne = true;
      }
    }

    expect(sawAirborne).toBe(true);
    expect(jumper.body.z).toBeGreaterThan(4.5);
    expect(jumper.body.y).toBeCloseTo(0.0, 2);
    expect(jumper.body.isGrounded).toBe(true);
  });

  it('prevents weapon hits between different vertical tiers while hitting cleanly on the same tier', () => {
    const combat = new CombatSystem();
    const bridgeAttacker = new Fighter({
      id: 'atk',
      displayName: 'Bridge Attacker',
      isHuman: true,
      classId: 'spear',
      x: 0,
      y: 4.0,
      z: 0,
      yaw: 0,
    });
    const underVictim = new Fighter({
      id: 'under',
      displayName: 'Under Bridge Victim',
      isHuman: false,
      classId: 'sword',
      x: 0,
      y: 0.0,
      z: 1.8,
      yaw: Math.PI,
    });
    const sameTierVictim = new Fighter({
      id: 'same',
      displayName: 'Bridge Victim',
      isHuman: false,
      classId: 'sword',
      x: 0,
      y: 4.0,
      z: 1.8,
      yaw: Math.PI,
    });

    const atk = bridgeAttacker.config.lightCombo[0];
    expect(
      combat.checkWeaponHit(bridgeAttacker, underVictim, atk, ARENA_CONFIG)
    ).toBeNull();
    expect(
      combat.checkWeaponHit(bridgeAttacker, sameTierVictim, atk, ARENA_CONFIG)
    ).not.toBeNull();
  });

  it('navigates BotController from Lower Courtyard up a Staircase to reach an enemy on Tier 2', () => {
    const lowerBotFighter = new Fighter({
      id: 'bot_climber',
      displayName: 'Bot Climber',
      isHuman: false,
      classId: 'dual',
      x: -8.0,
      y: 0.0,
      z: 13.5,
      yaw: Math.PI,
    });
    const upperTarget = new Fighter({
      id: 'bridge_target',
      displayName: 'Bridge Target',
      isHuman: true,
      classId: 'sword',
      x: -13.5,
      y: 4.0,
      z: 0.0,
      yaw: 0,
    });

    const bot = new BotController(lowerBotFighter, () => 0.42);
    const all = [lowerBotFighter, upperTarget];
    const counts = new Map<string, number>();

    const dt = 1 / 60;
    for (let i = 0; i < 360; i++) {
      const intent = bot.update(dt, all, counts, ARENA_CONFIG, true);
      lowerBotFighter.update(dt, intent, ARENA_CONFIG, true);
    }

    expect(lowerBotFighter.body.y).toBeCloseTo(4.0, 2);
  });

  it('registers all 23 modular KayKit Dungeon Remastered .glb asset keys', () => {
    const entries = Object.values(DUNGEON_MODEL_FILES);
    expect(entries.length).toBe(23);
    for (const filename of entries) {
      expect(filename.endsWith('.glb')).toBe(true);
    }
  });
});
