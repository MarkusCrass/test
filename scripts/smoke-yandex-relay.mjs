// Live relay protocol check. Uses a private room and cleans up its sessions.
// This is not a substitute for a real two-browser Yandex Games test.
import assert from 'node:assert/strict';

const base = process.argv[2] ?? 'https://igra.cosmorox.ru';
const sessions = [];
async function request(action, body) {
  const response = await fetch(`${base}/api/mp.php?action=${action}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Origin: 'https://yandex.ru', ...(body === undefined ? {} : { 'Content-Type': 'text/plain;charset=UTF-8' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  assert.equal(response.status, 200, `${action}: HTTP ${response.status}`);
  assert.equal(response.headers.get('access-control-allow-origin'), '*', `${action}: missing CORS header`);
  let result;
  try { result = JSON.parse(text); } catch { throw new Error(`${action}: response is not JSON (possible anti-bot challenge)`); }
  return result;
}
async function sync(clientId, ...messages) {
  const result = await request('sync', { clientId, messages });
  assert.ok(Array.isArray(result.messages), 'sync: missing messages');
  const error = result.messages.find(m => m.type === 'error');
  if (error) throw new Error(`relay: ${error.message}`);
  return result.messages;
}
function message(messages, type) {
  const found = messages.find(m => m.type === type);
  assert.ok(found, `missing ${type}`);
  return found;
}

try {
  const health = await request('health');
  assert.equal(health.ok, true, 'relay health check failed');
  assert.equal(health.storage, 'local', 'relay is not using shared local storage');
  const host = await request('connect', {}); if (host.clientId) sessions.push(host.clientId);
  const guest = await request('connect', {}); if (guest.clientId) sessions.push(guest.clientId);
  assert.ok(host.clientId && guest.clientId && host.clientId !== guest.clientId, 'invalid client IDs');
  assert.equal(host.relayMode, 'host_sim');
  const created = await sync(host.clientId, { type: 'create_room', playerName: 'Relay test A', classId: 'sword', isPublic: false, fillBots: false });
  const room = message(created, 'room_joined').room;
  assert.ok(room.roomCode && room.isPublic === false, 'private room not created');
  const joined = await sync(guest.clientId, { type: 'join_room', roomCode: room.roomCode, playerName: 'Relay test B', classId: 'spear' });
  assert.equal(message(joined, 'room_joined').room.players.length, 2, 'guest could not join');
  const bootstrap = message(await sync(host.clientId, { type: 'start_match' }), 'host_bootstrap_sim');
  assert.equal(bootstrap.roster.length, 2, 'incorrect match roster');
  const snapshot = { serverTick: 1, phase: 'Countdown', fighters: [], projectiles: [], killFeed: [] };
  await sync(host.clientId, { type: 'host_match_init', matchGeneration: bootstrap.matchGeneration, snapshot });
  assert.equal(message(await sync(guest.clientId), 'match_started').snapshot.serverTick, 1);
  await sync(guest.clientId, { type: 'input', moveX: 0.5 });
  assert.equal(message(await sync(host.clientId), 'relay_guest_input').input.moveX, 0.5);
  await sync(host.clientId, { type: 'host_snapshot', snapshot: { ...snapshot, serverTick: 2 } });
  assert.equal(message(await sync(guest.clientId), 'snapshot').snapshot.serverTick, 2);
  console.log('Live relay passed: HTTPS, CORS, private room, two clients, match bootstrap and two-way messages.');
} catch (error) {
  console.error('Live relay check failed:', error.message);
  process.exitCode = 1;
} finally {
  for (const clientId of sessions.reverse()) {
    try { await request('disconnect', { clientId }); }
    catch (error) { console.error('Cleanup failed:', error.message); process.exitCode = 1; }
  }
}
