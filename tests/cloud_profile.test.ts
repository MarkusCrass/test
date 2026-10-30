// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROFILE, loadProfile, saveProfile } from '../src/config/playerProfile';
import { CloudProfile, type CloudPlayer } from '../src/platform/CloudProfile';

const value = (coins: number) => ({ ...DEFAULT_PROFILE, coins, unlockedKnights: ['sword', 'dual', 'spear'] as const, totals: { gamesPlayed: 2, wins: 1, kills: 3 } });
function makePlayer(id = 'player-a', initial: unknown = null) {
  let remote: unknown = initial;
  const getData = vi.fn(async () => ({ knightsProfileV1: remote }));
  const setData = vi.fn(async (data: Record<string, unknown>) => { remote = data.knightsProfileV1; });
  const player: CloudPlayer = { getUniqueID: () => id, getData, setData };
  return { player, getData, setData, setRemote: (data: unknown) => { remote = data; }, remote: () => remote };
}
let service: CloudProfile | null = null;
beforeEach(() => localStorage.clear());
afterEach(() => { service?.dispose(); service = null; });

describe('Yandex cloud progress', () => {
  it('loads cloud progress before play and saves changes through player.setData', async () => {
    const p = makePlayer('a', value(240));
    service = await CloudProfile.start(p.player);
    expect(loadProfile().coins).toBe(240);
    saveProfile({ ...loadProfile(), coins: 300 });
    await service!.flush();
    expect(p.setData).toHaveBeenCalledWith({ knightsProfileV1: expect.objectContaining({ coins: 300 }) }, true);
    expect((p.remote() as { coins: number }).coins).toBe(300);
  });
  it('imports an existing local profile when cloud is empty', async () => {
    saveProfile({ ...loadProfile(), coins: 205 });
    const p = makePlayer(); service = await CloudProfile.start(p.player); await service!.flush();
    expect((p.remote() as { coins: number }).coins).toBe(205);
  });
  it('keeps offline changes pending and does not overwrite an unread cloud', async () => {
    const p = makePlayer('a', value(240)); service = await CloudProfile.start(p.player);
    saveProfile({ ...loadProfile(), coins: 260 }); service!.dispose(); service = null;
    p.getData.mockRejectedValueOnce(new Error('offline'));
    service = await CloudProfile.start(p.player);
    expect(loadProfile().coins).toBe(260); await service!.flush();
    expect(p.setData).not.toHaveBeenCalled();
    service!.dispose(); service = await CloudProfile.start(p.player); await service!.flush();
    expect((p.remote() as { coins: number }).coins).toBe(260);
  });
  it('preserves both copies and asks the player when another device changed the cloud', async () => {
    const p = makePlayer('a', value(200)); service = await CloudProfile.start(p.player);
    saveProfile({ ...loadProfile(), coins: 250 }); service!.dispose();
    p.setRemote(value(300)); service = await CloudProfile.start(p.player);
    expect(service!.conflict).toBe(true); expect(loadProfile().coins).toBe(250);
    await service!.flush(); expect(p.setData).not.toHaveBeenCalled();
    service!.resolveConflict('local'); expect(loadProfile().coins).toBe(250);
    await service!.flush(); expect((p.remote() as { coins: number }).coins).toBe(250);
    expect(localStorage.getItem('kls_cloud_profile_pending_v1_a_backup')).toContain('300');
  });
  it('detects another device changing cloud while the current session is open', async () => {
    const p = makePlayer('a', value(200)); service = await CloudProfile.start(p.player);
    const conflict = vi.fn(); service!.onConflict(conflict);
    saveProfile({ ...loadProfile(), coins: 250 }); p.setRemote(value(300));
    await service!.flush();
    expect(conflict).toHaveBeenCalledOnce(); expect(p.setData).not.toHaveBeenCalled();
    service!.resolveConflict('cloud'); expect(loadProfile().coins).toBe(300);
    expect(localStorage.getItem('kls_cloud_profile_pending_v1_a_backup')).toContain('250');
  });
  it('never imports a previous account into an empty new account', async () => {
    const a = makePlayer('account-a', value(900)); service = await CloudProfile.start(a.player);
    expect(loadProfile().coins).toBe(900); service!.dispose();
    const b = makePlayer('account-b'); service = await CloudProfile.start(b.player);
    expect(loadProfile().coins).toBe(DEFAULT_PROFILE.coins);
    await service!.flush(); expect(b.setData).not.toHaveBeenCalled();
  });
  it('can retain the live profile and synchronize if localStorage writes are blocked', async () => {
    const blocked = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    try {
      const p = makePlayer('a', value(240)); service = await CloudProfile.start(p.player);
      expect(loadProfile().coins).toBe(240);
      saveProfile({ ...loadProfile(), coins: 265 });
      await service!.flush(); expect((p.remote() as { coins: number }).coins).toBe(265);
    } finally { blocked.mockRestore(); }
  });
  it('does not replace invalid remote data or grant a bogus profile', async () => {
    const p = makePlayer('a', { coins: -5 }); service = await CloudProfile.start(p.player);
    saveProfile({ ...loadProfile(), coins: 300 }); await service!.flush();
    expect(p.setData).not.toHaveBeenCalled();
  });
});
