// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LANGS, LOCALES, classDisplayName, detectLanguage, t } from '../src/config/locales';
import { DEFAULT_SETTINGS, hasSavedLanguage, loadSettings, saveSettings } from '../src/config/settings';
import { CLASS_ORDER } from '../src/config/classes';
import { UIManager, type UICallbacks } from '../src/ui/UIManager';

describe('localization', () => {
  beforeEach(() => { localStorage.clear(); document.body.innerHTML = '<div id="root"></div>'; });

  it('has complete dictionaries, valid placeholders, and names for all classes', () => {
    for (const [key, translations] of Object.entries(LOCALES)) {
      const placeholders = (value: string) => [...value.matchAll(/\{\w+\}/g)].map(m => m[0]).sort();
      for (const { code } of LANGS) {
        expect(translations[code], `${key}/${code}`).toBeTruthy();
        expect(placeholders(translations[code]), `${key}/${code}`).toEqual(placeholders(translations.ru));
      }
    }
    for (const id of CLASS_ORDER) for (const { code } of LANGS) {
      expect(classDisplayName(id, code)).not.toBe(id);
    }
    expect(t('playBuy', 'en', { price: 300 })).toBe('Buy for 300');
    expect(detectLanguage('tr-TR')).toBe('tr');
    expect(detectLanguage('fr-FR')).toBe('ru');
  });

  it('persists and validates a language preference', () => {
    expect(hasSavedLanguage()).toBe(false);
    saveSettings({ ...DEFAULT_SETTINGS, language: 'tr' });
    expect(hasSavedLanguage()).toBe(true);
    expect(loadSettings().language).toBe('tr');
    localStorage.setItem('knights_last_standing_settings_v2', '{"language":"invalid"}');
    expect(hasSavedLanguage()).toBe(false);
    expect(LANGS.map(l => l.code)).toContain(loadSettings().language);
  });

  it('updates the interface and direction immediately without losing other settings', () => {
    const callbacks = new Proxy({ onSettingsChanged: vi.fn() }, { get: (target, key) => key in target ? target[key as 'onSettingsChanged'] : vi.fn() }) as unknown as UICallbacks;
    const root = document.querySelector<HTMLElement>('#root')!;
    new UIManager(root, { ...DEFAULT_SETTINGS }, callbacks);
    const clickLanguage = (code: string) => root.querySelector<HTMLButtonElement>(`.lang-btn[data-lang="${code}"]`)!.click();
    clickLanguage('en');
    expect(root.querySelector('.hub-headline')?.textContent).toBe('Ready to fight?');
    expect(root.querySelector('#hub-play-title')?.textContent).toBe('FIGHT!');
    expect(root.querySelector('#lbl-lang')?.textContent).toBe('English');
    expect(callbacks.onSettingsChanged).toHaveBeenLastCalledWith(expect.objectContaining({ language: 'en', graphicsQuality: 'ultra' }));
    root.querySelector<HTMLButtonElement>('#qual-high')!.click();
    expect(callbacks.onSettingsChanged).toHaveBeenLastCalledWith(expect.objectContaining({ language: 'en', graphicsQuality: 'high' }));
    clickLanguage('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(root.querySelector<HTMLButtonElement>('.lang-btn[data-lang="ar"]')?.getAttribute('aria-pressed')).toBe('true');
    clickLanguage('tr');
    expect(document.documentElement.dir).toBe('ltr');
    expect(root.querySelector('.hub-headline')?.textContent).toBe('Savaşmaya hazır mısınız?');
  });
});
