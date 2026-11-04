// Балансировка: PvE-вклад классов и ПвП-винрейт каждого против каждого
import { Game, type Player } from '../../shared/src/sim/game';
import { DT } from '../../shared/src/constants';
import { HERO_CLASSES, type HeroClass } from '../../shared/src/types';
import { makeItem, TEMPLATE_BY_ID, computeStats } from '../../shared/src/data/items';

const mode = process.argv[2] ?? 'all';
const combos: HeroClass[][] = [];
const NC = HERO_CLASSES.length;
for (let i = 0; i < NC; i++) for (let j = i + 1; j < NC; j++) for (let k = j + 1; k < NC; k++) combos.push([HERO_CLASSES[i], HERO_CLASSES[j], HERO_CLASSES[k]]);

function team(seed: number, classes: HeroClass[]) {
  const g = new Game(seed);
  for (const c of classes) {
    const p = g.addBot() as Player;
    p.cls = c;
    p.stats = computeStats(c, p.equip);
    p.hp = p.stats.maxHp;
  }
  return g;
}

if (mode === 'all' || mode === 'pve') {
  const agg: Record<string, { dmg: number; kills: number; deaths: number; n: number; rounds: number }> = {};
  for (const c of HERO_CLASSES) agg[c] = { dmg: 0, kills: 0, deaths: 0, n: 0, rounds: 0 };
  let seed = 1;
  for (const combo of combos) {
    for (let rep = 0; rep < +(process.env.PVE_REPS ?? 1); rep++) {
      const g = team(seed++, combo);
      g.startRound = 1;
      g.startGame();
      let t = 0;
      const deaths: Record<string, number> = {};
      // PvP-раунды пропускаем, чтобы мерить только бой с мобами
      while (g.phase !== 'gameover' && g.round <= 14 && t < 4000) {
        if (g.phase === 'intro' && g.round % 5 === 0) { g.round++; g.beginRound(); }
        g.update(DT);
        const s = g.snapshot();
        for (const e of s.E) if (e.e === 'pdie') deaths[e.pid] = (deaths[e.pid] ?? 0) + 1;
        t += DT;
      }
      const tot = [...g.players.values()].reduce((a, p) => a + p.dmgDealt, 0) || 1;
      for (const p of g.players.values()) {
        const a = agg[p.cls];
        a.dmg += p.dmgDealt / tot; a.kills += p.kills; a.deaths += deaths[p.id] ?? 0; a.n++; a.rounds += g.round;
      }
    }
  }
  console.log('PvE (доля урона в команде, убийства, смерти за игру, средний раунд):');
  for (const c of HERO_CLASSES) {
    const a = agg[c];
    console.log(`  ${c.padEnd(9)} урон ${(a.dmg / a.n * 100).toFixed(1)}%  убийств ${(a.kills / a.n).toFixed(0)}  смертей ${(a.deaths / a.n).toFixed(1)}  раунд ${(a.rounds / a.n).toFixed(1)}`);
  }
}

if (mode === 'all' || mode === 'pvp') {
  const tiers: [string, number][] = (process.env.TIERS ?? 'common:1,rare:6,epic:11,legendary:16,relic:18').split(',').map((x) => { const [a, b] = x.split(':'); return [a, +b] as [string, number]; });
  const weapon: Record<HeroClass, string> = { warrior: 'sword', mage: 'staff', archer: 'bow', hunter: 'glaives', summoner: 'tome', werewolf: 'claws', dwarf: 'blunderbuss' };
  const wins: Record<string, number> = {};
  const games: Record<string, number> = {};
  for (const c of HERO_CLASSES) { wins[c] = 0; games[c] = 0; }
  const matrix: Record<string, Record<string, number>> = {};
  const tw: Record<string, Record<string, number>> = {};
  let seed = 1000;
  for (const [rar, round] of tiers) {
    for (let i = 0; i < HERO_CLASSES.length; i++) for (let j = i + 1; j < HERO_CLASSES.length; j++) {
      const A = HERO_CLASSES[i], B = HERO_CLASSES[j];
      for (let rep = 0; rep < +(process.env.PVP_REPS ?? 8); rep++) {
        const g = team(seed++, [A, B]);
        for (const p of g.players.values()) {
          if (round > 1) for (const t of [weapon[p.cls], 'helm', 'plate', 'boots', 'amulet', 'ring']) {
            const it = makeItem(TEMPLATE_BY_ID[t], rar as 'rare', round);
            p.equip[it.slot] = it;
          }
        }
        g.startRound = round <= 5 ? 5 : round <= 10 ? 10 : round <= 15 ? 15 : 20;
        g.startGame();
        let t = 0; let winner: string | null = null;
        while (t < 200) {
          g.update(DT); const s = g.snapshot(); t += DT;
          const d = s.E.find((e) => e.e === 'duel');
          if (d && d.e === 'duel') { winner = d.winner; break; }
        }
        const pa = [...g.players.values()].find((p) => p.cls === A)!;
        games[A]++; games[B]++;
        const key = `${A}-${B}`;
        matrix[key] = matrix[key] ?? 0 as unknown as Record<string, number>;
        const tk = rar; tw[tk] = tw[tk] ?? {}; tw[tk][A] = (tw[tk][A] ?? 0) + (winner === pa.id ? 1 : 0); tw[tk][B] = (tw[tk][B] ?? 0) + (winner && winner !== pa.id ? 1 : 0);
        if (winner === pa.id) { wins[A]++; (matrix as any)[key] = ((matrix as any)[key] || 0) + 1; }
        else if (winner) wins[B]++;
      }
    }
  }
  console.log('ПвП винрейт (одинаковое снаряжение, 3 уровня):');
  for (const c of HERO_CLASSES) console.log(`  ${c.padEnd(9)} ${(wins[c] / games[c] * 100).toFixed(0)}%`);
  for (const [t, m] of Object.entries(tw)) console.log('  ' + t.padEnd(10), HERO_CLASSES.map((c) => `${c} ${Math.round((m[c] ?? 0) / (+(process.env.PVP_REPS ?? 8) * (HERO_CLASSES.length - 1)) * 100)}%`).join('  '));
  console.log('  пары (победы первого из ' + 12 * tiers.length + '):', Object.entries(matrix).map(([k, v]) => `${k}:${v}`).join(' '));
}
