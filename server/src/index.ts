import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { DEFAULT_PORT, Room, makeRoomCode, type C2S, type S2C } from '@game/shared';

const PORT = Number(process.env.PORT) || DEFAULT_PORT;
const here = dirname(fileURLToPath(import.meta.url));
// Сервер также раздаёт собранный веб-клиент (можно играть из браузера телефона).
const STATIC_DIR = resolve(process.env.STATIC_DIR ?? join(here, '../../client/dist'));
const ROOM_IDLE_MS = 5 * 60_000;

const rooms = new Map<string, Room>();

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

async function serveStatic(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  if (path.includes('..')) {
    res.writeHead(400).end();
    return;
  }
  let file = join(STATIC_DIR, path || 'index.html');
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
  } catch {
    file = join(STATIC_DIR, 'index.html');
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Клиент не собран. Выполните npm run build.');
  }
}

const http = createServer((req, res) => void serveStatic(req, res));
const wss = new WebSocketServer({ server: http, maxPayload: 8 * 1024 });

wss.on('connection', (ws: WebSocket) => {
  let room: Room | null = null;
  let pid: string | null = null;
  const client = {
    send(msg: S2C) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    },
  };
  const fail = (msg: string) => client.send({ t: 'err', msg });

  ws.on('message', (raw) => {
    let msg: C2S;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'ping') {
      client.send({ t: 'pong', c: Number(msg.c) || 0 });
      return;
    }
    if (room && pid) {
      room.handle(pid, msg);
      return;
    }
    if (msg.t === 'create') {
      const code = makeRoomCode((c) => rooms.has(c));
      const r = new Room(code);
      rooms.set(code, r);
      const p = r.join(String(msg.name ?? ''), client);
      if (typeof p === 'string') return fail(p);
      room = r;
      pid = p.id;
      console.log(`[${code}] создана комнатой игроком ${p.name}`);
    } else if (msg.t === 'join' || msg.t === 'rejoin') {
      const code = String(msg.code ?? '').toUpperCase().trim();
      const r = rooms.get(code);
      if (!r) return fail('Комната не найдена');
      const p = msg.t === 'join' ? r.join(String(msg.name ?? ''), client) : r.rejoin(String(msg.token ?? ''), client);
      if (typeof p === 'string') return fail(p);
      room = r;
      pid = p.id;
      console.log(`[${code}] ${msg.t === 'join' ? 'вошёл' : 'переподключился'} ${p.name}`);
    }
  });

  ws.on('close', () => {
    if (room && pid) room.leave(pid, client);
  });
});

// Игровой цикл: 20 тиков в секунду для всех комнат
let last = Date.now();
let acc = 0;
const STEP = 50;
setInterval(() => {
  const now = Date.now();
  acc += Math.min(500, now - last);
  last = now;
  while (acc >= STEP) {
    acc -= STEP;
    for (const [code, r] of rooms) {
      if (r.clients.size === 0) {
        // Пустую комнату держим, чтобы игроки могли переподключиться
        if (r.game.phase === 'lobby' || now - r.emptySince > ROOM_IDLE_MS) {
          rooms.delete(code);
          console.log(`[${code}] комната закрыта`);
        }
        continue;
      }
      r.step();
    }
  }
}, 16);

http.listen(PORT, () => {
  console.log(`Сервер «25 waves» запущен: http://0.0.0.0:${PORT}  (WebSocket на том же порту)`);
});
