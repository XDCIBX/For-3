import { Rng } from './rng';
import { ARENA_RADIUS, LAIR_ROUND, WORLD_RADIUS } from './constants';

/** stalagmite, lava, hoard — препятствия логова дракона. */
export type ObstacleKind = 'tree' | 'rock' | 'pillar' | 'pond' | 'campfire' | 'tent' | 'stump' | 'stalagmite' | 'lava' | 'hoard';

export interface Obstacle {
  x: number;
  z: number;
  r: number;
  kind: ObstacleKind;
  /** Низкое препятствие: не блокирует снаряды. */
  low?: boolean;
  variant: number;
  scale: number;
  rot: number;
}

export interface Vec2 {
  x: number;
  z: number;
}

export interface WorldData {
  seed: number;
  /** Остров (волны 1–20) или логово дракона (21–25). */
  kind?: 'island' | 'lair';
  radius: number;
  obstacles: Obstacle[];
  spawns: Vec2[];
  pond: Vec2 & { r: number };
  ruins: Vec2;
}

function distToSeg(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / (abx * abx + abz * abz || 1)));
  const dx = a.x + abx * t - p.x;
  const dz = a.z + abz * t - p.z;
  return Math.hypot(dx, dz);
}

export function generateWorld(seed: number): WorldData {
  const rng = new Rng(seed);
  const obstacles: Obstacle[] = [];
  const R = WORLD_RADIUS;

  const spawns: Vec2[] = [];
  const nSpawns = 5;
  const a0 = rng.range(0, Math.PI * 2);
  for (let i = 0; i < nSpawns; i++) {
    const a = a0 + (i / nSpawns) * Math.PI * 2 + rng.range(-0.2, 0.2);
    spawns.push({ x: Math.cos(a) * (R - 3.5), z: Math.sin(a) * (R - 3.5) });
  }
  const center = { x: 0, z: 0 };

  const free = (x: number, z: number, r: number, pad = 0.4) => {
    for (const o of obstacles) if (Math.hypot(o.x - x, o.z - z) < o.r + r + pad) return false;
    return true;
  };
  const nearPath = (p: Vec2, w: number) => spawns.some((s) => distToSeg(p, center, s) < w);

  obstacles.push({ x: 0, z: 0, r: 0.75, kind: 'campfire', low: true, variant: 0, scale: 1, rot: 0 });
  obstacles.push({ x: -4.2, z: -3.4, r: 1.3, kind: 'tent', variant: 0, scale: 1, rot: 0.6 });
  obstacles.push({ x: 4.6, z: -3.0, r: 1.3, kind: 'tent', variant: 1, scale: 1, rot: -0.7 });

  // Пруд
  let pond = { x: 0, z: 18, r: 3.4 };
  for (let tries = 0; tries < 40; tries++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(14, 21);
    const p = { x: Math.cos(a) * d, z: Math.sin(a) * d, r: rng.range(3, 3.8) };
    if (!nearPath(p, p.r + 2)) {
      pond = p;
      break;
    }
  }
  obstacles.push({ x: pond.x, z: pond.z, r: pond.r, kind: 'pond', low: true, variant: 0, scale: 1, rot: 0 });

  // Руины
  let ruins = { x: -16, z: 6 };
  for (let tries = 0; tries < 60; tries++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(13, 21);
    const p = { x: Math.cos(a) * d, z: Math.sin(a) * d };
    if (!nearPath(p, 5.5) && Math.hypot(p.x - pond.x, p.z - pond.z) > pond.r + 7) {
      ruins = p;
      break;
    }
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    obstacles.push({
      x: ruins.x + Math.cos(a) * 3.4,
      z: ruins.z + Math.sin(a) * 3.4,
      r: 0.6,
      kind: 'pillar',
      variant: rng.int(0, 2),
      scale: rng.range(0.7, 1.15),
      rot: rng.range(0, Math.PI),
    });
  }

  // Деревья
  let placed = 0;
  for (let tries = 0; tries < 900 && placed < 62; tries++) {
    const a = rng.range(0, Math.PI * 2);
    const d = Math.sqrt(rng.range(0.08, 1)) * (R - 1.2);
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    if (d < 9) continue;
    const r = rng.range(0.55, 0.8);
    if (nearPath({ x, z }, 2.4)) continue;
    if (spawns.some((s) => Math.hypot(s.x - x, s.z - z) < 4.5)) continue;
    if (!free(x, z, r, 1.1)) continue;
    const roll = rng.next();
    const variant = roll < 0.45 ? 0 : roll < 0.85 ? 1 : 2; // ель, дуб, берёза
    obstacles.push({ x, z, r, kind: 'tree', variant, scale: rng.range(0.85, 1.3), rot: rng.range(0, Math.PI * 2) });
    placed++;
  }
  // Камни и пни
  placed = 0;
  for (let tries = 0; tries < 500 && placed < 22; tries++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(6, R - 1.5);
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const stump = rng.chance(0.2);
    const r = stump ? 0.45 : rng.range(0.5, 1.3);
    if (nearPath({ x, z }, 1.8)) continue;
    if (spawns.some((s) => Math.hypot(s.x - x, s.z - z) < 4)) continue;
    if (!free(x, z, r, 0.8)) continue;
    obstacles.push({ x, z, r, kind: stump ? 'stump' : 'rock', variant: rng.int(0, 2), scale: 1, rot: rng.range(0, Math.PI * 2) });
    placed++;
  }

  return { seed, radius: R, obstacles, spawns, pond, ruins, kind: 'island' };
}

