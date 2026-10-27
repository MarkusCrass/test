import { describe, expect, it } from 'vitest';
import { ARENA_CONFIG } from '../src/config/arenaConfig';
import { CombatSystem } from '../src/core/CombatSystem';
import { createEmptyIntent, Fighter } from '../src/core/Fighter';

describe('Class Signature Abilities [1] & [2] across all 4 Knights', () => {
  it('Sword [1] Heroic Rush pierces enemy block & [2] Oath of Steel heals + buffs damage by 25%', () => {
    const combat = new CombatSystem();
    const sword = new Fighter({
      id: 'sword_p',
      displayName: 'Paladin',
      classId: 'sword',
      isHuman: true,
      x: 0,
      z: 0,
      yaw: 0, // facing +Z
    });
    const blocker = new Fighter({
      id: 'enemy',
      displayName: 'Defender',
      classId: 'sword',
      isHuman: false,
      x: 0,
      z: 3.2,
      yaw: Math.PI, // facing -Z toward Paladin
    });

    // Enemy holds block
    const blockIntent = createEmptyIntent(Math.PI);
    blockIntent.blockHeld = true;
    blocker.update(0.05, blockIntent, ARENA_CONFIG, true);
    expect(blocker.state).toBe('Blocking');

    // Paladin triggers [1] Heroic Rush
    const ab1 = createEmptyIntent(0);
    ab1.ability1Pressed = true;
    const res1 = sword.update(1 / 60, ab1, ARENA_CONFIG, true);
    expect(res1.usedAbility?.id).toBe('sword_rush');
    expect(sword.abilityCooldowns[0]).toBeGreaterThan(6.5);

    for (let i = 0; i < 45; i++) {
      sword.update(1 / 60, createEmptyIntent(0), ARENA_CONFIG, true);
      blocker.update(1 / 60, blockIntent, ARENA_CONFIG, true);
      combat.step([sword, blocker], ARENA_CONFIG, 1.0, 1 / 60);
    }
    expect(blocker.hp).toBeLessThan(blocker.maxHp);

    // Wound Paladin and drain stamina, then cast [2] Oath of Steel
    sword.hp = 50;
    sword.stamina = 30;
    const ab2 = createEmptyIntent(0);
    ab2.ability2Pressed = true;
    const res2 = sword.update(1 / 60, ab2, ARENA_CONFIG, true);
    expect(res2.usedAbility?.id).toBe('sword_warcry');

    for (let i = 0; i < 30; i++) {
      sword.update(1 / 60, createEmptyIntent(0), ARENA_CONFIG, true);
      combat.step([sword, blocker], ARENA_CONFIG, 1.0, 1 / 60);
    }
    expect(sword.hp).toBe(68); // +18 HP healed!
    expect(sword.damageAuraTimer).toBeGreaterThan(4.0);
  });

  it('Dual [1] Blade Cyclone lands multi-hit spin & [2] Thrown Dagger hits distant target + grants Haste', () => {
    const combat = new CombatSystem();
    const dual = new Fighter({
      id: 'dual_p',
      displayName: 'Duelist',
      classId: 'dual',
      isHuman: true,
      x: 0,
      z: 0,
      yaw: 0,
    });
    const dummy = new Fighter({
      id: 'dummy',
      displayName: 'Target',
      classId: 'hammer',
      isHuman: false,
      x: 0,
      z: 1.8,
      yaw: Math.PI,
    });

    // Trigger [1] Blade Cyclone
    const ab1 = createEmptyIntent(0);
    ab1.ability1Pressed = true;
    dual.update(1 / 60, ab1, ARENA_CONFIG, true);

    let cycloneHits = 0;
    for (let i = 0; i < 60; i++) {
      const steer = createEmptyIntent(0);
      dual.update(1 / 60, steer, ARENA_CONFIG, true);
      // Keep dummy within spin radius to count multi-hit pulses
      dummy.body.x = dual.body.x;
      dummy.body.z = dual.body.z + 1.5;
      const evs = combat.step([dual, dummy], ARENA_CONFIG, 1.0, 1 / 60);
      cycloneHits += evs.filter((e) => e.type === 'hit').length;
    }
    expect(cycloneHits).toBeGreaterThanOrEqual(2);

    // Place target 8.5m away in clear courtyard lane (x = -4 avoids center bridge ramp/pillars) and cast [2] Thrown Dagger!
    dual.body.x = -4;
    dual.body.z = -4;
    dual.yaw = 0;
    dummy.body.x = -4;
    dummy.body.z = 4.5;
    const hpBeforeDagger = dummy.hp;

    const ab2 = createEmptyIntent(0);
    ab2.ability2Pressed = true;
    dual.update(1 / 60, ab2, ARENA_CONFIG, true);

    let daggerHitObserved = false;
    for (let i = 0; i < 45; i++) {
      dual.update(1 / 60, createEmptyIntent(0), ARENA_CONFIG, true);
      const evs = combat.step([dual, dummy], ARENA_CONFIG, 1.0, 1 / 60);
      if (evs.some((e) => e.type === 'dagger_hit')) {
        daggerHitObserved = true;
      }
    }
    expect(daggerHitObserved).toBe(true);
    expect(dummy.hp).toBeLessThan(hpBeforeDagger);
    expect(dual.hasteTimer).toBeGreaterThan(2.5);
  });

  it('Spear [1] Dragon Lunge pierces guard at long range & [2] Sweep Vault hits 360° and vaults backward', () => {
    const combat = new CombatSystem();
    const spear = new Fighter({
      id: 'spear_p',
      displayName: 'Lancer',
      classId: 'spear',
      isHuman: true,
      x: -4,
      z: 0,
      yaw: 0,
    });
    const flanker = new Fighter({
      id: 'flanker',
      displayName: 'Flanker',
      classId: 'dual',
      isHuman: false,
      x: -4,
      z: -2.1, // Standing BEHIND the Spear knight!
      yaw: 0,
    });

    // Cast [2] 360° Sweep Vault while enemy is behind!
    const startZ = spear.body.z;
    const ab2 = createEmptyIntent(0);
    ab2.ability2Pressed = true;
    spear.update(1 / 60, ab2, ARENA_CONFIG, true);

    for (let i = 0; i < 45; i++) {
      spear.update(1 / 60, createEmptyIntent(0), ARENA_CONFIG, true);
      combat.step([spear, flanker], ARENA_CONFIG, 1.0, 1 / 60);
    }
    // Enemy behind took 360° sweep damage AND Spear vaulted backward (-Z)!
    expect(flanker.hp).toBeLessThan(flanker.maxHp);
    expect(spear.body.z).toBeLessThan(startZ - 1.2);

    // Cast [1] Dragon Lunge against distant blocking foe
    spear.body.x = -4;
    spear.body.z = 0;
    spear.yaw = 0;
    flanker.body.x = -4;
    flanker.body.z = 4.6;
    flanker.yaw = Math.PI;
    const blk = createEmptyIntent(Math.PI);
    blk.blockHeld = true;
    flanker.update(0.05, blk, ARENA_CONFIG, true);
    const hpBeforeDragon = flanker.hp;

    const ab1 = createEmptyIntent(0);
    ab1.ability1Pressed = true;
    spear.update(1 / 60, ab1, ARENA_CONFIG, true);
    for (let i = 0; i < 38; i++) {
      spear.update(1 / 60, createEmptyIntent(0), ARENA_CONFIG, true);
      flanker.update(1 / 60, blk, ARENA_CONFIG, true);
      combat.step([spear, flanker], ARENA_CONFIG, 1.0, 1 / 60);
    }
    expect(flanker.hp).toBeLessThan(hpBeforeDragon);
  });

  it('Hammer [1] Siege Ram applies full Stunned state & [2] Titan Quake grants Iron Bastion (-35% dmg + hyper-armor)', () => {
    const combat = new CombatSystem();
    const hammer = new Fighter({
      id: 'hammer_p',
      displayName: 'Juggernaut',
      classId: 'hammer',
      isHuman: true,
      x: -4,
      z: 0,
      yaw: 0,
    });
    const victim = new Fighter({
      id: 'victim',
      displayName: 'Swordsman',
      classId: 'sword',
      isHuman: false,
      x: -4,
      z: 3.4,
      yaw: Math.PI,
    });

    // Cast [1] Siege Ram
    const ab1 = createEmptyIntent(0);
    ab1.ability1Pressed = true;
    hammer.update(1 / 60, ab1, ARENA_CONFIG, true);
    expect(hammer.hasFrontalAbilityGuard).toBe(true);

    let stunnedObserved = false;
    for (let i = 0; i < 40; i++) {
      hammer.update(1 / 60, createEmptyIntent(0), ARENA_CONFIG, true);
      victim.update(1 / 60, createEmptyIntent(Math.PI), ARENA_CONFIG, true);
      combat.step([hammer, victim], ARENA_CONFIG, 1.0, 1 / 60);
      if (victim.state === 'Stunned') {
        stunnedObserved = true;
      }
    }
    expect(stunnedObserved).toBe(true);

    // Wait for Hammer recovery, place victim nearby & cast [2] Titan Quake
    for (let i = 0; i < 30; i++) {
      hammer.update(1 / 60, createEmptyIntent(0), ARENA_CONFIG, true);
      victim.update(1 / 60, createEmptyIntent(Math.PI), ARENA_CONFIG, true);
    }
    victim.body.x = hammer.body.x;
    victim.body.z = hammer.body.z + 2.8;
    const hpBeforeQuake = victim.hp;

    const ab2 = createEmptyIntent(0);
    ab2.ability2Pressed = true;
    hammer.update(1 / 60, ab2, ARENA_CONFIG, true);

    let quakeObserved = false;
    for (let i = 0; i < 45; i++) {
      hammer.update(1 / 60, createEmptyIntent(0), ARENA_CONFIG, true);
      const evs = combat.step([hammer, victim], ARENA_CONFIG, 1.0, 1 / 60);
      if (evs.some((e) => e.type === 'quake_slam')) {
        quakeObserved = true;
      }
    }
    expect(quakeObserved).toBe(true);
    expect(victim.hp).toBeLessThan(hpBeforeQuake);
    expect(hammer.ironBastionTimer).toBeGreaterThan(4.0);

    // Verify Iron Bastion prevents HitReaction stagger!
    hammer.applyHitReaction(0.4, false);
    expect(hammer.state).not.toBe('HitReaction');
  });
});
