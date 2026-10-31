// Integration test against a real PHP process, with isolated temporary state.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

const root = await mkdtemp(path.join(os.tmpdir(), 'knights-bot-rooms-'));
await mkdir(path.join(root, 'api'));
await copyFile('public/api/mp.php', path.join(root, 'api/mp.php'));
const probe = net.createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const php = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', root], { stdio: 'ignore' });
const base = `http://127.0.0.1:${port}/api/mp.php`;
const sessions = [];
async function req(action, payload) {
  const response = await fetch(`${base}?action=${action}`, {
    method: payload === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  assert.equal(response.status, 200, `${action}: ${response.status}`);
  return response.json();
}
const sync = (clientId, ...messages) => req('sync', { clientId, messages });
const find = (messages, type) => { const m = messages.find(x => x.type === type); assert.ok(m, `missing ${type}`); return m; };
try {
  let ready = false;
  for (let i = 0; i < 100 && !ready; i++) {
    try { ready = (await req('health')).ok; } catch { await new Promise(r => setTimeout(r, 30)); }
  }
  assert.ok(ready, 'PHP server did not start');
  const host = await req('connect', {}); sessions.push(host.clientId);
  let rooms = find(host.messages, 'welcome').rooms;
  assert.equal(rooms.length, 1);
  assert.equal(rooms[0].hostIsBot, true);
  assert.equal(rooms[0].playerCount, 1);
  const botName = rooms[0].hostName;
  const code = rooms[0].roomCode;
  const joined = find((await sync(host.clientId, { type: 'join_room', roomCode: code, playerName: 'Host', classId: 'dual' })).messages, 'room_joined');
  assert.equal(joined.room.hostClientId, host.clientId);
  assert.equal(joined.room.players.length, 2);
  assert.equal(joined.room.players[1].name, botName);
  assert.ok(joined.room.players[1].clientId.startsWith('c_bot_'));
  const guest = await req('connect', {}); sessions.push(guest.clientId);
  const joinedGuest = find((await sync(guest.clientId, { type: 'quick_join', playerName: 'Guest', classId: 'spear' })).messages, 'room_joined');
  assert.equal(joinedGuest.room.roomCode, code, 'quick join must prefer human rooms');
  assert.equal(joinedGuest.room.players.length, 3);
  const started = find((await sync(host.clientId, { type: 'start_match' })).messages, 'host_bootstrap_sim');
  assert.equal(started.preferredBotName, botName);
  assert.equal(started.roster.length, 2, 'bots must not be in human roster');
  // Advance timestamps instead of waiting 45/180 seconds in CI.
  const statePath = path.join(root, 'api/_runtime/mp_state.json');
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  state.lastBotRoomAt = Date.now() / 1000 - 46;
  await writeFile(statePath, JSON.stringify(state));
  const browser = await req('connect', {}); sessions.push(browser.clientId);
  rooms = find(browser.messages, 'welcome').rooms;
  const vacant = rooms.filter(r => r.hostIsBot);
  assert.ok(vacant.length >= 1 && vacant.length <= 3);
  console.log('PHP AI-room test passed: scheduled room, real host, quick-join, match bootstrap and bot identity.');
} finally {
  for (const clientId of sessions.reverse()) { try { await req('disconnect', { clientId }); } catch {} }
  php.kill();
  await new Promise(resolve => php.once('exit', resolve));
  await rm(root, { recursive: true, force: true });
}
