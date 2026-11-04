// Стресс-тест симуляции: «люди» жмут что попало (ввод, умения, покупки, мусорные
// сообщения, отключения), боты добивают состав. Проверяем: нет исключений, NaN,
// разрастания сущностей; снимок сериализуется; игра доходит до конца.
import { Game, type Player } from '../../shared/src/sim/game';
import { DT } from '../../shared/src/constants';
import { HERO_CLASSES } from '../../shared/src/types';

const N = +(process.env.N ?? 20);
const FROM = +(process.env.FROM ?? 0);
let fails = 0;
const maxCounts = { mobs: 0, zones: 0, projs: 0, minions: 0, snap: 0 };
const ends: Record<string, number> = {};
const t0 = Date.now();
for (let gi = FROM; gi < FROM + N; gi++) {
  const seed = 5000 + gi;
  let rs = seed * 7919;
  const rnd = () => ((rs = (rs * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const g = new Game(seed);
  const humans = 1 + (gi % 3);
  const ids: string[] = [];
  try {
    for (let i = 0; i < humans; i++) {
      const p = g.addPlayer('Игрок' + i) as Player;
      ids.push(p.id);
      g.handle(p.id, { t: 'pick', cls: HERO_CLASSES[(gi + i * 2) % HERO_CLASSES.length] });
    }
    for (let i = humans; i < 3; i++) g.handle(ids[0], { t: 'addBot' });
    for (const id of ids) g.handle(id, { t: 'ready', v: true });
    g.handle(ids[0], { t: 'start' });
    if (g.phase === 'lobby') throw new Error('не стартовала');
    let t = 0;
    let dropped: string | null = null;
    while (g.phase !== 'gameover' && t < 60 * 60) {
      for (const id of ids) {
        const p = g.players.get(id);
        if (!p) continue;
        const r = rnd();
        if (r < 0.08) g.handle(id, { t: 'in', mx: rnd() * 2 - 1, mz: rnd() * 2 - 1 });
        else if (r < 0.2) {
          // Чаще всего бьёт в ближайшего врага, иногда — куда попало
          const t = rnd() < 0.7 ? g.nearestTarget(p, 30) : null;
          const dx = t ? t.x - p.x : rnd() * 2 - 1;
          const dz = t ? t.z - p.z : rnd() * 2 - 1;
          if (t && rnd() < 0.5) g.handle(id, { t: 'in', mx: dx, mz: dz });
          g.handle(id, { t: 'cast', s: (rnd() * 4) | 0, dx, dz, d: t ? Math.hypot(dx, dz) : rnd() * 14 });
        }
        else if (r < 0.2005) g.handle(id, { t: 'cast', s: 9, dx: NaN, dz: Infinity, d: -5 } as never);
        else if (r < 0.201) g.handle(id, { t: 'in', mx: 1e9, mz: NaN } as never);
        else if (r < 0.2015) g.handle(id, { t: 'buy', id: 'нет-такого' });
        else if (r < 0.202) g.handle(id, null as never);
        else if (r < 0.2025) g.handle(id, { t: 'kick', id: ids[0] });
        if (g.phase === 'tavern' && rnd() < 0.05 && g.shop.length) g.handle(id, { t: 'buy', id: g.shop[(rnd() * g.shop.length) | 0].id });
        if (g.phase === 'tavern' && rnd() < 0.02) g.handle(id, { t: 'ready', v: true });
      }
      // Отключение и возврат человека посреди игры
      if (humans > 1 && !dropped && rnd() < 0.0005) {
        dropped = ids[1];
        g.removePlayer(dropped);
      } else if (dropped && rnd() < 0.002) {
        g.reconnect(dropped);
        dropped = null;
      }
      g.update(DT);
      if (process.env.TRACE && g.phase === 'battle' && g.mobs.size === 1 && Math.round(t / DT) % 100 === 0) {
        const m = [...g.mobs.values()][0] as unknown as Record<string, unknown> & { x: number; z: number };
        console.log(t.toFixed(0), g.round, m.kind, m.x.toFixed(2), m.z.toFixed(2), 'target', m.target, 'windup', m.windup, 'taunt', m.tauntT, 'stun', m.stunT, 'frozen', m.frozenT, [...g.players.values()].map((p) => p.id + ':' + p.x.toFixed(1) + ',' + p.z.toFixed(1)).join(' '));
      }
      const s = g.snapshot();
      const js = JSON.stringify(s);
      if (js.includes('null,') && /"(x|z|hp)":null/.test(js)) throw new Error('null/NaN в снимке ' + g.phase + ' r' + g.round);
      maxCounts.snap = Math.max(maxCounts.snap, js.length);
      for (const p of g.players.values()) if (!Number.isFinite(p.x) || !Number.isFinite(p.z) || !Number.isFinite(p.hp)) throw new Error(`NaN у героя ${p.cls} r${g.round}`);
      for (const m of g.mobs.values()) if (!Number.isFinite(m.x) || !Number.isFinite(m.z) || !Number.isFinite(m.hp)) throw new Error(`NaN у моба ${m.kind} r${g.round}`);
      maxCounts.mobs = Math.max(maxCounts.mobs, g.mobs.size);
      maxCounts.zones = Math.max(maxCounts.zones, g.zones.size);
      maxCounts.projs = Math.max(maxCounts.projs, (g as unknown as { projs: Map<string, unknown> }).projs?.size ?? 0);
      maxCounts.minions = Math.max(maxCounts.minions, g.minions.size);
      t += DT;
    }
    const key = g.phase === 'gameover' ? (g.result?.win ? 'победа' : 'поражение r' + g.round) : 'зависла r' + g.round + ' ' + g.phase;
    ends[key] = (ends[key] ?? 0) + 1;
    if (key.startsWith('зависла')) {
      const gg = g as unknown as { spawnQueue: unknown[]; timer: number };
      console.log('ЗАВИСЛА seed', seed, 'таймер', gg.timer, 'очередь', gg.spawnQueue?.length, 'мобы', [...g.mobs.values()].map((m) => `${m.kind}@${m.x.toFixed(1)},${m.z.toFixed(1)} hp${m.hp.toFixed(0)} spawnT${(m as unknown as { spawnT: number }).spawnT}`).join('; '));
      console.log('   герои', [...g.players.values()].map((p) => `${p.cls}${p.bot ? '(бот)' : ''} ${p.alive ? 'жив' : 'мёртв'} ${p.x.toFixed(1)},${p.z.toFixed(1)} conn${p.connected} spect${p.spectator} resp${p.respawn.toFixed(1)}`).join('; '), 'граница', g.bound);
    }
  } catch (e) {
    fails++;
    console.log(`игра ${gi} (seed ${seed}) упала на r${g.round} ${g.phase}:`, (e as Error).stack?.split('\n').slice(0, 4).join(' | '));
  }
}
console.log('исходы', ends, 'падений', fails, 'максимумы', maxCounts, `за ${((Date.now() - t0) / 1000).toFixed(0)}с`);
