import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Анатомические формы и походка для героев и мобов: сужающиеся конечности с
 * мышечным рельефом, торс с талией и грудной клеткой, голова с челюстью,
 * скулами и глазницами, кисти с пальцами, стопы. Плюс кинематика шага:
 * колени, лодыжки, локти и «прилипание» стоп к земле.
 */

const cache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = cache.get(key);
  if (!g) cache.set(key, (g = make()));
  return g;
}

/**
 * Сегмент конечности от сустава (y = 0) вниз до y = -len: скруглённые концы,
 * сужение и «мышца» в верхней трети. bulge — насколько выражен рельеф.
 */
export function limb(rTop: number, rBot: number, len: number, bulge = 0.12, seg = 10): THREE.BufferGeometry {
  return cached(`limb${rTop}|${rBot}|${len}|${bulge}|${seg}`, () => {
    const pts: THREE.Vector2[] = [];
    // Верхний купол
    for (let i = 0; i <= 4; i++) {
      const a = (i / 4) * (Math.PI / 2);
      pts.push(new THREE.Vector2(Math.sin(a) * rTop, Math.cos(a) * rTop * 0.7));
    }
    // Тело сегмента
    const n = 8;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const r = THREE.MathUtils.lerp(rTop, rBot, t) * (1 + bulge * Math.sin(Math.min(1, t * 1.5) * Math.PI));
      pts.push(new THREE.Vector2(r, -len * t));
    }
    // Нижний купол
    for (let i = 0; i <= 4; i++) {
      const a = (i / 4) * (Math.PI / 2);
      pts.push(new THREE.Vector2(Math.cos(a) * rBot, -len - Math.sin(a) * rBot * 0.7));
    }
    pts[pts.length - 1].x = 0;
    const g = new THREE.LatheGeometry(pts, seg);
    g.computeVertexNormals();
    return g;
  });
}

/** Торс: таз, талия, грудная клетка, покатые плечи; спина плоская, грудь вперёд. */
export function torsoShape(w = 1, d = 1, stout = 0): THREE.BufferGeometry {
  return cached(`torso${w}|${d}|${stout}`, () => {
    const prof: [number, number][] = [
      [0.0, -0.16],
      [0.17, -0.14],
      [0.245, -0.05],
      [0.255, 0.06],
      [0.24 + stout * 0.05, 0.2],
      [0.25 + stout * 0.05, 0.3],
      [0.28 + stout * 0.03, 0.42],
      [0.295, 0.53],
      [0.29, 0.62],
      [0.25, 0.7],
      [0.15, 0.765],
      [0.0, 0.785],
    ];
    const g = new THREE.LatheGeometry(
      prof.map(([r, y]) => new THREE.Vector2(r, y)),
      20,
    );
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i);
      const y = p.getY(i);
      let z = p.getZ(i) * 0.74;
      // Грудные мышцы и лопатки
      if (z > 0) {
        const chest = Math.exp(-(((y - 0.52) / 0.13) ** 2)) * Math.exp(-(((Math.abs(x) - 0.13) / 0.12) ** 2));
        z += 0.035 * chest + 0.02 * Math.exp(-(((y - 0.2) / 0.12) ** 2)) * stout;
      } else {
        z *= 0.92;
        z -= 0.015 * Math.exp(-(((y - 0.55) / 0.12) ** 2)) * Math.exp(-(((Math.abs(x) - 0.13) / 0.1) ** 2));
      }
      // Плечи шире груди
      x *= 1.05 + 0.06 * Math.exp(-(((y - 0.64) / 0.08) ** 2));
      p.setXYZ(i, x * w, y, z * d);
    }
    g.computeVertexNormals();
    return g;
  });
}

/**
 * Голова радиуса ~0.4 (масштабируется группой головы): вытянутый череп,
 * сужающаяся челюсть и подбородок, надбровные дуги, скулы, глазницы.
 */
export function headShape(kind: 'human' | 'brute' | 'skull' = 'human'): THREE.BufferGeometry {
  return cached(`head${kind}`, () => {
    const g = new THREE.SphereGeometry(0.4, 24, 18);
    const p = g.attributes.position;
    const brute = kind === 'brute';
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i);
      let y = p.getY(i);
      let z = p.getZ(i);
      const front = Math.max(0, z / 0.4);
      // Череп: выше и уже, затылок назад
      y *= 1.1;
      x *= 0.9;
      if (z < 0 && y > -0.05) z *= 1.08;
      // Челюсть сужается книзу, подбородок вперёд
      if (y < 0) {
        const k = Math.min(1, -y / 0.44);
        x *= 1 - (brute ? 0.08 : 0.3) * k;
        z *= 1 - 0.12 * k * (1 - front);
        if (front > 0.4) z += (brute ? 0.06 : 0.035) * k * front;
      }
      // Лицо площе с боков
      if (front > 0.6) z -= 0.03 * (front - 0.6);
      // Надбровные дуги и скулы
      const ax = Math.abs(x);
      z += (brute ? 0.07 : 0.03) * front * Math.exp(-(((y - 0.13) / 0.05) ** 2)) * Math.exp(-(((ax - 0.13) / 0.12) ** 2));
      x += Math.sign(x) * 0.022 * front * Math.exp(-(((y + 0.03) / 0.07) ** 2)) * Math.exp(-(((ax - 0.27) / 0.08) ** 2));
      // Глазницы
      if (kind !== 'brute') z -= (kind === 'skull' ? 0.09 : 0.035) * front * Math.exp(-(((y - 0.04) / 0.06) ** 2)) * Math.exp(-(((ax - 0.14) / 0.07) ** 2));
      // Виски чуть впалые
      x -= Math.sign(x) * 0.015 * Math.exp(-(((y - 0.12) / 0.08) ** 2)) * Math.exp(-((z / 0.15) ** 2));
      p.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    return g;
  });
}

