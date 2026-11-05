// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GAME_DATA_KEYS, configureCrazyData, isCrazyDataActive, onCrazyDataSaveError, type CrazyDataStore } from '../src/config/gameStorage';
import { DEFAULT_PROFILE, loadProfile, saveProfile, unlockKnight } from '../src/config/playerProfile';
import { DEFAULT_SETTINGS, hasSavedLanguage, loadSettings, markLanguageSelected, saveSettings } from '../src/config/settings';
import { loadSoloBotProgress, recordSoloBotOutcome } from '../src/config/soloBotProgress';
import { CrazyGames, type CrazySdk } from '../src/platform/CrazyGames';
import { UIManager, type UICallbacks } from '../src/ui/UIManager';

function makeData(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const data: CrazyDataStore = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
  };
  return { values, data };
}

function makeSdk(data?: CrazyDataStore): CrazySdk {
  return {
    init: vi.fn(async () => {}),
    environment: 'local',
    data,
    game: {
      loadingStart: vi.fn(), loadingStop: vi.fn(),
      gameplayStart: vi.fn(), gameplayStop: vi.fn(),
    },
  };
}

beforeEach(() => {
  configureCrazyData(null);
  localStorage.clear();
  vi.stubEnv('VITE_PLATFORM', 'crazygames');
});
afterEach(() => {
  configureCrazyData(null);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('CrazyGames SDK Data progress', () => {
  it('waits for SDK.init before reading account data or starting the game UI', async () => {
    const { data } = makeData();
    let finish!: () => void;
    const sdk = makeSdk(data);
    sdk.init = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const platform = new CrazyGames();
    const starting = platform.initialize(sdk);
    expect(isCrazyDataActive()).toBe(false);
    expect(data.getItem).not.toHaveBeenCalled();
    expect(sdk.game.loadingStart).not.toHaveBeenCalled();
    finish();
    await starting;
    expect(isCrazyDataActive()).toBe(true);
    expect(data.getItem).toHaveBeenCalledWith(GAME_DATA_KEYS.profile);
    expect(sdk.game.loadingStart).toHaveBeenCalledOnce();
  });

  it('imports pre-existing browser saves once, then keeps coins, unlocks, bot progress, and settings in SDK Data', async () => {
    saveProfile({ ...DEFAULT_PROFILE, coins: 500 });
    recordSoloBotOutcome(5);
    saveSettings({ ...DEFAULT_SETTINGS, language: 'ru', graphicsQuality: 'high' });
    markLanguageSelected();
    localStorage.setItem(GAME_DATA_KEYS.multiplayerName, 'Sir Arthur');
    const oldLocalProfile = localStorage.getItem(GAME_DATA_KEYS.profile);
    const { values, data } = makeData();

    await new CrazyGames().initialize(makeSdk(data));
    expect(values.get(GAME_DATA_KEYS.profile)).toBe(oldLocalProfile);
    expect(values.get(GAME_DATA_KEYS.soloBots)).toBe(localStorage.getItem(GAME_DATA_KEYS.soloBots));
    expect(values.get(GAME_DATA_KEYS.settings)).toBe(localStorage.getItem(GAME_DATA_KEYS.settings));
    expect(values.get(GAME_DATA_KEYS.languagePreference)).toBe('manual');
    expect(values.get(GAME_DATA_KEYS.multiplayerName)).toBe('Sir Arthur');
    expect(loadSettings().language).toBe('ru');
    expect(hasSavedLanguage()).toBe(true);
    expect(loadSoloBotProgress().lossStreak).toBe(1);

    const purchased = unlockKnight({ ...loadProfile(), coins: 200 }, 'hammer');
    expect(purchased.success).toBe(true);
    saveProfile(purchased.profile);
    recordSoloBotOutcome(5);
    saveSettings({ ...loadSettings(), graphicsQuality: 'low' });
    expect(JSON.parse(values.get(GAME_DATA_KEYS.profile)!).unlockedKnights).toContain('hammer');
    expect(loadProfile().coins).toBe(200);
    expect(loadSoloBotProgress().assistTier).toBe(1);
    expect(loadSettings().graphicsQuality).toBe('low');
    expect(localStorage.getItem(GAME_DATA_KEYS.profile)).toBe(oldLocalProfile); // Legacy backup is not modified.
    expect(localStorage.getItem(GAME_DATA_KEYS.soloBots)).toContain('"lossStreak":1');
  });

  it('saves a hero bought through the real UI and reloads it without using localStorage', async () => {
    const { values, data } = makeData({ [GAME_DATA_KEYS.profile]: JSON.stringify({ ...DEFAULT_PROFILE, coins: 450 }) });
    await new CrazyGames().initialize(makeSdk(data));
    const root = document.createElement('div');
    document.body.appendChild(root);
    const callbacks = new Proxy({}, { get: () => vi.fn() }) as UICallbacks;
    try {
      new UIManager(root, loadSettings(), callbacks);
      root.querySelector<HTMLButtonElement>('.hub-hero-chip[data-cid="hammer"]')!.click();
      root.querySelector<HTMLButtonElement>('#btn-menu-quick')!.click();
      expect(loadProfile().coins).toBe(150);
      expect(loadProfile().unlockedKnights).toContain('hammer');
      expect(localStorage.getItem(GAME_DATA_KEYS.profile)).toBeNull();
      expect(JSON.parse(values.get(GAME_DATA_KEYS.profile)!).coins).toBe(150);
      const nameInput = root.querySelector<HTMLInputElement>('#mp-name-input')!;
      nameInput.value = 'Arena Hero';
      nameInput.dispatchEvent(new Event('change'));
      expect(values.get(GAME_DATA_KEYS.multiplayerName)).toBe('Arena Hero');
      root.innerHTML = '';
      new UIManager(root, loadSettings(), callbacks);
      expect(root.querySelector('.hub-hero-chip[data-cid="hammer"]')?.classList.contains('locked')).toBe(false);
      expect(root.querySelector('#hub-main-coin-display')?.textContent).toBe('150');
      expect(root.querySelector<HTMLInputElement>('#mp-name-input')?.value).toBe('Arena Hero');
    } finally {
      root.remove();
    }
  });

  it('still starts in English unless the user manually picked another language', () => {
    saveSettings({ ...DEFAULT_SETTINGS, language: 'ru' }); // Automatically saved, not a manual choice.
    const guest = makeData();
    expect(configureCrazyData(guest.data)).toBe(true);
    expect(loadSettings().language).toBe('en');
    markLanguageSelected();
    saveSettings({ ...loadSettings(), language: 'tr' });
    expect(loadSettings().language).toBe('tr');
    expect(guest.values.get(GAME_DATA_KEYS.languagePreference)).toBe('manual');
  });

  it('honors existing cloud data over stale local progress and never imports it into a second account', async () => {
    saveProfile({ ...DEFAULT_PROFILE, coins: 900 });
    const oldLocal = localStorage.getItem(GAME_DATA_KEYS.profile);
    const a = makeData({ [GAME_DATA_KEYS.profile]: JSON.stringify({ ...DEFAULT_PROFILE, coins: 450 }) });
    await new CrazyGames().initialize(makeSdk(a.data));
    expect(loadProfile().coins).toBe(450);
    expect(localStorage.getItem(GAME_DATA_KEYS.profile)).toBe(oldLocal);
    expect(localStorage.getItem('kls_crazy_data_imported_v1')).toBe('1');
    saveProfile({ ...loadProfile(), coins: 475 });
    expect(JSON.parse(a.values.get(GAME_DATA_KEYS.profile)!).coins).toBe(475);

    configureCrazyData(null); // Simulate a fresh account (SDK reloads the page after login).
    const b = makeData();
    await new CrazyGames().initialize(makeSdk(b.data));
    expect(loadProfile().coins).toBe(DEFAULT_PROFILE.coins);
    expect(b.values.has(GAME_DATA_KEYS.profile)).toBe(false);
    saveProfile({ ...loadProfile(), coins: 150 });
    expect(JSON.parse(b.values.get(GAME_DATA_KEYS.profile)!).coins).toBe(150);
    expect(JSON.parse(a.values.get(GAME_DATA_KEYS.profile)!).coins).toBe(475);
  });

  it('scopes adaptive solo bot progress to the SDK account, not a local Yandex owner', () => {
    localStorage.setItem('kls_cloud_profile_owner_v1', 'old-yandex-user');
    const a = makeData({ [GAME_DATA_KEYS.soloBots]: '{"lossStreak":2,"assistTier":1}' });
    expect(configureCrazyData(a.data)).toBe(true);
    expect(loadSoloBotProgress().assistTier).toBe(1);
    recordSoloBotOutcome(5);
    expect(JSON.parse(a.values.get(GAME_DATA_KEYS.soloBots)!).assistTier).toBe(2);
    expect(a.values.has(`${GAME_DATA_KEYS.soloBots}_old-yandex-user`)).toBe(false);

    configureCrazyData(null);
    const b = makeData();
    expect(configureCrazyData(b.data)).toBe(true);
    expect(loadSoloBotProgress().assistTier).toBe(0);
    expect(a.values.get(GAME_DATA_KEYS.soloBots)).toContain('"assistTier":2');
  });

  it('does not mark an empty guest as migrated so a later offline local save can still be imported', () => {
    const first = makeData();
    expect(configureCrazyData(first.data)).toBe(true);
    expect(localStorage.getItem('kls_crazy_data_imported_v1')).toBeNull();
    configureCrazyData(null);
    saveProfile({ ...DEFAULT_PROFILE, coins: 280 });
    const second = makeData();
    expect(configureCrazyData(second.data)).toBe(true);
    expect(loadProfile().coins).toBe(280);
    expect(localStorage.getItem('kls_crazy_data_imported_v1')).toBe('1');
  });

  it('does not lose an old save or mark migration complete when SDK Data rejects a write', () => {
    saveProfile({ ...DEFAULT_PROFILE, coins: 310 });
    const { values, data } = makeData();
    const write = data.setItem;
    data.setItem = vi.fn((key, value) => {
      if (key === GAME_DATA_KEYS.profile) throw new Error('dataLimitExcedeed');
      write(key, value);
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(configureCrazyData(data)).toBe(false);
    expect(isCrazyDataActive()).toBe(false);
    expect(loadProfile().coins).toBe(310);
    expect(localStorage.getItem('kls_crazy_data_imported_v1')).toBeNull();
    expect(warn).toHaveBeenCalled();

    const working = makeData(Object.fromEntries(values));
    expect(configureCrazyData(working.data)).toBe(true);
    expect(loadProfile().coins).toBe(310);
  });

  it('falls back to device-local progress if the Data module is disabled, missing, or SDK init fails', async () => {
    saveProfile({ ...DEFAULT_PROFILE, coins: 230 });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const blocked = makeSdk({ getItem: () => { throw new Error('dataModuleDisabled'); }, setItem: vi.fn() });
    await new CrazyGames().initialize(blocked);
    expect(isCrazyDataActive()).toBe(false);
    expect(loadProfile().coins).toBe(230);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('CrazyGames Data is unavailable'), expect.any(Error));

    await new CrazyGames().initialize(makeSdk());
    expect(isCrazyDataActive()).toBe(false);
    saveProfile({ ...loadProfile(), coins: 250 });
    expect(JSON.parse(localStorage.getItem(GAME_DATA_KEYS.profile)!).coins).toBe(250);

    const offline = makeSdk(makeData().data);
    offline.init = vi.fn(async () => { throw new Error('offline'); });
    await new CrazyGames().initialize(offline);
    expect(isCrazyDataActive()).toBe(false);
    expect(loadProfile().coins).toBe(250);
  });

  it('keeps a failed in-memory write from leaking into another SDK account', () => {
    const first = makeData();
    expect(configureCrazyData(first.data)).toBe(true);
    first.data.setItem = vi.fn(() => { throw new Error('quota exceeded'); });
    const onError = vi.fn();
    const unsubscribe = onCrazyDataSaveError(onError);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      saveProfile({ ...DEFAULT_PROFILE, coins: 410 });
      expect(onError).toHaveBeenCalledOnce();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('CrazyGames Data save failed'), expect.any(Error));
      expect(loadProfile().coins).toBe(410); // Retain live progress while SDK is failing.
    } finally { unsubscribe(); }
    configureCrazyData(null);
    const next = makeData();
    expect(configureCrazyData(next.data)).toBe(true);
    expect(loadProfile().coins).toBe(DEFAULT_PROFILE.coins);
  });

  it('shows a localized warning to the player when the Data module cannot save', () => {
    const { data } = makeData();
    expect(configureCrazyData(data)).toBe(true);
    const root = document.createElement('div');
    document.body.appendChild(root);
    const ui = new UIManager(root, loadSettings(), new Proxy({}, { get: () => vi.fn() }) as UICallbacks);
    const notice = root.querySelector<HTMLElement>('#save-warning')!;
    const unsubscribe = onCrazyDataSaveError(() => ui.showSaveWarning('saveFailed'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(notice.classList.contains('hidden')).toBe(true);
      data.setItem = () => { throw new Error('dataLimitExcedeed'); };
      saveProfile({ ...DEFAULT_PROFILE, coins: 120 });
      expect(notice.classList.contains('hidden')).toBe(false);
      expect(notice.textContent).toContain('Could not save progress');
      expect(warn).toHaveBeenCalled();
    } finally {
      unsubscribe();
      root.remove();
    }
  });

  it('can use SDK Data even when browser localStorage is blocked', async () => {
    const { data } = makeData({ [GAME_DATA_KEYS.profile]: JSON.stringify({ ...DEFAULT_PROFILE, coins: 440 }) });
    const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    try {
      await new CrazyGames().initialize(makeSdk(data));
      expect(loadProfile().coins).toBe(440);
      saveProfile({ ...loadProfile(), coins: 470 });
      expect(loadProfile().coins).toBe(470);
    } finally {
      read.mockRestore();
      write.mockRestore();
    }
  });
});
