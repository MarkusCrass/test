import { describe, expect, it } from 'vitest';
import { ARENA_CONFIG } from '../src/config/arenaConfig';
import { CLASS_ORDER } from '../src/config/classes';
import { CombatSystem } from '../src/core/CombatSystem';
import { createEmptyIntent, Fighter } from '../src/core/Fighter';
import { CameraRig } from '../src/render/CameraRig';

describe('CameraRig SpringArm, Obstacles & All 4 Classes Verification', () => {
  it('clamps vertical pitch and prevents camera from clipping outside arena walls', () => {
    const cam = new CameraRig(16 / 9);
    cam.snapBehindTarget(0, -13.2, 0); // Player standing right next to outer wall!

    // Try extreme mouse vertical movements
    cam.applyMouseDelta(0, -99999, 1.0);
    expect(cam.pitch).toBeGreaterThanOrEqual(0.06);

    cam.applyMouseDelta(0, 99999, 1.0);
    expect(cam.pitch).toBeLessThanOrEqual(0.95);

    // Update camera near perimeter wall -> camera must stay inside arena radius (14m)
    for (let i = 0; i < 20; i++) {
      cam.updateGameplay(0.05, 0, -13.2, ARENA_CONFIG);
    }
    const camDistFromArenaCenter = Math.hypot(
      cam.camera.position.x,
      cam.camera.position.z
    );
    expect(camDistFromArenaCenter).toBeLessThan(ARENA_CONFIG.radius);
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
