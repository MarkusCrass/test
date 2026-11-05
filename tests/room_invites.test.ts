// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CrazyGames, type CrazySdk } from '../src/platform/CrazyGames';
import { YandexGames } from '../src/platform/YandexGames';
import { configureCrazyData } from '../src/config/gameStorage';
import { DEFAULT_SETTINGS } from '../src/config/settings';
import { t } from '../src/config/locales';
import { UIManager, type UICallbacks } from '../src/ui/UIManager';
import { RoomInviteFlow } from '../src/net/roomInviteFlow';
import type { RoomLobbyState } from '../src/net/protocol';
import {
  normalizeRoomCode, roomCodeFromParams, roomCodeFromWebUrl, roomCodeFromYandexPayload,
  webRoomInviteUrl, yandexRoomInviteUrl,
} from '../src/net/roomInvites';

const hostRoom = (code = 'ABCD'): RoomLobbyState => ({
  roomCode: code, hostClientId: 'c_host', isPublic: false, fillBots: false, phase: 'lobby',
  players: [{ clientId: 'c_host', fighterId: 'human_1', name: 'Knight', classId: 'sword', ready: true, isHost: true, pingMs: 20 }],
});

function mockSdk() {
  const data = new Map<string, string>();
  const game = {
    loadingStart: vi.fn(), loadingStop: vi.fn(), gameplayStart: vi.fn(), gameplayStop: vi.fn(),
    isInstantMultiplayer: true,
    inviteParams: { roomCode: 'abcd' } as unknown,
    addJoinRoomListener: vi.fn((_listener: (params: unknown) => void) => {}),
    updateRoom: vi.fn(), leftRoom: vi.fn(),
    inviteLink: vi.fn(({ roomCode }: { roomCode: string }) => `https://www.crazygames.com/game/knights-last-standing?roomCode=${roomCode}`),
  };
  return {
    environment: 'local', init: vi.fn(async () => {}), game,
    data: { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, val: string) => { data.set(key, val); } },
    user: { isUserAccountAvailable: true as boolean, getUser: vi.fn(async (): Promise<{ username: string } | null> => ({ username: 'SingingCheese.TLNUZ' })) },
  } satisfies CrazySdk;
}

beforeEach(() => { localStorage.clear(); document.body.innerHTML = '<div id="root"></div>'; });
afterEach(() => { configureCrazyData(null); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); window.history.replaceState(null, '', '/'); });

describe('common room invite links', () => {
  it('accepts only a 4-character code and ignores malicious or malformed invitations', () => {
    expect(normalizeRoomCode(' ab3d ')).toBe('AB3D');
    expect(normalizeRoomCode('bad/../../')).toBeNull();
    expect(normalizeRoomCode({ roomCode: 'ABCD' })).toBeNull();
    expect(roomCodeFromParams({ roomCode: 'q1r2' })).toBe('Q1R2');
    expect(roomCodeFromParams({ roomCode: '<script>' })).toBeNull();
    expect(roomCodeFromParams(['ABCD'])).toBeNull();
    expect(roomCodeFromYandexPayload('room:abc2')).toBe('ABC2');
    expect(roomCodeFromYandexPayload('abc2')).toBeNull();
    expect(roomCodeFromYandexPayload('room:abc2?steal=true')).toBeNull();
  });

  it('uses the live site page for web links while keeping unrelated query params', () => {
    const url = webRoomInviteUrl('https://igra.cosmorox.ru/index.html?lang=tr#lobby', 'x2y3')!;
    expect(url).toBe('https://igra.cosmorox.ru/index.html?lang=tr&room=X2Y3');
    expect(roomCodeFromWebUrl(url)).toBe('X2Y3');
    expect(webRoomInviteUrl('javascript:alert(1)', 'ABCD')).toBeNull();
    expect(webRoomInviteUrl('https://example.com/', '../../admin')).toBeNull();
  });

  it('uses the Yandex game page ID and SDK payload, not the embedded game iframe', () => {
    const url = yandexRoomInviteUrl('1234567', 'abcd')!;
    expect(url).toBe('https://yandex.ru/games/app/1234567?payload=room%3AABCD');
    expect(roomCodeFromYandexPayload(new URL(url).searchParams.get('payload'))).toBe('ABCD');
    expect(yandexRoomInviteUrl(undefined, 'ABCD')).toBeNull();
    expect(yandexRoomInviteUrl('123/evil', 'ABCD')).toBeNull();
  });
});

