import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { DEFAULT_PORT, Room, makeRoomCode, type C2S, type S2C } from '@game/shared';

// ------------------------------------------------------------------ настройки (переменные окружения)
const num = (v: string | undefined, def: number) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : def);
/** Порт HTTP и WebSocket (хостинги обычно задают PORT сами). */
const PORT = num(process.env.PORT, DEFAULT_PORT);
/** Адрес, на котором слушать: 0.0.0.0 — все интерфейсы (в контейнере так и нужно). */
const HOST = process.env.HOST || '0.0.0.0';
const here = dirname(fileURLToPath(import.meta.url));
// Сервер также раздаёт собранный веб-клиент (можно играть из браузера телефона).
const STATIC_DIR = resolve(process.env.STATIC_DIR ?? join(here, '../../client/dist'));
const ROOM_IDLE_MS = 5 * 60_000;
/** Предел комнат на сервер: защита от перегрузки (одна комната — 3 игрока). */
const MAX_ROOMS = num(process.env.MAX_ROOMS, 300);
/** Предел одновременных соединений с одного IP-адреса. */
const MAX_CONN_PER_IP = num(process.env.MAX_CONN_PER_IP, 16);
/**
 * Сервер за HTTPS-прокси (Caddy, nginx, Fly.io, Render): адрес игрока берётся из X-Forwarded-For.
 * Без прокси не включать — заголовок можно подделать.
 */
const TRUST_PROXY = process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true';
/**
 * Разрешённые источники страниц (через запятую), например https://game.example.com,app://game.
 * Пусто — пускать всех (по умолчанию: игра ходит из браузера, Electron app://, Capacitor).
 */
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
/** Проверка «живости» соединений: прокси и мобильные сети молча рвут связь. */
const HEARTBEAT_MS = num(process.env.HEARTBEAT_MS, 25_000);
const VERSION = process.env.APP_VERSION || '1.0.0';
const started = Date.now();

const rooms = new Map<string, Room>();
/** Сколько раз комната падала с ошибкой: после нескольких подряд её закрываем, остальные живут. */
const roomErrors = new Map<string, number>();

function roomFailed(code: string, r: Room, e: unknown) {
  const n = (roomErrors.get(code) ?? 0) + 1;
  roomErrors.set(code, n);
  console.error(`[${code}] ошибка в игре (${n}):`, e);
  if (n >= 5) {
    for (const c of r.clients.values()) c.send({ t: 'err', msg: 'err.serverCrash' });
    rooms.delete(code);
    roomErrors.delete(code);
  }
}

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
    let players = 0;
    for (const r of rooms.values()) players += r.clients.size;
    res.writeHead(shuttingDown ? 503 : 200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ ok: !shuttingDown, version: VERSION, uptime: Math.round((Date.now() - started) / 1000), rooms: rooms.size, players }));
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
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
    // Файлы с хешем в имени (assets/…) не меняются — пусть браузер их кэширует; index.html — всегда свежий
    const cache = file.includes(`${join(STATIC_DIR, 'assets')}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': cache, 'x-content-type-options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Клиент не собран. Выполните npm run build.');
  }
}

const http = createServer((req, res) => void serveStatic(req, res));
// Соединения на IP-адрес
const perIp = new Map<string, number>();
let shuttingDown = false;

function clientIp(req: IncomingMessage): string {
  if (TRUST_PROXY) {
    const fwd = req.headers['x-forwarded-for'];
    const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.socket.remoteAddress ?? '?';
}

const wss = new WebSocketServer({
  server: http,
  maxPayload: 8 * 1024,
  verifyClient: ({ origin, req }, done) => {
    if (shuttingDown) return done(false, 503, 'Server restarting');
    if (ALLOWED_ORIGINS.length && origin && !ALLOWED_ORIGINS.includes(origin)) return done(false, 403, 'Origin not allowed');
    if ((perIp.get(clientIp(req)) ?? 0) >= MAX_CONN_PER_IP) return done(false, 429, 'Too many connections');
    done(true);
  },
});

/** Сокеты, ответившие на последний ping. */
const alive = new WeakSet<WebSocket>();

wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
  const ip = clientIp(req);
  perIp.set(ip, (perIp.get(ip) ?? 0) + 1);
  alive.add(ws);
  ws.on('pong', () => alive.add(ws));
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
      try {
        room.handle(pid, msg);
      } catch (e) {
        roomFailed(room.code, room, e);
      }
      return;
    }
    if (msg.t === 'create') {
      if (rooms.size >= MAX_ROOMS) return fail('err.serverFull');
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
      if (!r) return fail('err.roomNotFound');
      const p = msg.t === 'join' ? r.join(String(msg.name ?? ''), client) : r.rejoin(String(msg.token ?? ''), client);
      if (typeof p === 'string') return fail(p);
      room = r;
      pid = p.id;
      console.log(`[${code}] ${msg.t === 'join' ? 'вошёл' : 'переподключился'} ${p.name}`);
    }
  });

  // Без обработчика ошибка сокета (слишком длинное сообщение, битый кадр) роняет весь процесс
  ws.on('error', (e) => console.warn('ошибка сокета:', e.message));

  ws.on('close', () => {
    const n = (perIp.get(ip) ?? 1) - 1;
    if (n > 0) perIp.set(ip, n);
    else perIp.delete(ip);
    if (room && pid) room.leave(pid, client);
  });
});

// Пинг на уровне протокола: соединение, не ответившее за интервал, закрываем — игрок переподключится,
// а комната не держит «мёртвого» героя. Заодно не даёт прокси закрыть тихое соединение по тайм-ауту.
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!alive.has(ws)) {
      ws.terminate();
      continue;
    }
    alive.delete(ws);
    try {
      ws.ping();
    } catch {
      /* сокет уже закрывается */
    }
  }
}, HEARTBEAT_MS);

// Игровой цикл: 20 тиков в секунду для всех комнат
let last = Date.now();
let acc = 0;
const STEP = 50;
const loop = setInterval(() => {
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
          roomErrors.delete(code);
          console.log(`[${code}] комната закрыта`);
        }
        continue;
      }
      try {
        r.step();
        roomErrors.delete(code);
      } catch (e) {
        roomFailed(code, r, e);
      }
    }
  }
}, 16);

wss.on('error', (e) => console.error('ошибка WebSocket-сервера:', e));
// Последний рубеж: непредвиденная ошибка пишется в лог, а не гасит все комнаты
process.on('uncaughtException', (e) => console.error('непойманная ошибка:', e));

/**
 * Остановка по SIGTERM/SIGINT (перезапуск контейнера, новая версия): новых не пускаем, /health отвечает 503,
 * игрокам закрываем соединение с кодом 1012 «сервис перезапускается».
 */
function shutdown(sig: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${sig}: остановка сервера, комнат ${rooms.size}`);
  clearInterval(heartbeat);
  clearInterval(loop);
  for (const ws of wss.clients) ws.close(1012, 'Server restarting');
  http.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

http.listen(PORT, HOST, () => {
  console.log(`Сервер «25 waves» ${VERSION} запущен: http://${HOST}:${PORT}  (WebSocket на том же порту)`);
  if (TRUST_PROXY) console.log('За прокси: адрес игрока берётся из X-Forwarded-For');
  if (ALLOWED_ORIGINS.length) console.log('Разрешённые источники:', ALLOWED_ORIGINS.join(', '));
});