/** Карта для волны: с 21-й бой идёт в логове дракона. */
export function worldFor(seed: number, round: number): WorldData {
  return round >= LAIR_ROUND ? generateLair(seed) : generateWorld(seed);
}

/**
 * Логово дракона: кратер из базальта с лавовым озером, сталагмитами и
 * грудой сокровищ. Пять пещерных ходов по краю — оттуда лезут мобы.
 * pond — лавовое озеро, ruins — сокровищница (гнездо дракона).
 */
export function generateLair(seed: number): WorldData {
  const rng = new Rng(seed * 7 + 13);
  const obstacles: Obstacle[] = [];
  const R = WORLD_RADIUS;
  const spawns: Vec2[] = [];
  const a0 = rng.range(0, Math.PI * 2);
  for (let i = 0; i < 5; i++) {
    const a = a0 + (i / 5) * Math.PI * 2 + rng.range(-0.15, 0.15);
    spawns.push({ x: Math.cos(a) * (R - 3.5), z: Math.sin(a) * (R - 3.5) });
  }
  const center = { x: 0, z: 0 };
  const free = (x: number, z: number, r: number, pad = 0.4) => {
    for (const o of obstacles) if (Math.hypot(o.x - x, o.z - z) < o.r + r + pad) return false;
    return true;
  };
  const nearPath = (p: Vec2, w: number) => spawns.some((s) => distToSeg(p, center, s) < w);

  // Гнездо с сокровищами — на севере, там просыпается дракон
  const ruins = { x: 0, z: -17 };
  obstacles.push({ x: ruins.x, z: ruins.z - 2.2, r: 1.8, kind: 'hoard', low: true, variant: 0, scale: 1, rot: 0 });
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * (0.15 + (i / 6) * 0.7) + Math.PI;
    obstacles.push({ x: ruins.x + Math.cos(a) * 6.5, z: ruins.z - 2 + Math.sin(a) * 4.5, r: 0.7, kind: 'stalagmite', variant: i % 3, scale: rng.range(1.1, 1.6), rot: rng.range(0, 6) });
  }
  // Лавовое озеро
  let pond = { x: 16, z: 10, r: 4 };
  for (let tries = 0; tries < 40; tries++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(15, 21);
    const p = { x: Math.cos(a) * d, z: Math.sin(a) * d, r: rng.range(3.4, 4.4) };
    if (!nearPath(p, p.r + 2) && Math.hypot(p.x - ruins.x, p.z - ruins.z) > p.r + 9) {
      pond = p;
      break;
    }
  }
  obstacles.push({ x: pond.x, z: pond.z, r: pond.r, kind: 'lava', low: true, variant: 0, scale: 1, rot: 0 });
  // Сталагмиты
  let placed = 0;
  for (let tries = 0; tries < 900 && placed < 34; tries++) {
    const a = rng.range(0, Math.PI * 2);
    const d = Math.sqrt(rng.range(0.1, 1)) * (R - 1.5);
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    if (d < 8) continue;
    const r = rng.range(0.45, 0.85);
    if (nearPath({ x, z }, 2.4)) continue;
    if (spawns.some((s) => Math.hypot(s.x - x, s.z - z) < 4.5)) continue;
    if (Math.hypot(x - ruins.x, z - ruins.z) < 6) continue;
    if (!free(x, z, r, 1.0)) continue;
    obstacles.push({ x, z, r, kind: 'stalagmite', variant: rng.int(0, 2), scale: rng.range(0.8, 1.5), rot: rng.range(0, Math.PI * 2) });
    placed++;
  }
  // Базальтовые глыбы
  placed = 0;
  for (let tries = 0; tries < 500 && placed < 16; tries++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(7, R - 1.5);
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const r = rng.range(0.6, 1.4);
    if (nearPath({ x, z }, 1.8)) continue;
    if (spawns.some((s) => Math.hypot(s.x - x, s.z - z) < 4)) continue;
    if (Math.hypot(x - ruins.x, z - ruins.z) < 5) continue;
    if (!free(x, z, r, 0.8)) continue;
    obstacles.push({ x, z, r, kind: 'rock', variant: rng.int(0, 2), scale: 1, rot: rng.range(0, Math.PI * 2) });
    placed++;
  }
  return { seed, radius: R, obstacles, spawns, pond, ruins, kind: 'lair' };
}

