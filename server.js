const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { WebSocketServer, WebSocket } = require('ws');
const { CLASSES, BOSSES } = require('./src/config');
const { Game } = require('./src/game');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const rooms = new Map();
const httpClients = new Map();
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const HTTP_POLL_MS = 15000;
const HTTP_CLIENT_TTL_MS = 90000;
const HTTP_STATE_MS = 100;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function cleanName(value) {
  const name = String(value || '').replace(/[<>\n\r]/g, '').trim().slice(0, 16);
  return name || `Странник ${Math.floor(10 + Math.random() * 90)}`;
}

function makeRoomCode() {
  let code;
  do {
    code = Array.from({ length: 5 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function send(ws, message) {
  if (ws.readyState !== WebSocket.OPEN) return;
  if (!ws.isHttp) {
    ws.send(JSON.stringify(message));
    return;
  }

  // Limit long-poll traffic while retaining the newest state and every combat event.
  if (message.type === 'state') {
    const now = Date.now();
    const events = message.game.events || [];
    if (!message.game.result && now - (ws.lastStateAt || 0) < HTTP_STATE_MS) {
      const deferredEvents = ws.deferredState?.game?.events || [];
      ws.deferredState = {
        ...message,
        game: { ...message.game, events: [...deferredEvents, ...events] }
      };
      return;
    }
    if (ws.deferredState) {
      const deferredEvents = ws.deferredState.game.events || [];
      message = { ...message, game: { ...message.game, events: [...deferredEvents, ...events] } };
      ws.deferredState = null;
    }
    ws.lastStateAt = now;
  }
  ws.send(message);
}

function broadcast(room, message) {
  for (const player of room.players.values()) send(player.ws, message);
}

function roomSnapshot(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    bossId: room.bossId,
    state: room.state,
    maxPlayers: 5,
    players: [...room.players.values()].map((player) => ({
      id: player.id,
      name: player.name,
      classId: player.classId
    }))
  };
}

function broadcastRoom(room) {
  broadcast(room, { type: 'room', room: roomSnapshot(room) });
}

function leaveRoom(ws) {
  if (!ws.roomCode) return;
  const room = rooms.get(ws.roomCode);
  ws.roomCode = null;
  if (!room) return;

  room.players.delete(ws.id);
  if (!room.players.size) {
    rooms.delete(room.code);
    return;
  }

  if (room.hostId === ws.id) room.hostId = room.players.keys().next().value;
  if (room.game) room.game.events.push({ kind: 'playerLeft', playerId: ws.id });

  broadcastRoom(room);
  if (room.state === 'ended') room.endBroadcast = false;
}

function joinRoom(ws, room, name, classId) {
  const player = {
    id: ws.id,
    ws,
    name: cleanName(name),
    classId: CLASSES[classId] ? classId : 'ranger',
    input: {}
  };
  room.players.set(ws.id, player);
  ws.roomCode = room.code;
  broadcastRoom(room);
}

function writeJson(res, status, payload) {
  if (res.writableEnded || res.destroyed) return;
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}

function readJson(req, maxBytes = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    let tooLarge = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        tooLarge = true;
        return;
      }
      body += chunk.toString();
    });
    req.on('end', () => {
      if (tooLarge) {
        reject(new Error('Payload too large'));
        return;
      }
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function flushHttpClient(client) {
  if (!client.pending || !client.queue.length) return;
  const pending = client.pending;
  client.pending = null;
  clearTimeout(pending.timer);
  const messages = client.queue.splice(0, client.queue.length);
  writeJson(pending.res, 200, { messages });
}

function initializeClient(ws) {
  ws.id = crypto.randomUUID();
  ws.roomCode = null;
  ws.isAlive = true;
  send(ws, { type: 'hello', id: ws.id });
}

function createHttpClient(res) {
  const client = {
    isHttp: true,
    readyState: WebSocket.OPEN,
    roomCode: null,
    queue: [],
    pending: null,
    deferredState: null,
    lastSeen: Date.now(),
    lastStateAt: 0,
    inputSequence: 0,
    send(message) {
      this.queue.push(message);
      if (this.queue.length > 400) this.queue.shift();
      flushHttpClient(this);
    }
  };
  initializeClient(client);
  httpClients.set(client.id, client);
  writeJson(res, 200, { id: client.id });
}

function destroyHttpClient(client) {
  if (!client || client.readyState === WebSocket.CLOSED) return;
  leaveRoom(client);
  client.readyState = WebSocket.CLOSED;
  client.queue.length = 0;
  client.deferredState = null;
  if (client.pending) {
    const pending = client.pending;
    client.pending = null;
    clearTimeout(pending.timer);
    writeJson(pending.res, 200, { messages: [] });
  }
  httpClients.delete(client.id);
}

function getHttpClient(id, res) {
  const client = httpClients.get(String(id || ''));
  if (!client || client.readyState !== WebSocket.OPEN) {
    writeJson(res, 401, { error: 'Сессия истекла. Переподключитесь.' });
    return null;
  }
  client.lastSeen = Date.now();
  return client;
}

async function handleApiRequest(req, res, pathname) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Cache-Control': 'no-store' });
    res.end();
    return;
  }

  if (pathname === '/api/connect' && req.method === 'POST') {
    createHttpClient(res);
    return;
  }

  if (pathname === '/api/poll' && req.method === 'GET') {
    const id = new URL(req.url, 'http://localhost').searchParams.get('id');
    const client = getHttpClient(id, res);
    if (!client) return;
    if (client.queue.length) {
      const messages = client.queue.splice(0, client.queue.length);
      writeJson(res, 200, { messages });
      return;
    }
    if (client.pending) {
      const previous = client.pending;
      client.pending = null;
      clearTimeout(previous.timer);
      writeJson(previous.res, 200, { messages: [] });
    }
    const pending = { res, timer: null };
    pending.timer = setTimeout(() => {
      if (client.pending !== pending) return;
      client.pending = null;
      writeJson(res, 200, { messages: [] });
    }, HTTP_POLL_MS);
    client.pending = pending;
    res.on('close', () => {
      if (client.pending !== pending) return;
      client.pending = null;
      clearTimeout(pending.timer);
    });
    return;
  }

  if (pathname === '/api/send' && req.method === 'POST') {
    const body = await readJson(req);
    const client = getHttpClient(body.id, res);
    if (!client) return;
    const message = body.message;
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      writeJson(res, 400, { error: 'Некорректное сообщение.' });
      return;
    }
    if (message.type === 'input') {
      const sequence = Number(body.sequence);
      if (!Number.isFinite(sequence) || sequence <= client.inputSequence) {
        writeJson(res, 200, { ok: true });
        return;
      }
      client.inputSequence = sequence;
    }
    handleClientMessage(client, message);
    writeJson(res, 200, { ok: true });
    return;
  }

  if (pathname === '/api/close' && req.method === 'POST') {
    const body = await readJson(req);
    const client = httpClients.get(String(body.id || ''));
    if (client) destroyHttpClient(client);
    writeJson(res, 200, { ok: true });
    return;
  }

  writeJson(res, 404, { error: 'Неизвестный метод транспорта.' });
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }

  if (pathname.startsWith('/api/')) {
    handleApiRequest(req, res, pathname).catch((error) => {
      writeJson(res, 400, { error: error.message || 'Transport error' });
    });
    return;
  }

  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ok: true,
      rooms: rooms.size,
      players: [...rooms.values()].reduce((sum, room) => sum + room.players.size, 0),
      httpClients: httpClients.size
    }));
    return;
  }

  const isVendor = pathname.startsWith('/vendor/');
  const baseDir = isVendor ? path.join(__dirname, 'node_modules', 'three', 'build') : PUBLIC_DIR;
  const relativePath = isVendor
    ? pathname.replace(/^\/vendor\//, '')
    : pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  if (isVendor && !['three.module.js', 'three.core.js'].includes(relativePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  const filePath = path.normalize(path.join(baseDir, relativePath));
  if (!filePath.startsWith(`${baseDir}${path.sep}`) && filePath !== baseDir) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (error, stat) => {
    if (error || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Файл не найден');
      return;
    }
    const extension = path.extname(filePath).toLowerCase();
    const cacheable = isVendor || ['.jpg', '.jpeg', '.png', '.svg', '.ico'].includes(extension);
    const compress = /\bgzip\b/.test(req.headers['accept-encoding'] || '') && ['.js', '.css'].includes(extension) && stat.size > 1024;
    const headers = {
      'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
      'Cache-Control': cacheable ? 'public, max-age=86400' : 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    };
    if (compress) {
      headers['Content-Encoding'] = 'gzip';
      headers.Vary = 'Accept-Encoding';
    }
    res.writeHead(200, headers);
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => res.destroy());
    if (compress) stream.pipe(zlib.createGzip({ level: 6 })).pipe(res);
    else stream.pipe(res);
  });
});

