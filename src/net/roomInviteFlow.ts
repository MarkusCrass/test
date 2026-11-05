import type { GamePlatform } from '../platform/GamePlatform';
import type { RoomLobbyState } from './protocol';
import { normalizeRoomCode } from './roomInvites';

export interface RoomInviteActions {
  currentRoomCode(): string | null;
  join(roomCode: string): void;
  createPrivateRoom(): void;
}

/**
 * One common join flow for SDK invitations, links opened before boot and the
 * CrazyGames Instant Multiplayer entry point. Network/renderer/UI stay in the
 * application; this class only resolves priorities and prevents duplicate joins.
 */
export class RoomInviteFlow {
  private pending: string | null = null;
  private manualNavigation = false;

  constructor(private readonly platform: GamePlatform, private readonly actions: RoomInviteActions) {}

  markManualNavigation(): void {
    this.manualNavigation = true;
  }

  accept(value: unknown): void {
    const code = normalizeRoomCode(value);
    if (!code || this.pending === code || this.actions.currentRoomCode() === code) return;
    this.pending = code;
    try { this.actions.join(code); }
    catch (error) { this.pending = null; throw error; }
  }

  roomUpdated(room: RoomLobbyState | null): void {
    if (room?.roomCode === this.pending) this.pending = null;
    this.platform.updateRoom?.(room);
  }

  failed(): void {
    this.pending = null;
  }

  start(nameReady: Promise<unknown>, timeoutMs = 1500): void {
    this.platform.onJoinRoomInvite?.(code => this.accept(code));
    const initial = this.platform.getInitialRoomCode?.() ?? null;
    const instant = this.platform.isInstantMultiplayer?.() ?? false;
    if (!initial && !instant) return;

    let launched = false;
    const launch = () => {
      if (launched) return;
      launched = true;
      if (this.manualNavigation || this.pending || this.actions.currentRoomCode()) return;
      if (initial) this.accept(initial); // An invitation takes priority over a new party.
      else this.actions.createPrivateRoom();
    };
    // A logged-in player's portal username is used when it arrives promptly;
    // a stalled user module must never block joining or creating a room.
    const timer = setTimeout(launch, timeoutMs);
    void nameReady.then(() => { clearTimeout(timer); launch(); }, () => { clearTimeout(timer); launch(); });
  }
}
