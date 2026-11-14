import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { brotliCompress, constants as zconst, deflateRawSync, gzip as gzipCb } from 'node:zlib';
import { promisify } from 'node:util';
import { DEFAULT_PORT, Room, makeRoomCode, type C2S, type S2C, type Snapshot } from '@game/shared';

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
 * Сервер за HTTPS-прокси (Caddy, nginx, Render): адрес игрока берётся из X-Forwarded-For.
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
// Сжатие WebSocket (permessage-deflate) — только для старых клиентов без сжатых снимков. По умолчанию выключено:
// новые клиенты получают снимки, сжатые сервером один раз на комнату, а встроенное сжатие заставляло бы
// сервер распаковывать каждое сообщение игроков (браузеры сжимают все исходящие) и держать по два потока zlib
// на соединение.
const WS_DEFLATE = process.env.WS_DEFLATE === '1';
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

/** Раздаваемые файлы в памяти, вместе со сжатыми копиями (br, gzip): диск и сжатие — один раз на файл. */
interface CachedFile {
  data: Buffer;
  br: Buffer | null;
  gz: Buffer | null;
  type: string;
  etag: string;
}
const fileCache = new Map<string, Promise<CachedFile | null>>();
const SKIP_COMPRESS = new Set(['.png', '.woff', '.woff2', '.ico', '.jpg', '.webp']);
function cachedFile(file: string, mtime: number, size: number): Promise<CachedFile | null> {
  const key = `${file}|${mtime}|${size}`;
  let p = fileCache.get(key);
  if (!p) {
    p = (async () => {
      try {
        const data = await readFile(file);
        const ext = extname(file);
        const small = data.length < 1024 || SKIP_COMPRESS.has(ext);
        // Сжатие в пуле потоков zlib — игровой цикл не ждёт
        const [br, gz] = small
          ? [null, null]
          : await Promise.all([
              brotli(data, { params: { [zconst.BROTLI_PARAM_QUALITY]: 11, [zconst.BROTLI_PARAM_SIZE_HINT]: data.length } }),
              gzip(data, { level: 9 }),
            ]);
        return { data, br, gz, type: MIME[ext] ?? 'application/octet-stream', etag: `"${size.toString(36)}-${Math.round(mtime).toString(36)}"` };
      } catch {
        return null;
      }
    })();
    fileCache.set(key, p);
    if (fileCache.size > 200) fileCache.delete(fileCache.keys().next().value!);
  }
  return p;
}

