import type { RoomLobbyState } from '../net/protocol';

/** The small platform surface used by the game loop and UI. */
export interface GamePlatform {
  ready(): void;
  setGameplay(active: boolean): void;
  getPlayerName(): Promise<string | undefined>;
  showRewarded(onRewarded: () => void, onFinished: (rewarded: boolean) => void): boolean;

  // The room/UX flow is shared; only the invitation transport is platform-specific.
  getInitialRoomCode?(): string | null;
  onJoinRoomInvite?(join: (roomCode: string) => void): void;
  isInstantMultiplayer?(): boolean;
  updateRoom?(room: RoomLobbyState | null): void;
  getRoomInviteLink?(roomCode: string): string | null;
}
