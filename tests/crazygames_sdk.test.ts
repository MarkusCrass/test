import { afterEach, describe, expect, it, vi } from 'vitest';
import { CrazyGames, type CrazySdk } from '../src/platform/CrazyGames';

function mockSdk(environment = 'local') {
  return {
    environment,
    init: vi.fn(async () => {}),
    game: {
      loadingStart: vi.fn(), loadingStop: vi.fn(),
      gameplayStart: vi.fn(), gameplayStop: vi.fn(),
    },
  } satisfies CrazySdk;
}

afterEach(() => vi.useRealTimers());

describe('CrazyGames Basic Launch SDK', () => {
  it('initializes before loading events and sends gameplay only when ready', async () => {
    const sdk = mockSdk();
    const platform = new CrazyGames();
    await platform.initialize(sdk);
    expect(sdk.game.loadingStart).toHaveBeenCalledOnce();
    platform.setGameplay(true);
    expect(sdk.game.gameplayStart).not.toHaveBeenCalled();
    platform.ready(); platform.ready(); platform.setGameplay(true);
    expect(sdk.game.loadingStop).toHaveBeenCalledOnce();
    expect(sdk.game.gameplayStart).toHaveBeenCalledOnce();
    platform.setGameplay(false); platform.setGameplay(false);
    expect(sdk.game.gameplayStop).toHaveBeenCalledOnce();
    platform.setGameplay(true);
    expect(sdk.game.gameplayStart).toHaveBeenCalledTimes(2);
    expect(platform.showRewarded()).toBe(false);
  });

  it('does not start gameplay after a pause before loading completes', async () => {
    const sdk = mockSdk(); const platform = new CrazyGames();
    await platform.initialize(sdk);
    platform.setGameplay(true); platform.setGameplay(false); platform.ready();
    expect(sdk.game.loadingStop).toHaveBeenCalledOnce();
    expect(sdk.game.gameplayStart).not.toHaveBeenCalled();
  });

  it('continues without SDK when unavailable, disabled or initialization fails', async () => {
    const missing = new CrazyGames(); await missing.initialize(undefined); missing.ready(); missing.setGameplay(true);
    const sdk = mockSdk('disabled'); const platform = new CrazyGames();
    await platform.initialize(sdk); platform.ready(); platform.setGameplay(true);
    expect(sdk.game.loadingStart).not.toHaveBeenCalled();
    expect(sdk.game.gameplayStart).not.toHaveBeenCalled();
    const rejected = mockSdk(); rejected.init = vi.fn(async () => { throw new Error('offline'); });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await new CrazyGames().initialize(rejected); expect(warn).toHaveBeenCalled(); warn.mockRestore();
  });

  it('ignores an SDK that finishes initializing after the timeout', async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const sdk = mockSdk(); sdk.init = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const platform = new CrazyGames(); const initializing = platform.initialize(sdk, 100);
    await vi.advanceTimersByTimeAsync(100); await initializing;
    platform.ready(); platform.setGameplay(true); finish(); await Promise.resolve();
    expect(sdk.game.loadingStart).not.toHaveBeenCalled();
    expect(sdk.game.gameplayStart).not.toHaveBeenCalled();
  });
});
