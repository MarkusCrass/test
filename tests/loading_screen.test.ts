// @vitest-environment jsdom
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoadingScreen } from '../src/ui/LoadingScreen';
import { LoadingTracker } from '../src/render/LoadingTracker';

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = `<div id="ui-root" inert aria-hidden="true"></div><div id="boot-splash">
    <span id="boot-badge-text"></span><span id="boot-subtitle"></span><span id="boot-status"></span><p id="boot-hint"></p>
    <button id="boot-retry"></button><button id="boot-continue"></button></div>`;
});
afterEach(() => vi.useRealTimers());

describe('startup loading screen', () => {
  it('remains in place when the UI mounts and changes to actual loading stages', () => {
    const screen = new LoadingScreen('en');
    document.querySelector('#ui-root')!.innerHTML = '<button>Menu</button>';
    expect(document.getElementById('boot-splash')).not.toBeNull();
    expect(document.getElementById('ui-root')?.hasAttribute('inert')).toBe(true);
    screen.setStage('characters'); expect(document.getElementById('boot-status')?.textContent).toContain('heroes');
    screen.setStage('arena'); expect(document.getElementById('boot-status')?.textContent).toContain('arena');
    screen.setLanguage('ru'); expect(document.getElementById('boot-status')?.textContent).toContain('арену');
    screen.finish(); expect(document.getElementById('boot-splash')).toBeNull();
    expect(document.getElementById('ui-root')?.hasAttribute('inert')).toBe(false);
    expect(document.getElementById('ui-root')?.hasAttribute('aria-hidden')).toBe(false);
  });

  it('offers retry and explicit fallback if loading stalls or files fail', () => {
    const screen = new LoadingScreen('en', 100);
    const continueLoading = vi.fn(); screen.allowContinue(continueLoading);
    vi.advanceTimersByTime(100);
    expect(document.querySelector<HTMLButtonElement>('#boot-retry')!.hidden).toBe(false);
    expect(document.querySelector<HTMLButtonElement>('#boot-continue')!.hidden).toBe(false);
    document.querySelector<HTMLButtonElement>('#boot-continue')!.click();
    expect(continueLoading).toHaveBeenCalledOnce();
    screen.showProblem('fatal');
    expect(document.querySelector<HTMLButtonElement>('#boot-continue')!.hidden).toBe(true);
    expect(document.getElementById('boot-hint')?.textContent).toContain('3D graphics');
    screen.finish();
  });
});

describe('Three.js resource tracking', () => {
  it('waits for pending assets, records errors and preserves existing callbacks', async () => {
    const manager = new THREE.LoadingManager();
    const start = vi.fn(); const load = vi.fn(); const error = vi.fn();
    manager.onStart = start; manager.onLoad = load; manager.onError = error;
    const tracker = new LoadingTracker(manager);
    manager.itemStart('a'); manager.itemStart('b');
    const done = vi.fn(); const waiting = tracker.waitForIdle().then(done);
    manager.itemEnd('a'); await Promise.resolve(); expect(done).not.toHaveBeenCalled();
    manager.itemError('b'); manager.itemEnd('b'); await waiting;
    expect(tracker.hasFailures).toBe(true);
    expect(start).toHaveBeenCalledOnce(); expect(load).toHaveBeenCalledOnce(); expect(error).toHaveBeenCalledWith('b');
    tracker.dispose(); expect(manager.onStart).toBe(start); expect(manager.onLoad).toBe(load); expect(manager.onError).toBe(error);
  });
});
