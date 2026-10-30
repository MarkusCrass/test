import { describe, expect, it } from 'vitest';
import {
  computeSpatialMix,
  isWoodenBridgeSurface,
  pickVariantIndex,
  SFX_BANKS,
  SoundManager,
} from '../src/audio/SoundManager';
import { Fighter } from '../src/core/Fighter';

describe('Real CC0 Foley SoundManager & Spatial Audio Helpers', () => {
  it('defines non-empty MP3 variant banks across all 27 medieval sound categories', () => {
    const bankEntries = Object.entries(SFX_BANKS);
    expect(bankEntries.length).toBe(27);

    let totalFiles = 0;
    for (const [, files] of bankEntries) {
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) {
        expect(file.endsWith('.mp3')).toBe(true);
        totalFiles++;
      }
    }
    expect(totalFiles).toBe(90);
  });

  it('never picks the same variant twice in a row when bank has multiple samples', () => {
    let last: number | undefined = undefined;
    for (let i = 0; i < 40; i++) {
      const next = pickVariantIndex(4, last, (i * 0.37) % 1);
      expect(next).toBeGreaterThanOrEqual(0);
      expect(next).toBeLessThan(4);
      if (last !== undefined) {
        expect(next).not.toBe(last);
      }
      last = next;
    }
    expect(pickVariantIndex(1, 0, 0.5)).toBe(0);
  });

  it('detects elevated wooden Skybridge deck vs stone courtyard and bastions', () => {
    // Upper central wooden Skybridge (y = 4.0m, |x| <= 10, |z| <= 4)
    expect(isWoodenBridgeSurface(0, 4.0, 0)).toBe(true);
    expect(isWoodenBridgeSurface(-8.5, 4.0, 2.5)).toBe(true);

    // Directly underneath Skybridge in stone courtyard (y = 0.0m) -> stone!
    expect(isWoodenBridgeSurface(0, 0.0, 0)).toBe(false);

    // West & East elevated stone bastions (|x| > 10.2) -> stone!
    expect(isWoodenBridgeSurface(-14.0, 4.0, 0)).toBe(false);
    expect(isWoodenBridgeSurface(14.0, 4.0, 0)).toBe(false);
  });

  it('computes 3D distance attenuation, stereo panning, and focus-actor bypass', () => {
    const listener = { x: 0, y: 0, z: 0, rightX: 1, rightZ: 0 };

    const selfMix = computeSpatialMix(listener, 12, 4, -8, true);
    expect(selfMix.gain).toBe(1.0);
    expect(selfMix.pan).toBe(0.0);
    expect(selfMix.distantLowpassHz).toBeNull();

    const rightEnemy = computeSpatialMix(listener, 10, 0, 0, false);
    const leftEnemy = computeSpatialMix(listener, -10, 0, 0, false);
    expect(rightEnemy.pan).toBeGreaterThan(0.5);
    expect(leftEnemy.pan).toBeLessThan(-0.5);
    expect(rightEnemy.gain).toBeLessThan(1.0);
    expect(rightEnemy.gain).toBeGreaterThan(0.35);

    const farEnemy = computeSpatialMix(listener, 0, 0, 26, false);
    expect(farEnemy.gain).toBeLessThan(rightEnemy.gain);
    expect(farEnemy.distantLowpassHz).not.toBeNull();
  });

  it('executes all combat, foley, and UI methods safely in headless environments', () => {
    const sound = new SoundManager();
    sound.setVolume(0.75);
    sound.updateListener(0, 0, 0, 1, 0);

    const a = new Fighter({
      id: 'player',
      displayName: 'Игрок',
      isHuman: true,
      classId: 'sword',
      x: 0,
      z: 0,
      yaw: 0,
    });
    const b = new Fighter({
      id: 'bot_1',
      displayName: 'Торвальд Молот',
      isHuman: false,
      classId: 'hammer',
      x: 2,
      z: 0,
      yaw: Math.PI,
    });

    expect(() => {
      sound.playUiClick();
      sound.playClassSelect('sword');
      sound.playClassSelect('dual');
      sound.playClassSelect('spear');
      sound.playClassSelect('hammer');
      sound.playFootstep(true, 0, 4, 0, 'sword');
      sound.playJump(true, 0, 0, 0, 'dual');
      sound.playDodge(false, 2, 0, 0, 'hammer');
      sound.playLanding(true, 0, 4, 0, 'spear');
      sound.playCountdownTick(false);
      sound.playCountdownTick(true);
      sound.playSuddenDeathBell();
      sound.playMatchEnd(true);
      sound.handleCombatEvents(
        [
          { type: 'swing', attackerId: 'player', x: 0, y: 1, z: 0 },
          {
            type: 'ability_cast',
            attackerId: 'bot_1',
            abilityId: 'hammer_quake',
            x: 2,
            y: 1,
            z: 0,
          },
          {
            type: 'heavy_hit',
            attackerId: 'bot_1',
            victimId: 'player',
            damage: 34,
            x: 1,
            y: 1,
            z: 0,
          },
          {
            type: 'parried',
            attackerId: 'bot_1',
            victimId: 'player',
            x: 1,
            y: 1,
            z: 0,
          },
          {
            type: 'death',
            attackerId: 'player',
            victimId: 'bot_1',
            x: 2,
            y: 1,
            z: 0,
          },
        ],
        [a, b],
        'player'
      );
    }).not.toThrow();
  });
});