export const ARENA_OBSTACLES: Obstacle[] = [0, 1, 2, 3].map((i) => {
  const a = Math.PI / 4 + (i * Math.PI) / 2;
  return { x: Math.cos(a) * 6.5, z: Math.sin(a) * 6.5, r: 0.85, kind: 'pillar' as const, variant: 0, scale: 1, rot: 0 };
});
export const ARENA_BOUND = ARENA_RADIUS;

/** Выталкивает круг из препятствий и удерживает внутри границы. */
/**
 * Сетка препятствий: для каждой клетки 3×3 — препятствия (в исходном порядке), которые могут повлиять на
 * объект в этой клетке. Моб проверяет пару десятков ближних камней, а не все ~100 на острове. Порядок тот же,
 * лишние по-прежнему отсеиваются точными проверками — результат совпадает с полным перебором.
 */
const CELL = 3;
/** Запас дальности: обход препятствий смотрит на 2,2 + 2r(камня) + r(моба, до 2,6) + 0,25 вперёд и вбок. */
const REACH = 5.3;
interface ObstacleGrid {
  x0: number;
  z0: number;
  nx: number;
  nz: number;
  cells: Obstacle[][];
}
const grids = new WeakMap<readonly Obstacle[], ObstacleGrid | null>();
function gridOf(obstacles: readonly Obstacle[]): ObstacleGrid | null {
  let g = grids.get(obstacles);
  if (g !== undefined) return g;
  g = null;
  if (obstacles.length > 12) {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const o of obstacles) {
      x0 = Math.min(x0, o.x - o.r);
      z0 = Math.min(z0, o.z - o.r);
      x1 = Math.max(x1, o.x + o.r);
      z1 = Math.max(z1, o.z + o.r);
    }
    x0 -= REACH + 6;
    z0 -= REACH + 6;
    const nx = Math.ceil((x1 + REACH + 6 - x0) / CELL);
    const nz = Math.ceil((z1 + REACH + 6 - z0) / CELL);
    const cells: Obstacle[][] = new Array(nx * nz);
    // Соседние клетки часто видят одни и те же камни — одинаковые списки храним один раз (память сервера)
    const shared = new Map<string, Obstacle[]>();
    for (let iz = 0; iz < nz; iz++)
      for (let ix = 0; ix < nx; ix++) {
        const cx0 = x0 + ix * CELL, cz0 = z0 + iz * CELL;
        const idx: number[] = [];
        obstacles.forEach((o, i) => {
          // Расстояние от центра камня до клетки
          const dx = Math.max(cx0 - o.x, 0, o.x - (cx0 + CELL));
          const dz = Math.max(cz0 - o.z, 0, o.z - (cz0 + CELL));
          const reach = 2 * o.r + REACH;
          if (dx * dx + dz * dz < reach * reach) idx.push(i);
        });
        const key = idx.join(',');
        let list = shared.get(key);
        if (!list) shared.set(key, (list = idx.map((i) => obstacles[i])));
        cells[iz * nx + ix] = list;
      }
    g = { x0, z0, nx, nz, cells };
  }
  grids.set(obstacles, g);
  return g;
}

