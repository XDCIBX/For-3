// Нагрузка сервера на одну комнату (запуск из shared/: npx tsx ../tools/sim/serverbench.ts)
// Полные игры тремя ботами; на каждом тике меряем: симуляцию (update), снимок с разностным кодированием,
// JSON и сжатие (один раз на комнату, словарь — прошлый снимок, как SnapshotPacker в server/src/index.ts).
// Итог — мс процессора на тик комнаты по стадиям игры (без отправки по сокетам — её меряет loadtest.cjs).
// N=<игр> SEED=<первое зерно>. Math.random подменён — прогоны воспроизводимы, удобно сравнивать «до/после».
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { Game, type Player } from '../../shared/src/sim/game';
import { DT } from '../../shared/src/constants';
import { HERO_CLASSES } from '../../shared/src/types';
import { DeltaEncoder, decodeSnapshot } from '../../shared/src/sim/delta';
import type { Snapshot } from '../../shared/src/protocol';

let rs = 1;
// ID предметов берут время — фиксируем часы, иначе снимки отличаются от прогона к прогону
Date.now = () => 1_800_000_000_000;
Math.random = () => ((rs = (Math.imul(rs, 1103515245) + 12345) >>> 0) / 4294967296);

const N = +(process.env.N ?? 6);
const SEED = +(process.env.SEED ?? 100);
const NOZIP = process.env.NOZIP === '1';
// DELTA=0 — старый формат (полные снимки), для сравнения; CHECK=1 — проверять, что клиент восстанавливает снимок точно
const DELTA = process.env.DELTA !== '0';
const CHECK = process.env.CHECK === '1';
let mismatches = 0;
type Acc = { ticks: number; upd: number; snap: number; json: number; zip: number; bytes: number; zbytes: number; mobs: number };
const blank = (): Acc => ({ ticks: 0, upd: 0, snap: 0, json: 0, zip: 0, bytes: 0, zbytes: 0, mobs: 0 });
const stages: Record<string, Acc> = {};
const stageOf = (g: Game) => (g.phase === 'tavern' || g.phase === 'lobby' ? 'таверна' : g.phase.startsWith('duel') ? 'дуэль' : g.round >= 25 ? 'дракон' : g.round >= 21 ? 'логово 21–24' : g.round >= 11 ? 'остров 11–20' : 'остров 1–10');
const now = () => Number(process.hrtime.bigint()) / 1e6;
const hash = createHash('sha1');
let wins = 0;
(async () => {
for (let gi = 0; gi < N; gi++) {
  rs = SEED + gi * 7919;
  const g = new Game(SEED + gi);
  for (let i = 0; i < 3; i++) {
    const p = g.addBot() as Player;
    p.cls = HERO_CLASSES[(gi + i * 3) % 7];
  }
  g.startGame();
  const enc = new DeltaEncoder();
  let client: Snapshot | null = null;
  let prevText: Buffer | null = null;
  let t = 0;
  while (g.phase !== 'gameover' && t < 3600) {
    const a = stages[stageOf(g)] ??= blank();
    let t0 = now();
    g.update(DT);
    let t1 = now();
    a.upd += t1 - t0;
    const s = g.snapshot();
    // Хэш — по полному снимку: оптимизация сети не должна менять саму игру
    const sim = JSON.stringify(s);
    hash.update(sim);
    t0 = now();
    const wire = DELTA ? enc.encode(s) : s;
    t1 = now();
    a.snap += t1 - t0;
    const js = DELTA ? JSON.stringify(wire) : sim;
    t0 = now();
    a.json += t0 - t1;
    t1 = t0;
    if (CHECK) {
      const got = decodeSnapshot(JSON.parse(js), client) as unknown as Record<string, unknown[]>;
      client = got as unknown as Snapshot;
      const want = JSON.parse(sim) as Record<string, unknown[]>;
      for (const k of ['P', 'M', 'S', 'R', 'Z']) {
        const strip = (l: unknown[]) => JSON.stringify(l.map((e) => { const o = { ...(e as object) } as Record<string, unknown>; if (k === 'P') { delete o.eq; delete o.stats; } return Object.keys(o).sort().map((f) => [f, o[f]]); }));
        if (strip(got[k]) !== strip(want[k])) {
          if (mismatches++ < 3) console.log('РАСХОЖДЕНИЕ', k, 'тик', g.tick, strip(got[k]).slice(0, 300), '\n   ожидалось', strip(want[k]).slice(0, 300));
        }
      }
    }
    let zb = 0;
    if (!NOZIP) {
      const text = Buffer.from(js);
      const dict = prevText && prevText.length <= 32768 ? prevText : null;
      zb = (dict ? zlib.deflateRawSync(text, { level: 6, dictionary: dict }) : zlib.deflateRawSync(text, { level: 6 })).length + 1;
      prevText = text;
    }
    t0 = now();
    a.zip += t0 - t1;
    a.bytes += js.length;
    a.zbytes += zb;
    a.ticks++;
    a.mobs += g.mobs.size;
    t += DT;
  }
  if (g.result?.win) wins++;
}
const tot = blank();
console.log('стадия            тиков   мобов  update  snapshot  JSON   сжатие    итого мс/тик   КБ/с на игрока');
for (const [k, a] of Object.entries(stages)) {
  for (const f of Object.keys(tot) as (keyof Acc)[]) tot[f] += a[f];
  const per = (x: number) => (x / a.ticks).toFixed(3).padStart(7);
  console.log(`${k.padEnd(16)} ${String(a.ticks).padStart(6)} ${(a.mobs / a.ticks).toFixed(0).padStart(6)} ${per(a.upd)} ${per(a.snap)}  ${per(a.json)} ${per(a.zip)}    ${per(a.upd + a.snap + a.json + a.zip)}       ${((a.zbytes / a.ticks) * 20 / 1024).toFixed(1)}`);
}
const ms = (tot.upd + tot.snap + tot.json + tot.zip) / tot.ticks;
console.log(`всего: ${ms.toFixed(3)} мс/тик в среднем → одно ядро ≈ ${Math.floor(50 / ms)} комнат (${Math.floor(50 / ms) * 3} игроков) при 100 % загрузке; побед ${wins}/${N}`);
if (CHECK) console.log('расхождений при восстановлении:', mismatches);
console.log('хэш всех снимков:', hash.digest('hex').slice(0, 16));
})();
