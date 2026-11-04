import { Game } from '../../shared/src/sim/game';
import { DT } from '../../shared/src/constants';
import { computeStats } from '../../shared/src/data/items';
// Источники урона по героям на поздних волнах
const N = +(process.env.N ?? 8);
const by: Record<string, number> = {};
for (let s = 0; s < N; s++) {
  const g = new Game(9100 + s * 13) as any;
  g.addBot(); g.addBot(); g.addBot();
  const CL = ['warrior', 'mage', 'archer', 'hunter', 'summoner', 'werewolf', 'dwarf'] as const;
  [...g.players.values()].forEach((p: any, i: number) => { p.cls = CL[(s * 3 + i) % 7]; p.stats = computeStats(p.cls, p.equip); p.hp = p.stats.maxHp; });
  let src = '?';
  const wrap = (name: string, tag: (...a: any[]) => string) => { const o = g[name].bind(g); g[name] = (...a: any[]) => { const prev = src; src = tag(...a); const r = o(...a); src = prev; return r; }; };
  wrap('mobAttack', (m: any) => m.kind + '-atk');
  wrap('updateZones', () => 'zone');
  wrap('updateProjectiles', () => 'proj');
  const zz = g.updateZones.bind(g);
  const dp = g.damagePlayer.bind(g);
  g.damagePlayer = (t: any, v: number, c: boolean, sr: any) => { const r = dp(t, v, c, sr); if (g.round >= 19) { const k = g.round + ':' + src; by[k] = (by[k] ?? 0) + r; } return r; };
  // зоны: уточняем тип
  g.updateZones = (dt: number) => { for (const zn of g.zones.values()) zn._k = zn.kind; zz(dt); };
  g.startGame();
  let t = 0;
  while (g.phase !== 'gameover' && t < 30000) { g.update(DT); g.snapshot(); t += DT; }
}
const rows = Object.entries(by).sort();
for (const [k, v] of rows) console.log(k, Math.round(v / N));