/**
 * Препятствия, которые могут коснуться объекта радиусом до 2,6 в точке (x, z) или оказаться у него на пути
 * в пределах 2,2 вперёд (обход). Порядок — как в исходном списке. Вне сетки — весь список.
 */
export function obstaclesNear(obstacles: readonly Obstacle[], x: number, z: number): readonly Obstacle[] {
  const g = gridOf(obstacles);
  if (!g) return obstacles;
  const ix = Math.floor((x - g.x0) / CELL);
  const iz = Math.floor((z - g.z0) / CELL);
  if (!(ix >= 0 && iz >= 0 && ix < g.nx && iz < g.nz)) return obstacles;
  return g.cells[iz * g.nx + ix];
}

export function resolveCollision(pos: Vec2, r: number, obstacles: readonly Obstacle[], bound: number): void {
  // Обычно объект ни во что не упирается — проверяем только ближние камни. Если толчок всё же был, повторяем
  // полным перебором с исходной точки: цепочка толчков могла бы увести к камню вне ближнего списка.
  const near = r <= 2.6 ? obstaclesNear(obstacles, pos.x, pos.z) : obstacles;
  if (near !== obstacles) {
    let hit = false;
    for (const o of near) {
      const dx = pos.x - o.x;
      const dz = pos.z - o.z;
      const min = o.r + r;
      if (dx * dx + dz * dz < min * min) {
        hit = true;
        break;
      }
    }
    if (!hit) {
      clampToBound(pos, r, bound);
      return;
    }
  }
  for (const o of obstacles) {
    const dx = pos.x - o.x;
    const dz = pos.z - o.z;
    const min = o.r + r;
    const d2 = dx * dx + dz * dz;
    if (d2 < min * min) {
      const d = Math.sqrt(d2) || 0.0001;
      pos.x = o.x + (dx / d) * min;
      pos.z = o.z + (dz / d) * min;
    }
  }
  clampToBound(pos, r, bound);
}

function clampToBound(pos: Vec2, r: number, bound: number) {
  const d = Math.hypot(pos.x, pos.z);
  const maxD = bound - r;
  if (d > maxD) {
    pos.x *= maxD / d;
    pos.z *= maxD / d;
  }
}

/** Пересекает ли отрезок высокое препятствие (для снарядов). */
export function hitsSolid(x: number, z: number, r: number, obstacles: readonly Obstacle[]): boolean {
  for (const o of r <= 2.6 ? obstaclesNear(obstacles, x, z) : obstacles) {
    if (o.low) continue;
    const dx = x - o.x;
    const dz = z - o.z;
    const min = o.r * 0.85 + r;
    if (dx * dx + dz * dz < min * min) return true;
  }
  return false;
}

/** Упрётся ли снаряд радиуса r в высокое препятствие по пути из (x0, z0) в (x1, z1). */
export function shotBlocked(x0: number, z0: number, x1: number, z1: number, r: number, obstacles: readonly Obstacle[]): boolean {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len2 = dx * dx + dz * dz || 1e-6;
  for (const o of obstacles) {
    if (o.low) continue;
    const t = Math.min(1, Math.max(0, ((o.x - x0) * dx + (o.z - z0) * dz) / len2));
    const px = x0 + dx * t - o.x;
    const pz = z0 + dz * t - o.z;
    const min = o.r * 0.85 + r;
    if (px * px + pz * pz < min * min) return true;
  }
  return false;
}
