// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LANGS, LOCALES, classDisplayName, detectLanguage, detectYandexLanguage, t } from '../src/config/locales';
import { DEFAULT_SETTINGS, hasSavedLanguage, loadSettings, saveSettings, markLanguageSelected } from '../src/config/settings';
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
    expect(detectYandexLanguage('fr-FR')).toBe('en');
    expect(detectYandexLanguage('uk-UA')).toBe('ru');
    expect(detectYandexLanguage('ar')).toBe('ar');
  });

  it('persists and validates a language preference', () => {
    expect(hasSavedLanguage()).toBe(false);
    saveSettings({ ...DEFAULT_SETTINGS, language: 'tr' });
    expect(hasSavedLanguage()).toBe(false);
    markLanguageSelected();
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

describe('complete localized game content', () => {
  beforeEach(() => { localStorage.clear(); document.body.innerHTML = '<div id="root"></div>'; });

  it('translates each hero and all seven skill descriptions in every supported language', async () => {
    const { KNIGHT_CLASSES } = await import('../src/config/classes');
    const { heroText, abilityText } = await import('../src/config/heroLocales');
    const { buildClassSkillBar } = await import('../src/ui/skillIcons');
    for (const id of CLASS_ORDER) {
      const cfg = KNIGHT_CLASSES[id];
      for (const { code } of LANGS) {
        const role = heroText(id, 'role', code, cfg.role);
        const summary = heroText(id, 'summary', code, cfg.summary);
        expect(role).toBeTruthy();
        expect(summary).toBeTruthy();
        const bar = buildClassSkillBar(id, code);
        expect(bar).toHaveLength(7);
        for (const slot of bar) {
          expect(slot.title, `${id}/${code}/${slot.slotKey}`).toBeTruthy();
          expect(slot.description, `${id}/${code}/${slot.slotKey}`).toBeTruthy();
          expect(slot.category, `${id}/${code}/${slot.slotKey}`).toBeTruthy();
          if (code !== 'ru') {
            expect([role, summary, slot.title, slot.description, slot.category, ...slot.badges].join(' '), `${id}/${code}/${slot.slotKey}`).not.toMatch(/[А-Яа-яЁё]/);
          }
        }
        for (const ability of cfg.abilities) {
          expect(abilityText(ability.id, 'name', code, ability.name)).toBeTruthy();
          expect(abilityText(ability.id, 'description', code, ability.description)).toBeTruthy();
        }
      }
    }
  });

  it('does not leave untranslated Russian text on initial non-Russian screens', () => {
    const callbacks = new Proxy({}, { get: () => vi.fn() }) as UICallbacks;
    for (const { code } of LANGS.filter(l => l.code !== 'ru')) {
      const root = document.createElement('div');
      document.body.appendChild(root);
      new UIManager(root, { ...DEFAULT_SETTINGS, language: code }, callbacks);
      expect(root.textContent, code).not.toMatch(/[А-Яа-яЁё]/);
      root.remove();
    }
  });

  it('updates heroes, rooms, controls, themes, and server errors after a language change', () => {
    const callbacks = new Proxy({ onSettingsChanged: vi.fn() }, { get: (target, key) => key in target ? target[key as 'onSettingsChanged'] : vi.fn() }) as unknown as UICallbacks;
    const root = document.querySelector<HTMLElement>('#root')!;
    const ui = new UIManager(root, { ...DEFAULT_SETTINGS }, callbacks);
    ui.updatePublicRooms([{ roomCode: 'ABCD', hostName: 'Alice', playerCount: 1, maxPlayers: 5, fillBots: true, phase: 'lobby' }]);
    const click = (sel: string) => root.querySelector<HTMLButtonElement>(sel)!.click();
    for (const { code } of LANGS.filter(l => l.code !== 'ru')) {
      click(`.lang-btn[data-lang="${code}"]`);
      expect(root.querySelector('.dossier-summary')?.textContent).not.toMatch(/[А-Яа-яЁё]/);
      expect(root.querySelector('.sel-ability-desc')?.textContent).not.toMatch(/[А-Яа-яЁё]/);
      expect(root.querySelector('.skill-tooltip')?.textContent).not.toMatch(/[А-Яа-яЁё]/);
      expect(root.querySelector('.mp-room-row')?.textContent).not.toMatch(/[А-Яа-яЁё]/);
      expect(root.querySelector('#lbl-arena-theme')?.textContent).toBe(t('theme_oak_tournament', code));
      expect(root.querySelector('.arena-theme-chip-name')?.textContent).toBe(t('themeShort_oak_tournament', code));
      expect(root.querySelector<HTMLInputElement>('#mp-name-input')?.placeholder).toBe(t('enterName', code));
      ui.showMultiplayerNotice('Комната «ABCD» не найдена.');
      expect(root.querySelector('#mp-alert-banner')?.textContent).toBe(t('netRoomMissing', code, { code: 'ABCD' }));
      click('.hub-hero-chip[data-cid="hammer"]');
      expect(root.querySelector('#hub-play-title')?.textContent).toBe(t('playBuy', code, { price: 300 }));
      click('.hub-hero-chip[data-cid="sword"]');
    }
  });

  it('translates identified bot hosts without changing player-chosen nicknames', () => {
    const callbacks = new Proxy({}, { get: () => vi.fn() }) as UICallbacks;
    const root = document.querySelector<HTMLElement>('#root')!;
    const ui = new UIManager(root, { ...DEFAULT_SETTINGS, language: 'en' }, callbacks);
    ui.updatePublicRooms([
      { roomCode: 'BOT1', hostName: 'Бот-хост Арес', hostIsBot: true, playerCount: 1, maxPlayers: 5, fillBots: true, phase: 'lobby' },
      { roomCode: 'USER', hostName: 'Бот-хост Арес', playerCount: 1, maxPlayers: 5, fillBots: true, phase: 'lobby' },
    ]);
    const names = [...root.querySelectorAll('.mp-room-host')].map(el => el.textContent);
    expect(names).toEqual(['Bot host Ares', 'Бот-хост Арес']);
  });

  it('updates battle HUD and results without awarding a second payout on language change', async () => {
    const { MatchManager } = await import('../src/core/MatchManager');
    const { createEmptyIntent } = await import('../src/core/Fighter');
    const { loadProfile } = await import('../src/config/playerProfile');
    const callbacks = new Proxy({ onSettingsChanged: vi.fn() }, { get: (target, key) => key in target ? target[key as 'onSettingsChanged'] : vi.fn() }) as unknown as UICallbacks;
    const root = document.querySelector<HTMLElement>('#root')!;
    const ui = new UIManager(root, { ...DEFAULT_SETTINGS }, callbacks);
    const match = new MatchManager();
    match.startMatch('sword', 'duel_debug');
    root.querySelector<HTMLButtonElement>('.lang-btn[data-lang="en"]')!.click();
    ui.update(match, [], false);
    expect(root.querySelector('#hud-player-state')?.textContent).toBe(t('stateIdle', 'en'));
    expect(root.querySelector('#hud-alive-pill')?.textContent).toBe(t('aliveCount', 'en', { alive: 2, total: 2 }));
    expect(root.querySelector('#hud-actionbar .skill-tooltip')?.textContent).not.toMatch(/[А-Яа-яЁё]/);
    expect(root.querySelector('#hud-roster-list')?.textContent).not.toMatch(/[А-Яа-яЁё]/);
    match.update(4, createEmptyIntent());
    for (const fighter of match.fighters) if (!fighter.isHuman) { fighter.hp = 0; fighter.state = 'Dead'; }
    match.update(0.1, createEmptyIntent());
    ui.update(match, [], false);
    expect(match.state).toBe('MatchFinished');
    const coins = loadProfile().coins;
    expect(root.querySelector('#res-headline')?.textContent).toBe(t('resVictory', 'en'));
    expect(root.querySelector('#res-tbody')?.textContent).not.toMatch(/[А-Яа-яЁё]/);
    root.querySelector<HTMLButtonElement>('.lang-btn[data-lang="es"]')!.click();
    ui.update(match, [], false);
    expect(root.querySelector('#res-headline')?.textContent).toBe(t('resVictory', 'es'));
    expect(loadProfile().coins).toBe(coins);
  });
});
