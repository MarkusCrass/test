import type {
  IncomingMessage,
  Server as HttpServer,
  ServerResponse,
} from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import { CLASS_ORDER, KnightClassId } from '../src/config/classes';
import { CombatEvent } from '../src/core/CombatSystem';
import { AuthoritativeMatchSim } from '../src/net/MultiplayerRoomSim';
import {
  ClientMsg,
  MAX_PLAYERS_PER_ROOM,
  RoomLobbyState,
  RoomSummary,
  ServerMsg,
} from '../src/net/protocol';

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SIM_DT = 1 / 60;
const HTTP_SESSION_TIMEOUT_MS = 18_000;
const MAX_HTTP_OUTBOX = 48;

interface ClientSession {
  clientId: string;
  transport: 'ws' | 'http';
  ws: WebSocket | null;
  httpOutbox: ServerMsg[];
  lastSeenAt: number;
  name: string;
  classId: KnightClassId;
  ready: boolean;
  pingMs: number;
  roomCode: string | null;
  fighterId: string;
}

interface RoomInstance {
  roomCode: string;
  hostClientId: string;
  isPublic: boolean;
  fillBots: boolean;
  phase: 'lobby' | 'in_match';
  matchGeneration: number;
  players: ClientSession[];
  sim: AuthoritativeMatchSim | null;
  serverTick: number;
  pendingEvents: CombatEvent[];
  pendingFootsteps: string[];
  pendingJumps: string[];
  pendingDodges: string[];
  pendingLandings: Array<{ id: string; x: number; y: number; z: number }>;
  pendingFinalPhase: boolean;
}

function sanitizeName(raw: unknown, fallbackNum: number): string {
  if (typeof raw !== 'string') return `Рыцарь #${fallbackNum}`;
  const cleaned = raw
    .replace(/[\r\n\t<>]/g, '')
    .trim()
    .slice(0, 18);
  return cleaned.length >= 2 ? cleaned : `Рыцарь #${fallbackNum}`;
}

function sanitizeClassId(raw: unknown): KnightClassId {
  if (typeof raw === 'string' && (CLASS_ORDER as string[]).includes(raw)) {
    return raw as KnightClassId;
  }
  return 'sword';
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk.toString();
      if (raw.length > 65536) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  const payload = Buffer.from(JSON.stringify(data), 'utf8');
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Length', payload.byteLength);
  res.end(payload);
}

