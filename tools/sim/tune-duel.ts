// Подбор DUEL_POWER (shared/src/sim/game.ts): дуэли каждого с каждым при равном снаряжении на волнах
// 5, 10, 15, 20, 24, затем множитель класса на волне правится в сторону 50 % побед. Запуск из shared/:
//   REPS=60 IT=8 npx tsx ../tools/sim/tune-duel.ts        → печатает таблицу для вставки в game.ts
import { Game, DUEL_POWER, type Player } from '../../shared/src/sim/game';
import { DT } from '../../shared/src/constants';
import { HERO_CLASSES, type HeroClass } from '../../shared/src/types';
import { makeItem, TEMPLATE_BY_ID, computeStats } from '../../shared/src/data/items';

const ROUNDS = [5, 10, 15, 20, 24];
const REPS = +(process.env.REPS ?? 60);
const IT = +(process.env.IT ?? 8);
const STEP = +(process.env.STEP ?? 0.45);
const weapon: Record<HeroClass, string> = { warrior: 'sword', mage: 'staff', archer: 'bow', hunter: 'glaives', summoner: 'tome', werewolf: 'claws', dwarf: 'blunderbuss' };
const BUILDS = [
  ['helm', 'plate', 'greaves', 'talisman', 'band'],
  ['helm', 'leather', 'boots', 'amulet', 'ring'],
  ['hood', 'robe', 'boots', 'amulet', 'ring'],
];
const rarity: Record<number, string> = { 5: 'common', 10: 'rare', 15: 'epic', 20: 'legendary', 24: 'relic' };

/** Винрейт классов на волне (ничья — половина). */
export function measure(round: number, reps: number, seed0: number): Record<HeroClass, number> {
  const w = Object.fromEntries(HERO_CLASSES.map((c) => [c, 0])) as Record<HeroClass, number>;
  const n = Object.fromEntries(HERO_CLASSES.map((c) => [c, 0])) as Record<HeroClass, number>;
  let seed = seed0;
  for (let i = 0; i < 7; i++)
    for (let j = i + 1; j < 7; j++)
      for (let rep = 0; rep < reps; rep++) {
        const order = rep % 2 ? [HERO_CLASSES[j], HERO_CLASSES[i]] : [HERO_CLASSES[i], HERO_CLASSES[j]];
        const g = new Game(seed++);
        for (const c of order) {
          const p = g.addBot() as Player;
          p.cls = c;
          for (const id of [weapon[c], ...BUILDS[Math.floor(rep / 2) % BUILDS.length]]) {
            const it = makeItem(TEMPLATE_BY_ID[id], rarity[round] as 'rare', round);
            p.equip[it.slot] = it;
          }
          p.stats = computeStats(c, p.equip);
          p.hp = p.stats.maxHp;
        }
        g.startRound = round;
        g.startGame();
        let time = 0;
        outer: while (time < 200) {
          g.update(DT);
          time += DT;
          for (const e of g.snapshot().E)
            if (e.e === 'duel') {
              const ca = g.players.get(e.a)!.cls, cb = g.players.get(e.b)!.cls;
              const a = e.winner === null ? 0.5 : e.winner === e.a ? 1 : 0;
              w[ca] += a; w[cb] += 1 - a; n[ca]++; n[cb]++;
              break outer;
            }
        }
      }
  for (const c of HERO_CLASSES) w[c] /= n[c] || 1;
  return w;
}

const fmt = (x: number) => x.toFixed(2);
const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(4);
if (process.argv[1]?.includes('tune-duel')) {
  for (let it = 0; it <= IT; it++) {
    const res: Record<number, Record<HeroClass, number>> = {};
    for (const [ri, r] of ROUNDS.entries()) res[r] = measure(r, REPS, 10000 * (it + 1) + ri * 1000);
    let worst = 0;
    console.log(`\nитерация ${it}:  ` + ROUNDS.map((r) => `в${r}`.padStart(13)).join(''));
    for (const c of HERO_CLASSES) {
      console.log(`  ${c.padEnd(9)}` + ROUNDS.map((r, ri) => `${pct(res[r][c])} ×${fmt(DUEL_POWER[c][ri])}`.padStart(13)).join(''));
      for (const r of ROUNDS) worst = Math.max(worst, Math.abs(res[r][c] - 0.5));
    }
    console.log(`  наибольшее отклонение от 50 %: ${Math.round(worst * 100)} п.`);
    if (it === IT) break;
    // Поправка: множитель × (0.5 / винрейт)^STEP, затем нормируем среднее геометрическое на волне к 1
    for (const [ri, r] of ROUNDS.entries()) {
      for (const c of HERO_CLASSES) {
        const wr = Math.min(0.92, Math.max(0.08, res[r][c]));
        DUEL_POWER[c][ri] *= Math.pow(0.5 / wr, STEP);
      }
      const gm = Math.exp(HERO_CLASSES.reduce((a, c) => a + Math.log(DUEL_POWER[c][ri]), 0) / 7);
      for (const c of HERO_CLASSES) DUEL_POWER[c][ri] = Math.min(1.8, Math.max(0.55, DUEL_POWER[c][ri] / gm));
    }
  }
  console.log('\nТаблица для shared/src/sim/game.ts:');
  for (const c of HERO_CLASSES) console.log(`  ${c}: [${DUEL_POWER[c].map(fmt).join(', ')}],`);
}
