import { afterEach, describe, expect, it, vi } from 'vitest';
import { assetUrl } from '../src/config/assetUrls';
import { CLASS_ORDER, KNIGHT_CLASSES } from '../src/config/classes';
import { buildClassSkillBar, getSkillIconUrl } from '../src/ui/skillIcons';

describe('asset paths for embedded game hosting', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('keeps icons, audio and notices inside the game directory', () => {
    vi.stubEnv('BASE_URL', './');
    const page = 'https://game.example/yandex/app/123/index.html';
    for (const path of ['icons/skills/sword_light.svg', 'audio/sfx/ui_click_1.mp3', 'licenses/three-MIT.txt']) {
      expect(new URL(assetUrl(path), page).href).toBe(`https://game.example/yandex/app/123/${path}`);
    }
    for (const id of CLASS_ORDER) {
      for (const skill of buildClassSkillBar(id)) {
        expect(new URL(getSkillIconUrl(skill.iconFile), page).pathname).toBe(`/yandex/app/123/icons/skills/${skill.iconFile}`);
      }
      expect(KNIGHT_CLASSES[id]).toBeDefined();
    }
  });

  it('respects an explicitly configured Vite base path', () => {
    vi.stubEnv('BASE_URL', '/game/');
    expect(assetUrl('/icons/skills/sword_light.svg')).toBe('/game/icons/skills/sword_light.svg');
  });
});
