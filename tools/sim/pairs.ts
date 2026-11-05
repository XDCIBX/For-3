// Винрейт пар классов при равном снаряжении по волнам ПвП (запуск из shared/): REPS=48 npx tsx ../tools/sim/pairs.ts
import { Game, type Player } from '../../shared/src/sim/game';
import { DT } from '../../shared/src/constants';
import { HERO_CLASSES, type HeroClass } from '../../shared/src/types';
import { makeItem, TEMPLATE_BY_ID, computeStats } from '../../shared/src/data/items';
const REPS = +(process.env.REPS ?? 48);
const weapon: Record<HeroClass, string> = { warrior: 'sword', mage: 'staff', archer: 'bow', hunter: 'glaives', summoner: 'tome', werewolf: 'claws', dwarf: 'blunderbuss' };
const BUILDS = [['helm', 'plate', 'greaves', 'talisman', 'band'], ['helm', 'leather', 'boots', 'amulet', 'ring'], ['hood', 'robe', 'boots', 'amulet', 'ring']];
const rarity: Record<number, string> = { 5: 'common', 10: 'rare', 15: 'epic', 20: 'legendary', 24: 'relic' };
const short = (c: string) => c.slice(0, 4);
let seed = 777000;
const all: { r: number; a: string; b: string; wr: number }[] = [];
for (const round of [5, 10, 15, 20, 24]) {
  const rows: string[] = [];
  for (let i = 0; i < 7; i++) for (let j = i + 1; j < 7; j++) {
    let wa = 0;
    for (let rep = 0; rep < REPS; rep++) {
      const order = rep % 2 ? [HERO_CLASSES[j], HERO_CLASSES[i]] : [HERO_CLASSES[i], HERO_CLASSES[j]];
      const g = new Game(seed++);
      for (const c of order) {
        const p = g.addBot() as Player;
        p.cls = c;
        for (const id of [weapon[c], ...BUILDS[Math.floor(rep / 2) % 3]]) { const it = makeItem(TEMPLATE_BY_ID[id], rarity[round] as 'rare', round); p.equip[it.slot] = it; }
        p.stats = computeStats(c, p.equip); p.hp = p.stats.maxHp;
      }
      g.startRound = round; g.startGame();
      let t = 0;
      outer: while (t < 200) { g.update(DT); t += DT; for (const e of g.snapshot().E) if (e.e === 'duel') { const ca = g.players.get(e.a)!.cls; const x = e.winner === null ? 0.5 : e.winner === e.a ? 1 : 0; wa += ca === HERO_CLASSES[i] ? x : 1 - x; break outer; } }
    }
    const wr = wa / REPS;
    all.push({ r: round, a: HERO_CLASSES[i], b: HERO_CLASSES[j], wr });
    rows.push(`${short(HERO_CLASSES[i])}-${short(HERO_CLASSES[j])} ${Math.round(wr * 100)}`);
  }
  console.log(`в${round}: ${rows.join('  ')}`);
}
const bad = all.filter((x) => x.wr > 0.75 || x.wr < 0.25).map((x) => `в${x.r} ${x.a}-${x.b} ${Math.round(x.wr * 100)}%`);
console.log(`\nпар с перекосом сильнее 75/25: ${bad.length} из ${all.length}` + (bad.length ? ': ' + bad.join(', ') : ''));
