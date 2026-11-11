import http from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createGame, addPlayer, startGame, tick, snapshot, DIRECTIONS } from './game.js';

const publicDir = new URL('./public/', import.meta.url);
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/game.js', ['../game.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
]);
const icons = new Set(['✦', '⚡', '🌙', '🍒', '🪐', '👾', '🐱', '🌈']);

export function createApp() {
  const rooms = new Map();
  const sessions = new Map();
  const send = (res, status, value) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(value));
  };
  const state = room => ({
    ...snapshot(room.game), code: room.code, host: room.host,
    players: room.game.players.map(p => ({ ...p, connected: room.streams.has(p.id) })),
  });
  const broadcast = room => {
    const data = `data: ${JSON.stringify(state(room))}\n\n`;
    for (const stream of room.streams.values()) {
      if (stream.writableLength > 1024 * 1024) stream.destroy();
      else stream.write(data);
    }
  };
  const remove = (room, id) => {
    room.streams.get(id)?.end();
    room.streams.delete(id);
    room.game.players = room.game.players.filter(p => p.id !== id);
    sessions.delete(id);
    if (room.host === id) room.host = room.game.players[0]?.id;
    if (!room.game.players.length) rooms.delete(room.code);
    else broadcast(room);
  };
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && files.has(url.pathname)) {
        const [file, type] = files.get(url.pathname);
        res.writeHead(200, { 'Content-Type': type });
        res.end(await readFile(new URL(file, publicDir)));
        return;
      }
      if (url.pathname === '/api/events' && req.method === 'GET') {
        const session = sessions.get(url.searchParams.get('id'));
        if (!session || session.token !== url.searchParams.get('token')) {
          send(res, 401, { error: 'Session expired. Please join a room again.' });
          return;
        }
        const room = rooms.get(session.code);
        const previous = room.streams.get(session.id);
        res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        room.streams.set(session.id, res);
        previous?.end();
        session.seen = Date.now();
        room.updated = Date.now();
        broadcast(room);
        req.on('close', () => {
          if (room.streams.get(session.id) === res) {
            room.streams.delete(session.id);
            session.seen = Date.now();
            const player = room.game.players.find(p => p.id === session.id);
            if (player) player.direction = null;
          }
        });
        return;
      }
      if (req.method !== 'POST' || !url.pathname.startsWith('/api/')) {
        send(res, 404, { error: 'Not found.' });
        return;
      }
      if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) {
        send(res, 403, { error: 'Cross-origin requests are not allowed.' });
        return;
      }
      if (!req.headers['content-type']?.startsWith('application/json')) {
        send(res, 415, { error: 'Expected JSON.' });
        return;
      }
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 16000) {
          send(res, 413, { error: 'That image is too large. Try a smaller one.' });
          return;
        }
      }
      let data;
      try { data = JSON.parse(body); } catch { send(res, 400, { error: 'Invalid JSON.' }); return; }
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        send(res, 400, { error: 'Expected a JSON object.' });
        return;
      }
      if (url.pathname === '/api/join') {
        const name = typeof data.name === 'string' ? data.name.trim().slice(0, 18) : '';
        const avatar = typeof data.avatar === 'string' && (icons.has(data.avatar) ||
          /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(data.avatar) && data.avatar.length < 12000) ? data.avatar : '✦';
        if (!name) { send(res, 400, { error: 'Give your pilot a name first.' }); return; }
        let room;
        const code = typeof data.code === 'string' ? data.code.trim().toUpperCase() : '';
        if (code) {
          room = rooms.get(code);
          if (!room) { send(res, 404, { error: 'Room not found. Check the code with your host.' }); return; }
        } else {
          if (rooms.size >= 100) { send(res, 503, { error: 'Arcade is busy. Please try again later.' }); return; }
          let newCode;
          do { newCode = randomBytes(3).toString('hex').toUpperCase(); } while (rooms.has(newCode));
          room = { code: newCode, game: createGame(), streams: new Map(), updated: Date.now() };
        }
        const id = randomUUID();
        try { addPlayer(room.game, id, name, avatar); }
        catch (error) { send(res, 409, { error: error.message }); return; }
        const token = randomBytes(24).toString('hex');
        room.host ||= id;
        rooms.set(room.code, room);
        sessions.set(id, { id, token, code: room.code, seen: Date.now(), inputSequence: 0 });
        send(res, 200, { id, token, code: room.code });
        broadcast(room);
        return;
      }
      const session = sessions.get(data.id);
      if (!session || session.token !== data.token) {
        send(res, 401, { error: 'Session expired. Please join a room again.' }); return;
      }
      const room = rooms.get(session.code);
      const player = room.game.players.find(p => p.id === session.id);
      if (url.pathname === '/api/input') {
        if (Number.isSafeInteger(data.sequence) && data.sequence > session.inputSequence) {
          player.direction = Object.hasOwn(DIRECTIONS, data.direction) ? data.direction : null;
          session.inputSequence = data.sequence;
        }
      } else if (url.pathname === '/api/action') {
        if (data.action === 'leave') {
          remove(room, session.id);
          send(res, 200, { ok: true }); return;
        }
        if (room.host !== session.id) { send(res, 403, { error: 'Only the host can control the run.' }); return; }
        if (data.action === 'start' && ['lobby', 'won', 'gameover'].includes(room.game.status)) startGame(room.game);
        else if (data.action === 'pause' && room.game.status === 'playing') room.game.status = 'paused';
        else if (data.action === 'pause' && room.game.status === 'paused') room.game.status = 'playing';
        else if (data.action === 'lobby' && ['won', 'gameover'].includes(room.game.status)) {
          room.game = { ...createGame(), players: room.game.players };
        } else { send(res, 400, { error: 'That action is not available right now.' }); return; }
        broadcast(room);
      } else { send(res, 404, { error: 'Not found.' }); return; }
      send(res, 200, { ok: true });
    } catch {
      if (!res.headersSent) send(res, 400, { error: 'Unable to process request.' });
      else res.end();
    }
  });
  const timer = setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      for (const player of [...room.game.players]) {
        const session = sessions.get(player.id);
        if (!room.streams.has(player.id) && now - session.seen > 30000) remove(room, player.id);
      }
      if (!rooms.has(room.code)) continue;
      if (now - room.updated > 3600000) {
        for (const player of [...room.game.players]) remove(room, player.id);
        continue;
      }
      if (room.streams.size) {
        room.updated = now;
        tick(room.game);
        if (room.game.status !== 'lobby') broadcast(room);
      }
    }
  }, 120);
  timer.unref();
  server.on('close', () => {
    clearInterval(timer);
    for (const room of rooms.values()) for (const stream of room.streams.values()) stream.end();
  });
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT || 3000);
  createApp().listen(port, '0.0.0.0', () => {
    console.log(`Neon Relay is ready at http://localhost:${port}`);
    console.log('For LAN play, share this computer’s local IP and port. Ctrl+C to stop.');
  });
}
