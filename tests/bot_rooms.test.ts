import http from 'node:http';
import { describe, expect, it } from 'vitest';
import { MultiplayerHub } from '../server/wsHub';
import { AuthoritativeMatchSim } from '../src/net/MultiplayerRoomSim';

describe('AI rooms', () => {
  it('creates joinable bot rooms without pretending bots are connected clients', async () => {
    const hub = new MultiplayerHub();
    // Test the scheduler without sleeping for the 45-second production interval.
    const tick = () => (hub as unknown as { maybeCreateBotRoom(): void }).maybeCreateBotRoom();
    const server = http.createServer((req, res) => { if (!hub.handleApiRequest(req, res)) { res.statusCode = 404; res.end(); } });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no port');
    const base = `http://127.0.0.1:${addr.port}`;
    const post = async (path: string, data: unknown) => (await fetch(base + path, { method: 'POST', body: JSON.stringify(data) })).json();
    try {
      tick(); tick(); tick(); tick();
      const rooms = hub.getPublicRoomSummaries();
      expect(rooms).toHaveLength(3);
      expect(new Set(rooms.map(r => r.hostName)).size).toBe(3);
      expect(rooms.every(r => r.hostIsBot && r.playerCount === 1)).toBe(true);
      const health = await (await fetch(base + '/api/rooms')).json();
      expect(health.onlinePlayers).toBe(0);
      const client = await post('/api/mp/connect', {});
      const joined = await post('/api/mp/sync', { clientId: client.clientId, messages: [{ type: 'join_room', roomCode: rooms[0].roomCode, playerName: 'Игрок', classId: 'dual' }] });
      const room = joined.messages.find((m: { type: string }) => m.type === 'room_joined').room;
      expect(room.hostClientId).toBe(client.clientId);
      expect(room.players).toHaveLength(2);
      expect(room.players[1].name).toBe(rooms[0].hostName);
      expect(room.players[1].clientId).toMatch(/^c_bot_/);
      const started = await post('/api/mp/sync', { clientId: client.clientId, messages: [{ type: 'start_match' }] });
      const snapshot = started.messages.find((m: { type: string }) => m.type === 'match_started').snapshot;
      expect(snapshot.fighters).toHaveLength(5);
      expect(snapshot.fighters.find((f: { displayName: string }) => f.displayName === `🤖 ${rooms[0].hostName}`)?.isHuman).toBe(false);
      await post('/api/mp/disconnect', { clientId: client.clientId });
      expect(hub.getPublicRoomSummaries().some(r => r.roomCode === rooms[0].roomCode)).toBe(false);
    } finally {
      hub.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('keeps the named bot in the arena and assigns it real AI', () => {
    const sim = new AuthoritativeMatchSim();
    sim.start([{ fighterId: 'human_1', name: 'Player', classId: 'spear' }], true, 'Котик');
    const bot = sim.fighters.find(f => f.displayName === '🤖 Котик');
    expect(bot?.isHuman).toBe(false);
    expect(bot?.classId).toBe('sword');
    expect(bot && sim.bots.has(bot.id)).toBe(true);
  });
});