function handleClientMessage(ws, message) {
  if (!message || typeof message !== 'object') {
    send(ws, { type: 'error', message: 'Некорректное сообщение.' });
    return;
  }

  if (message.type === 'create') {
    leaveRoom(ws);
    const code = makeRoomCode();
    const room = {
      code,
      hostId: ws.id,
      bossId: BOSSES[message.bossId] ? message.bossId : 'minotaur',
      players: new Map(),
      state: 'lobby',
      game: null,
      result: null,
      endBroadcast: false,
      createdAt: Date.now()
    };
    rooms.set(code, room);
    joinRoom(ws, room, message.name, message.classId);
    return;
  }

  if (message.type === 'join') {
    const code = String(message.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    const room = rooms.get(code);
    if (!room) {
      send(ws, { type: 'error', context: 'join', message: 'Комната не найдена. Проверьте код.' });
      return;
    }
    if (room.state !== 'lobby') {
      send(ws, { type: 'error', context: 'join', message: 'Этот отряд уже сражается. Дождитесь возвращения в лобби.' });
      return;
    }
    if (room.players.size >= 5 && !room.players.has(ws.id)) {
      send(ws, { type: 'error', context: 'join', message: 'В отряде уже пять человек.' });
      return;
    }
    leaveRoom(ws);
    joinRoom(ws, room, message.name, message.classId);
    return;
  }

  const room = rooms.get(ws.roomCode);
  const player = room?.players.get(ws.id);
  if (!room || !player) return;

  if (message.type === 'lobbyUpdate' && room.state === 'lobby') {
    if (CLASSES[message.classId]) player.classId = message.classId;
    if (BOSSES[message.bossId] && room.hostId === ws.id) room.bossId = message.bossId;
    if (message.name !== undefined) player.name = cleanName(message.name);
    broadcastRoom(room);
    return;
  }

  if (message.type === 'start' && room.state === 'lobby' && room.hostId === ws.id) {
    room.game = new Game(room);
    room.state = 'playing';
    room.result = null;
    room.endBroadcast = false;
    broadcast(room, { type: 'started', bossId: room.bossId, code: room.code });
    return;
  }

  if (message.type === 'restart' && room.state === 'ended' && room.hostId === ws.id) {
    room.state = 'lobby';
    room.game = null;
    room.result = null;
    room.endBroadcast = false;
    for (const member of room.players.values()) member.input = {};
    broadcastRoom(room);
    return;
  }

  if (message.type === 'input' && room.state === 'playing') {
    const input = message.input || {};
    player.input = {
      up: Boolean(input.up),
      down: Boolean(input.down),
      left: Boolean(input.left),
      right: Boolean(input.right),
      attack: Boolean(input.attack),
      ability: Boolean(input.ability),
      dash: Boolean(input.dash),
      sprint: Boolean(input.sprint),
      ultimate: Boolean(input.ultimate),
      interact: Boolean(input.interact),
      moveX: Math.max(-1, Math.min(1, Number(input.moveX) || 0)),
      moveY: Math.max(-1, Math.min(1, Number(input.moveY) || 0)),
      aimX: Math.max(-100, Math.min(1700, Number(input.aimX) || 0)),
      aimY: Math.max(-100, Math.min(1000, Number(input.aimY) || 0))
    };
    return;
  }

  if (message.type === 'leave') {
    leaveRoom(ws);
    send(ws, { type: 'left' });
  }
}

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });

wss.on('connection', (ws) => {
  initializeClient(ws);
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      send(ws, { type: 'error', message: 'Некорректное сообщение.' });
      return;
    }
    handleClientMessage(ws, message);
  });
  ws.on('close', () => leaveRoom(ws));
  ws.on('error', () => leaveRoom(ws));
});

let lastTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(0.1, (now - lastTick) / 1000);
  lastTick = now;

  for (const room of rooms.values()) {
    if (!room.game) continue;
    if (room.state !== 'playing' && !(room.state === 'ended' && !room.endBroadcast)) continue;
    if (room.state === 'playing') room.game.update(dt);
    broadcast(room, { type: 'state', code: room.code, game: room.game.snapshot() });
    room.game.events.length = 0;
    if (room.state === 'ended') room.endBroadcast = true;
  }
}, 50);

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
  const now = Date.now();
  for (const client of httpClients.values()) {
    if (now - client.lastSeen > HTTP_CLIENT_TTL_MS) destroyHttpClient(client);
  }
}, 30000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`МИФЫ: ПРОБУЖДЕНИЕ — server listening on 0.0.0.0:${PORT}`);
});
