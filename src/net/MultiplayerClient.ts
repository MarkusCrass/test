import { KnightClassId } from '../config/classes';
import { FighterInputIntent } from '../core/Fighter';
import {
  ClientMsg,
  RoomLobbyState,
  RoomSummary,
  ServerMsg,
  WorldSnapshot,
} from './protocol';

export type NetConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

export type ServerSnapshotMsg = Extract<ServerMsg, { type: 'snapshot' }>;

export interface MultiplayerClientCallbacks {
  onStatusChange?: (status: NetConnectionStatus, errorText?: string) => void;
  onRoomsList?: (rooms: RoomSummary[]) => void;
  onRoomUpdated?: (room: RoomLobbyState | null) => void;
  onErrorMsg?: (message: string) => void;
  onMatchStarted?: (payload: {
    roomCode: string;
    yourFighterId: string;
    matchGeneration: number;
    snapshot: WorldSnapshot;
  }) => void;
  onSnapshot?: (msg: ServerSnapshotMsg) => void;
  onReturnedToLobby?: (room: RoomLobbyState) => void;
  onPingUpdate?: (pingMs: number) => void;
}

export class MultiplayerClient {
  private ws: WebSocket | null = null;
  private status: NetConnectionStatus = 'disconnected';
  private readonly customWsUrl?: string;
  private readonly callbacks: MultiplayerClientCallbacks;

  public clientId: string | null = null;
  public yourFighterId: string | null = null;
  public publicRooms: RoomSummary[] = [];
  public currentRoom: RoomLobbyState | null = null;
  public pingMs = 0;

  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private inputSendAccum = 0;
  private jumpSeq = 0;
  private dodgeSeq = 0;
  private ability1Seq = 0;
  private ability2Seq = 0;
  private lastAttackHeld = false;
  private lastBlockHeld = false;

  private pendingConnectResolvers: Array<(ok: boolean) => void> = [];

  constructor(
    callbacks: MultiplayerClientCallbacks = {},
    customWsUrl?: string
  ) {
    this.callbacks = callbacks;
    this.customWsUrl = customWsUrl;
  }

  public getStatus(): NetConnectionStatus {
    return this.status;
  }

  public isConnected(): boolean {
    return (
      this.status === 'connected' && this.ws?.readyState === WebSocket.OPEN
    );
  }

  public isHost(): boolean {
    return Boolean(
      this.clientId &&
        this.currentRoom &&
        this.currentRoom.hostClientId === this.clientId
    );
  }

