import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ARENA_CONFIG } from '../src/config/arenaConfig';
import {
  ARENA_THEMES,
  DEFAULT_SETTINGS,
  getArenaThemeMeta,
} from '../src/config/settings';
import { BotController } from '../src/core/BotAI';
import { CharacterBody } from '../src/core/CharacterBody';
import { CombatSystem } from '../src/core/CombatSystem';
import { createEmptyIntent, Fighter } from '../src/core/Fighter';
import { ArenaFireSystem } from '../src/render/ArenaFireSystem';
import { ARENA_PROP_FILES } from '../src/render/ArenaPropCache';
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

  it('validates all 65 CC0 3D .glb arena models, fire meshes, colormaps & open-source FX textures on disk', () => {
    const dungeonEntries = Object.values(DUNGEON_MODEL_FILES);
    const propEntries = Object.values(ARENA_PROP_FILES);
    expect(dungeonEntries.length).toBe(36);
    expect(propEntries.length).toBe(29);

    const checkGlbFile = (fullPath: string) => {
      expect(fs.existsSync(fullPath)).toBe(true);
      const buf = fs.readFileSync(fullPath);
      expect(buf.length).toBeGreaterThan(1000);
      expect(buf.toString('ascii', 0, 4)).toBe('glTF');

      // Ensure every external texture URI referenced by a .glb exists right beside it!
      const jsonLen = buf.readUInt32LE(12);
      const gltfJson = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen)) as {
        images?: Array<{ uri?: string }>;
      };
      for (const img of gltfJson.images ?? []) {
        if (img.uri && !img.uri.startsWith('data:')) {
          const texPath = path.join(path.dirname(fullPath), img.uri);
          expect(fs.existsSync(texPath)).toBe(true);
        }
      }
    };

    for (const filename of dungeonEntries) {
      expect(filename.endsWith('.glb')).toBe(true);
      checkGlbFile(path.resolve('public/models/dungeon', filename));
    }

    for (const relPath of propEntries) {
      expect(relPath.endsWith('.glb')).toBe(true);
      checkGlbFile(path.resolve('public/models/props', relPath));
    }

    for (const fxTex of [
      'three_fire_lut.png',
      'volumetric_firetex.png',
      'volumetric_smoke.png',
      'flame_01.png',
      'flame_04.png',
      'fire_01.png',
      'circle_05.png',
    ]) {
      const fxPath = path.resolve('public/textures/fx', fxTex);
      expect(fs.existsSync(fxPath)).toBe(true);
      expect(fs.statSync(fxPath).size).toBeGreaterThan(2000);
    }

    // Verify 3D ArenaFireSystem spawns braziers/bonfires/pit inferno & steps 240 rising embers cleanly
    const fireSys = new ArenaFireSystem();
    const root = new THREE.Group();
    fireSys.createFire({
      parent: root,
      x: 0,
      y: 1.5,
      z: 0,
      preset: 'brazier',
      withLight: true,
      worldEmberOrigin: { x: 0, y: 1.6, z: 0 },
    });
    fireSys.createFire({
      parent: root,
      x: 4,
      y: 0.2,
      z: -6,
      preset: 'bonfire',
      withLight: false,
      worldEmberOrigin: { x: 4, y: 0.5, z: -6 },
    });
    fireSys.update(1.25, 1 / 60, new THREE.Vector3(0, 4, 10));
    expect(root.children.length).toBe(2);
  });

  it('performs parabolic jump on Space (jumpPressed), vaults over low barriers, and triggers landing state', () => {
    // Place knight right in front of court_barrier_north (x=0, z=-10.0, height=1.15m)
    const vaulter = new Fighter({
      id: 'vaulter',
      displayName: 'Vaulter',
      isHuman: true,
      classId: 'sword',
      x: 0.0,
      y: 0.0,
      z: -8.3,
      yaw: Math.PI,
    });

    const dt = 1 / 60;
    let peakY = 0;
    let sawLanded = false;

    for (let i = 0; i < 60; i++) {
      const intent = createEmptyIntent(Math.PI);
      intent.moveZ = -1;
      intent.sprint = true;
      if (i === 0) {
        intent.jumpPressed = true;
      }
      const res = vaulter.update(dt, intent, ARENA_CONFIG, true);
      if (vaulter.body.y > peakY) {
        peakY = vaulter.body.y;
      }
      if (res.landed) {
        sawLanded = true;
      }
    }

    // Reached >1.35m height (clearing 1.15m wooden barrier), crossed past z=-10.0, and landed back at y=0!
    expect(peakY).toBeGreaterThan(1.35);
    expect(vaulter.body.z).toBeLessThan(-10.8);
    expect(sawLanded).toBe(true);
    expect(vaulter.body.isGrounded).toBe(true);
    expect(vaulter.body.y).toBeCloseTo(0.0, 2);
  });

  it('allows all 4 classes (including wide 0.58m Hammer) to walk up stairs and cross Bastion <-> Skybridge seams without snagging', () => {
    const dt = 1 / 60;
    for (const classId of ['hammer', 'sword', 'spear', 'dual'] as const) {
      const knight = new Fighter({
        id: `walk_${classId}`,
        displayName: classId,
        isHuman: true,
        classId,
        x: -14.0,
        y: 0,
        z: 11.2,
        yaw: Math.PI,
      });

      // 1. Normal walk (NO sprint) up SW staircase onto West Bastion (z=11.2 -> z in [-2..+4], y=4.0)
      for (let i = 0; i < 105; i++) {
        const intent = createEmptyIntent(Math.PI);
        intent.moveZ = -1;
        intent.sprint = false;
        knight.update(dt, intent, ARENA_CONFIG, true);
      }
      expect(knight.body.y).toBeCloseTo(4.0, 2);
      expect(knight.body.z).toBeLessThan(5.0);
      expect(knight.body.z).toBeGreaterThan(-4.5);

      // 2. Walk straight East across West Bastion -> Skybridge seam (x=-10) -> East Bastion seam (x=+10) along z = 2.6
      knight.body.z = 2.6;
      for (let i = 0; i < 420; i++) {
        const intent = createEmptyIntent(Math.PI * 0.5);
        intent.moveX = 1;
        intent.sprint = false;
        knight.update(dt, intent, ARENA_CONFIG, true);
      }
      expect(knight.body.y).toBeCloseTo(4.0, 2);
      expect(knight.body.x).toBeGreaterThan(11.5);
    }

    // 3. Jumping underneath the Skybridge at y=0 near z=-3.92 never hits Tier 2 bridge railings above!
    const underJumper = new Fighter({
      id: 'under_jump',
      displayName: 'Under Jumper',
      isHuman: true,
      classId: 'dual',
      x: -5.0,
      y: 0.0,
      z: -5.0,
      yaw: 0,
    });
    for (let i = 0; i < 45; i++) {
      const intent = createEmptyIntent(0);
      intent.moveZ = 1;
      intent.sprint = true;
      intent.jumpPressed = i === 0;
      underJumper.update(dt, intent, ARENA_CONFIG, true);
    }
    expect(underJumper.body.z).toBeGreaterThan(-2.5);
  });

  it('never falls through any of the 4 staircases when jumping up, dodging down, or colliding mid-stairs', () => {
    const dt = 1 / 60;
    const stairCases = [
      { id: 'stairs_nw', x: -14.0, startZ: -11.3, moveZ: 1, yaw: 0 },
      { id: 'stairs_sw', x: -14.0, startZ: 11.3, moveZ: -1, yaw: Math.PI },
      { id: 'stairs_ne', x: 14.0, startZ: -11.3, moveZ: 1, yaw: 0 },
      { id: 'stairs_se', x: 14.0, startZ: 11.3, moveZ: -1, yaw: Math.PI },
    ] as const;

    for (const sc of stairCases) {
      // 1. Repeatedly JUMPING while sprinting UP the steep staircase (the classic vy > 0 tunnel case!)
      const jumper = new Fighter({
        id: `stair_jump_${sc.id}`,
        displayName: 'Stair Jumper',
        isHuman: true,
        classId: 'dual',
        x: sc.x,
        y: 0,
        z: sc.startZ,
        yaw: sc.yaw,
      });

      for (let i = 0; i < 120; i++) {
        const intent = createEmptyIntent(sc.yaw);
        intent.moveZ = sc.moveZ;
        intent.sprint = true;
        intent.jumpPressed = i % 16 === 2;
        jumper.update(dt, intent, ARENA_CONFIG, true);

        const supportY = jumper.body.computeSupportFloorY(ARENA_CONFIG);
        expect(jumper.body.y).toBeGreaterThanOrEqual(supportY - 1e-4);
      }
      expect(jumper.body.y).toBeGreaterThanOrEqual(ARENA_CONFIG.tierHeight - 0.05);

      // 2. Dodging & sprinting BACK DOWN the staircase + colliding with an opponent mid-stairs
      const blocker = new Fighter({
        id: `stair_block_${sc.id}`,
        displayName: 'Stair Blocker',
        isHuman: false,
        classId: 'hammer',
        x: sc.x + 0.25,
        y: 2.0,
        z: sc.moveZ > 0 ? -8.1 : 8.1,
        yaw: sc.yaw,
      });
      blocker.body.y = blocker.body.computeSupportFloorY(ARENA_CONFIG);

      for (let i = 0; i < 140; i++) {
        const downIntent = createEmptyIntent(sc.yaw + Math.PI);
        downIntent.moveZ = -sc.moveZ;
        downIntent.sprint = true;
        downIntent.dodgePressed = i === 8;
        jumper.update(dt, downIntent, ARENA_CONFIG, true);

        const holdIntent = createEmptyIntent(sc.yaw);
        blocker.update(dt, holdIntent, ARENA_CONFIG, true);

        CharacterBody.resolveFighterCollisions(
          [jumper.body, blocker.body],
          ARENA_CONFIG
        );

        expect(jumper.body.y).toBeGreaterThanOrEqual(
          jumper.body.computeSupportFloorY(ARENA_CONFIG) - 1e-4
        );
        expect(blocker.body.y).toBeGreaterThanOrEqual(
          blocker.body.computeSupportFloorY(ARENA_CONFIG) - 1e-4
        );
      }
    }
  });

  it('ships 4 Arena surface & color themes (Oak Timber default, Sandstone, Sapphire Marble, Dark Citadel) with valid .glb & PBR textures', () => {
    expect(DEFAULT_SETTINGS.arenaTheme).toBe('oak_tournament');
    expect(ARENA_THEMES.map((t) => t.id)).toEqual([
      'oak_tournament',
      'sandstone_colosseum',
      'azure_marble',
      'obsidian_citadel',
    ]);

    for (const theme of ARENA_THEMES) {
      const meta = getArenaThemeMeta(theme.id);
      expect(meta.name.length).toBeGreaterThan(3);
      expect(meta.masonryTintHex).toBeGreaterThan(0);
    }

    // Verify new KayKit wood/earth .glb floor tiles & PBR wood/marble JPEGs exist and have valid binary headers
    for (const relGlb of [
      'public/models/dungeon/floor_wood_large.gltf.glb',
      'public/models/dungeon/floor_wood_large_dark.gltf.glb',
      'public/models/dungeon/floor_dirt_large.gltf.glb',
    ]) {
      const p = path.resolve(process.cwd(), relGlb);
      expect(fs.existsSync(p)).toBe(true);
      const buf = fs.readFileSync(p);
      expect(buf.toString('ascii', 0, 4)).toBe('glTF');
    }

    for (const relJpg of [
      'public/textures/arena/hardwood2_diffuse.jpg',
      'public/textures/arena/hardwood2_bump.jpg',
      'public/textures/arena/hardwood2_roughness.jpg',
      'public/textures/arena/marble_checker_diffuse.jpg',
      'public/textures/arena/marble_checker_normal.jpg',
    ]) {
      const p = path.resolve(process.cwd(), relJpg);
      expect(fs.existsSync(p)).toBe(true);
      const buf = fs.readFileSync(p);
      expect(buf[0]).toBe(0xff);
      expect(buf[1]).toBe(0xd8);
    }
  });
});
