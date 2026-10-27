import { describe, expect, it } from 'vitest';
import { CLASS_ORDER, KNIGHT_CLASSES } from '../src/config/classes';
import { buildClassSkillBar } from '../src/ui/skillIcons';

describe('Bottom Square Skill Hotbar & Custom RPG Skill Icons', () => {
  it('generates 6 distinct square skill slots per class (24 unique icons total) with full hover tooltip data', () => {
    const seenIconFiles = new Set<string>();

    for (const classId of CLASS_ORDER) {
      const cfg = KNIGHT_CLASSES[classId];
      const bar = buildClassSkillBar(classId);

      expect(bar.length).toBe(6);
      expect(bar.map((s) => s.slotKey)).toEqual([
        'light',
        'heavy',
        'defense',
        'ability1',
        'ability2',
        'dodge',
      ]);

      // [1] and [2] are flagged as signature squares with exact config cooldowns
      expect(bar[3].isSignature).toBe(true);
      expect(bar[3].hotkey).toBe('1');
      expect(bar[3].cooldownSec).toBe(cfg.abilities[0].cooldown);
      expect(bar[3].title).toBe(cfg.abilities[0].name);

      expect(bar[4].isSignature).toBe(true);
      expect(bar[4].hotkey).toBe('2');
      expect(bar[4].cooldownSec).toBe(cfg.abilities[1].cooldown);
      expect(bar[4].title).toBe(cfg.abilities[1].name);

      for (const slot of bar) {
        expect(slot.iconFile.endsWith('.svg')).toBe(true);
        expect(slot.iconUrl.includes(`/icons/skills/${slot.iconFile}`)).toBe(
          true
        );
        expect(slot.title.trim().length).toBeGreaterThan(2);
        expect(slot.category.trim().length).toBeGreaterThan(4);
        expect(slot.description.trim().length).toBeGreaterThan(15);
        expect(slot.badges.length).toBeGreaterThan(0);
        seenIconFiles.add(slot.iconFile);
      }
    }

    // Every single skill across all 4 knight classes has its own unique icon!
    expect(seenIconFiles.size).toBe(24);
  });
});
