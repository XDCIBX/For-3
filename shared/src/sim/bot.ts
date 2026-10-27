import { CLASSES } from '../data/classes';
import { itemScore } from '../data/items';
import type { Game, Player } from './game';
import { isCombatPhase } from './game';

/** Простой ИИ для ботов — заполняют пустые места в команде. */
export function updateBot(g: Game, p: Player, dt: number) {
  if (g.phase === 'lobby') {
    p.ready = true;
    return;
  }
  if (g.phase === 'tavern') {
    p.ai.tavernT -= dt;
    if (p.ai.tavernT > 0 || p.ready) return;
    // Покупаем лучшее доступное улучшение
    const options = g.shop
      .filter((it) => (!it.cls || it.cls === p.cls) && it.price <= p.gold)
      .filter((it) => itemScore(it) > itemScore(p.equip[it.slot]) + 2)
      .sort((a, b) => itemScore(b) - itemScore(a));
    if (options.length > 0) {
      g.buy(p, options[0].id);
      p.ai.tavernT = 1 + Math.random() * 2;
    } else p.ready = true;
    return;
  }
  if (!p.alive || p.spectator) {
    p.input = { mx: 0, mz: 0 };
    return;
  }
  p.ai.think -= dt;
  if (p.ai.think > 0) return;
  p.ai.think = 0.12 + Math.random() * 0.08;

  if (!isCombatPhase(g.phase)) {
    // Возвращаемся к лагерю
    const d = Math.hypot(p.x, p.z);
    p.input = d > 4 ? { mx: -p.x / d, mz: -p.z / d } : { mx: 0, mz: 0 };
    return;
  }

  const target = g.nearestTarget(p, 60);
  if (!target) {
    const d = Math.hypot(p.x, p.z);
    p.input = d > 5 ? { mx: -p.x / d, mz: -p.z / d } : { mx: 0, mz: 0 };
    return;
  }
  const dx = target.x - p.x;
  const dz = target.z - p.z;
  const dist = Math.hypot(dx, dz) || 0.01;
  const nx = dx / dist;
  const nz = dz / dist;
  const desired = p.cls === 'warrior' ? 1.4 : p.cls === 'mage' ? 7.5 : 9;

  // Опасность рядом: сколько врагов близко
  const all = g.targetsFor(p);
  const near = (r: number) => all.filter((t) => Math.hypot(t.x - p.x, t.z - p.z) - t.rad < r).length;

  let mx = 0;
  let mz = 0;
  if (dist > desired + 1) {
    mx = nx;
    mz = nz;
  } else if (dist < desired - 2 && p.cls !== 'warrior') {
    mx = -nx;
    mz = -nz;
  }
  if (p.cls !== 'warrior' && dist < desired + 1.5) {
    // кружим вокруг цели
    mx += -nz * p.ai.strafe * 0.7;
    mz += nx * p.ai.strafe * 0.7;
    if (Math.random() < 0.03) p.ai.strafe *= -1;
  }
  // Не уходим к краю острова
  const dc = Math.hypot(p.x, p.z);
  if (dc > g.bound - 4) {
    mx -= (p.x / dc) * 1.2;
    mz -= (p.z / dc) * 1.2;
  }
  const l = Math.hypot(mx, mz);
  p.input = l > 0.05 ? { mx: mx / Math.max(1, l), mz: mz / Math.max(1, l) } : { mx: 0, mz: 0 };

  const aim = (spread = 0.12) => {
    const a = Math.atan2(nx, nz) + (Math.random() - 0.5) * spread;
    return { dx: Math.sin(a), dz: Math.cos(a) };
  };
  const sk = CLASSES[p.cls].skills;
  const ready = (i: number) => p.cds[i] <= 0;
  const cast = (i: number, a = aim(), d = dist) => g.castSkill(p, i, a.dx, a.dz, d);

  switch (p.cls) {
    case 'warrior':
      if (ready(3) && near(8) >= 4) cast(3);
      else if (ready(2) && near(3.2) >= 2) cast(2);
      else if (ready(1) && dist > 3 && dist < 7.5) cast(1);
      else if (ready(0) && dist - target.rad < sk[0].range) cast(0);
      break;
    case 'mage':
      if (ready(2) && near(4.5) >= 2) cast(2);
      else if (ready(3) && dist < sk[3].range && (near(10) >= 3 || target.kind === 'p')) cast(3, aim(0.05), dist);
      else if (ready(1) && dist < sk[1].range) cast(1);
      else if (ready(0) && dist < sk[0].range) cast(0);
      break;
    case 'archer':
      if (ready(2) && near(2.6) >= 1) {
        const a = Math.atan2(-nx, -nz) + (Math.random() - 0.5) * 1.2;
        cast(2, { dx: Math.sin(a), dz: Math.cos(a) });
      } else if (ready(3) && dist < sk[3].range && (near(12) >= 3 || target.kind === 'p')) cast(3, aim(0.05), dist);
      else if (ready(1) && dist < sk[1].range) cast(1);
      else if (ready(0) && dist < sk[0].range) cast(0);
      break;
  }
}