describe('CrazyGames multiplayer SDK bridge', () => {
  it('reads initial invite, accepts mid-game joins, and gives the invite priority over Instant Multiplayer', async () => {
    const sdk = mockSdk();
    const platform = new CrazyGames();
    await platform.initialize(sdk);
    expect(platform.isInstantMultiplayer()).toBe(true);
    expect(platform.getInitialRoomCode()).toBe('ABCD');
    const join = vi.fn();
    platform.onJoinRoomInvite(join);
    expect(sdk.game.addJoinRoomListener).toHaveBeenCalledOnce();
    const listener = sdk.game.addJoinRoomListener.mock.calls[0][0];
    listener({ roomCode: 'z5y2' });
    listener({ roomCode: '../../evil' });
    expect(join).toHaveBeenCalledOnce();
    expect(join).toHaveBeenCalledWith('Z5Y2');

    expect(platform.getRoomInviteLink('ABCD')).toContain('roomCode=ABCD');
    expect(sdk.game.inviteLink).toHaveBeenCalledWith({ roomCode: 'ABCD' });
    expect(platform.getRoomInviteLink('<svg>')).toBeNull();
    expect(sdk.game.inviteLink).toHaveBeenCalledTimes(1);
  });

  it('reports joinable/private, full, active, and rematch lobbies; leaves on disconnect', async () => {
    const sdk = mockSdk();
    const platform = new CrazyGames();
    await platform.initialize(sdk);
    const room = hostRoom();
    platform.updateRoom(room);
    platform.updateRoom(room); // No duplicate SDK events on each UI/network refresh.
    expect(sdk.game.updateRoom).toHaveBeenCalledOnce();
    expect(sdk.game.updateRoom).toHaveBeenCalledWith({
      roomId: 'ABCD', isJoinable: true, inviteParams: { roomCode: 'ABCD' },
    });

    const full = { ...room, players: Array(5).fill(room.players[0]) };
    platform.updateRoom(full);
    expect(sdk.game.updateRoom).toHaveBeenLastCalledWith({ roomId: 'ABCD', isJoinable: false, inviteParams: { roomCode: 'ABCD' } });
    platform.updateRoom({ ...room, phase: 'in_match' });
    expect(sdk.game.updateRoom).toHaveBeenCalledTimes(2); // Already non-joinable.
    platform.updateRoom(room); // The group plays again without creating a new room.
    expect(sdk.game.updateRoom).toHaveBeenLastCalledWith({ roomId: 'ABCD', isJoinable: true, inviteParams: { roomCode: 'ABCD' } });
    platform.updateRoom(null); platform.updateRoom(null);
    expect(sdk.game.leftRoom).toHaveBeenCalledOnce();
    expect(sdk.game.updateRoom).toHaveBeenCalledTimes(3);
  });

  it('shows the CrazyGames account username without prompting guests to log in', async () => {
    const sdk = mockSdk();
    const platform = new CrazyGames();
    await platform.initialize(sdk);
    expect(await platform.getPlayerName()).toBe('SingingCheese.TLNUZ');
    sdk.user.getUser = vi.fn(async () => null);
    expect(await platform.getPlayerName()).toBeUndefined();
    sdk.user.isUserAccountAvailable = false;
    expect(await platform.getPlayerName()).toBeUndefined();
    expect(sdk.user.getUser).toHaveBeenCalledTimes(1);
  });

  it('remains playable if optional invite methods are missing or unavailable', async () => {
    const sdk = mockSdk();
    sdk.game.inviteLink = vi.fn(() => { throw new Error('offline'); });
    const platform = new CrazyGames();
    await platform.initialize(sdk);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(platform.getRoomInviteLink('ABCD')).toBeNull();
    expect(warn).toHaveBeenCalled();
    sdk.game.inviteLink = vi.fn(() => 'javascript:alert(1)');
    expect(platform.getRoomInviteLink('ABCD')).toBeNull();
    sdk.game.inviteParams = null;
    expect(platform.getInitialRoomCode()).toBeNull();
  });
});

