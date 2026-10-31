// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/config/settings';
import { loadProfile } from '../src/config/playerProfile';
import { UIManager, type UICallbacks } from '../src/ui/UIManager';

function setup(watch?: UICallbacks['onWatchRewardedAd']) {
  const root = document.querySelector<HTMLElement>('#root')!;
  const callbacks = new Proxy({ onWatchRewardedAd: watch }, { get: (target, key) => key in target ? target[key as 'onWatchRewardedAd'] : vi.fn() }) as unknown as UICallbacks;
  const ui = new UIManager(root, { ...DEFAULT_SETTINGS, language: 'en' }, callbacks);
  const click = (selector: string) => root.querySelector<HTMLButtonElement>(selector)!.click();
  return { root, ui, click };
}
describe('about and rewarded ad interface', () => {
  beforeEach(() => { localStorage.clear(); document.body.innerHTML = '<div id="root"></div>'; });
  afterEach(() => vi.unstubAllEnvs());
  it('opens license notices inside settings and reads the full bundled license safely', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => 'The MIT License\nCopyright authors' });
    vi.stubGlobal('fetch', fetchMock);
    const { root, click } = setup();
    click('#btn-menu-settings'); click('#btn-settings-about');
    expect(root.querySelector('#modal-about')?.classList.contains('hidden')).toBe(false);
    const license = root.querySelector<HTMLDetailsElement>('details[data-license-path="licenses/three-MIT.txt"]')!;
    license.open = true; license.dispatchEvent(new Event('toggle'));
    await vi.waitFor(() => expect(license.querySelector('pre')?.textContent).toContain('The MIT License'));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('licenses/three-MIT.txt'));
    click('#btn-about-close'); expect(root.querySelector('#modal-about')?.classList.contains('hidden')).toBe(true);
    expect(root.querySelector('#modal-settings')?.classList.contains('hidden')).toBe(false);
    vi.unstubAllGlobals();
  });
  it('asks which save to use when cloud and device conflict', () => {
    const { root, ui, click } = setup();
    const choose = vi.fn(); ui.showCloudConflict(choose);
    expect(root.querySelector('#modal-cloud-conflict')?.classList.contains('hidden')).toBe(false);
    click('#btn-cloud-local'); expect(choose).toHaveBeenCalledWith('local');
    expect(root.querySelector('#modal-cloud-conflict')?.classList.contains('hidden')).toBe(true);
    ui.showCloudConflict(choose); click('#btn-cloud-remote');
    expect(choose.mock.calls).toEqual([['local'], ['cloud']]);
  });
  it('does not overwrite a user nickname with a delayed platform name', () => {
    const { root, ui } = setup();
    ui.useYandexPlayerName('Platform Player');
    const name = root.querySelector<HTMLInputElement>('#mp-name-input')!;
    expect(name.value).toBe('Platform Player');
    name.value = 'My chosen name'; name.dispatchEvent(new Event('input'));
    ui.useYandexPlayerName('Late name'); expect(name.value).toBe('My chosen name');
  });
  it('hides the rewarded button in CrazyGames Basic Launch', () => {
    vi.stubEnv('VITE_PLATFORM', 'crazygames');
    const { root } = setup();
    expect(root.querySelector('#btn-watch-ad')?.classList.contains('hidden')).toBe(true);
  });
  it('does not grant coins when an ad is missing or closed without reward', () => {
    const { root, click } = setup(() => false);
    const before = loadProfile().coins;
    click('#btn-watch-ad'); click('#btn-ad-reward');
    expect(loadProfile().coins).toBe(before);
    expect(root.querySelector('#ad-status')?.textContent).toContain('No coins');
  });
  it('awards coins only on a rewarded callback', () => {
    let reward!: () => void, finish!: (rewarded: boolean) => void;
    const { click } = setup((onReward, onFinish) => { reward = onReward; finish = onFinish; return true; });
    const before = loadProfile().coins;
    click('#btn-watch-ad'); click('#btn-ad-reward');
    expect(loadProfile().coins).toBe(before);
    reward(); expect(loadProfile().coins).toBe(before + 10);
    finish(true);
  });
});
