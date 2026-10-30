import { describe, expect, it, vi } from 'vitest';
import { YandexGames, type YandexSdk } from '../src/platform/YandexGames';

describe('Yandex Games SDK integration', () => {
  it('initializes through YaGames, reads platform locale, sends ready once, and synchronizes gameplay', async () => {
    const locale = vi.fn(), pause = vi.fn(), ready = vi.fn(), start = vi.fn(), stop = vi.fn();
    const listeners: Record<string, () => void> = {};
    const sdk: YandexSdk = { environment: { i18n: { lang: 'tr' } }, features: { LoadingAPI: { ready }, GameplayAPI: { start, stop } }, on: (event, callback) => { listeners[event] = callback; }, getPlayer: async () => ({ getName: () => 'Arthur' }) };
    const service = new YandexGames(pause);
    const init = vi.fn().mockResolvedValue(sdk);
    await service.initialize({ init }, locale);
    expect(init).toHaveBeenCalledOnce();
    expect(locale).toHaveBeenCalledWith('tr');
    expect(await service.getPlayerName()).toBe('Arthur');
    expect(ready).not.toHaveBeenCalled();
    service.ready(); service.ready();
    expect(ready).toHaveBeenCalledOnce();
    service.setGameplay(true); service.setGameplay(true); service.setGameplay(false); service.setGameplay(false);
    expect(start).toHaveBeenCalledOnce(); expect(stop).toHaveBeenCalledOnce();
    listeners.game_api_pause(); listeners.game_api_resume();
    expect(pause.mock.calls).toEqual([[true], [false]]);
  });

  it('grants only on the official reward callback and ignores duplicate or late callbacks', async () => {
    let callbacks!: Parameters<NonNullable<YandexSdk['adv']>['showRewardedVideo']>[0]['callbacks'];
    const sdk: YandexSdk = { adv: { showRewardedVideo(options) { callbacks = options.callbacks; } } };
    const service = new YandexGames(vi.fn()); await service.initialize({ init: async () => sdk }, vi.fn());
    const reward = vi.fn(), finish = vi.fn();
    expect(service.showRewarded(reward, finish)).toBe(true);
    expect(service.showRewarded(reward, finish)).toBe(false);
    callbacks.onOpen(); expect(reward).not.toHaveBeenCalled();
    callbacks.onRewarded(); callbacks.onRewarded(); expect(reward).toHaveBeenCalledOnce();
    callbacks.onClose(true); callbacks.onError('late');
    expect(finish).toHaveBeenCalledOnce(); expect(finish).toHaveBeenCalledWith(true);
    expect(service.showRewarded(reward, finish)).toBe(true);
    callbacks.onClose(false); callbacks.onRewarded();
    expect(reward).toHaveBeenCalledOnce(); expect(finish).toHaveBeenLastCalledWith(false);
  });

  it('does not reward missing, rejected or erroring ads and works without the platform', async () => {
    const reward = vi.fn(), finish = vi.fn(), service = new YandexGames(vi.fn());
    await service.initialize(undefined, vi.fn());
    expect(service.showRewarded(reward, finish)).toBe(false);
    await service.initialize({ init: async () => ({ adv: { showRewardedVideo: ({ callbacks }) => callbacks.onError('no ad') } }) }, vi.fn());
    expect(service.showRewarded(reward, finish)).toBe(true);
    expect(reward).not.toHaveBeenCalled(); expect(finish).toHaveBeenCalledWith(false);
    await service.initialize({ init: async () => { throw new Error('offline'); } }, vi.fn());
    expect(reward).not.toHaveBeenCalled();
  });
});