export class MultiplayerHub {
  private readonly wss: WebSocketServer;
  private readonly clients = new Map<string, ClientSession>();
  private readonly rooms = new Map<string, RoomInstance>();
  private nextClientNum = 1;
  private simLoopTimer: ReturnType<typeof setInterval> | null = null;
  private pruneTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.wss = new WebSocketServer({ noServer: true });
    this.wss.on('connection', (ws: WebSocket) => this.onSocketConnected(ws));
    this.pruneTimer = setInterval(
      () => this.pruneInactiveHttpSessions(),
      4000
    );
    this.pruneTimer.unref?.();
  }

  public handleUpgrade(
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer
  ): boolean {
    const pathname = (req.url ?? '/').split('?')[0];
    if (pathname !== '/ws') {
      return false;
    }
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.wss.emit('connection', ws, req);
    });
    return true;
  }

  public handleApiRequest(req: IncomingMessage, res: ServerResponse): boolean {
    const pathname = (req.url ?? '/').split('?')[0];

    if (req.method === 'GET' && pathname === '/api/rooms') {
      sendJson(res, 200, {
        status: 'ok',
        onlinePlayers: this.clients.size,
        rooms: this.getPublicRoomSummaries(),
      });
      return true;
    }

    if (req.method === 'POST' && pathname === '/api/mp/connect') {
      const session = this.createSession('http', null);
      console.log(`[MP Hub] HTTP client connected: ${session.clientId}`);
      this.sendSession(session, {
        type: 'welcome',
        clientId: session.clientId,
        rooms: this.getPublicRoomSummaries(),
      });
      sendJson(res, 200, {
        clientId: session.clientId,
        messages: session.httpOutbox.splice(0),
      });
      return true;
    }

    if (req.method === 'POST' && pathname === '/api/mp/sync') {
      readJsonBody(req)
        .then((body) => {
          const obj = (body ?? {}) as {
            clientId?: string;
            messages?: ClientMsg[];
          };
          const session = obj.clientId
            ? this.clients.get(obj.clientId)
            : undefined;
          if (!session || session.transport !== 'http') {
            sendJson(res, 410, { error: 'session_expired' });
            return;
          }
          session.lastSeenAt = Date.now();
          if (Array.isArray(obj.messages)) {
            for (const msg of obj.messages) {
              if (msg && typeof msg === 'object' && 'type' in msg) {
                this.onClientMessage(session, msg);
              }
            }
          }
          sendJson(res, 200, {
            messages: session.httpOutbox.splice(0),
          });
        })
        .catch(() => {
          sendJson(res, 400, { error: 'bad_request' });
        });
      return true;
    }

    if (req.method === 'POST' && pathname === '/api/mp/disconnect') {
      readJsonBody(req)
        .then((body) => {
          const obj = (body ?? {}) as { clientId?: string };
          if (obj.clientId) {
            const session = this.clients.get(obj.clientId);
            if (session) {
              this.leaveCurrentRoom(session, false);
              this.clients.delete(session.clientId);
            }
          }
          sendJson(res, 200, { ok: true });
        })
        .catch(() => {
          sendJson(res, 200, { ok: false });
        });
      return true;
    }

    return false;
  }

  public close(): void {
    if (this.simLoopTimer) {
      clearInterval(this.simLoopTimer);
      this.simLoopTimer = null;
    }
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }
    for (const session of this.clients.values()) {
      try {
        session.ws?.close();
      } catch {
        // Ignore
      }
    }
    this.clients.clear();
    this.rooms.clear();
    this.wss.close();
  }

  private createSession(
    transport: 'ws' | 'http',
    ws: WebSocket | null
  ): ClientSession {
    const num = this.nextClientNum++;
    const clientId = `c_${num}`;
    const session: ClientSession = {
      clientId,
      transport,
      ws,
      httpOutbox: [],
      lastSeenAt: Date.now(),
      name: `Рыцарь #${num}`,
      classId: 'sword',
      ready: true,
      pingMs: 14,
      roomCode: null,
      fighterId: `human_${num}`,
    };
    this.clients.set(clientId, session);
    return session;
  }

  private pruneInactiveHttpSessions(): void {
    const now = Date.now();
    for (const [id, session] of this.clients.entries()) {
      if (
        session.transport === 'http' &&
        now - session.lastSeenAt > HTTP_SESSION_TIMEOUT_MS
      ) {
        this.leaveCurrentRoom(session, false);
        this.clients.delete(id);
      }
    }
  }

  private onSocketConnected(ws: WebSocket): void {
    const session = this.createSession('ws', ws);
    console.log(`[MP Hub] WS client connected: ${session.clientId}`);

    this.sendSession(session, {
      type: 'welcome',
      clientId: session.clientId,
      rooms: this.getPublicRoomSummaries(),
    });

    ws.on('message', (data) => {
      session.lastSeenAt = Date.now();
      let parsed: ClientMsg;
      try {
        const text = typeof data === 'string' ? data : data.toString('utf8');
        parsed = JSON.parse(text) as ClientMsg;
      } catch {
        return;
      }
      this.onClientMessage(session, parsed);
    });

    ws.on('close', () => {
      this.leaveCurrentRoom(session, false);
      this.clients.delete(session.clientId);
    });

    ws.on('error', () => {
      // Handled on close
    });
  }

  private onClientMessage(session: ClientSession, msg: ClientMsg): void {
    const fallbackNum =
      Number.parseInt(session.clientId.replace('c_', ''), 10) || 1;

    switch (msg.type) {
      case 'ping': {
        if (
          typeof msg.lastPingMs === 'number' &&
          Number.isFinite(msg.lastPingMs) &&
          msg.lastPingMs > 0
        ) {
          session.pingMs = Math.min(999, Math.round(msg.lastPingMs));
        }
        this.sendSession(session, {
          type: 'pong',
          clientTime: msg.clientTime,
          serverTime: Date.now(),
        });
        break;
      }

      case 'list_rooms': {
        this.sendSession(session, {
          type: 'rooms_list',
          rooms: this.getPublicRoomSummaries(),
        });
        break;
      }

      case 'create_room': {
        this.leaveCurrentRoom(session, false);
        session.name = sanitizeName(msg.playerName, fallbackNum);
        session.classId = sanitizeClassId(msg.classId);
        session.ready = true;

        const room = this.createRoomInstance(
          session,
          Boolean(msg.isPublic),
          Boolean(msg.fillBots)
        );
        console.log(
          `[MP Hub] Room ${room.roomCode} created by ${session.name} (bots=${room.fillBots})`
        );
        this.sendSession(session, {
          type: 'room_joined',
          room: this.serializeRoomLobby(room),
          yourFighterId: session.fighterId,
        });
        this.broadcastPublicRoomsToLobbyBrowsers();
        break;
      }

      case 'join_room': {
        const code = String(msg.roomCode ?? '')
          .trim()
          .toUpperCase();
        const room = this.rooms.get(code);
        if (!room) {
          this.sendSession(session, {
            type: 'error',
            message: `Комната «${code || '????'}» не найдена.`,
          });
          return;
        }
        if (room.phase !== 'lobby') {
          this.sendSession(session, {
            type: 'error',
            message:
              'Бой в этой комнате уже начался. Дождитесь завершения раунда.',
          });
          return;
        }
        if (room.players.length >= MAX_PLAYERS_PER_ROOM) {
          this.sendSession(session, {
            type: 'error',
            message: `Комната заполнена (${MAX_PLAYERS_PER_ROOM}/${MAX_PLAYERS_PER_ROOM}).`,
          });
          return;
        }

        this.leaveCurrentRoom(session, false);
        session.name = sanitizeName(msg.playerName, fallbackNum);
        session.classId = sanitizeClassId(msg.classId);
        session.ready = true;
        session.roomCode = room.roomCode;
        room.players.push(session);

        this.sendSession(session, {
          type: 'room_joined',
          room: this.serializeRoomLobby(room),
          yourFighterId: session.fighterId,
        });
        this.broadcastRoomUpdated(room, session.clientId);
        this.broadcastPublicRoomsToLobbyBrowsers();
        break;
      }

      case 'quick_join': {
        this.leaveCurrentRoom(session, false);
        session.name = sanitizeName(msg.playerName, fallbackNum);
        session.classId = sanitizeClassId(msg.classId);
        session.ready = true;

        let targetRoom: RoomInstance | null = null;
        for (const r of this.rooms.values()) {
          if (
            r.isPublic &&
            r.phase === 'lobby' &&
            r.players.length < MAX_PLAYERS_PER_ROOM
          ) {
            targetRoom = r;
            break;
          }
        }

        if (!targetRoom) {
          targetRoom = this.createRoomInstance(session, true, true);
          this.sendSession(session, {
            type: 'room_joined',
            room: this.serializeRoomLobby(targetRoom),
            yourFighterId: session.fighterId,
          });
        } else {
          session.roomCode = targetRoom.roomCode;
          targetRoom.players.push(session);
          this.sendSession(session, {
            type: 'room_joined',
            room: this.serializeRoomLobby(targetRoom),
            yourFighterId: session.fighterId,
          });
          this.broadcastRoomUpdated(targetRoom, session.clientId);
        }
        this.broadcastPublicRoomsToLobbyBrowsers();
        break;
      }

      case 'leave_room': {
        this.leaveCurrentRoom(session, true);
        break;
      }

      case 'select_class': {
        const room = this.getSessionRoom(session);
        session.classId = sanitizeClassId(msg.classId);
        if (room && room.phase === 'lobby') {
          this.broadcastRoomUpdated(room);
        }
        break;
      }

      case 'set_name': {
        const room = this.getSessionRoom(session);
        session.name = sanitizeName(msg.playerName, fallbackNum);
        if (room && room.phase === 'lobby') {
          this.broadcastRoomUpdated(room);
          this.broadcastPublicRoomsToLobbyBrowsers();
        }
        break;
      }

      case 'set_ready': {
        const room = this.getSessionRoom(session);
        session.ready = Boolean(msg.ready);
        if (room && room.phase === 'lobby') {
          this.broadcastRoomUpdated(room);
        }
        break;
      }

      case 'set_room_options': {
        const room = this.getSessionRoom(session);
        if (
          !room ||
          room.hostClientId !== session.clientId ||
          room.phase !== 'lobby'
        ) {
          return;
        }
        room.fillBots = Boolean(msg.fillBots);
        room.isPublic = Boolean(msg.isPublic);
        this.broadcastRoomUpdated(room);
        this.broadcastPublicRoomsToLobbyBrowsers();
        break;
      }

      case 'start_match': {
        const room = this.getSessionRoom(session);
        if (!room || room.phase !== 'lobby') return;
        if (room.hostClientId !== session.clientId) {
          this.sendSession(session, {
            type: 'error',
            message: 'Только глава комнаты может начать поединок.',
          });
          return;
        }
        if (!room.fillBots && room.players.length < 2) {
          this.sendSession(session, {
            type: 'error',
            message:
              'Нужно минимум 2 игрока (или включите «Дополнить ботами до 5»).',
          });
          return;
        }
        this.launchRoomMatch(room);
        break;
      }

      case 'rematch': {
        const room = this.getSessionRoom(session);
        if (!room) return;
        if (room.hostClientId === session.clientId) {
          if (room.phase === 'lobby' || room.sim?.phase === 'MatchFinished') {
            this.launchRoomMatch(room);
          }
        } else {
          session.ready = true;
          if (room.phase === 'lobby') {
            this.broadcastRoomUpdated(room);
          }
        }
        break;
      }

      case 'return_to_lobby': {
        const room = this.getSessionRoom(session);
        if (!room) return;
        if (room.hostClientId === session.clientId) {
          room.phase = 'lobby';
          room.sim = null;
          for (const p of room.players) {
            p.ready = true;
          }
          const lobbyState = this.serializeRoomLobby(room);
          for (const p of room.players) {
            this.sendSession(p, {
              type: 'returned_to_lobby',
              room: lobbyState,
            });
          }
          this.ensureSimLoopState();
          this.broadcastPublicRoomsToLobbyBrowsers();
        }
        break;
      }

      case 'input': {
        const room = this.getSessionRoom(session);
        if (!room || room.phase !== 'in_match' || !room.sim) return;
        room.sim.submitInput(session.fighterId, {
          moveX: msg.moveX,
          moveZ: msg.moveZ,
          aimYaw: msg.aimYaw,
          sprint: msg.sprint,
          attackHeld: msg.attackHeld,
          blockHeld: msg.blockHeld,
          jumpSeq: msg.jumpSeq,
          dodgeSeq: msg.dodgeSeq,
          ability1Seq: msg.ability1Seq,
          ability2Seq: msg.ability2Seq,
        });
        break;
      }
    }
  }

  private createRoomInstance(
    host: ClientSession,
    isPublic: boolean,
    fillBots: boolean
  ): RoomInstance {
    const roomCode = this.generateUniqueRoomCode();
    host.roomCode = roomCode;
    const room: RoomInstance = {
      roomCode,
      hostClientId: host.clientId,
      isPublic,
      fillBots,
      phase: 'lobby',
      matchGeneration: 0,
      players: [host],
      sim: null,
      serverTick: 0,
      pendingEvents: [],
      pendingFootsteps: [],
      pendingJumps: [],
      pendingDodges: [],
      pendingLandings: [],
      pendingFinalPhase: false,
    };
    this.rooms.set(roomCode, room);
    return room;
  }

  private generateUniqueRoomCode(): string {
    for (let attempt = 0; attempt < 200; attempt++) {
      let code = '';
      for (let i = 0; i < 4; i++) {
        const idx = Math.floor(Math.random() * ROOM_CODE_ALPHABET.length);
        code += ROOM_CODE_ALPHABET[idx];
      }
      if (!this.rooms.has(code)) return code;
    }
    return `R${Math.floor(100 + Math.random() * 900)}`;
  }

  private leaveCurrentRoom(
    session: ClientSession,
    notifyCaller: boolean
  ): void {
    const code = session.roomCode;
    if (!code) return;
    session.roomCode = null;

    if (notifyCaller) {
      this.sendSession(session, { type: 'room_left' });
      this.sendSession(session, {
        type: 'rooms_list',
        rooms: this.getPublicRoomSummaries(),
      });
    }

    const room = this.rooms.get(code);
    if (!room) return;

    room.players = room.players.filter((p) => p.clientId !== session.clientId);

    if (room.players.length === 0) {
      this.rooms.delete(code);
      this.ensureSimLoopState();
      this.broadcastPublicRoomsToLobbyBrowsers();
      return;
    }

    if (room.hostClientId === session.clientId) {
      room.hostClientId = room.players[0].clientId;
      room.players[0].ready = true;
    }

    if (room.phase === 'in_match' && room.sim) {
      const deathEv = room.sim.eliminateDisconnectedFighter(session.fighterId);
      if (deathEv) {
        room.pendingEvents.push(deathEv);
      }
    }

    this.broadcastRoomUpdated(room);
    this.broadcastPublicRoomsToLobbyBrowsers();
  }

  private launchRoomMatch(room: RoomInstance): void {
    room.phase = 'in_match';
    room.matchGeneration += 1;
    room.serverTick = 0;
    room.pendingEvents = [];
    room.pendingFootsteps = [];
    room.pendingJumps = [];
    room.pendingDodges = [];
    room.pendingLandings = [];
    room.pendingFinalPhase = false;

    const sim = new AuthoritativeMatchSim();
    sim.start(
      room.players.map((p) => ({
        fighterId: p.fighterId,
        name: p.name,
        classId: p.classId,
      })),
      room.fillBots
    );
    room.sim = sim;

    console.log(
      `[MP Hub] Match #${room.matchGeneration} started in ${room.roomCode} (${room.players.length} human, ${sim.fighters.length} total)`
    );

    const initialSnapshot = sim.buildSnapshot(0);
    for (const p of room.players) {
      this.sendSession(p, {
        type: 'match_started',
        matchGeneration: room.matchGeneration,
        roomCode: room.roomCode,
        yourFighterId: p.fighterId,
        snapshot: initialSnapshot,
      });
    }

    this.ensureSimLoopState();
    this.broadcastPublicRoomsToLobbyBrowsers();
  }

  private ensureSimLoopState(): void {
    let anyActive = false;
    for (const r of this.rooms.values()) {
      if (r.phase === 'in_match' && r.sim) {
        anyActive = true;
        break;
      }
    }

    if (anyActive && !this.simLoopTimer) {
      this.simLoopTimer = setInterval(
        () => this.tickActiveMatches(),
        1000 / 60
      );
    } else if (!anyActive && this.simLoopTimer) {
      clearInterval(this.simLoopTimer);
      this.simLoopTimer = null;
    }
  }

  private tickActiveMatches(): void {
    for (const room of this.rooms.values()) {
      if (room.phase !== 'in_match' || !room.sim) continue;
      if (room.sim.phase === 'MatchFinished') continue;

      room.serverTick += 1;
      const stepRes = room.sim.step(SIM_DT);

      if (stepRes.events.length > 0) {
        room.pendingEvents.push(...stepRes.events);
      }
      if (stepRes.footsteps.length > 0) {
        room.pendingFootsteps.push(...stepRes.footsteps);
      }
      if (stepRes.jumps.length > 0) {
        room.pendingJumps.push(...stepRes.jumps);
      }
      if (stepRes.dodges.length > 0) {
        room.pendingDodges.push(...stepRes.dodges);
      }
      if (stepRes.landings.length > 0) {
        room.pendingLandings.push(...stepRes.landings);
      }
      if (stepRes.enteredFinalPhase) {
        room.pendingFinalPhase = true;
      }

      const hasImmediateImpulse =
        room.pendingEvents.length > 0 ||
        room.pendingJumps.length > 0 ||
        room.pendingDodges.length > 0 ||
        room.pendingFinalPhase ||
        stepRes.phaseChangedTo !== null;

      if (room.serverTick % 2 === 0 || hasImmediateImpulse) {
        const snapshot = room.sim.buildSnapshot(room.serverTick);
        const msg: ServerMsg = {
          type: 'snapshot',
          snapshot,
          events: [...room.pendingEvents],
          footsteps: [...room.pendingFootsteps],
          jumps: [...room.pendingJumps],
          dodges: [...room.pendingDodges],
          landings: [...room.pendingLandings],
          enteredFinalPhase: room.pendingFinalPhase,
        };
        for (const p of room.players) {
          this.sendSession(p, msg);
        }

        room.pendingEvents = [];
        room.pendingFootsteps = [];
        room.pendingJumps = [];
        room.pendingDodges = [];
        room.pendingLandings = [];
        room.pendingFinalPhase = false;
      }
    }
  }

  private getSessionRoom(session: ClientSession): RoomInstance | null {
    if (!session.roomCode) return null;
    return this.rooms.get(session.roomCode) ?? null;
  }

  private serializeRoomLobby(room: RoomInstance): RoomLobbyState {
    return {
      roomCode: room.roomCode,
      hostClientId: room.hostClientId,
      isPublic: room.isPublic,
      fillBots: room.fillBots,
      phase: room.phase,
      players: room.players.map((p) => ({
        clientId: p.clientId,
        fighterId: p.fighterId,
        name: p.name,
        classId: p.classId,
        ready: p.ready,
        isHost: p.clientId === room.hostClientId,
        pingMs: p.pingMs,
      })),
    };
  }

  public getPublicRoomSummaries(): RoomSummary[] {
    const out: RoomSummary[] = [];
    for (const r of this.rooms.values()) {
      if (!r.isPublic) continue;
      const host =
        r.players.find((p) => p.clientId === r.hostClientId) ?? r.players[0];
      out.push({
        roomCode: r.roomCode,
        hostName: host ? host.name : 'Рыцарь',
        playerCount: r.players.length,
        maxPlayers: MAX_PLAYERS_PER_ROOM,
        fillBots: r.fillBots,
        phase: r.phase,
      });
    }
    return out;
  }

  private broadcastRoomUpdated(
    room: RoomInstance,
    excludeClientId?: string
  ): void {
    const payload: ServerMsg = {
      type: 'room_updated',
      room: this.serializeRoomLobby(room),
    };
    for (const p of room.players) {
      if (p.clientId === excludeClientId) continue;
      this.sendSession(p, payload);
    }
  }

  private broadcastPublicRoomsToLobbyBrowsers(): void {
    const rooms = this.getPublicRoomSummaries();
    const payload: ServerMsg = { type: 'rooms_list', rooms };
    for (const session of this.clients.values()) {
      if (!session.roomCode) {
        this.sendSession(session, payload);
      }
    }
  }

  private sendSession(session: ClientSession, msg: ServerMsg): void {
    if (session.transport === 'ws') {
      if (session.ws && session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(JSON.stringify(msg));
      }
      return;
    }

    // For HTTP transport: coalesce pure position-only snapshots when queue is backed up,
    // while ALWAYS preserving snapshots that carry events/jumps/dodges and all control messages!
    if (
      msg.type === 'snapshot' &&
      msg.events.length === 0 &&
      msg.jumps.length === 0 &&
      msg.dodges.length === 0 &&
      msg.landings.length === 0 &&
      !msg.enteredFinalPhase
    ) {
      for (let i = session.httpOutbox.length - 1; i >= 0; i--) {
        const prev = session.httpOutbox[i];
        if (
          prev.type === 'snapshot' &&
          prev.events.length === 0 &&
          prev.jumps.length === 0 &&
          prev.dodges.length === 0 &&
          prev.landings.length === 0 &&
          !prev.enteredFinalPhase
        ) {
          session.httpOutbox[i] = msg;
          return;
        }
      }
    }

    if (session.httpOutbox.length >= MAX_HTTP_OUTBOX) {
      session.httpOutbox.shift();
    }
    session.httpOutbox.push(msg);
  }
}

export function attachMultiplayerHub(httpServer: HttpServer): MultiplayerHub {
  const hub = new MultiplayerHub();
  httpServer.on('upgrade', (req, socket, head) => {
    hub.handleUpgrade(req, socket, head);
  });
  return hub;
}