  private resolveWsUrl(): string {
    if (this.customWsUrl) return this.customWsUrl;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws`;
  }

  public connect(): Promise<boolean> {
    if (this.isConnected()) {
      return Promise.resolve(true);
    }
    if (this.status === 'connecting' && this.ws) {
      return new Promise((resolve) => {
        this.pendingConnectResolvers.push(resolve);
      });
    }

    this.cleanupSocket(false);
    this.setStatus('connecting');

    return new Promise((resolve) => {
      this.pendingConnectResolvers.push(resolve);
      let socket: WebSocket;
      try {
        socket = new WebSocket(this.resolveWsUrl());
      } catch {
        this.setStatus('error', 'Не удалось открыть сетевой сокет.');
        this.flushConnectResolvers(false);
        return;
      }

      this.ws = socket;

      socket.addEventListener('open', () => {
        if (this.ws !== socket) return;
        this.setStatus('connected');
        this.startPingLoop();
        this.send({ type: 'list_rooms' });
        this.flushConnectResolvers(true);
      });

      socket.addEventListener('message', (ev) => {
        if (this.ws !== socket) return;
        const raw = typeof ev.data === 'string' ? ev.data : String(ev.data);
        try {
          const msg = JSON.parse(raw) as ServerMsg;
          this.handleServerMessage(msg);
        } catch {
          // Ignore malformed packet
        }
      });

      socket.addEventListener('close', () => {
        if (this.ws !== socket) return;
        this.ws = null;
        this.stopPingLoop();
        const hadRoom = this.currentRoom !== null;
        this.currentRoom = null;
        this.yourFighterId = null;
        if (hadRoom) {
          this.callbacks.onRoomUpdated?.(null);
        }
        this.setStatus('disconnected');
        this.flushConnectResolvers(false);
      });

      socket.addEventListener('error', () => {
        if (this.ws !== socket) return;
        this.setStatus('error', 'Потеряна связь с сервером арены.');
      });
    });
  }

  public disconnect(): void {
    this.cleanupSocket(true);
  }

  private cleanupSocket(notifyStatus: boolean): void {
    this.stopPingLoop();
    if (this.ws) {
      const sock = this.ws;
      this.ws = null;
      try {
        sock.close();
      } catch {
        // Ignore close error
      }
    }
    this.currentRoom = null;
    this.yourFighterId = null;
    if (notifyStatus) {
      this.setStatus('disconnected');
      this.callbacks.onRoomUpdated?.(null);
    }
    this.flushConnectResolvers(false);
  }

  private flushConnectResolvers(ok: boolean): void {
    const list = this.pendingConnectResolvers.splice(0);
    for (const fn of list) {
      fn(ok);
    }
  }

  private setStatus(next: NetConnectionStatus, err?: string): void {
    this.status = next;
    this.callbacks.onStatusChange?.(next, err);
  }

  private startPingLoop(): void {
    this.stopPingLoop();
    this.send({ type: 'ping', clientTime: performance.now() });
    this.pingTimer = setInterval(() => {
      if (this.isConnected()) {
        this.send({
          type: 'ping',
          clientTime: performance.now(),
          lastPingMs: this.pingMs > 0 ? this.pingMs : undefined,
        });
      }
    }, 2500);
  }

  private stopPingLoop(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private send(msg: ClientMsg): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  public requestRooms(): void {
    this.send({ type: 'list_rooms' });
  }

  public async quickJoin(
    playerName: string,
    classId: KnightClassId
  ): Promise<void> {
    const ok = await this.connect();
    if (!ok) return;
    this.send({ type: 'quick_join', playerName, classId });
  }

  public async createRoom(opts: {
    playerName: string;
    classId: KnightClassId;
    fillBots: boolean;
    isPublic: boolean;
  }): Promise<void> {
    const ok = await this.connect();
    if (!ok) return;
    this.send({
      type: 'create_room',
      playerName: opts.playerName,
      classId: opts.classId,
      fillBots: opts.fillBots,
      isPublic: opts.isPublic,
    });
  }

  public async joinRoom(
    roomCode: string,
    playerName: string,
    classId: KnightClassId
  ): Promise<void> {
    const ok = await this.connect();
    if (!ok) return;
    this.send({
      type: 'join_room',
      roomCode: roomCode.trim().toUpperCase(),
      playerName,
      classId,
    });
  }

  public leaveRoom(): void {
    if (this.currentRoom) {
      this.send({ type: 'leave_room' });
      this.currentRoom = null;
      this.yourFighterId = null;
      this.callbacks.onRoomUpdated?.(null);
    }
  }

  public selectClass(classId: KnightClassId): void {
    this.send({ type: 'select_class', classId });
  }

  public setName(playerName: string): void {
    this.send({ type: 'set_name', playerName });
  }

  public setReady(ready: boolean): void {
    this.send({ type: 'set_ready', ready });
  }

  public setRoomOptions(opts: { fillBots: boolean; isPublic: boolean }): void {
    this.send({
      type: 'set_room_options',
      fillBots: opts.fillBots,
      isPublic: opts.isPublic,
    });
  }

  public startMatch(): void {
    this.send({ type: 'start_match' });
  }

  public requestRematch(): void {
    this.send({ type: 'rematch' });
  }

  public returnToLobby(): void {
    this.send({ type: 'return_to_lobby' });
  }

  public resetInputSequences(): void {
    this.inputSendAccum = 0;
    this.jumpSeq = 0;
    this.dodgeSeq = 0;
    this.ability1Seq = 0;
    this.ability2Seq = 0;
    this.lastAttackHeld = false;
    this.lastBlockHeld = false;
  }

  /**
   * Streams player input at ~33 Hz, plus immediately whenever a discrete action edge occurs.
   */
  public streamInputIntent(dt: number, intent: FighterInputIntent): void {
    if (!this.isConnected()) return;

    let urgent = false;
    if (intent.jumpPressed) {
      this.jumpSeq += 1;
      urgent = true;
    }
    if (intent.dodgePressed) {
      this.dodgeSeq += 1;
      urgent = true;
    }
    if (intent.ability1Pressed) {
      this.ability1Seq += 1;
      urgent = true;
    }
    if (intent.ability2Pressed) {
      this.ability2Seq += 1;
      urgent = true;
    }
    if (
      intent.attackHeld !== this.lastAttackHeld ||
      intent.blockHeld !== this.lastBlockHeld
    ) {
      this.lastAttackHeld = intent.attackHeld;
      this.lastBlockHeld = intent.blockHeld;
      urgent = true;
    }

    this.inputSendAccum += dt;
    if (!urgent && this.inputSendAccum < 0.03) {
      return;
    }
    this.inputSendAccum = 0;

    this.send({
      type: 'input',
      moveX: Math.round(intent.moveX * 1000) / 1000,
      moveZ: Math.round(intent.moveZ * 1000) / 1000,
      aimYaw: Math.round(intent.aimYaw * 1000) / 1000,
      sprint: intent.sprint,
      attackHeld: intent.attackHeld,
      blockHeld: intent.blockHeld,
      jumpSeq: this.jumpSeq,
      dodgeSeq: this.dodgeSeq,
      ability1Seq: this.ability1Seq,
      ability2Seq: this.ability2Seq,
    });
  }

  private handleServerMessage(msg: ServerMsg): void {
    switch (msg.type) {
      case 'welcome':
        this.clientId = msg.clientId;
        this.publicRooms = msg.rooms;
        this.callbacks.onRoomsList?.(msg.rooms);
        break;
      case 'rooms_list':
        this.publicRooms = msg.rooms;
        this.callbacks.onRoomsList?.(msg.rooms);
        break;
      case 'room_joined':
        this.yourFighterId = msg.yourFighterId;
        this.currentRoom = msg.room;
        this.callbacks.onRoomUpdated?.(msg.room);
        break;
      case 'room_updated':
        this.currentRoom = msg.room;
        this.callbacks.onRoomUpdated?.(msg.room);
        break;
      case 'returned_to_lobby':
        this.currentRoom = msg.room;
        this.callbacks.onReturnedToLobby?.(msg.room);
        break;
      case 'room_left':
        this.currentRoom = null;
        this.yourFighterId = null;
        this.callbacks.onRoomUpdated?.(null);
        break;
      case 'error':
        this.callbacks.onErrorMsg?.(msg.message);
        break;
      case 'match_started':
        this.resetInputSequences();
        this.yourFighterId = msg.yourFighterId;
        if (this.currentRoom) {
          this.currentRoom = { ...this.currentRoom, phase: 'in_match' };
        }
        this.callbacks.onMatchStarted?.({
          roomCode: msg.roomCode,
          yourFighterId: msg.yourFighterId,
          matchGeneration: msg.matchGeneration,
          snapshot: msg.snapshot,
        });
        break;
      case 'snapshot':
        this.callbacks.onSnapshot?.(msg);
        break;
      case 'pong': {
        const rtt = Math.max(1, Math.round(performance.now() - msg.clientTime));
        this.pingMs =
          this.pingMs === 0 ? rtt : Math.round(this.pingMs * 0.65 + rtt * 0.35);
        this.callbacks.onPingUpdate?.(this.pingMs);
        break;
      }
    }
  }
}
