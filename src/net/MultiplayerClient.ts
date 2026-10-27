import { KnightClassId } from '../config/classes';
import { CombatEvent } from '../core/CombatSystem';
import { FighterInputIntent } from '../core/Fighter';
import { AuthoritativeMatchSim } from './MultiplayerRoomSim';
import {
  ClientInputPacket,
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

const WS_CONNECT_TIMEOUT_MS = 1800;
const HTTP_BROWSER_POLL_MS = 450;
const HTTP_ROOM_LOBBY_POLL_MS = 160;
const HTTP_MATCH_POLL_MS = 48;
const HOST_SIM_DT = 1 / 60;

export class MultiplayerClient {
  private ws: WebSocket | null = null;
  private transport: 'none' | 'ws' | 'http' = 'none';
  private httpEndpointStyle: 'rest' | 'php' = 'rest';
  private relayMode: 'server_sim' | 'host_sim' = 'server_sim';
  private status: NetConnectionStatus = 'disconnected';
  private readonly customWsUrl?: string;
  private readonly callbacks: MultiplayerClientCallbacks;

  public clientId: string | null = null;
  public yourFighterId: string | null = null;
  public publicRooms: RoomSummary[] = [];
  public currentRoom: RoomLobbyState | null = null;
  public pingMs = 0;

  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private httpPollTimer: ReturnType<typeof setTimeout> | null = null;
  private httpInFlight = false;
  private httpPendingImmediate = false;
  private httpOutbox: ClientMsg[] = [];
  private httpFailures = 0;

  // Host-authoritative simulation state (active when relayMode === 'host_sim', e.g. on Beget PHP hosting)
  private hostSim: AuthoritativeMatchSim | null = null;
  private hostSimTimer: ReturnType<typeof setInterval> | null = null;
  private hostSimLastNow = 0;
  private hostSimAccum = 0;
  private hostSimTick = 0;
  private hostLocalEvents: CombatEvent[] = [];
  private hostLocalFootsteps: string[] = [];
  private hostLocalJumps: string[] = [];
  private hostLocalDodges: string[] = [];
  private hostLocalLandings: Array<{
    id: string;
    x: number;
    y: number;
    z: number;
  }> = [];
  private hostLocalFinalPhase = false;
  private hostRelayEvents: CombatEvent[] = [];
  private hostRelayFootsteps: string[] = [];
  private hostRelayJumps: string[] = [];
  private hostRelayDodges: string[] = [];
  private hostRelayLandings: Array<{
    id: string;
    x: number;
    y: number;
    z: number;
  }> = [];
  private hostRelayFinalPhase = false;

  private inputSendAccum = 0;
  private jumpSeq = 0;
  private dodgeSeq = 0;
  private ability1Seq = 0;
  private ability2Seq = 0;
  private lastAttackHeld = false;
  private lastBlockHeld = false;

  private connectInFlight: Promise<boolean> | null = null;

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

  public getTransport(): 'none' | 'ws' | 'http' {
    return this.transport;
  }

  public getRelayMode(): 'server_sim' | 'host_sim' {
    return this.relayMode;
  }

  public isConnected(): boolean {
    if (this.status !== 'connected') return false;
    if (this.transport === 'ws') {
      return this.ws?.readyState === WebSocket.OPEN;
    }
    return this.transport === 'http' && this.clientId !== null;
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

  private resolveHttpBaseUrl(): string {
    if (this.customWsUrl) {
      return this.customWsUrl
        .replace(/^wss:/i, 'https:')
        .replace(/^ws:/i, 'http:')
        .replace(/\/ws\/?$/, '');
    }
    return '.';
  }

  private buildHttpEndpoint(action: 'connect' | 'sync' | 'disconnect'): string {
    const base = this.resolveHttpBaseUrl();
    if (this.httpEndpointStyle === 'php') {
      return `${base}/api/mp.php?action=${action}`;
    }
    return `${base}/api/mp/${action}`;
  }

  public connect(): Promise<boolean> {
    if (this.isConnected()) {
      return Promise.resolve(true);
    }
    if (this.connectInFlight) {
      return this.connectInFlight;
    }

    this.cleanupTransport(false);
    this.setStatus('connecting');

    const attempt = (async (): Promise<boolean> => {
      const wsOk = await this.tryConnectWebSocket();
      if (wsOk) {
        return true;
      }
      // Automatic HTTP/PHP fallback (works behind proxies, DPI, and Beget shared virtual hosting)
      const httpOk = await this.tryConnectHttpFallback();
      if (httpOk) {
        return true;
      }
      this.setStatus(
        'error',
        'Не удалось подключиться к серверу арены.'
      );
      return false;
    })();

    this.connectInFlight = attempt.finally(() => {
      this.connectInFlight = null;
    });
    return this.connectInFlight;
  }

  private tryConnectWebSocket(): Promise<boolean> {
    if (typeof WebSocket === 'undefined') {
      return Promise.resolve(false);
    }
    // If customWsUrl explicitly points to an http(s) URL (for tests), skip WebSocket
    if (this.customWsUrl && /^https?:/i.test(this.customWsUrl)) {
      return Promise.resolve(false);
    }

    return new Promise((resolve) => {
      let settled = false;
      let socket: WebSocket;

      const finish = (ok: boolean): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve(ok);
      };

      try {
        socket = new WebSocket(this.resolveWsUrl());
      } catch {
        resolve(false);
        return;
      }

      const timeoutId = setTimeout(() => {
        if (!settled) {
          try {
            socket.close();
          } catch {
            // Ignore
          }
          if (this.ws === socket) {
            this.ws = null;
          }
          finish(false);
        }
      }, WS_CONNECT_TIMEOUT_MS);

      this.ws = socket;

      socket.addEventListener('open', () => {
        if (settled || this.ws !== socket) {
          try {
            socket.close();
          } catch {
            // Ignore
          }
          return;
        }
        this.transport = 'ws';
        this.relayMode = 'server_sim';
        this.setStatus('connected');
        this.startPingLoop();
        this.send({ type: 'list_rooms' });
        finish(true);
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
        if (!settled) {
          finish(false);
          return;
        }
        this.stopHostSim();
        this.transport = 'none';
        this.stopPingLoop();
        const hadRoom = this.currentRoom !== null;
        this.currentRoom = null;
        this.yourFighterId = null;
        if (hadRoom) {
          this.callbacks.onRoomUpdated?.(null);
        }
        this.setStatus('disconnected');
      });

      socket.addEventListener('error', () => {
        if (this.ws !== socket) return;
        if (!settled) {
          try {
            socket.close();
          } catch {
            // Ignore
          }
          this.ws = null;
          finish(false);
        }
      });
    });
  }

  private async tryHttpEndpointStyle(
    style: 'rest' | 'php'
  ): Promise<{
    clientId: string;
    messages: ServerMsg[];
    rtt: number;
  } | null> {
    try {
      this.httpEndpointStyle = style;
      const startedAt = performance.now();
      const res = await fetch(this.buildHttpEndpoint('connect'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        cache: 'no-store',
      });
      if (!res.ok) return null;
      const text = await res.text();
      if (!text || text.trimStart().startsWith('<')) return null;
      const data = JSON.parse(text) as {
        clientId?: string;
        messages?: ServerMsg[];
      };
      if (!data.clientId) return null;
      return {
        clientId: data.clientId,
        messages: Array.isArray(data.messages) ? data.messages : [],
        rtt: Math.max(1, Math.round(performance.now() - startedAt)),
      };
    } catch {
      return null;
    }
  }

  private async tryConnectHttpFallback(): Promise<boolean> {
    const connected =
      (await this.tryHttpEndpointStyle('rest')) ??
      (await this.tryHttpEndpointStyle('php'));

    if (!connected) {
      return false;
    }

    this.transport = 'http';
    this.clientId = connected.clientId;
    this.httpOutbox = [];
    this.httpFailures = 0;
    this.pingMs = connected.rtt;
    this.setStatus('connected');
    this.callbacks.onPingUpdate?.(this.pingMs);

    for (const msg of connected.messages) {
      this.handleServerMessage(msg);
    }

    this.startPingLoop();
    this.scheduleHttpPoll(80);
    return true;
  }

  private scheduleHttpPoll(delayMs?: number): void {
    if (this.transport !== 'http' || this.status !== 'connected') return;
    if (this.httpPollTimer !== null) {
      clearTimeout(this.httpPollTimer);
      this.httpPollTimer = null;
    }
    const interval =
      delayMs ??
      (this.currentRoom?.phase === 'in_match'
        ? HTTP_MATCH_POLL_MS
        : this.currentRoom
        ? HTTP_ROOM_LOBBY_POLL_MS
        : HTTP_BROWSER_POLL_MS);
    this.httpPollTimer = setTimeout(() => {
      this.httpPollTimer = null;
      void this.flushHttpSync();
    }, interval);
  }

  private async flushHttpSync(): Promise<void> {
    if (
      this.transport !== 'http' ||
      this.status !== 'connected' ||
      !this.clientId
    ) {
      return;
    }
    if (this.httpInFlight) {
      this.httpPendingImmediate = true;
      return;
    }

    this.httpInFlight = true;
    this.httpPendingImmediate = false;
    const outgoing = this.httpOutbox.splice(0);

    try {
      const res = await fetch(this.buildHttpEndpoint('sync'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: this.clientId,
          messages: outgoing,
        }),
        cache: 'no-store',
      });

      if (res.status === 410) {
        this.handleHttpDisconnect(
          'Сессия истекла. Нажмите «Обновить» для переподключения.'
        );
        return;
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      this.httpFailures = 0;
      const payload = (await res.json()) as { messages?: ServerMsg[] };
      if (Array.isArray(payload.messages)) {
        for (const msg of payload.messages) {
          this.handleServerMessage(msg);
        }
      }
    } catch {
      this.httpFailures += 1;
      if (this.httpFailures >= 6) {
        this.handleHttpDisconnect('Потеряна связь с сервером арены.');
        return;
      }
    } finally {
      this.httpInFlight = false;
    }

    if (this.transport === 'http' && this.status === 'connected') {
      if (this.httpPendingImmediate || this.httpOutbox.length > 0) {
        this.scheduleHttpPoll(8);
      } else {
        this.scheduleHttpPoll();
      }
    }
  }

  private handleHttpDisconnect(errMsg: string): void {
    this.stopHostSim();
    this.stopPingLoop();
    if (this.httpPollTimer !== null) {
      clearTimeout(this.httpPollTimer);
      this.httpPollTimer = null;
    }
    this.transport = 'none';
    this.clientId = null;
    const hadRoom = this.currentRoom !== null;
    this.currentRoom = null;
    this.yourFighterId = null;
    if (hadRoom) {
      this.callbacks.onRoomUpdated?.(null);
    }
    this.setStatus('error', errMsg);
  }

  public disconnect(): void {
    this.cleanupTransport(true);
  }

  private cleanupTransport(notifyStatus: boolean): void {
    this.stopHostSim();
    this.stopPingLoop();
    if (this.httpPollTimer !== null) {
      clearTimeout(this.httpPollTimer);
      this.httpPollTimer = null;
    }

    if (this.ws) {
      const sock = this.ws;
      this.ws = null;
      try {
        sock.close();
      } catch {
        // Ignore close error
      }
    }

    if (this.transport === 'http' && this.clientId) {
      const cid = this.clientId;
      fetch(this.buildHttpEndpoint('disconnect'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: cid }),
        keepalive: true,
      }).catch(() => {});
    }

    this.transport = 'none';
    this.clientId = null;
    this.httpOutbox = [];
    this.currentRoom = null;
    this.yourFighterId = null;
    if (notifyStatus) {
      this.setStatus('disconnected');
      this.callbacks.onRoomUpdated?.(null);
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
    if (this.transport === 'ws') {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(msg));
      }
      return;
    }

    if (this.transport === 'http' && this.status === 'connected') {
      if (msg.type === 'input') {
        for (let i = this.httpOutbox.length - 1; i >= 0; i--) {
          if (this.httpOutbox[i].type === 'input') {
            this.httpOutbox[i] = msg;
            return;
          }
        }
        this.httpOutbox.push(msg);
        return;
      }

      if (
        msg.type === 'host_snapshot' &&
        msg.events.length === 0 &&
        msg.jumps.length === 0 &&
        msg.dodges.length === 0 &&
        msg.landings.length === 0 &&
        !msg.enteredFinalPhase
      ) {
        for (let i = this.httpOutbox.length - 1; i >= 0; i--) {
          const prev = this.httpOutbox[i];
          if (
            prev.type === 'host_snapshot' &&
            prev.events.length === 0 &&
            prev.jumps.length === 0 &&
            prev.dodges.length === 0 &&
            prev.landings.length === 0 &&
            !prev.enteredFinalPhase
          ) {
            this.httpOutbox[i] = msg;
            return;
          }
        }
        this.httpOutbox.push(msg);
        return;
      }

      this.httpOutbox.push(msg);
      if (msg.type !== 'ping' && msg.type !== 'host_snapshot') {
        void this.flushHttpSync();
      }
    }
  }

  private startHostSim(msg: Extract<ServerMsg, { type: 'host_bootstrap_sim' }>): void {
    this.stopHostSim();

    const sim = new AuthoritativeMatchSim();
    sim.start(msg.roster, msg.fillBots);
    this.hostSim = sim;
    this.hostSimTick = 0;
    this.hostSimAccum = 0;
    this.hostSimLastNow = performance.now();

    const snap0 = sim.buildSnapshot(0);
    // Notify guests immediately through the PHP relay
    this.send({
      type: 'host_match_init',
      matchGeneration: msg.matchGeneration,
      snapshot: snap0,
    });

    // Trigger local match start immediately for Host
    this.handleServerMessage({
      type: 'match_started',
      matchGeneration: msg.matchGeneration,
      roomCode: msg.roomCode,
      yourFighterId: msg.yourFighterId,
      snapshot: snap0,
    });

    this.hostSimTimer = setInterval(() => this.tickHostSim(), 1000 / 60);
  }

  private stopHostSim(): void {
    if (this.hostSimTimer !== null) {
      clearInterval(this.hostSimTimer);
      this.hostSimTimer = null;
    }
    this.hostSim = null;
    this.hostLocalEvents = [];
    this.hostLocalFootsteps = [];
    this.hostLocalJumps = [];
    this.hostLocalDodges = [];
    this.hostLocalLandings = [];
    this.hostLocalFinalPhase = false;
    this.hostRelayEvents = [];
    this.hostRelayFootsteps = [];
    this.hostRelayJumps = [];
    this.hostRelayDodges = [];
    this.hostRelayLandings = [];
    this.hostRelayFinalPhase = false;
  }

  private tickHostSim(): void {
    if (!this.hostSim) return;
    if (this.hostSim.phase === 'MatchFinished') {
      this.stopHostSim();
      return;
    }

    const now = performance.now();
    const elapsed = Math.min(0.1, Math.max(0, (now - this.hostSimLastNow) / 1000));
    this.hostSimLastNow = now;
    this.hostSimAccum += elapsed;

    while (this.hostSimAccum >= HOST_SIM_DT && this.hostSim) {
      this.hostSimAccum -= HOST_SIM_DT;
      this.hostSimTick += 1;

      const stepRes = this.hostSim.step(HOST_SIM_DT);

      if (stepRes.events.length > 0) {
        this.hostLocalEvents.push(...stepRes.events);
        this.hostRelayEvents.push(...stepRes.events);
      }
      if (stepRes.footsteps.length > 0) {
        this.hostLocalFootsteps.push(...stepRes.footsteps);
        this.hostRelayFootsteps.push(...stepRes.footsteps);
      }
      if (stepRes.jumps.length > 0) {
        this.hostLocalJumps.push(...stepRes.jumps);
        this.hostRelayJumps.push(...stepRes.jumps);
      }
      if (stepRes.dodges.length > 0) {
        this.hostLocalDodges.push(...stepRes.dodges);
        this.hostRelayDodges.push(...stepRes.dodges);
      }
      if (stepRes.landings.length > 0) {
        this.hostLocalLandings.push(...stepRes.landings);
        this.hostRelayLandings.push(...stepRes.landings);
      }
      if (stepRes.enteredFinalPhase) {
        this.hostLocalFinalPhase = true;
        this.hostRelayFinalPhase = true;
      }

      const hasLocalImpulse =
        this.hostLocalEvents.length > 0 ||
        this.hostLocalJumps.length > 0 ||
        this.hostLocalDodges.length > 0 ||
        this.hostLocalFinalPhase ||
        stepRes.phaseChangedTo !== null;

      if (this.hostSimTick % 2 === 0 || hasLocalImpulse) {
        const snapshot = this.hostSim.buildSnapshot(this.hostSimTick);
        this.callbacks.onSnapshot?.({
          type: 'snapshot',
          snapshot,
          events: this.hostLocalEvents.splice(0),
          footsteps: this.hostLocalFootsteps.splice(0),
          jumps: this.hostLocalJumps.splice(0),
          dodges: this.hostLocalDodges.splice(0),
          landings: this.hostLocalLandings.splice(0),
          enteredFinalPhase: this.hostLocalFinalPhase,
        });
        this.hostLocalFinalPhase = false;
      }

      const hasRelayImpulse =
        this.hostRelayEvents.length > 0 ||
        this.hostRelayJumps.length > 0 ||
        this.hostRelayDodges.length > 0 ||
        this.hostRelayFinalPhase ||
        stepRes.phaseChangedTo !== null;

      if (this.hostSimTick % 3 === 0 || hasRelayImpulse) {
        const snapshot = this.hostSim.buildSnapshot(this.hostSimTick);
        this.send({
          type: 'host_snapshot',
          snapshot,
          events: this.hostRelayEvents.splice(0),
          footsteps: this.hostRelayFootsteps.splice(0),
          jumps: this.hostRelayJumps.splice(0),
          dodges: this.hostRelayDodges.splice(0),
          landings: this.hostRelayLandings.splice(0),
          enteredFinalPhase: this.hostRelayFinalPhase,
        });
        this.hostRelayFinalPhase = false;
        if (hasRelayImpulse) {
          void this.flushHttpSync();
        }
      }

      if (stepRes.phaseChangedTo === 'MatchFinished') {
        break;
      }
    }
  }

  public requestRooms(): void {
    if (!this.isConnected()) {
      void this.connect();
      return;
    }
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
    this.stopHostSim();
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
    this.stopHostSim();
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

    const packet: ClientInputPacket = {
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
    };

    // If this client is running Host-Authoritative Simulation, feed input straight into local sim at 0ms latency!
    if (this.hostSim && this.yourFighterId) {
      this.hostSim.submitInput(this.yourFighterId, packet);
      return;
    }

    this.inputSendAccum += dt;
    const minInterval = this.transport === 'http' ? 0.04 : 0.03;
    if (!urgent && this.inputSendAccum < minInterval) {
      return;
    }
    this.inputSendAccum = 0;

    this.send({
      type: 'input',
      ...packet,
    });

    if (urgent && this.transport === 'http') {
      void this.flushHttpSync();
    }
  }

  private handleServerMessage(msg: ServerMsg): void {
    switch (msg.type) {
      case 'welcome':
        this.clientId = msg.clientId;
        if (msg.relayMode) {
          this.relayMode = msg.relayMode;
        }
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
        this.stopHostSim();
        this.currentRoom = msg.room;
        this.callbacks.onReturnedToLobby?.(msg.room);
        if (this.transport === 'http') {
          this.scheduleHttpPoll(HTTP_ROOM_LOBBY_POLL_MS);
        }
        break;
      case 'room_left':
        this.stopHostSim();
        this.currentRoom = null;
        this.yourFighterId = null;
        this.callbacks.onRoomUpdated?.(null);
        break;
      case 'error':
        this.callbacks.onErrorMsg?.(msg.message);
        break;
      case 'host_bootstrap_sim':
        this.startHostSim(msg);
        break;
      case 'relay_guest_input':
        if (this.hostSim) {
          this.hostSim.submitInput(msg.fighterId, msg.input);
        }
        break;
      case 'relay_guest_left':
        if (this.hostSim) {
          const deathEv = this.hostSim.eliminateDisconnectedFighter(
            msg.fighterId
          );
          if (deathEv) {
            this.hostLocalEvents.push(deathEv);
            this.hostRelayEvents.push(deathEv);
          }
        }
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
        if (this.transport === 'http') {
          this.scheduleHttpPoll(HTTP_MATCH_POLL_MS);
        }
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