describe('the shared invitation / Instant Multiplayer launch flow', () => {
  it('joins the invited room first, ignores duplicate notifications and can switch rooms in-game', async () => {
    const sdk = mockSdk();
    const platform = new CrazyGames();
    await platform.initialize(sdk);
    let current: string | null = null;
    const join = vi.fn((code: string) => { current = code; });
    const createPrivateRoom = vi.fn();
    const flow = new RoomInviteFlow(platform, { currentRoomCode: () => current, join, createPrivateRoom });
    flow.start(Promise.resolve());
    await vi.waitFor(() => expect(join).toHaveBeenCalledWith('ABCD'));
    expect(createPrivateRoom).not.toHaveBeenCalled();
    const notify = sdk.game.addJoinRoomListener.mock.calls[0][0];
    notify({ roomCode: 'ABCD' });
    expect(join).toHaveBeenCalledTimes(1);
    notify({ roomCode: 'EF12' });
    expect(join).toHaveBeenCalledWith('EF12');
    flow.roomUpdated(hostRoom('EF12'));
    expect(sdk.game.updateRoom).toHaveBeenCalledWith({ roomId: 'EF12', isJoinable: true, inviteParams: { roomCode: 'EF12' } });
    flow.roomUpdated(null);
    expect(sdk.game.leftRoom).toHaveBeenCalledOnce();
    current = null;
    flow.failed();
    notify({ roomCode: 'EF12' });
    expect(join).toHaveBeenCalledTimes(3); // Can retry after a network error.
  });

  it('creates a private lobby after a stalled account lookup, but not if the player used the menu', async () => {
    vi.useFakeTimers();
    const sdk = mockSdk();
    sdk.game.inviteParams = null;
    const platform = new CrazyGames();
    await platform.initialize(sdk);
    const join = vi.fn();
    const createPrivateRoom = vi.fn();
    let finish!: () => void;
    const account = new Promise<void>(resolve => { finish = resolve; });
    const flow = new RoomInviteFlow(platform, { currentRoomCode: () => null, join, createPrivateRoom });
    flow.start(account, 1500);
    expect(createPrivateRoom).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1500);
    expect(createPrivateRoom).toHaveBeenCalledOnce();
    finish(); await Promise.resolve();
    expect(createPrivateRoom).toHaveBeenCalledOnce();
    expect(join).not.toHaveBeenCalled();

    const manual = new RoomInviteFlow(platform, { currentRoomCode: () => null, join, createPrivateRoom });
    manual.start(Promise.resolve(), 1500);
    manual.markManualNavigation();
    await vi.advanceTimersByTimeAsync(1500);
    expect(createPrivateRoom).toHaveBeenCalledOnce();
  });
});

describe('Yandex and standalone online rooms', () => {
  it('reads Yandex SDK payload and shares its app URL, not a CDN or preview iframe', async () => {
    vi.stubEnv('VITE_PLATFORM', 'yandex');
    const platform = new YandexGames(vi.fn());
    await platform.initialize({ init: async () => ({ environment: { i18n: { lang: 'ru' }, app: { id: '12345' }, payload: 'room:x2y3' } }) }, () => {});
    expect(platform.getInitialRoomCode()).toBe('X2Y3');
    expect(platform.getRoomInviteLink('ABCD')).toBe('https://yandex.ru/games/app/12345?payload=room%3AABCD');
  });

  it('uses a link on the standalone website and falls back to room code without a Yandex app ID', () => {
    vi.stubEnv('VITE_PLATFORM', 'site');
    window.history.replaceState(null, '', '/?ref=menu&room=abc1');
    const site = new YandexGames(vi.fn());
    expect(site.getInitialRoomCode()).toBe('ABC1');
    expect(site.getRoomInviteLink('x2y3')).toContain('ref=menu&room=X2Y3');
    vi.stubEnv('VITE_PLATFORM', 'yandex');
    expect(site.getInitialRoomCode()).toBeNull();
    expect(site.getRoomInviteLink('ABCD')).toBeNull();
  });
});

