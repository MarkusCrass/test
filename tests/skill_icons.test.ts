import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CLASS_ORDER, KNIGHT_CLASSES } from '../src/config/classes';
import { buildClassSkillBar } from '../src/ui/skillIcons';

describe('Bottom Square Skill Hotbar & Custom RPG Skill Icons (9 Melee Heroes × 7 Slots)', () => {
  it('generates 7 distinct square skill slots per class (63 unique existing SVG icons total) with [1], [2], [3] skills', () => {
    const seenIconFiles = new Set<string>();
    expect(CLASS_ORDER.length).toBe(9);

    for (const classId of CLASS_ORDER) {
      const cfg = KNIGHT_CLASSES[classId];
      const bar = buildClassSkillBar(classId);

      expect(bar.length).toBe(7);
      expect(bar.map((s) => s.slotKey)).toEqual([
        'light',
        'heavy',
        'defense',
        'ability1',
        'ability2',
        'ability3',
        'dodge',
      ]);

      // [1], [2], and [3] are flagged as signature squares with exact config cooldowns
      expect(bar[3].isSignature).toBe(true);
      expect(bar[3].hotkey).toBe('1');
      expect(bar[3].cooldownSec).toBe(cfg.abilities[0].cooldown);
      expect(bar[3].title).toBe(cfg.abilities[0].name);

      expect(bar[4].isSignature).toBe(true);
      expect(bar[4].hotkey).toBe('2');
      expect(bar[4].cooldownSec).toBe(cfg.abilities[1].cooldown);
      expect(bar[4].title).toBe(cfg.abilities[1].name);

      expect(bar[5].isSignature).toBe(true);
      expect(bar[5].hotkey).toBe('3');
      expect(bar[5].cooldownSec).toBe(cfg.abilities[2].cooldown);
      expect(bar[5].title).toBe(cfg.abilities[2].name);

      for (const slot of bar) {
        expect(slot.iconFile.endsWith('.svg')).toBe(true);
        expect(slot.iconUrl.includes(`/icons/skills/${slot.iconFile}`)).toBe(
          true
        );
        const fullSvgPath = path.resolve(
          process.cwd(),
          'public/icons/skills',
          slot.iconFile
        );
        expect(fs.existsSync(fullSvgPath)).toBe(true);
        expect(slot.title.trim().length).toBeGreaterThan(2);
        expect(slot.category.trim().length).toBeGreaterThan(4);
        expect(slot.description.trim().length).toBeGreaterThan(15);
        expect(slot.badges.length).toBeGreaterThan(0);
        seenIconFiles.add(slot.iconFile);
      }
    }

    // Every single skill across all 9 melee classes has its own unique SVG icon (9 * 7 = 63)!
    expect(seenIconFiles.size).toBe(63);
  });
});
