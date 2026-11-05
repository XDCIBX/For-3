// Что набирают классы к ПвП-волнам в реальных играх ботов: золото, характеристики, вещи (запуск из shared/)
import { Game, type Player } from '../../shared/src/sim/game';
import { DT, isPvpRound } from '../../shared/src/constants';
import { HERO_CLASSES, type HeroClass } from '../../shared/src/types';
import { computeStats } from '../../shared/src/data/items';
const N = +(process.env.N ?? 2);
const acc: Record<string, Record<string, number[]>> = {};
const items: Record<string, Record<string, number>> = {};
let seed = 5000;
const combos: HeroClass[][] = [];
for (let i = 0; i < 7; i++) for (let j = i + 1; j < 7; j++) for (let k = j + 1; k < 7; k++) combos.push([HERO_CLASSES[i], HERO_CLASSES[j], HERO_CLASSES[k]]);
for (const combo of combos) for (let rep = 0; rep < N; rep++) {
  const g = new Game(seed++);
  for (const c of combo) { const p = g.addBot() as Player; p.cls = c; p.stats = computeStats(c, p.equip); p.hp = p.stats.maxHp; }
  g.startGame();
  let t = 0, last = -1;
  while (g.phase !== 'gameover' && t < 30000) {
    g.update(DT); t += DT;
    if (g.phase === 'duel_intro' && g.round !== last && isPvpRound(g.round)) {
      last = g.round;
      for (const p of g.players.values()) {
        const k = `${g.round}`;
        acc[k] = acc[k] ?? {};
        const s = p.stats as unknown as Record<string, number>;
        const v = [p.gold + Object.values(p.equip).reduce((a, it) => a + (it ? it.price : 0), 0), s.maxHp, s.damage, s.armor, s.skillPower ?? 0, s.attackSpeed, s.crit, s.lifesteal];
        (acc[k][p.cls] = acc[k][p.cls] ?? []).push(...[]);
        const key = `${k}|${p.cls}`;
        (acc as any)[key] = (acc as any)[key] ?? { n: 0, v: v.map(() => 0) };
        (acc as any)[key].n++; v.forEach((x, i) => ((acc as any)[key].v[i] += x));
        if (g.round === 20) for (const it of Object.values(p.equip)) if (it) { items[p.cls] = items[p.cls] ?? {}; items[p.cls][it.tpl] = (items[p.cls][it.tpl] ?? 0) + 1; }
      }
    }
  }
}
for (const r of [5, 10, 20]) {
  console.log(`\nволна ${r}: богатство(золото+цена вещей) maxHp damage armor skillPower atkSpd crit lifesteal`);
  for (const c of HERO_CLASSES) { const a = (acc as any)[`${r}|${c}`]; if (!a) continue; console.log('  ' + c.padEnd(9) + a.v.map((x: number) => (x / a.n).toFixed(x / a.n < 3 ? 2 : 0).padStart(8)).join('')); }
}
console.log('\nвещи на волне 20:');
for (const c of HERO_CLASSES) console.log('  ' + c.padEnd(9) + Object.entries(items[c] ?? {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' '));
