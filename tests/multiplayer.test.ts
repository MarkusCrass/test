import http from 'node:http';
import { describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { attachMultiplayerHub } from '../server/wsHub';
import { createEmptyIntent } from '../src/core/Fighter';
import { MatchManager } from '../src/core/MatchManager';
import {
  AuthoritativeMatchSim,
  ClientNetWorldSync,
} from '../src/net/MultiplayerRoomSim';
import { MultiplayerClient } from '../src/net/MultiplayerClient';
import { ClientMsg, ServerMsg } from '../src/net/protocol';

function waitForMsg<T extends ServerMsg['type']>(
  ws: WebSocket,
  type: T,
  timeoutMs = 3000
): Promise<Extract<ServerMsg, { type: T }>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMsg);
      reject(new Error(`Timed out waiting for ServerMsg "${type}"`));
    }, timeoutMs);

    const onMsg = (raw: WebSocket.RawData) => {
      const msg = JSON.parse(raw.toString()) as ServerMsg;
      if (msg.type === type) {
        clearTimeout(timer);
        ws.off('message', onMsg);
        resolve(msg as Extract<ServerMsg, { type: T }>);
      }
    };
    ws.on('message', onMsg);
  });
}

function sendClientMsg(ws: WebSocket, msg: ClientMsg): void {
  ws.send(JSON.stringify(msg));
}