async function serveStatic(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/health') {
    let players = 0;
    for (const r of rooms.values()) players += r.clients.size;
    res.writeHead(shuttingDown ? 503 : 200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(
      JSON.stringify({
        ok: !shuttingDown,
        version: VERSION,
        uptime: Math.round((Date.now() - started) / 1000),
        rooms: rooms.size,
        players,
        // Доля игрового потока в работе (0–1) и наибольшее опоздание тика за последнюю минуту, мс
        load: Math.round(load.busy * 1000) / 1000,
        lagMs: load.lagMax,
      }),
    );
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
  let st;
  try {
    st = await stat(file);
    if (st.isDirectory()) {
      file = join(file, 'index.html');
      st = await stat(file);
    }
  } catch {
    file = join(STATIC_DIR, 'index.html');
    try {
      st = await stat(file);
    } catch {
      st = null;
    }
  }
  const f = st && (await cachedFile(file, st.mtimeMs, st.size));
  if (!f) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Клиент не собран. Выполните npm run build.');
    return;
  }
  // Файлы с хешем в имени (assets/…) не меняются — пусть браузер их кэширует; index.html — всегда свежий
  const cache = file.startsWith(join(STATIC_DIR, 'assets')) ? 'public, max-age=31536000, immutable' : 'no-cache';
  const headers: Record<string, string> = { 'content-type': f.type, 'cache-control': cache, 'x-content-type-options': 'nosniff', etag: f.etag, vary: 'accept-encoding' };
  if (req.headers['if-none-match'] === f.etag) {
    res.writeHead(304, headers).end();
    return;
  }
  // Сжатая заранее копия: игра (~1 МБ скриптов) уходит в 4–5 раз меньше, а сжимается один раз, а не на каждый запрос
  const accept = String(req.headers['accept-encoding'] ?? '');
  let body = f.data;
  if (f.br && /\bbr\b/.test(accept)) {
    body = f.br;
    headers['content-encoding'] = 'br';
  } else if (f.gz && /\bgzip\b/.test(accept)) {
    body = f.gz;
    headers['content-encoding'] = 'gzip';
  }
  headers['content-length'] = String(body.length);
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
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

/**
 * Сжатые снимки (для клиентов, приславших z: 1). Снимок сжимается **один раз на комнату**, а не для каждого
 * игрока (как делал permessage-deflate: три сжатия на тик на комнату). Словарь — текст прошлого снимка, который
 * у каждого клиента комнаты уже есть: соседние снимки почти одинаковы, сжатие в 4 раза при ~75 мкс на тик.
 * Формат: байт 0 — 1, если сжато со словарём (прошлым снимком), 0 — без; дальше deflate-raw с JSON.
 * Без словаря — только первый снимок после входа игрока в комнату (`reset`): у новичка прошлого снимка нет.
 * Вход игрока делает снимок полным (`full`), так что с него новичок и начинает.
 */
const brotli = promisify(brotliCompress);
const gzip = promisify(gzipCb);
const DICT_MAX = 32 * 1024;
class SnapshotPacker {
  private prev: Buffer | null = null;
  private last: Snapshot | null = null;
  private out: Buffer = Buffer.alloc(0);
  /** Игрок вошёл в комнату: следующий снимок — без словаря. */
  reset() {
    this.prev = null;
  }
  pack(wire: Snapshot): Buffer {
    if (wire === this.last) return this.out;
    const text = Buffer.from(JSON.stringify(wire));
    const dict = this.prev && this.prev.length <= DICT_MAX ? this.prev : null;
    const z = dict ? deflateRawSync(text, { level: 6, dictionary: dict }) : deflateRawSync(text, { level: 6 });
    const out = Buffer.allocUnsafe(z.length + 1);
    out[0] = dict ? 1 : 0;
    z.copy(out, 1);
    this.prev = text;
    this.last = wire;
    this.out = out;
    return out;
  }
}
const packers = new WeakMap<Room, SnapshotPacker>();
function packerOf(r: Room): SnapshotPacker {
  let p = packers.get(r);
  if (!p) packers.set(r, (p = new SnapshotPacker()));
  return p;
}

/** Один и тот же снимок уходит всем игрокам комнаты — превращаем в текст один раз, а не на каждого. */
let lastMsg: S2C | null = null;
let lastText = '';
function encode(msg: S2C): string {
  if (msg !== lastMsg) {
    lastMsg = msg;
    lastText = JSON.stringify(msg);
  }
  return lastText;
}

const wss = new WebSocketServer({
  server: http,
  maxPayload: 8 * 1024,
  perMessageDeflate: WS_DEFLATE
    ? { threshold: 256, zlibDeflateOptions: { level: 3, memLevel: 7 }, serverMaxWindowBits: 14, concurrencyLimit: 8 }
    : false,
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
  /** Клиент понимает сжатые разностные снимки (новые версии игры); старые получают полные снимки текстом. */
  let packed = false;
  const client = {
    send(msg: S2C) {
      if (ws.readyState === WebSocket.OPEN) ws.send(encode(msg));
    },
    snapshot(wire: Snapshot, raw: Snapshot) {
      if (ws.readyState !== WebSocket.OPEN) return;
      if (packed && room) ws.send(packerOf(room).pack(wire), { binary: true, compress: false });
      else ws.send(encode(raw));
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
    if (msg.t === 'create' || msg.t === 'join' || msg.t === 'rejoin') packed = msg.z === 1;
    if (msg.t === 'create') {
      if (rooms.size >= MAX_ROOMS) return fail('err.serverFull');
      const code = makeRoomCode((c) => rooms.has(c));
      const r = new Room(code, undefined, { delta: true });
      rooms.set(code, r);
      const p = r.join(String(msg.name ?? ''), client);
      if (typeof p === 'string') return fail(p);
      room = r;
      pid = p.id;
      packerOf(r).reset();
      console.log(`[${code}] создана комнатой игроком ${p.name}`);
    } else if (msg.t === 'join' || msg.t === 'rejoin') {
      const code = String(msg.code ?? '').toUpperCase().trim();
      const r = rooms.get(code);
      if (!r) return fail('err.roomNotFound');
      const p = msg.t === 'join' ? r.join(String(msg.name ?? ''), client) : r.rejoin(String(msg.token ?? ''), client);
      if (typeof p === 'string') return fail(p);
      room = r;
      pid = p.id;
      packerOf(r).reset();
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

// Игровой цикл: 20 тиков в секунду у каждой комнаты. Комнаты тикают каждая в своей фазе (с момента создания),
// а не все разом раз в 50 мс: при сотнях комнат залп занимал бы поток на десятки миллисекунд, и сообщения
// игроков ждали бы его конца. Таймер частый (5 мс), работа за один вызов — лишь у подошедших комнат.
const STEP = 50;
const nextTick = new WeakMap<Room, number>();
/** Нагрузка для /health: доля времени цикла в работе (EWMA) и наибольшее опоздание тика за минуту. */
const load = { busy: 0, lagMax: 0, lagSince: Date.now() };
let loopLast = performance.now();
const loop = setInterval(() => {
  const t0 = performance.now();
  const now = Date.now();
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
    let due = nextTick.get(r) ?? now;
    if (due > now) continue;
    const late = now - due;
    if (late > load.lagMax) load.lagMax = late;
    // Сервер не успевал (перегрузка, пауза процесса): догоняем не больше 10 тиков, остальное пропускаем
    if (late > STEP * 10) due = now - STEP * 10;
    while (due <= now) {
      try {
        r.step();
        roomErrors.delete(code);
      } catch (e) {
        roomFailed(code, r, e);
        break;
      }
      due += STEP;
    }
    nextTick.set(r, due);
  }
  const t1 = performance.now();
  load.busy = load.busy * 0.995 + ((t1 - t0) / Math.max(1, t1 - loopLast)) * 0.005;
  loopLast = t1;
  if (now - load.lagSince > 60_000) {
    load.lagMax = 0;
    load.lagSince = now;
  }
}, 5);

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

/** Заранее читаем и сжимаем файлы игры, чтобы первые игроки не ждали сжатия. */
async function warmStatic() {
  const walk = async (dir: string): Promise<void> => {
    for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const f = join(dir, e.name);
      if (e.isDirectory()) await walk(f);
      else {
        const st = await stat(f).catch(() => null);
        if (st) await cachedFile(f, st.mtimeMs, st.size);
      }
    }
  };
  await walk(STATIC_DIR);
}

http.listen(PORT, HOST, () => {
  console.log(`Сервер «25 waves» ${VERSION} запущен: http://${HOST}:${PORT}  (WebSocket на том же порту)`);
  if (TRUST_PROXY) console.log('За прокси: адрес игрока берётся из X-Forwarded-For');
  if (ALLOWED_ORIGINS.length) console.log('Разрешённые источники:', ALLOWED_ORIGINS.join(', '));
  const t0 = Date.now();
  void warmStatic().then(() => console.log(`Файлы игры в памяти и сжаты за ${Date.now() - t0} мс`));
});
