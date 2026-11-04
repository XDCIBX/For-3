import { Game } from '../../shared/src/sim/game';
import { DT } from '../../shared/src/constants';
import { computeStats } from '../../shared/src/data/items';
// Полная игра ботами: где проигрывают, смерти и длительность по волнам, бой с драконом
const N = +(process.env.N ?? 8);
const lost: Record<number, number> = {};
const deathsBy: Record<number, number> = {};
const timeBy: Record<number, number> = {};
const hpBy: Record<number, number> = {};
let wins = 0;
let dragonT = 0, dragonN = 0, dragonHpLeft = 0;
for (let s = 0; s < N; s++) {
  const g = new Game(9100 + s * 13);
  g.addBot(); g.addBot(); g.addBot();
  const CL = ['warrior', 'mage', 'archer', 'hunter', 'summoner', 'werewolf', 'dwarf'] as const;
  [...g.players.values()].forEach((p, i) => { p.cls = CL[(s * 3 + i * (s % 2 ? 2 : 1)) % 7]; });
  const seen = new Set<string>();
  for (const p of g.players.values()) { while (seen.has(p.cls)) p.cls = CL[(CL.indexOf(p.cls) + 1) % 7]; seen.add(p.cls); }
  for (const p of g.players.values()) { p.stats = computeStats(p.cls, p.equip); p.hp = p.stats.maxHp; }
  if (process.env.START) g.startRound = +process.env.START;
  g.startGame();
  let t = 0;
  let rt = 0;
  while (g.phase !== 'gameover' && t < 30000) {
    g.update(DT);
    const sn = g.snapshot();
    for (const e of sn.E) if (e.e === 'pdie') deathsBy[g.round] = (deathsBy[g.round] ?? 0) + 1;
    if (g.phase === 'battle') { rt += DT; timeBy[g.round] = (timeBy[g.round] ?? 0) + DT; }
    if (g.phase === 'battle' && g.round === 25) { dragonT += DT;
      const d = [...g.mobs.values()].find((m) => m.kind === 'dragon');
      if (d) dragonHpLeft = d.hp / d.maxHp;
    }
    if (g.phase === 'intro') hpBy[g.round] = [...g.players.values()].reduce((a, p) => a + p.stats.maxHp, 0) / 3;
    t += DT;
  }
  const r = g.snapshot().result;
  if (r?.win) wins++;
  else lost[r?.round ?? g.round] = (lost[r?.round ?? g.round] ?? 0) + 1;
  if ((r?.round ?? 0) === 25) { dragonN++; }
  console.log(`seed ${s}: ${r?.win ? 'ПОБЕДА' : 'поражение на ' + (r?.round ?? g.round)} классы ${[...g.players.values()].map((p) => p.cls).join(',')} ${r?.round === 25 && !r.win ? 'дракон hp ' + (dragonHpLeft * 100).toFixed(0) + '%' : ''}`);
}
console.log(`побед ${wins}/${N}; проигрыши по волнам`, lost, 'бой с драконом в среднем', dragonN ? (dragonT / dragonN).toFixed(0) + 'с' : '-');
const rows = Object.keys(timeBy).map(Number).filter((r) => r >= 16).map((r) => `${r}: время ${(timeBy[r] / N).toFixed(0)}с смертей ${((deathsBy[r] ?? 0) / N).toFixed(1)} hp ${Math.round(hpBy[r] ?? 0)}`);
console.log(rows.join('\n'));
