import { describe, expect, it } from 'vitest';
import { ARENA_CONFIG } from '../src/config/arenaConfig';
import { CLASS_ORDER } from '../src/config/classes';
import { CombatSystem } from '../src/core/CombatSystem';
import { createEmptyIntent, Fighter } from '../src/core/Fighter';
import { angleDiff } from '../src/core/math';
import {
  CameraRig,
  RETICLE_DEFAULT_NORM_X,
  RETICLE_DEFAULT_NORM_Y,
} from '../src/render/CameraRig';

describe('CameraRig SpringArm, Obstacles & All 4 Classes Verification', () => {
  it('supports full spherical MMORPG pitch (upward & downward), scroll zoom, and prevents clipping through walls/floors', () => {
    const cam = new CameraRig(16 / 9);
    cam.snapBehindTarget(0, -13.2, 0); // Player standing near outer zone

    // Look steep UPWARD (negative pitch -> looking up at Skybridge / towers!)
    cam.applyMouseDelta(0, -99999, 1.0);
    expect(cam.pitch).toBeCloseTo(cam.minPitch, 4);
    expect(cam.pitch).toBeLessThan(-0.75);
    for (let i = 0; i < 15; i++) {
      cam.updateGameplay(0.05, 0, -5.0, ARENA_CONFIG, 0);
    }
    // Camera never sinks below courtyard floor even when pitching -47 deg upward!
    expect(cam.camera.position.y).toBeGreaterThanOrEqual(0.24);

    // Look steep DOWNWARD (high tactical MMORPG bird's-eye overview)
    cam.applyMouseDelta(0, 99999, 1.0);
    expect(cam.pitch).toBeCloseTo(cam.maxPitch, 4);
    expect(cam.pitch).toBeGreaterThan(1.15);

    // Mouse-wheel zoom clamps cleanly between [2.4m .. 10.8m] across scroll ticks
    for (let i = 0; i < 12; i++) cam.applyWheelZoom(-120);
    expect(cam.targetDistance).toBeCloseTo(cam.minDistance, 4);
    for (let i = 0; i < 20; i++) cam.applyWheelZoom(120);
    expect(cam.targetDistance).toBeCloseTo(cam.maxDistance, 4);
    cam.targetDistance = 6.0;

    // Update camera near perimeter wall -> camera must stay inside arena radius
    for (let i = 0; i < 20; i++) {
      cam.updateGameplay(0.05, 0, -20.5, ARENA_CONFIG);
    }
    const camDistFromArenaCenter = Math.hypot(
      cam.camera.position.x,
      cam.camera.position.z
    );
    expect(camDistFromArenaCenter).toBeLessThan(ARENA_CONFIG.radius);
  });

  it('positions the lower crosshair at top=42%, raycasts anywhere across screen, turns 180° on free-cam attack, and aims 3D projectiles vertically', () => {
    expect(RETICLE_DEFAULT_NORM_X).toBeCloseTo(0.5, 4);
    expect(RETICLE_DEFAULT_NORM_Y).toBeCloseTo(0.42, 4);

    const cam = new CameraRig(16 / 9);
    const player = new Fighter({
      id: 'hero',
      displayName: 'Hero',
      isHuman: true,
      classId: 'dual',
      x: 0,
      y: 0,
      z: -8.5,
      yaw: Math.PI, // Initially facing AWAY (-Z) while camera looks +Z!
    });

    const bridgeEnemy = new Fighter({
      id: 'bridge_foe',
      displayName: 'Страж Моста',
      isHuman: false,
      classId: 'sword',
      x: 0,
      y: 4.0, // Standing 4m up at Tier 2 Skybridge overlook edge!
      z: -3.4,
      yaw: Math.PI,
    });

    // Snap camera at yaw=0 (+Z) and tilt upward toward the 4m Skybridge enemy
    cam.snapBehindTarget(player.body.x, player.body.z, 0, player.body.y);
    cam.pitch = -0.22; // Looking upward!
    cam.updateGameplay(0.05, player.body.x, player.body.z, ARENA_CONFIG, 0);

    // 1. Raycast through elevated crosshair & verify upward aimPitch + enemy detection
    const centerAim = cam.computeCrosshairAim({
      normX: RETICLE_DEFAULT_NORM_X,
      normY: RETICLE_DEFAULT_NORM_Y,
      playerX: player.body.x,
      playerY: player.body.y,
      playerZ: player.body.z,
      fighters: [player, bridgeEnemy],
      localPlayerId: player.id,
      arena: ARENA_CONFIG,
    });
    expect(Math.abs(angleDiff(centerAim.aimYaw, 0))).toBeLessThan(0.08);
    expect(centerAim.aimPitch).toBeGreaterThan(0.25);

    // 2. Raycast at far left & far right screen coordinates (Free-Cursor MMORPG mode!)
    const leftAim = cam.computeCrosshairAim({
      normX: 0.12,
      normY: 0.25,
      playerX: player.body.x,
      playerY: player.body.y,
      playerZ: player.body.z,
      arena: ARENA_CONFIG,
    });
    const rightAim = cam.computeCrosshairAim({
      normX: 0.88,
      normY: 0.72,
      playerX: player.body.x,
      playerY: player.body.y,
      playerZ: player.body.z,
      arena: ARENA_CONFIG,
    });
    expect(Math.abs(angleDiff(leftAim.aimYaw, rightAim.aimYaw))).toBeGreaterThan(
      0.45
    );
    expect(leftAim.aimPitch).toBeGreaterThan(rightAim.aimPitch);

    // 3. Cast Throwing Dagger [2] when player was facing 180° away (-Z) -> immediately turns +Z and hits 4m Skybridge enemy!
    const combat = new CombatSystem();
    const castIntent = createEmptyIntent(centerAim.aimYaw);
    castIntent.aimPitch = Math.atan2(
      bridgeEnemy.body.y + 1.15 - (player.body.y + 1.22),
      Math.hypot(
        bridgeEnemy.body.x - player.body.x,
        bridgeEnemy.body.z - player.body.z
      )
    );
    castIntent.hasAimOverride = true;
    castIntent.ability2Pressed = true;

    player.update(1 / 60, castIntent, ARENA_CONFIG, true);
    // Player immediately spun 180 deg from Math.PI to ~0 toward crosshair!
    expect(Math.abs(angleDiff(player.yaw, 0))).toBeLessThan(0.05);

    let hitBridgeEnemy = false;
    for (let step = 0; step < 60; step++) {
      player.update(
        1 / 60,
        {
          ...createEmptyIntent(centerAim.aimYaw),
          aimPitch: castIntent.aimPitch,
          hasAimOverride: true,
        },
        ARENA_CONFIG,
        true
      );
      const evs = combat.step([player, bridgeEnemy], ARENA_CONFIG, 1.0, 1 / 60);
      if (evs.some((e) => e.type === 'dagger_hit' && e.victimId === bridgeEnemy.id)) {
        hitBridgeEnemy = true;
        break;
      }
    }
    expect(hitBridgeEnemy).toBe(true);
    expect(bridgeEnemy.hp).toBeLessThan(bridgeEnemy.maxHp);
  });

  it('prevents attacks from hitting through solid stone columns', () => {
    const combat = new CombatSystem();
    const pillar = ARENA_CONFIG.circles[0];

    // Place Spear attacker on one side of the pillar and victim on the opposite side
    const dirX = pillar.x / Math.hypot(pillar.x, pillar.z);
    const dirZ = pillar.z / Math.hypot(pillar.x, pillar.z);

    const spear = new Fighter({
      id: 'spear_a',
      displayName: 'Spear',
      isHuman: true,
      classId: 'spear',
      x: pillar.x - dirX * 1.4,
      z: pillar.z - dirZ * 1.4,
      yaw: Math.atan2(dirX, dirZ),
    });

    const victim = new Fighter({
      id: 'vic',
      displayName: 'Target',
      isHuman: false,
      classId: 'sword',
      x: pillar.x + dirX * 1.4,
      z: pillar.z + dirZ * 1.4,
      yaw: 0,
    });

    const intent = createEmptyIntent(spear.yaw);
    intent.heavyAttackRequest = true; // 4.35m reach easily spans 2.8m, EXCEPT pillar blocks it!
    spear.update(0.01, intent, ARENA_CONFIG, true);
    spear.update(0.41, createEmptyIntent(spear.yaw), ARENA_CONFIG, true); // Active!
    expect(spear.isHitboxActive).toBe(true);

    const events = combat.step([spear, victim], ARENA_CONFIG, 1.0);
    expect(events.length).toBe(0);
    expect(victim.hp).toBe(victim.maxHp);
  });

  it('verifies unique defensive & dodge mechanics across all 4 classes', () => {
    for (const cid of CLASS_ORDER) {
      const f = new Fighter({
        id: `test_${cid}`,
        displayName: cid,
        isHuman: true,
        classId: cid,
        x: 0,
        z: 0,
        yaw: 0, // facing +Z
      });

      const dodgeIntent = createEmptyIntent(0);
      dodgeIntent.dodgePressed = true;
      f.update(0.02, dodgeIntent, ARENA_CONFIG, true);
      expect(f.state).toBe('Dodging');

      // Spear backsteps (-Z) when no directional movement is held; others move forward (+Z)
      if (cid === 'spear') {
        expect(f.dodgeDirZ).toBeLessThan(0);
      } else {
        expect(f.dodgeDirZ).toBeGreaterThan(0);
      }
    }
  });
});