describe('shared lobby invite UI', () => {
  const setup = (invite: (code: string) => string | null) => {
    const callbacks = new Proxy({ onMpInviteLink: vi.fn(invite), onMpSetName: vi.fn() }, { get: (target, key) => key in target ? target[key as 'onMpInviteLink' | 'onMpSetName'] : vi.fn() }) as unknown as UICallbacks;
    const root = document.querySelector<HTMLElement>('#root')!;
    const ui = new UIManager(root, { ...DEFAULT_SETTINGS, language: 'en' }, callbacks);
    return { root, ui, callbacks };
  };

  it('copies the platform link for any joinable lobby and shows honest feedback', async () => {
    const writeText = vi.fn(async (_text: string) => {});
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const { root, ui, callbacks } = setup(code => `https://example.com/?room=${code}`);
    const invite = root.querySelector<HTMLButtonElement>('#btn-mp-invite')!;
    expect(invite.classList.contains('hidden')).toBe(true);
    ui.updateMultiplayerRoom(hostRoom(), 'c_host');
    expect(invite.classList.contains('hidden')).toBe(false);
    invite.click();
    await vi.waitFor(() => expect(root.querySelector('#mp-alert-banner')?.textContent).toBe(t('mpInviteCopied', 'en')));
    expect(writeText).toHaveBeenCalledWith('https://example.com/?room=ABCD');
    expect(callbacks.onMpInviteLink).toHaveBeenCalledWith('ABCD');

    ui.updateMultiplayerRoom({ ...hostRoom(), phase: 'in_match' }, 'c_host');
    expect(invite.classList.contains('hidden')).toBe(true);
    ui.updateMultiplayerRoom({ ...hostRoom(), players: Array(5).fill(hostRoom().players[0]) }, 'c_host');
    expect(invite.classList.contains('hidden')).toBe(true);
    ui.updateMultiplayerRoom(null, null);
    expect(invite.classList.contains('hidden')).toBe(true);
  });

  it('never claims an invitation was copied when clipboard permission is denied', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn(async () => { throw new Error('not allowed'); }) } });
    const { root, ui } = setup(() => 'https://example.com/?room=ABCD');
    ui.updateMultiplayerRoom(hostRoom(), 'c_host');
    root.querySelector<HTMLButtonElement>('#btn-mp-invite')!.click();
    await vi.waitFor(() => expect(root.querySelector('#mp-alert-banner')?.textContent).toBe(t('mpCopyFailed', 'en', { code: 'ABCD' })));
  });

  it('copies a room code instead of a broken link; names match the CrazyGames account', async () => {
    const writeText = vi.fn(async (_text: string) => {});
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const { root, ui, callbacks } = setup(() => null);
    ui.useCrazyGamesPlayerName('SingingCheese.TLNUZ');
    expect(root.querySelector<HTMLInputElement>('#mp-name-input')?.value).toBe('SingingCheese.TLNUZ');
    expect(root.querySelector<HTMLInputElement>('#mp-name-input')?.readOnly).toBe(true);
    expect(callbacks.onMpSetName).not.toHaveBeenCalled(); // The game syncs it once the server has assigned this client a room.
    ui.updateMultiplayerRoom(hostRoom(), 'c_host');
    root.querySelector<HTMLButtonElement>('#btn-mp-invite')!.click();
    await vi.waitFor(() => expect(root.querySelector('#mp-alert-banner')?.textContent).toBe(t('mpInviteCodeCopied', 'en', { code: 'ABCD' })));
    expect(writeText).toHaveBeenCalledWith('ABCD');
    root.querySelector<HTMLButtonElement>('#btn-mp-copy-code')!.click();
    await vi.waitFor(() => expect(root.querySelector('#mp-alert-banner')?.textContent).toBe(t('mpNoticeCopied', 'en', { code: 'ABCD' })));
  });
});
