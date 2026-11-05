// Баланс ПвП по волнам 5, 10, 15, 20, 24 (запуск из shared/: npx tsx ../tools/sim/pvp.ts [real|eq|both])
//   real — полные игры ботов (бой, покупки в лавке, свои вещи у каждого класса): итог каждой дуэли
//          по волнам. N=<игр на набор классов> (по умолчанию 2; наборов — все 35 троек).
//   eq   — дуэль каждого с каждым на нужной волне при одинаковом по силе снаряжении своего класса
//          (редкость по волне: обычная/редкая/эпическая/легендарная/реликвия). REPS=<повторов пары>.
import { Game, type Player } from '../../shared/src/sim/game';
import { DT, isPvpRound } from '../../shared/src/constants';
import { HERO_CLASSES, type HeroClass } from '../../shared/src/types';
import { makeItem, TEMPLATE_BY_ID, computeStats } from '../../shared/src/data/items';

const mode = process.argv[2] ?? 'both';
const ROUNDS = [5, 10, 15, 20, 24];
type Tally = Record<number, Record<string, { w: number; n: number }>>;
const blank = (): Tally => Object.fromEntries(ROUNDS.map((r) => [r, Object.fromEntries(HERO_CLASSES.map((c) => [c, { w: 0, n: 0 }]))]));
const pairs: Record<string, { w: number; n: number }> = {};

function print(title: string, t: Tally) {
  console.log(`\n${title}`);
  console.log('  класс     ' + ROUNDS.map((r) => `в${r}`.padStart(9)).join('') + '     всего');
  for (const c of HERO_CLASSES) {
    let W = 0, N = 0;
    const cells = ROUNDS.map((r) => {
      const x = t[r][c];
      W += x.w; N += x.n;
      return (x.n ? `${Math.round((x.w / x.n) * 100)}%` : '—').padStart(5) + `(${String(x.n).padStart(3)})`;
    });
    console.log(`  ${c.padEnd(9)}${cells.join('')}   ${N ? Math.round((W / N) * 100) + '%' : '—'}`);
  }
}

function addDuel(t: Tally, round: number, ca: HeroClass, cb: HeroClass, winA: boolean | null) {
  if (!t[round]) return;
  // Ничья — по половине
  const a = winA === null ? 0.5 : winA ? 1 : 0;
  t[round][ca].w += a; t[round][ca].n++;
  t[round][cb].w += 1 - a; t[round][cb].n++;
  const k = `${round}:${ca}>${cb}`;
  pairs[k] = pairs[k] ?? { w: 0, n: 0 };
  pairs[k].w += a; pairs[k].n++;
}

if (mode === 'real' || mode === 'both') {
  const N = +(process.env.N ?? 2);
  const t = blank();
  const combos: HeroClass[][] = [];
  for (let i = 0; i < 7; i++) for (let j = i + 1; j < 7; j++) for (let k = j + 1; k < 7; k++) combos.push([HERO_CLASSES[i], HERO_CLASSES[j], HERO_CLASSES[k]]);
  let seed = 5000, games = 0, reached24 = 0;
  for (const combo of combos)
    for (let rep = 0; rep < N; rep++) {
      const g = new Game(seed++);
      for (const c of combo) {
        const p = g.addBot() as Player;
        p.cls = c;
        p.stats = computeStats(c, p.equip);
        p.hp = p.stats.maxHp;
      }
      g.startGame();
      let time = 0;
      while (g.phase !== 'gameover' && time < 30000) {
        g.update(DT);
        time += DT;
        for (const e of g.snapshot().E) {
          if (e.e !== 'duel') continue;
          const ca = g.players.get(e.a)?.cls, cb = g.players.get(e.b)?.cls;
          if (!ca || !cb || !isPvpRound(g.round)) continue;
          addDuel(t, g.round, ca, cb, e.winner === null ? null : e.winner === e.a);
          if (g.round === 24) reached24++;
        }
      }
      games++;
    }
  print(`РЕАЛЬНЫЕ ИГРЫ БОТОВ: ${games} игр, винрейт в дуэлях по волнам (в скобках — число дуэлей)`, t);
}

if (mode === 'eq' || mode === 'both') {
  const REPS = +(process.env.REPS ?? 12);
  const t = blank();
  // Одинаковый комплект брони у всех (оружие — своего класса): видно силу класса, а не выбор вещей
  const weapon: Record<HeroClass, string> = { warrior: 'sword', mage: 'staff', archer: 'bow', hunter: 'glaives', summoner: 'tome', werewolf: 'claws', dwarf: 'blunderbuss' };
  // Три типичных комплекта (у обоих в дуэли — один и тот же): танк, боец, заклинатель
  const BUILDS = [
    ['helm', 'plate', 'greaves', 'talisman', 'band'],
    ['helm', 'leather', 'boots', 'amulet', 'ring'],
    ['hood', 'robe', 'boots', 'amulet', 'ring'],
  ];
  const rarity: Record<number, string> = { 5: 'common', 10: 'rare', 15: 'epic', 20: 'legendary', 24: 'relic' };
  let seed = 90000;
  for (const round of ROUNDS)
    for (let i = 0; i < 7; i++)
      for (let j = i + 1; j < 7; j++)
        for (let rep = 0; rep < REPS; rep++) {
          const A = HERO_CLASSES[i], B = HERO_CLASSES[j];
          const g = new Game(seed++);
          // Половину дуэлей A стартует первым слотом, половину — вторым
          const order = rep % 2 ? [B, A] : [A, B];
          for (const c of order) {
            const p = g.addBot() as Player;
            p.cls = c;
            for (const id of [weapon[c], ...BUILDS[Math.floor(rep / 2) % BUILDS.length]]) {
                const tpl = TEMPLATE_BY_ID[id];
                if (!tpl) throw new Error('нет шаблона ' + id);
                const it = makeItem(tpl, rarity[round] as 'rare', round);
                p.equip[it.slot] = it;
              }
            p.stats = computeStats(c, p.equip);
            p.hp = p.stats.maxHp;
          }
          g.startRound = round;
          g.startGame();
          let time = 0, done = false;
          while (time < 200 && !done) {
            g.update(DT);
            time += DT;
            for (const e of g.snapshot().E) {
              if (e.e !== 'duel') continue;
              const ca = g.players.get(e.a)!.cls, cb = g.players.get(e.b)!.cls;
              addDuel(t, round, ca, cb, e.winner === null ? null : e.winner === e.a);
              done = true;
            }
          }
        }
  print(`РАВНОЕ СНАРЯЖЕНИЕ (3 комплекта брони): ${REPS} дуэлей на пару на каждой волне`, t);
}

if (process.env.PAIRS) {
  console.log('\nПары (винрейт первого):');
  for (const r of ROUNDS) {
    const row = Object.entries(pairs).filter(([k]) => k.startsWith(r + ':')).map(([k, v]) => `${k.split(':')[1]} ${Math.round((v.w / v.n) * 100)}%`);
    console.log(`  в${r}: ${row.join('  ')}`);
  }
}
