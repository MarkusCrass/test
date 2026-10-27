import { describe, expect, it } from 'vitest';
import { ARENA_CONFIG } from '../src/config/arenaConfig';
import { CombatSystem } from '../src/core/CombatSystem';
import { createEmptyIntent, Fighter } from '../src/core/Fighter';

describe('Fighter FSM, Stamina & 3-Phase Combat System', () => {
  it('transitions through Windup -> Active -> Recovery and activates hitbox only in Active', () => {
    const f = new Fighter({
      id: 'p1',
      displayName: 'Knight',
      isHuman: true,
      classId: 'sword',
      x: 0,
      z: 0,
      yaw: 0,
    });

    expect(f.state).toBe('Idle');
    expect(f.isHitboxActive).toBe(false);

    const intent = createEmptyIntent(0);
    intent.lightAttackTap = true;
    f.update(0.02, intent, ARENA_CONFIG, true);

    expect(f.state).toBe('Attacking');
    expect(f.attackPhase).toBe('Windup');
    expect(f.isHitboxActive).toBe(false);

    // Advance into Active window (sword_light_1 windup is 0.19s, active is 0.14s)
    f.update(0.19, createEmptyIntent(0), ARENA_CONFIG, true);
    expect(f.attackPhase).toBe('Active');
    expect(f.isHitboxActive).toBe(true);

    // Advance into Recovery window
    f.update(0.15, createEmptyIntent(0), ARENA_CONFIG, true);
    expect(f.attackPhase).toBe('Recovery');
    expect(f.isHitboxActive).toBe(false);

    // Finish recovery -> returns to Idle
    f.update(0.3, createEmptyIntent(0), ARENA_CONFIG, true);
    expect(f.state).toBe('Idle');
    expect(f.attackPhase).toBe('None');
  });

  it('prevents instant 180-degree turn during heavy attack and locks facing in Active phase', () => {
    const f = new Fighter({
      id: 'p1',
      displayName: 'Hammer',
      isHuman: true,
      classId: 'hammer',
      x: 0,
      z: 0,
      yaw: 0,
    });

    // Trigger heavy attack while trying to aim 180 degrees behind (PI)
    const intent = createEmptyIntent(Math.PI);
    intent.hasAimOverride = true;
    intent.heavyAttackRequest = true;
    f.update(0.05, intent, ARENA_CONFIG, true);

    expect(f.state).toBe('HeavyAttacking');
    expect(Math.abs(f.yaw)).toBeLessThan(1.0); // Cannot snap 180 deg!

    // Advance into Active phase
    f.update(0.5, intent, ARENA_CONFIG, true);
    expect(f.attackPhase).toBe('Active');
    const yawAtActiveStart = f.yaw;

    // Spin camera wildly during Active phase -> fighter yaw must stay locked!
    const spinIntent = createEmptyIntent(-Math.PI * 0.9);
    spinIntent.hasAimOverride = true;
    f.update(0.08, spinIntent, ARENA_CONFIG, true);
    expect(f.yaw).toBeCloseTo(yawAtActiveStart, 5);
  });

  it('never hits the same target twice during a single attack across multiple Active frames', () => {
    const combat = new CombatSystem();
    const attacker = new Fighter({
      id: 'a',
      displayName: 'Attacker',
      isHuman: true,
      classId: 'sword',
      x: 0,
      z: 0,
      yaw: 0, // faces +Z
    });
    const victim = new Fighter({
      id: 'v',
      displayName: 'Victim',
      isHuman: false,
      classId: 'sword',
      x: 0,
      z: 1.8,
      yaw: Math.PI,
    });

    const tap = createEmptyIntent(0);
    tap.lightAttackTap = true;
    attacker.update(0.01, tap, ARENA_CONFIG, true);

    let hitCount = 0;
    for (let i = 0; i < 40; i++) {
      attacker.update(0.016, createEmptyIntent(0), ARENA_CONFIG, true);
      victim.update(0.016, createEmptyIntent(Math.PI), ARENA_CONFIG, true);
      const events = combat.step([attacker, victim], ARENA_CONFIG, 1.0);
      for (const ev of events) {
        if (ev.type === 'hit') hitCount += 1;
      }
    }

    expect(hitCount).toBe(1);
    expect(victim.hp).toBeLessThan(victim.maxHp);
    expect(victim.hp).toBeGreaterThan(0);
  });

  it('enforces stamina costs, regen delay, clamping, and forbids actions when exhausted', () => {
    const f = new Fighter({
      id: 'p1',
      displayName: 'Knight',
      isHuman: true,
      classId: 'sword',
      x: 0,
      z: 0,
      yaw: 0,
    });

    f.drainStaminaClamped(95); // leaves 5 stamina
    expect(f.stamina).toBeCloseTo(5, 3);

    // Heavy attack requires 26 stamina -> must be rejected
    const heavy = createEmptyIntent(0);
    heavy.heavyAttackRequest = true;
    f.update(0.02, heavy, ARENA_CONFIG, true);
    expect(f.state).toBe('Idle');

    // Dodge requires 22 stamina -> must be rejected
    const dodge = createEmptyIntent(0);
    dodge.dodgePressed = true;
    f.update(0.02, dodge, ARENA_CONFIG, true);
    expect(f.state).toBe('Idle');

    // Stamina must NOT regenerate during regenDelay (~1.05s)
    f.update(0.5, createEmptyIntent(0), ARENA_CONFIG, true);
    expect(f.stamina).toBeCloseTo(5, 3);

    // After delay elapses, stamina smoothly regenerates
    f.update(1.0, createEmptyIntent(0), ARENA_CONFIG, true);
    expect(f.stamina).toBeGreaterThan(10);
  });

  it('supports directional blocking, timed parry stun (Class B), and unblockable Hammer slam (Class D)', () => {
    const combat = new CombatSystem();

    // 1. Timed Parry stuns melee attacker!
    const swordAttacker = new Fighter({
      id: 'a',
      displayName: 'Sword',
      isHuman: false,
      classId: 'sword',
      x: 0,
      z: 0,
      yaw: 0,
    });
    const dualDefender = new Fighter({
      id: 'd',
      displayName: 'Dual',
      isHuman: true,
      classId: 'dual',
      x: 0,
      z: 1.7,
      yaw: Math.PI, // facing attacker at z=0
    });

    const tap = createEmptyIntent(0);
    tap.lightAttackTap = true;
    swordAttacker.update(0.01, tap, ARENA_CONFIG, true);
    swordAttacker.update(0.19, createEmptyIntent(0), ARENA_CONFIG, true); // now Active

    const parryIntent = createEmptyIntent(Math.PI);
    parryIntent.blockHeld = true;
    dualDefender.update(0.02, parryIntent, ARENA_CONFIG, true);
    expect(dualDefender.state).toBe('Blocking');

    const parryEvents = combat.step([swordAttacker, dualDefender], ARENA_CONFIG, 1.0);
    expect(parryEvents.some((e) => e.type === 'parried')).toBe(true);
    expect(dualDefender.hp).toBe(dualDefender.maxHp);
    expect(swordAttacker.state).toBe('Stunned');

    // 2. Hammer Heavy Slam crushes through normal sword directional block!
    const hammer = new Fighter({
      id: 'h',
      displayName: 'Hammer',
      isHuman: true,
      classId: 'hammer',
      x: 4,
      z: 0,
      yaw: 0,
    });
    const blocker = new Fighter({
      id: 'b',
      displayName: 'Blocker',
      isHuman: false,
      classId: 'sword',
      x: 4,
      z: 1.9,
      yaw: Math.PI,
    });

    const hIntent = createEmptyIntent(0);
    hIntent.heavyAttackRequest = true;
    hammer.update(0.01, hIntent, ARENA_CONFIG, true);
    hammer.update(0.49, createEmptyIntent(0), ARENA_CONFIG, true); // Active!

    const bIntent = createEmptyIntent(Math.PI);
    bIntent.blockHeld = true;
    blocker.update(0.02, bIntent, ARENA_CONFIG, true);
    expect(blocker.state).toBe('Blocking');

    const crushEvents = combat.step([hammer, blocker], ARENA_CONFIG, 1.0);
    expect(crushEvents.some((e) => e.type === 'heavy_hit')).toBe(true);
    expect(blocker.hp).toBeLessThan(blocker.maxHp - 25);
  });

  it('prevents attacks after death and clamps HP at 0', () => {
    const f = new Fighter({
      id: 'dead_test',
      displayName: 'Fallen',
      isHuman: true,
      classId: 'dual',
      x: 0,
      z: 0,
      yaw: 0,
    });

    const died = f.takeRawDamage(999, 'enemy');
    expect(died).toBe(true);
    expect(f.hp).toBe(0);
    expect(f.state).toBe('Dead');

    const intent = createEmptyIntent(0);
    intent.lightAttackTap = true;
    intent.blockHeld = true;
    f.update(0.1, intent, ARENA_CONFIG, true);
    expect(f.state).toBe('Dead');
    expect(f.isHitboxActive).toBe(false);
  });
});