/** Ухо: плоская раковина, крепится сбоку головы. */
export function earShape(): THREE.BufferGeometry {
  return cached('ear', () => {
    const g = new THREE.SphereGeometry(0.075, 10, 8);
    g.scale(0.45, 1, 0.75);
    return g;
  });
}

/** Нос: клин с крыльями. */
export function noseShape(size = 1): THREE.BufferGeometry {
  return cached(`nose${size}`, () => {
    const bridge = new THREE.CylinderGeometry(0.025 * size, 0.05 * size, 0.17 * size, 6).rotateX(-0.25).translate(0, 0.0, 0);
    const tip = new THREE.SphereGeometry(0.045 * size, 8, 6).translate(0, -0.08 * size, 0.03 * size);
    const g = mergeGeometries([bridge.toNonIndexed(), tip.toNonIndexed()])!;
    g.computeVertexNormals();
    return g;
  });
}

/** Кисть от запястья (y = 0) вниз: ладонь, слегка согнутые пальцы, большой палец. */
export function handShape(size = 1, claws = false): THREE.BufferGeometry {
  return cached(`hand${size}|${claws}`, () => {
    const s = size;
    const parts: THREE.BufferGeometry[] = [];
    const palm = new THREE.BoxGeometry(0.1 * s, 0.11 * s, 0.045 * s, 1, 1, 1).translate(0, -0.06 * s, 0);
    parts.push(palm);
    for (let i = 0; i < 4; i++) {
      const x = (-0.036 + i * 0.024) * s;
      const len = (i === 1 || i === 2 ? 0.075 : 0.062) * s;
      const f = new THREE.CapsuleGeometry(0.011 * s, len, 2, 6).translate(0, -len / 2, 0).rotateX(0.55).translate(x, -0.115 * s, 0.004 * s);
      parts.push(f);
      if (claws) parts.push(new THREE.ConeGeometry(0.012 * s, 0.05 * s, 5).rotateX(Math.PI - 0.3).translate(x, -0.17 * s, 0.05 * s));
    }
    parts.push(new THREE.CapsuleGeometry(0.013 * s, 0.05 * s, 2, 6).rotateZ(0.7).rotateX(0.5).translate(0.05 * s, -0.06 * s, 0.02 * s));
    const g = mergeGeometries(parts.map((x) => x.toNonIndexed()))!;
    g.computeVertexNormals();
    return g;
  });
}

/** Стопа/сапог от лодыжки (y = 0): носок вперёд, пятка, подошва. */
export function footShape(size = 1, boot = true): THREE.BufferGeometry {
  return cached(`foot${size}|${boot}`, () => {
    const s = size;
    const parts: THREE.BufferGeometry[] = [];
    const main = new THREE.CapsuleGeometry(0.065 * s, 0.17 * s, 4, 10).rotateX(Math.PI / 2).scale(1, 0.72, 1).translate(0, -0.055 * s, 0.05 * s);
    parts.push(main.toNonIndexed());
    if (boot) parts.push(new THREE.CylinderGeometry(0.07 * s, 0.075 * s, 0.12 * s, 10).translate(0, -0.01 * s, -0.005 * s).toNonIndexed());
    parts.push(new THREE.BoxGeometry(0.13 * s, 0.025 * s, 0.31 * s).translate(0, -0.1 * s, 0.05 * s).toNonIndexed());
    const g = mergeGeometries(parts)!;
    g.computeVertexNormals();
    return g;
  });
}

/** Поза одной ноги в шаге: угол бедра, сгиб колена, угол стопы. */
export interface LegPose {
  thigh: number;
  knee: number;
  ankle: number;
}

/**
 * Цикл шага. phase — фаза этой ноги; mv — 0..1 насколько идёт; run — 0..1 бег.
 * Колено сгибается в фазе переноса ноги, слегка пружинит в опоре; стопа
 * держится параллельно земле и отталкивается носком.
 */
export function gait(phase: number, mv: number, run: number, out: LegPose): LegPose {
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  const A = (0.42 + 0.3 * run) * mv;
  out.thigh = s * A - run * 0.08 * mv;
  const swingK = (0.85 + 0.9 * run) * Math.max(0, -c);
  const stanceK = 0.18 * Math.max(0, c) * (1 - Math.abs(s));
  out.knee = mv * (swingK + stanceK) + 0.04;
  // Толчок носком, когда нога позади
  const push = Math.max(0, s) * Math.max(0, c + 0.3) * 0.5 * mv;
  out.ankle = -(out.thigh + out.knee) * 0.9 - push * (0.6 + run * 0.5);
  return out;
}

/** Высота бедра над стопой при данной позе. */
export function legHeight(thigh: number, knee: number, tl: number, sl: number): number {
  return tl * Math.cos(thigh) + sl * Math.cos(thigh + knee);
}
