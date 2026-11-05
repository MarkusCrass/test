// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/config/settings';
import { MatchManager } from '../src/core/MatchManager';
import { UIManager, type UICallbacks } from '../src/ui/UIManager';

const cleanups: Array<() => void> = [];
function mockProperty(target: object, key: string, descriptor: PropertyDescriptor): void {
  const previous = Object.getOwnPropertyDescriptor(target, key);
  Object.defineProperty(target, key, { configurable: true, ...descriptor });
  cleanups.push(() => {
    if (previous) Object.defineProperty(target, key, previous);
    else Reflect.deleteProperty(target, key);
  });
}

function makeUi(): { root: HTMLElement; ui: UIManager } {
  const root = document.querySelector<HTMLElement>('#root')!;
  const callbacks = new Proxy({}, { get: () => vi.fn() }) as UICallbacks;
  return { root, ui: new UIManager(root, DEFAULT_SETTINGS, callbacks) };
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<div id="root"></div>';
});
afterEach(() => {
  for (const cleanup of cleanups.reverse()) cleanup();
  cleanups.length = 0;
  vi.useRealTimers();
});

describe('fullscreen action in the game UI', () => {
  it('enters from the hub, exits during a fight, and stays synchronized in pause and results', async () => {
    let active: Element | null = null;
    mockProperty(document, 'fullscreenElement', { get: () => active });
    const enter = vi.fn(async function (this: Element) {
      expect(this).toBe(document.documentElement); // The whole game, not just the canvas.
      active = this;
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    const exit = vi.fn(async () => {
      active = null;
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    mockProperty(document.documentElement, 'requestFullscreen', { value: enter });
    mockProperty(document, 'exitFullscreen', { value: exit });
    const { root, ui } = makeUi();
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('.js-fullscreen-toggle')];
    expect(buttons).toHaveLength(4);
    expect(buttons.every(button => button.getAttribute('aria-label') === 'Полный экран')).toBe(true);

    root.querySelector<HTMLButtonElement>('#btn-hub-fullscreen')!.click();
    await vi.waitFor(() => expect(buttons.every(button => button.getAttribute('aria-pressed') === 'true')).toBe(true));
    expect(enter).toHaveBeenCalledOnce();
    expect(buttons.every(button => button.title === 'Выйти из полного экрана')).toBe(true);
    expect(root.querySelector('#btn-pause-fullscreen .fullscreen-label')?.textContent).toBe('Выйти из полного экрана');

    const match = new MatchManager();
    match.startMatch();
    ui.update(match, [], false);
    expect(root.querySelector('#screen-hud')?.classList.contains('hidden')).toBe(false);
    root.querySelector<HTMLButtonElement>('#btn-hud-fullscreen')!.click();
    await vi.waitFor(() => expect(buttons.every(button => button.getAttribute('aria-pressed') === 'false')).toBe(true));
    expect(exit).toHaveBeenCalledOnce();

    match.paused = true;
    ui.update(match, [], false);
    expect(root.querySelector('#modal-pause')?.classList.contains('hidden')).toBe(false);
    root.querySelector<HTMLButtonElement>('#btn-pause-fullscreen')!.click();
    await vi.waitFor(() => expect(buttons[0].getAttribute('aria-pressed')).toBe('true'));
    match.paused = false;
    match.state = 'MatchFinished';
    match.winnerId = 'player';
    ui.update(match, [], false);
    expect(root.querySelector('#modal-results')?.classList.contains('hidden')).toBe(false);
    root.querySelector<HTMLButtonElement>('#btn-results-fullscreen')!.click();
    await vi.waitFor(() => expect(buttons[0].getAttribute('aria-pressed')).toBe('false'));
    expect(enter).toHaveBeenCalledTimes(2);
    expect(exit).toHaveBeenCalledTimes(2);
  });

  it('follows an external Escape exit and retranslates titles and accessible names', async () => {
    let active: Element | null = null;
    mockProperty(document, 'fullscreenElement', { get: () => active });
    mockProperty(document.documentElement, 'requestFullscreen', {
      value: vi.fn(async () => { active = document.documentElement; document.dispatchEvent(new Event('fullscreenchange')); }),
    });
    const { root, ui } = makeUi();
    root.querySelector<HTMLButtonElement>('#btn-hub-fullscreen')!.click();
    await vi.waitFor(() => expect(root.querySelector('#btn-hub-fullscreen')?.getAttribute('aria-pressed')).toBe('true'));
    ui.updateSettingsExternal({ ...DEFAULT_SETTINGS, language: 'en' });
    expect(root.querySelector('#btn-hub-fullscreen')?.getAttribute('aria-label')).toBe('Exit fullscreen');
    expect(root.querySelector('#btn-pause-fullscreen .fullscreen-label')?.textContent).toBe('Exit fullscreen');
    active = null; // Browser exits fullscreen via Escape or a platform control.
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(root.querySelector('#btn-hub-fullscreen')?.getAttribute('aria-label')).toBe('Fullscreen');
    ui.updateSettingsExternal({ ...DEFAULT_SETTINGS, language: 'ar' });
    expect(root.querySelector('#btn-hud-fullscreen')?.getAttribute('aria-label')).toBe('ملء الشاشة');
    expect(root.querySelector('#nav-tab-arena')?.getAttribute('aria-label')).toBe('الساحة');
  });

  it('shows a localizable message rather than claiming success when an embed denies fullscreen', async () => {
    vi.useFakeTimers();
    const denied = vi.fn(() => Promise.reject(new Error('fullscreen denied by iframe')));
    mockProperty(document.documentElement, 'requestFullscreen', { value: denied });
    const { root, ui } = makeUi();
    root.querySelector<HTMLButtonElement>('#btn-hub-fullscreen')!.click();
    await Promise.resolve();
    await Promise.resolve();
    const message = root.querySelector<HTMLElement>('#fullscreen-feedback')!;
    expect(denied).toHaveBeenCalledOnce();
    expect(message.classList.contains('hidden')).toBe(false);
    expect(message.textContent).toContain('недоступен');
    expect(root.querySelector('#btn-hub-fullscreen')?.getAttribute('aria-pressed')).toBe('false');
    ui.updateSettingsExternal({ ...DEFAULT_SETTINGS, language: 'en' });
    expect(message.textContent).toContain('unavailable');
    vi.advanceTimersByTime(4500);
    expect(message.classList.contains('hidden')).toBe(true);
  });

  it('does not queue duplicate fullscreen requests while the browser is still deciding', async () => {
    let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    let active: Element | null = null;
    mockProperty(document, 'fullscreenElement', { get: () => active });
    const request = vi.fn(() => pending);
    mockProperty(document.documentElement, 'requestFullscreen', { value: request });
    const { root } = makeUi();
    root.querySelector<HTMLButtonElement>('#btn-hub-fullscreen')!.click();
    expect(root.querySelector<HTMLButtonElement>('#btn-hud-fullscreen')!.disabled).toBe(true);
    root.querySelector<HTMLButtonElement>('#btn-hud-fullscreen')!.dispatchEvent(new Event('click'));
    expect(request).toHaveBeenCalledOnce();

    active = document.documentElement;
    document.dispatchEvent(new Event('fullscreenchange'));
    finish();
    await Promise.resolve();
    expect(root.querySelector<HTMLButtonElement>('#btn-hub-fullscreen')!.disabled).toBe(false);
    expect(root.querySelector('#btn-hud-fullscreen')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('handles browsers without a fullscreen API or with prefixed WebKit methods', async () => {
    vi.useFakeTimers();
    mockProperty(document.documentElement, 'requestFullscreen', { value: undefined });
    const { root } = makeUi();
    root.querySelector<HTMLButtonElement>('#btn-hub-fullscreen')!.click();
    expect(root.querySelector('#fullscreen-feedback')?.classList.contains('hidden')).toBe(false);
    vi.runAllTimers();
    root.innerHTML = '';

    let active: Element | null = null;
    const enter = vi.fn(() => { active = document.documentElement; document.dispatchEvent(new Event('webkitfullscreenchange')); });
    const exit = vi.fn(() => { active = null; document.dispatchEvent(new Event('webkitfullscreenchange')); });
    mockProperty(document, 'webkitFullscreenElement', { get: () => active });
    mockProperty(document.documentElement, 'webkitRequestFullscreen', { value: enter });
    mockProperty(document, 'webkitExitFullscreen', { value: exit });
    const { root: fallbackRoot } = makeUi();
    fallbackRoot.querySelector<HTMLButtonElement>('#btn-hub-fullscreen')!.click();
    await Promise.resolve();
    expect(enter).toHaveBeenCalledOnce();
    expect(fallbackRoot.querySelector('#btn-hub-fullscreen')?.getAttribute('aria-pressed')).toBe('true');
    fallbackRoot.querySelector<HTMLButtonElement>('#btn-hub-fullscreen')!.click();
    await Promise.resolve();
    expect(exit).toHaveBeenCalledOnce();
    expect(fallbackRoot.querySelector('#btn-hub-fullscreen')?.getAttribute('aria-pressed')).toBe('false');
  });
});
