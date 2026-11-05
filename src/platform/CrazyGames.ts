import type { GamePlatform } from './GamePlatform';
import { configureCrazyData, type CrazyDataStore } from '../config/gameStorage';
import { normalizeRoomCode, roomCodeFromParams } from '../net/roomInvites';
import { MAX_PLAYERS_PER_ROOM, type RoomLobbyState } from '../net/protocol';

export interface CrazySdk {
  init(): Promise<void>;
  environment?: string;
  data?: CrazyDataStore;
  user?: {
    isUserAccountAvailable?: boolean;
    getUser?(): Promise<{ username?: string } | null>;
  };
  game: {
    loadingStart(): void;
    loadingStop(): void;
    gameplayStart(): void;
    gameplayStop(): void;
    isInstantMultiplayer?: boolean;
    inviteParams?: unknown;
    getInviteParam?(key: string): string | null;
    addJoinRoomListener?(listener: (inviteParams: unknown) => void): void;
    updateRoom?(state: { roomId: string; isJoinable: boolean; inviteParams: { roomCode: string } }): void;
    leftRoom?(): void;
    inviteLink?(inviteParams: { roomCode: string }): string;
  };
}

/** Basic Launch intentionally has no ads; progress uses the CrazyGames SDK Data module. */
export class CrazyGames implements GamePlatform {
  private sdk: CrazySdk | null = null;
  private readySent = false;
  private desiredGameplay = false;
  private gameplay = false;
  private reportedRoom: string | null = null;
  private reportedJoinable = false;

  async initialize(loader: CrazySdk | undefined, timeoutMs = 10000): Promise<void> {
    if (!loader) return;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const initialized = await Promise.race([
        loader.init().then(() => true),
        new Promise<false>(resolve => { timeout = setTimeout(() => resolve(false), timeoutMs); }),
      ]);
      if (!initialized || loader.environment === 'disabled') return;
      this.sdk = loader;
      // sdk.init() has already loaded this account's Data: switch storage before
      // KnightsGameApp reads coins, unlocked heroes, settings or bot progress.
      if (loader.data && typeof loader.data.getItem === 'function' && typeof loader.data.setItem === 'function') {
        configureCrazyData(loader.data);
      } else {
        console.warn('CrazyGames Data module is missing; select "Yes, using the Data Module" in the submission form. Local progress only.');
      }
      loader.game.loadingStart();
    } catch (error) {
      this.sdk = null;
      console.warn('CrazyGames SDK initialization failed:', error);
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
  }

  ready(): void {
    if (!this.sdk || this.readySent) return;
    this.readySent = true;
    try { this.sdk.game.loadingStop(); } catch (error) { console.warn('CrazyGames loading event failed:', error); }
    this.syncGameplay();
  }

  setGameplay(active: boolean): void {
    this.desiredGameplay = active;
    this.syncGameplay();
  }

  private syncGameplay(): void {
    if (!this.sdk || !this.readySent || this.gameplay === this.desiredGameplay) return;
    try {
      if (this.desiredGameplay) this.sdk.game.gameplayStart();
      else this.sdk.game.gameplayStop();
      this.gameplay = this.desiredGameplay;
    } catch (error) { console.warn('CrazyGames gameplay event failed:', error); }
  }

  async getPlayerName(): Promise<string | undefined> {
    const user = this.sdk?.user;
    if (!user?.getUser || user.isUserAccountAvailable === false) return undefined;
    try {
      const name = (await user.getUser())?.username?.trim();
      return name && name.length >= 2 ? name.slice(0, 20) : undefined;
    } catch { return undefined; } // Guests and embedded versions need no login prompt.
  }

  getInitialRoomCode(): string | null {
    const game = this.sdk?.game;
    if (!game) return null;
    try { return roomCodeFromParams(game.inviteParams) ?? normalizeRoomCode(game.getInviteParam?.('roomCode')); }
    catch { return null; }
  }

  onJoinRoomInvite(join: (roomCode: string) => void): void {
    try {
      this.sdk?.game.addJoinRoomListener?.((params) => {
        const code = roomCodeFromParams(params);
        if (code) join(code);
      });
    } catch (error) { console.warn('CrazyGames room join listener failed:', error); }
  }

  isInstantMultiplayer(): boolean {
    try { return this.sdk?.game.isInstantMultiplayer === true; }
    catch { return false; }
  }

  /** updateRoom drives CrazyGames' own Friends/Invite button; never show it for a full/active room. */
  updateRoom(room: RoomLobbyState | null): void {
    const game = this.sdk?.game;
    if (!game) return;
    if (!room) {
      if (this.reportedRoom === null) return;
      try {
        game.leftRoom?.();
        this.reportedRoom = null;
        this.reportedJoinable = false;
      } catch (error) { console.warn('CrazyGames room leave failed:', error); }
      return;
    }
    const code = normalizeRoomCode(room.roomCode);
    if (!code || !game.updateRoom) return;
    const joinable = room.phase === 'lobby' && room.players.length < MAX_PLAYERS_PER_ROOM;
    if (this.reportedRoom === code && this.reportedJoinable === joinable) return;
    try {
      game.updateRoom({ roomId: code, isJoinable: joinable, inviteParams: { roomCode: code } });
      this.reportedRoom = code;
      this.reportedJoinable = joinable;
    } catch (error) { console.warn('CrazyGames room status update failed:', error); }
  }

  getRoomInviteLink(roomCode: string): string | null {
    const code = normalizeRoomCode(roomCode);
    if (!code || !this.sdk?.game.inviteLink) return null;
    try {
      const link = this.sdk.game.inviteLink({ roomCode: code });
      const url = new URL(link);
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
    } catch (error) {
      console.warn('CrazyGames invite link failed:', error);
      return null; // The code remains usable if the SDK/share service is offline.
    }
  }

  showRewarded(): boolean { return false; }
}

/** Wait briefly for the async script; blocked SDKs must not prevent guest play. */
export async function findCrazySdk(timeoutMs = 5000): Promise<CrazySdk | undefined> {
  const get = () => (window as unknown as { CrazyGames?: { SDK?: CrazySdk } }).CrazyGames?.SDK;
  if (get()) return get();
  const script = document.getElementById('crazygames-sdk');
  if (!script) return undefined;
  return new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      script.removeEventListener('load', finish);
      script.removeEventListener('error', finish);
      resolve(get());
    };
    const timer = window.setTimeout(finish, timeoutMs);
    script.addEventListener('load', finish);
    script.addEventListener('error', finish);
    if (get()) finish();
  });
}
