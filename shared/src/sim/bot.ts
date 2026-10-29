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
  const melee = p.cls === 'warrior' || p.cls === 'hunter' || p.cls === 'werewolf';
  const desired = melee ? 1.4 : p.cls === 'dwarf' ? 5 : p.cls === 'mage' || p.cls === 'summoner' ? 7.5 : 9;

  // Опасность рядом: сколько врагов близко
  const all = g.targetsFor(p);
  const near = (r: number) => all.filter((t) => Math.hypot(t.x - p.x, t.z - p.z) - t.rad < r).length;

  let mx = 0;
  let mz = 0;
  if (dist > desired + 1) {
    mx = nx;
    mz = nz;
  } else if (dist < desired - 2 && !melee) {
    mx = -nx;
    mz = -nz;
  }
  if (!melee && dist < desired + 1.5) {
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
  // Уклонение от вражеских зон: удар босса, огненные шары и горящая земля, дыхание дракона
  for (const zn of g.zones.values()) {
    if (zn.owner !== null) continue;
    const ex = p.x - zn.x;
    const ez = p.z - zn.z;
    const d = Math.hypot(ex, ez) || 0.01;
    if (zn.kind === 'breath') {
      if (d > zn.r + 1) continue;
      let da = Math.atan2(ex, ez) - (zn.a ?? 0);
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) > (zn.arc ?? 0.6) + 0.45) continue;
      const a = (zn.a ?? 0) + (da >= 0 ? 1 : -1) * (Math.PI / 2);
      mx += Math.sin(a) * 2.4;
      mz += Math.cos(a) * 2.4;
    } else if (d < zn.r + 1.1) {
      mx += (ex / d) * 2.2;
      mz += (ez / d) * 2.2;
    }
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
      if (ready(3) && (near(8) >= 4 || (target.kind === 'p' && dist < 6))) cast(3);
      else if (ready(2) && (near(3.2) >= 2 || (target.kind === 'p' && dist < 3))) cast(2);
      else if (ready(1) && dist > 3 && dist < 7.5) cast(1);
      else if (ready(0) && dist - target.rad < sk[0].range) cast(0);
      break;
    case 'mage':
      if (ready(2) && (near(4.5) >= 2 || (target.kind === 'p' && dist < 4.5))) cast(2);
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
    case 'hunter':
      if (ready(3) && (near(5) >= 3 || target.kind === 'p')) cast(3);
      else if (ready(1) && dist > 3 && dist < 7) cast(1);
      else if (ready(2) && dist < sk[2].range) cast(2);
      else if (ready(0) && dist - target.rad < sk[0].range) cast(0);
      break;
    case 'werewolf':
      if (ready(3) && (near(5) >= 3 || target.kind === 'p')) cast(3);
      else if (ready(2) && (near(6) >= 3 || (target.kind === 'p' && dist < 5))) cast(2);
      else if (ready(1) && dist > 3 && dist < sk[1].range) cast(1, aim(0.05), dist);
      else if (ready(0) && dist - target.rad < sk[0].range) cast(0);
      break;
    case 'dwarf': {
      const turret = [...g.minions.values()].some((n) => n.owner === p.id && n.kind === 'turret');
      if (ready(3) && (near(5) >= 3 || (target.kind === 'p' && dist < 4.5))) cast(3);
      else if (ready(2) && !turret && dist < 12) cast(2, aim(0.05), Math.min(dist, 4));
      else if (ready(1) && dist < sk[1].range && (near(9) >= 2 || target.kind === 'p')) cast(1, aim(0.05), dist);
      else if (ready(0) && dist < sk[0].range) cast(0);
      break;
    }
    case 'summoner': {
      const mine = [...g.minions.values()].filter((n) => n.owner === p.id);
      if (ready(1) && !mine.some((n) => n.kind === 'wolf')) cast(1);
      else if (ready(2) && !mine.some((n) => n.kind === 'golem') && (near(10) >= 2 || target.kind === 'p')) cast(2);
      else if (ready(3) && dist < sk[3].range && (near(9) >= 2 || target.kind === 'p')) cast(3, aim(0.05), dist);
      else if (ready(0) && dist < sk[0].range) cast(0);
      break;
    }
  }
}