describe('Online Multiplayer Simulation, Sync & WebSocket Hub', () => {
  it('keeps MatchManager in MultiplayerLobby across animation frames without false MatchFinished draw', () => {
    const match = new MatchManager();
    match.goToMultiplayerLobby();
    expect(match.state).toBe('MultiplayerLobby');
    expect(match.fighters).toHaveLength(0);

    for (let i = 0; i < 120; i++) {
      const out = match.update(1 / 60, createEmptyIntent(0));
      expect(out.stateChangedTo).toBeNull();
      expect(match.state).toBe('MultiplayerLobby');
      expect(match.finishReason).toBeNull();
    }
  });

  it('spawns 2 human players + 3 tactical bots when fillBots=true, or exact humans when fillBots=false', () => {
    const simWithBots = new AuthoritativeMatchSim();
    simWithBots.start(
      [
        { fighterId: 'human_1', name: 'Артур', classId: 'sword' },
        { fighterId: 'human_2', name: 'Ланселот', classId: 'spear' },
      ],
      true
    );
    expect(simWithBots.fighters).toHaveLength(5);
    expect(simWithBots.fighters.filter((f) => f.isHuman)).toHaveLength(2);
    expect(simWithBots.bots.size).toBe(3);

    const simPvpOnly = new AuthoritativeMatchSim();
    simPvpOnly.start(
      [
        { fighterId: 'human_1', name: 'Артур', classId: 'sword' },
        { fighterId: 'human_2', name: 'Ланселот', classId: 'spear' },
        { fighterId: 'human_3', name: 'Гавейн', classId: 'hammer' },
      ],
      false
    );
    expect(simPvpOnly.fighters).toHaveLength(3);
    expect(simPvpOnly.bots.size).toBe(0);
  });

  it('delivers lossless jump/ability sequences and sub-tick click-and-release light attacks', () => {
    const sim = new AuthoritativeMatchSim();
    sim.start(
      [
        { fighterId: 'human_1', name: 'Артур', classId: 'dual' },
        { fighterId: 'human_2', name: 'Ланселот', classId: 'hammer' },
      ],
      false
    );

    // Advance past 3s countdown
    for (let i = 0; i < 185; i++) {
      sim.step(1 / 60);
    }
    expect(sim.phase).toBe('InProgress');

    // Sub-tick click & release (<16ms): two packets arrive before step() runs
    sim.submitInput('human_1', {
      moveX: 0,
      moveZ: 0,
      aimYaw: 0,
      sprint: false,
      attackHeld: true,
      blockHeld: false,
      jumpSeq: 0,
      dodgeSeq: 0,
      ability1Seq: 0,
      ability2Seq: 0,
    });
    sim.submitInput('human_1', {
      moveX: 0,
      moveZ: 0,
      aimYaw: 0,
      sprint: false,
      attackHeld: false,
      blockHeld: false,
      jumpSeq: 0,
      dodgeSeq: 0,
      ability1Seq: 0,
      ability2Seq: 0,
    });
    sim.submitInput('human_2', {
      moveX: 0,
      moveZ: 1,
      aimYaw: 0,
      sprint: false,
      attackHeld: false,
      blockHeld: false,
      jumpSeq: 1,
      dodgeSeq: 0,
      ability1Seq: 0,
      ability2Seq: 0,
    });

    const tickOut = sim.step(1 / 60);
    const p1 = sim.fighters.find((f) => f.id === 'human_1')!;
    const p2 = sim.fighters.find((f) => f.id === 'human_2')!;
    expect(p1.state).toBe('Attacking');
    expect(tickOut.jumps).toContain('human_2');
    expect(p2.body.vy).toBeGreaterThan(5);
  });

  it('eliminates disconnected players mid-match and resolves last-standing winner', () => {
    const sim = new AuthoritativeMatchSim();
    sim.start(
      [
        { fighterId: 'human_1', name: 'Артур', classId: 'sword' },
        { fighterId: 'human_2', name: 'Мордред', classId: 'dual' },
      ],
      false
    );
    for (let i = 0; i < 185; i++) sim.step(1 / 60);
    expect(sim.phase).toBe('InProgress');

    const ev = sim.eliminateDisconnectedFighter('human_2');
    expect(ev?.type).toBe('death');
    expect(sim.phase).toBe('MatchFinished');
    expect(sim.winnerId).toBe('human_1');
    expect(sim.finishReason).toBe('last_standing');
  });

  it('reconciles snapshots onto MatchManager for non-first localPlayerId and enters Spectator on death', () => {
    const sim = new AuthoritativeMatchSim();
    sim.start(
      [
        { fighterId: 'human_1', name: 'Хост', classId: 'sword' },
        { fighterId: 'human_2', name: 'Гость', classId: 'spear' },
        { fighterId: 'human_3', name: 'Третий', classId: 'hammer' },
      ],
      false
    );
    for (let i = 0; i < 185; i++) sim.step(1 / 60);

    const match = new MatchManager();
    const sync = new ClientNetWorldSync();
    const snap1 = sim.buildSnapshot(10);

    sync.initMatchFromSnapshot(match, 'human_2', 1, snap1);
    expect(match.isOnlineMatch).toBe(true);
    expect(match.getPlayer()?.id).toBe('human_2');
    expect(match.state).toBe('InProgress');

    // Eliminate human_2 while human_1 and human_3 continue fighting
    const f2 = sim.fighters.find((f) => f.id === 'human_2')!;
    f2.takeRawDamage(999, 'human_1');
    sim.step(1 / 60);

    const snap2 = sim.buildSnapshot(12);
    const changed = sync.applySnapshot(match, snap2);
    expect(changed).toBe('PlayerEliminated');
    expect(match.state).toBe('PlayerEliminated');

    // Interpolate 60 FPS frame smoothly
    sync.interpolateFrame(match, 1 / 60);
    expect(Number.isFinite(match.fighters[0].body.x)).toBe(true);
  });

  it('runs full two-client WebSocket room creation, join, class change, match start, and live snapshots', async () => {
    const server = http.createServer((req, res) => {
      if (hub.handleApiRequest(req, res)) return;
      res.statusCode = 404;
      res.end();
    });
    const hub = attachMultiplayerHub(server);

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    if (!addr || typeof addr === 'string') {
      throw new Error('Failed to bind ephemeral server');
    }
    const baseWs = `ws://127.0.0.1:${addr.port}/ws`;
    const baseHttp = `http://127.0.0.1:${addr.port}`;

    const ws1 = new WebSocket(baseWs);
    const ws2 = new WebSocket(baseWs);

    try {
      const [w1, w2] = await Promise.all([
        waitForMsg(ws1, 'welcome'),
        waitForMsg(ws2, 'welcome'),
      ]);
      expect(w1.clientId).toBeTruthy();
      expect(w2.clientId).toBeTruthy();

      // Host creates public room without bots (pure 2-player PvP)
      const joined1P = waitForMsg(ws1, 'room_joined');
      const roomsBroadcastP = waitForMsg(ws2, 'rooms_list');
      sendClientMsg(ws1, {
        type: 'create_room',
        playerName: 'Сэр Роланд',
        classId: 'sword',
        isPublic: true,
        fillBots: false,
      });

      const joined1 = await joined1P;
      const roomsBroadcast = await roomsBroadcastP;
      const code = joined1.room.roomCode;
      expect(code).toHaveLength(4);
      expect(roomsBroadcast.rooms.some((r) => r.roomCode === code)).toBe(true);

      // Verify /api/rooms HTTP endpoint
      const apiRes = await fetch(`${baseHttp}/api/rooms`);
      expect(apiRes.status).toBe(200);
      const apiJson = (await apiRes.json()) as {
        status: string;
        onlinePlayers: number;
        rooms: Array<{ roomCode: string }>;
      };
      expect(apiJson.status).toBe('ok');
      expect(apiJson.onlinePlayers).toBe(2);
      expect(apiJson.rooms.some((r) => r.roomCode === code)).toBe(true);

      // Client 2 joins room by 4-char code
      const joined2P = waitForMsg(ws2, 'room_joined');
      const updated1P = waitForMsg(ws1, 'room_updated');
      sendClientMsg(ws2, {
        type: 'join_room',
        roomCode: code,
        playerName: 'Торвальд',
        classId: 'hammer',
      });

      const [joined2, updated1] = await Promise.all([joined2P, updated1P]);
      expect(joined2.room.players).toHaveLength(2);
      expect(updated1.room.players).toHaveLength(2);

      // Client 2 switches class to spear in lobby
      const classUpdP = waitForMsg(ws1, 'room_updated');
      sendClientMsg(ws2, { type: 'select_class', classId: 'spear' });
      const classUpd = await classUpdP;
      expect(
        classUpd.room.players.find((p) => p.clientId === w2.clientId)?.classId
      ).toBe('spear');

      // Host starts match — both receive match_started + live 30 Hz snapshots
      const start1P = waitForMsg(ws1, 'match_started');
      const start2P = waitForMsg(ws2, 'match_started');
      sendClientMsg(ws1, { type: 'start_match' });

      const [m1, m2] = await Promise.all([start1P, start2P]);
      expect(m1.yourFighterId).not.toBe(m2.yourFighterId);
      expect(m1.snapshot.fighters).toHaveLength(2);

      const snapP = waitForMsg(ws2, 'snapshot');
      sendClientMsg(ws1, {
        type: 'input',
        moveX: 0,
        moveZ: 1,
        aimYaw: 0.5,
        sprint: true,
        attackHeld: false,
        blockHeld: false,
        jumpSeq: 1,
        dodgeSeq: 0,
        ability1Seq: 0,
        ability2Seq: 0,
      });
      const snap = await snapP;
      expect(snap.snapshot.serverTick).toBeGreaterThan(0);
    } finally {
      ws1.close();
      ws2.close();
      hub.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('supports full HTTP fallback (/api/mp/connect & /api/mp/sync) when WebSocket upgrades are blocked', async () => {
    const server = http.createServer((req, res) => {
      if (hub.handleApiRequest(req, res)) return;
      res.statusCode = 404;
      res.end();
    });
    const hub = attachMultiplayerHub(server);

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    if (!addr || typeof addr === 'string') {
      throw new Error('Failed to bind ephemeral server');
    }
    const baseHttp = `http://127.0.0.1:${addr.port}`;

    try {
      const c1Res = await fetch(`${baseHttp}/api/mp/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const c1 = (await c1Res.json()) as {
        clientId: string;
        messages: ServerMsg[];
      };
      expect(c1.clientId).toBeTruthy();
      expect(c1.messages.some((m) => m.type === 'welcome')).toBe(true);

      // Create room with bots via HTTP sync
      const createRes = await fetch(`${baseHttp}/api/mp/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: c1.clientId,
          messages: [
            {
              type: 'create_room',
              playerName: 'Сэр Гавейн',
              classId: 'hammer',
              isPublic: true,
              fillBots: true,
            } satisfies ClientMsg,
          ],
        }),
      });
      const createJson = (await createRes.json()) as { messages: ServerMsg[] };
      const joined = createJson.messages.find((m) => m.type === 'room_joined');
      expect(joined).toBeDefined();

      // Start match via HTTP sync (1 human + 4 bots = 5 fighters)
      const startRes = await fetch(`${baseHttp}/api/mp/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: c1.clientId,
          messages: [{ type: 'start_match' } satisfies ClientMsg],
        }),
      });
      const startJson = (await startRes.json()) as { messages: ServerMsg[] };
      const started = startJson.messages.find(
        (m) => m.type === 'match_started'
      );
      expect(started).toBeDefined();
      if (started && started.type === 'match_started') {
        expect(started.snapshot.fighters).toHaveLength(5);
      }

      // Wait ~60ms for 60Hz loop to emit snapshots into HTTP outbox
      await new Promise((r) => setTimeout(r, 65));
      const pollRes = await fetch(`${baseHttp}/api/mp/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: c1.clientId, messages: [] }),
      });
      const pollJson = (await pollRes.json()) as { messages: ServerMsg[] };
      expect(pollJson.messages.some((m) => m.type === 'snapshot')).toBe(true);

      // Clean disconnect
      const discRes = await fetch(`${baseHttp}/api/mp/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: c1.clientId }),
      });
      expect(discRes.status).toBe(200);
    } finally {
      hub.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('runs Host-Authoritative MultiplayerClient sync over Beget /api/mp.php relay without Node WS', async () => {
    let nextId = 1;
    const clients = new Map<
      string,
      {
        clientId: string;
        fighterId: string;
        name: string;
        classId: 'sword' | 'dual' | 'spear' | 'hammer';
        roomCode: string | null;
        outbox: ServerMsg[];
      }
    >();
    const rooms = new Map<
      string,
      {
        roomCode: string;
        hostClientId: string;
        isPublic: boolean;
        fillBots: boolean;
        phase: 'lobby' | 'in_match';
        matchGeneration: number;
        players: string[];
      }
    >();

    // Minimal HTTP server speaking ONLY /api/mp.php?action=... (simulating Beget shared PHP hosting)
    const phpLikeServer = http.createServer((req, res) => {
      const urlObj = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (urlObj.pathname !== '/api/mp.php') {
        res.statusCode = 404;
        res.end('Not Found');
        return;
      }
      const action = urlObj.searchParams.get('action');
      let raw = '';
      req.on('data', (c) => (raw += c.toString()));
      req.on('end', () => {
        const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        res.setHeader('Content-Type', 'application/json; charset=utf-8');

        if (action === 'connect') {
          const n = nextId++;
          const cid = `c_${n}`;
          clients.set(cid, {
            clientId: cid,
            fighterId: `human_${n}`,
            name: `Knight ${n}`,
            classId: 'sword',
            roomCode: null,
            outbox: [],
          });
          res.end(
            JSON.stringify({
              clientId: cid,
              messages: [
                {
                  type: 'welcome',
                  clientId: cid,
                  rooms: [],
                  relayMode: 'host_sim',
                } satisfies ServerMsg,
              ],
            })
          );
          return;
        }

        if (action === 'sync') {
          const cid = String(body.clientId ?? '');
          const sess = clients.get(cid);
          if (!sess) {
            res.statusCode = 410;
            res.end(JSON.stringify({ error: 'expired' }));
            return;
          }
          const msgs = (body.messages as ClientMsg[] | undefined) ?? [];
          for (const m of msgs) {
            if (m.type === 'create_room') {
              sess.name = m.playerName;
              sess.classId = m.classId;
              sess.roomCode = 'BEGT';
              rooms.set('BEGT', {
                roomCode: 'BEGT',
                hostClientId: cid,
                isPublic: m.isPublic,
                fillBots: m.fillBots,
                phase: 'lobby',
                matchGeneration: 0,
                players: [cid],
              });
              sess.outbox.push({
                type: 'room_joined',
                yourFighterId: sess.fighterId,
                room: {
                  roomCode: 'BEGT',
                  hostClientId: cid,
                  isPublic: m.isPublic,
                  fillBots: m.fillBots,
                  phase: 'lobby',
                  players: [
                    {
                      clientId: cid,
                      fighterId: sess.fighterId,
                      name: sess.name,
                      classId: sess.classId,
                      ready: true,
                      isHost: true,
                      pingMs: 12,
                    },
                  ],
                },
              });
            } else if (m.type === 'join_room') {
              const r = rooms.get(m.roomCode)!;
              sess.name = m.playerName;
              sess.classId = m.classId;
              sess.roomCode = r.roomCode;
              r.players.push(cid);
              sess.outbox.push({
                type: 'room_joined',
                yourFighterId: sess.fighterId,
                room: {
                  roomCode: r.roomCode,
                  hostClientId: r.hostClientId,
                  isPublic: r.isPublic,
                  fillBots: r.fillBots,
                  phase: 'lobby',
                  players: r.players.map((p) => {
                    const pc = clients.get(p)!;
                    return {
                      clientId: p,
                      fighterId: pc.fighterId,
                      name: pc.name,
                      classId: pc.classId,
                      ready: true,
                      isHost: p === r.hostClientId,
                      pingMs: 12,
                    };
                  }),
                },
              });
            } else if (m.type === 'start_match') {
              const r = rooms.get(sess.roomCode!)!;
              r.phase = 'in_match';
              r.matchGeneration += 1;
              sess.outbox.push({
                type: 'host_bootstrap_sim',
                matchGeneration: r.matchGeneration,
                roomCode: r.roomCode,
                yourFighterId: sess.fighterId,
                fillBots: r.fillBots,
                roster: r.players.map((p) => {
                  const pc = clients.get(p)!;
                  return {
                    fighterId: pc.fighterId,
                    name: pc.name,
                    classId: pc.classId,
                  };
                }),
              });
            } else if (m.type === 'host_match_init') {
              const r = rooms.get(sess.roomCode!)!;
              for (const p of r.players) {
                if (p === cid) continue;
                const pc = clients.get(p)!;
                pc.outbox.push({
                  type: 'match_started',
                  matchGeneration: m.matchGeneration,
                  roomCode: r.roomCode,
                  yourFighterId: pc.fighterId,
                  snapshot: m.snapshot,
                });
              }
            } else if (m.type === 'host_snapshot') {
              const r = rooms.get(sess.roomCode!)!;
              for (const p of r.players) {
                if (p === cid) continue;
                clients.get(p)!.outbox.push({
                  type: 'snapshot',
                  snapshot: m.snapshot,
                  events: m.events,
                  footsteps: m.footsteps,
                  jumps: m.jumps,
                  dodges: m.dodges,
                  landings: m.landings,
                  enteredFinalPhase: m.enteredFinalPhase,
                });
              }
            } else if (m.type === 'input') {
              const r = rooms.get(sess.roomCode!)!;
              clients.get(r.hostClientId)!.outbox.push({
                type: 'relay_guest_input',
                fighterId: sess.fighterId,
                input: m,
              });
            }
          }
          res.end(JSON.stringify({ messages: sess.outbox.splice(0) }));
          return;
        }

        res.end(JSON.stringify({ ok: true }));
      });
    });

    await new Promise<void>((resolve) =>
      phpLikeServer.listen(0, '127.0.0.1', resolve)
    );
    const addr = phpLikeServer.address();
    if (!addr || typeof addr === 'string') {
      throw new Error('Failed to bind phpLikeServer');
    }
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    let hostStarted = false;
    let guestStarted = false;
    let guestSnapshots = 0;

    const hostClient = new MultiplayerClient(
      {
        onMatchStarted: () => {
          hostStarted = true;
        },
      },
      baseUrl
    );
    const guestClient = new MultiplayerClient(
      {
        onMatchStarted: () => {
          guestStarted = true;
        },
        onSnapshot: () => {
          guestSnapshots += 1;
        },
      },
      baseUrl
    );

    try {
      await hostClient.createRoom({
        playerName: 'Хост Бегет',
        classId: 'sword',
        fillBots: true,
        isPublic: true,
      });
      await guestClient.joinRoom('BEGT', 'Гость Бегет', 'spear');
      hostClient.startMatch();

      // Wait ~360ms for Host 60Hz sim + HTTP relay to bootstrap Guest and deliver snapshots
      await new Promise((r) => setTimeout(r, 360));
      expect(hostStarted).toBe(true);
      expect(guestStarted).toBe(true);
      expect(guestSnapshots).toBeGreaterThan(0);

      // Verify Guest input relays back into Host simulation cleanly
      const intent = createEmptyIntent(0.4);
      intent.jumpPressed = true;
      guestClient.streamInputIntent(1 / 60, intent);
      await new Promise((r) => setTimeout(r, 140));
      expect(guestSnapshots).toBeGreaterThan(1);
    } finally {
      hostClient.disconnect();
      guestClient.disconnect();
      await new Promise<void>((resolve) => phpLikeServer.close(() => resolve()));
    }
  });
});
