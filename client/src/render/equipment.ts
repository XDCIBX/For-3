import * as THREE from 'three';
import type { HeroClass, Rarity } from '@game/shared';
import { G, RARITY_HEX, addOutline, faceted, glow, part, toon } from './toon';
import { chainTex, clothTex, leatherTex, metalTex, quiltTex, scaleTex } from './textures';
import { lathe, plate, tube, wrap } from './forge';

/**
 * Детальные модели экипировки, видимые на герое. Каждый шаблон предмета
 * выглядит по-своему, а с ростом редкости добавляются детали:
 * обычный → редкий (отделка) → эпический (украшения, свечение) → легендарный (золото, сияние).
 */

export const RANK: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3, relic: 4 };

export const ARMOR_COLORS: Record<string, Record<Rarity, number>> = {
  plate: { common: 0xa9b4bf, rare: 0x7aa6d8, epic: 0x8e62c9, legendary: 0xe7b84a, relic: 0x6a1c22 },
  robe: { common: 0x8d7c62, rare: 0x3f6fcc, epic: 0x7b3fc6, legendary: 0xd2493a, relic: 0x8a1020 },
  leather: { common: 0x8a5a33, rare: 0x2f7c6c, epic: 0x433468, legendary: 0xcf5a22, relic: 0x5a161c },
};
export const TRIM: Record<Rarity, number> = { common: 0x6a4a2a, rare: 0xd8dee4, epic: 0xffc93c, legendary: 0xfff0a0, relic: 0xff5a46 };
export const METAL: Record<Rarity, number> = { common: 0xd6dde3, rare: 0x9fd4ff, epic: 0xd4a6ff, legendary: 0xffe07a, relic: 0xff7a6a };
/** Цвет «драгоценных» деталей: золото у легендарных, алое пламя у реликвий. */
export const LUX: Record<Rarity, number> = { common: 0xffd54a, rare: 0xffd54a, epic: 0xffd54a, legendary: 0xffd54a, relic: 0xff3b2f };
export const GOLD = 0xffc93c;
export const LEATHER = 0x5a3a22;
export const WOOD = 0x8a5a2b;

type V3 = [number, number, number];

/** Части героя, к которым крепится экипировка. */
export interface Rig {
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  /** Предплечья (от локтя), голени (от колена), стопы (от лодыжки). */
  foreL: THREE.Group;
  foreR: THREE.Group;
  shinL: THREE.Group;
  shinR: THREE.Group;
  footL: THREE.Group;
  footR: THREE.Group;
  shinLen: number;
  foreLen: number;
  /** Торс героя: по его форме подгоняются кираса, кольчуга, куртка. */
  torsoMesh: THREE.Mesh;
}

/** Что построено — чтобы при смене экипировки всё убрать. */
export interface Built {
  parts: THREE.Object3D[];
  glow: THREE.Object3D[];
  spin: THREE.Object3D[];
}

export function add(parent: THREE.Object3D, out: Built, o: THREE.Object3D) {
  parent.add(o);
  out.parts.push(o);
  return o;
}

export function gem(color: number, size: number, pos: V3, out?: Built): THREE.Mesh {
  const m = new THREE.Mesh(faceted(new THREE.OctahedronGeometry(size, 0)), toon(color, { emissive: color, emissiveIntensity: 0.75 }));
  m.position.set(...pos);
  addOutline(m, 0.012);
  if (out) out.glow.push(m);
  return m;
}

export function halo(color: number, size: number, pos: V3, out: Built, opacity = 0.3): THREE.Mesh {
  const m = new THREE.Mesh(G.sphere(size, 12, 8), glow(color, opacity));
  m.position.set(...pos);
  out.glow.push(m);
  return m;
}

// ================================================================== Доспехи

/** Что доспех меняет у самого героя: цвет и фактура торса и рукавов. */
export interface ArmorLook {
  torso: number;
  sleeve: number;
  metal: boolean;
  /** Фактура рукавов (кольчуга, кожа, ткань). */
  sleeveMap?: THREE.Texture;
}

/** Оболочка по форме торса героя: кираса, кольчуга, куртка. */
function shell(rig: Rig, out: Built, col: number, o: { s?: [number, number, number]; y?: number; map?: THREE.Texture; metal?: number; rough?: number }) {
  const m = new THREE.Mesh(rig.torsoMesh.geometry, toon(col, { map: o.map, metal: o.metal, rough: o.rough }));
  const [sx, sy, sz] = o.s ?? [1.06, 1.02, 1.08];
  m.scale.set(sx, sy, sz);
  m.position.y = o.y ?? 0;
  return add(rig.torso, out, m);
}

/** Кольцо-обод по торсу (пояс, край лат): эллипс под форму торса. */
function band(rig: Rig, out: Built, col: number, y: number, rx: number, rz: number, t: number, o: { metal?: number; rough?: number; map?: THREE.Texture } = {}) {
  return add(rig.torso, out, part(G.torus(1, t, Math.PI * 2, 6, 32), col, { pos: [0, y, 0], rot: [Math.PI / 2, 0, 0], scale: [rx, rz, 1], outline: false, ...o }));
}

function rivets(parent: THREE.Object3D, out: Built, col: number, pts: V3[], r = 0.016) {
  for (const p of pts) add(parent, out, part(G.sphere(r, 6, 4), col, { pos: p, outline: false, metal: 0.9, rough: 0.35 }));
}

export function buildArmor(rig: Rig, tpl: string, r: Rarity, cls: HeroClass, out: Built): ArmorLook {
  const rank = RANK[r];
  const col = ARMOR_COLORS[tpl]?.[r] ?? 0x8a5a33;
  const trim = TRIM[r];
  const T = rig.torso;
  const MET = { metal: 0.7, rough: 0.34, map: metalTex() };
  if (tpl === 'plate') {
    if (rank === 0) {
      // Стёганка: простёганный ватник со стоячим воротом и шнуровкой
      const q = 0x9a8466;
      shell(rig, out, q, { s: [1.07, 1.0, 1.09], map: quiltTex(), rough: 0.9 });
      band(rig, out, 0x6a5440, 0.74, 0.17, 0.15, 0.035, { map: quiltTex() });
      for (let i = 0; i < 4; i++) add(T, out, part(G.box(0.08, 0.008, 0.012), 0x3a2a1a, { pos: [0, 0.6 - i * 0.09, 0.31], rot: [0, 0, i % 2 ? 0.4 : -0.4], outline: false }));
      for (const arm of [rig.armL, rig.armR]) add(arm, out, part(G.cyl(0.1, 0.092, 0.2, 12), q, { pos: [0, -0.1, 0], outline: false, map: quiltTex(), rough: 0.9 }));
      band(rig, out, LEATHER, 0.12, 0.29, 0.22, 0.03, { map: leatherTex() });
      return { torso: q, sleeve: q, metal: false, sleeveMap: quiltTex() };
    }
    if (rank === 1) {
      // Кольчуга до бёдер, кожаный пояс, наплечники из стёганки
      const c = 0xa8b0b8;
      shell(rig, out, c, { s: [1.06, 1.0, 1.08], map: chainTex(), metal: 0.85, rough: 0.45 });
      add(T, out, part(G.cyl(0.29, 0.33, 0.24, 20), c, { pos: [0, -0.1, 0], scale: [1, 1, 0.78], outline: false, map: chainTex(), metal: 0.85, rough: 0.45 }));
      band(rig, out, LEATHER, 0.12, 0.3, 0.23, 0.035, { map: leatherTex() });
      add(T, out, part(G.box(0.08, 0.07, 0.03), 0xc8ced6, { pos: [0, 0.12, 0.245], outline: false, metal: 0.9 }));
      band(rig, out, c, 0.74, 0.2, 0.17, 0.05, { map: chainTex(), metal: 0.85 });
      for (const arm of [rig.armL, rig.armR]) add(arm, out, part(G.halfSphere(0.14), 0x6a5440, { pos: [0, 0.02, 0], scale: [1.15, 0.8, 1.1], outline: false, map: quiltTex() }));
      return { torso: c, sleeve: c, metal: true, sleeveMap: chainTex() };
    }
    // Латы: кираса с рёбром, пластины живота, наплечники из трёх лам, наручи и налокотники
    shell(rig, out, col, { s: [1.08, 1.02, 1.12], ...MET });
    add(T, out, part(G.box(0.03, 0.42, 0.03), col, { pos: [0, 0.42, 0.315], rot: [-0.08, 0, Math.PI / 4], outline: false, ...MET }));
    for (const [y, k] of [
      [0.27, 1.13],
      [0.19, 1.15],
      [0.11, 1.17],
    ] as const)
      band(rig, out, col, y, 0.27 * k, 0.21 * k, 0.022, MET);
    band(rig, out, trim, 0.66, 0.29, 0.25, 0.016, { metal: 0.95, rough: 0.3 });
    // Горжет
    band(rig, out, col, 0.76, 0.17, 0.15, 0.045, MET);
    band(rig, out, col, 0.71, 0.21, 0.18, 0.04, MET);
    // Тассеты
    for (const a of [-0.55, 0, 0.55]) {
      const tg = new THREE.Group();
      tg.add(part(plate('tasset', [[-0.08, 0], [0.08, 0], [0.07, -0.2], [-0.07, -0.2]], 0.03, 0.008), col, { outline: false, ...MET }));
      tg.add(part(G.box(0.16, 0.02, 0.035), trim, { pos: [0, -0.005, 0], outline: false, metal: 0.95 }));
      rivets(tg, out, trim, [[-0.055, -0.04, 0.018], [0.055, -0.04, 0.018]], 0.012);
      tg.position.set(Math.sin(a) * 0.29, 0.02, Math.cos(a) * 0.24);
      tg.rotation.set(0.15, a, 0);
      add(T, out, tg);
    }
    for (const [arm, fore, s] of [
      [rig.armL, rig.foreL, -1],
      [rig.armR, rig.foreR, 1],
    ] as const) {
      for (let i = 0; i < 3; i++) add(arm, out, part(G.halfSphere(0.17 - i * 0.012), col, { pos: [s * 0.01, 0.04 - i * 0.065, 0], scale: [1.18, 0.62, 1.12], rot: [0, 0, s * 0.12], outline: false, ...MET }));
      add(arm, out, part(G.torus(0.19, 0.014, Math.PI * 2, 6, 24), trim, { pos: [0, 0.04, 0], rot: [Math.PI / 2, 0, 0], scale: [1.18, 1.12, 1], outline: false, metal: 0.95 }));
      add(arm, out, part(G.cyl(0.092, 0.08, 0.16, 14), col, { pos: [0, -0.2, 0], outline: false, ...MET }));
      // Налокотник с «крылышком» и наруч с отворотом
      add(fore, out, part(G.sphere(0.07, 12, 8), col, { pos: [0, 0.0, -0.025], scale: [1, 0.9, 1.15], outline: false, ...MET }));
      add(fore, out, part(G.cone(0.05, 0.08, 8), col, { pos: [s * 0.055, 0.0, -0.03], rot: [0, 0, -s * Math.PI / 2], scale: [1, 1, 0.4], outline: false, ...MET }));
      add(fore, out, part(G.cyl(0.072, 0.06, rig.foreLen * 0.6, 14), col, { pos: [0, -rig.foreLen * 0.6, 0], outline: false, ...MET }));
      add(fore, out, part(G.torus(0.074, 0.01, Math.PI * 2, 4, 16), trim, { pos: [0, -rig.foreLen * 0.32, 0], rot: [Math.PI / 2, 0, 0], outline: false, metal: 0.95 }));
      if (rank >= 3) for (const z of [-0.08, 0.08]) add(arm, out, part(G.cone(0.035, 0.15, 6), GOLD, { pos: [s * 0.08, 0.15, z], rot: [0, 0, -s * 0.5], outline: false, metal: 0.95, rough: 0.3 }));
    }
    rivets(T, out, trim, [[-0.19, 0.55, 0.27], [0.19, 0.55, 0.27], [-0.21, 0.32, 0.25], [0.21, 0.32, 0.25]]);
    if (rank >= 2) {
      add(T, out, gem(RARITY_HEX[r], 0.06, [0, 0.52, 0.34], out));
      add(T, out, part(G.torus(0.075, 0.014, Math.PI * 2, 6, 16), trim, { pos: [0, 0.52, 0.325], outline: false, metal: 0.95 }));
    }
    if (rank === 3) {
      // Доспех Дракона: чешуйчатая юбка и плащ
      add(T, out, part(G.cyl(0.3, 0.36, 0.22, 20), col, { pos: [0, -0.1, 0], scale: [1, 1, 0.8], outline: false, map: scaleTex(), metal: 0.9, rough: 0.35 }));
    }
    if (rank >= 3) {
      add(T, out, part(G.box(0.62, 0.9, 0.04), rank >= 4 ? 0x5a0a10 : 0xb8282a, { pos: [0, 0.24, -0.32], rot: [0.14, 0, 0], outline: false, map: clothTex() }));
      add(T, out, halo(LUX[r], 0.16, [0, 0.52, 0.34], out, 0.2));
    }
    if (rank >= 4) {
      // Латы Огненного Титана: раскалённые трещины
      for (const [x, y, a] of [
        [-0.12, 0.45, 0.6],
        [0.1, 0.38, -0.5],
        [0.02, 0.24, 0.2],
      ] as const)
      {
        const c = add(T, out, new THREE.Mesh(G.box(0.12, 0.012, 0.01), toon(0xff5a1a, { emissive: 0xff4010, emissiveIntensity: 1.6 })));
        c.position.set(x, y, 0.31 - Math.abs(x) * 0.15);
        c.rotation.z = a;
      }
    }
    return { torso: col, sleeve: cls === 'mage' ? 0x6b3fc4 : col, metal: true };
  }
  if (tpl === 'robe') {
    const cloth = clothTex();
    if (cls !== 'mage') {
      // Длинная юбка мантии со складками
      add(T, out, part(robeSkirt(), col, { pos: [0, 0.14, 0], outline: false, map: cloth, rough: 0.92 }));
      add(T, out, part(G.torus(1, 0.02, Math.PI * 2, 4, 40), rank >= 1 ? GOLD : 0x5a3a22, { pos: [0, -0.63, 0], rot: [Math.PI / 2, 0, 0], scale: [0.56, 0.5, 1], outline: false, metal: rank >= 1 ? 0.9 : 0 }));
    }
    shell(rig, out, col, { s: [1.05, 1.0, 1.08], map: cloth, rough: 0.9 });
    // Запа́х: отворот полы наискось и ворот-капюшон на спине
    add(T, out, part(G.box(0.05, 0.62, 0.02), rank >= 1 ? GOLD : 0x5a3a22, { pos: [0.03, 0.44, 0.3], rot: [0, 0, -0.32], outline: false, metal: rank >= 1 ? 0.9 : 0 }));
    add(T, out, part(G.sphere(0.23, 14, 10), col, { pos: [0, 0.72, -0.18], scale: [1.1, 0.7, 0.8], outline: false, map: cloth }));
    // Пелерина и расширяющиеся рукава
    add(T, out, part(lathe('capelet', [[0.18, 0.78], [0.3, 0.7], [0.42, 0.56], [0.45, 0.5]], 22), col, { scale: [1, 1, 0.82], outline: false, map: cloth, side: THREE.DoubleSide }));
    for (const fore of [rig.foreL, rig.foreR]) {
      add(fore, out, part(lathe('robesleeve', [[0.075, 0], [0.1, -0.1], [0.14, -0.2], [0.16, -0.24]], 14), col, { pos: [0, -rig.foreLen * 0.35, 0], outline: false, map: cloth, side: THREE.DoubleSide }));
      add(fore, out, part(G.torus(0.158, 0.014, Math.PI * 2, 4, 18), rank >= 1 ? GOLD : 0x5a3a22, { pos: [0, -rig.foreLen * 0.35 - 0.24, 0], rot: [Math.PI / 2, 0, 0], outline: false, metal: rank >= 1 ? 0.9 : 0 }));
    }
    // Кушак с кистями
    const sash = rank >= 1 ? GOLD : 0x7a4a2a;
    band(rig, out, sash, 0.13, 0.29, 0.23, 0.04, { metal: rank >= 1 ? 0.6 : 0, rough: 0.5 });
    for (const x of [0.08, 0.15]) {
      add(T, out, part(G.box(0.05, 0.28, 0.015), sash, { pos: [x, -0.03, 0.26], rot: [0.1, 0, x * 0.8], outline: false }));
      add(T, out, part(G.cone(0.03, 0.08, 6), sash, { pos: [x + 0.02, -0.2, 0.27], outline: false }));
    }
    if (rank >= 2) {
      // Вышитые руны по подолу и на груди
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        add(T, out, new THREE.Mesh(G.box(0.045, 0.045, 0.006), toon(RARITY_HEX[r], { emissive: RARITY_HEX[r], emissiveIntensity: 0.9 }))).position.set(Math.sin(a) * 0.53, -0.52, Math.cos(a) * 0.47);
      }
      add(T, out, gem(RARITY_HEX[r], 0.055, [0, 0.5, 0.31], out));
    }
    if (rank >= 3) {
      for (let i = 0; i < 5; i++) {
        const a = -0.9 + i * 0.45;
        add(T, out, part(G.cone(0.045, 0.22, 5), LUX[r], { pos: [Math.sin(a) * 0.3, 0.84, -Math.cos(a) * 0.12 - 0.06], rot: [-0.4, a, 0], outline: false, metal: 0.9 }));
      }
      add(T, out, halo(rank >= 4 ? 0xff3b2f : 0xffb070, 0.16, [0, 0.5, 0.32], out, 0.2));
    }
    return { torso: col, sleeve: col, metal: false, sleeveMap: cloth };
  }
  // Кожаный доспех: куртка со строчкой, ремни с пряжками, подсумки, наручи
  const lt = leatherTex();
  shell(rig, out, col, { s: [1.06, 1.0, 1.09], map: rank >= 4 ? scaleTex() : lt, rough: rank >= 4 ? 0.5 : 0.75, metal: rank >= 4 ? 0.3 : 0 });
  add(T, out, part(G.cyl(0.29, 0.31, 0.16, 20), col, { pos: [0, -0.05, 0], scale: [1, 1, 0.8], outline: false, map: lt }));
  for (const a of [-0.6, 0.6]) add(T, out, part(G.box(0.06, 0.66, 0.02), LEATHER, { pos: [0, 0.4, 0.31], rot: [0, 0, a], outline: false, map: lt }));
  add(T, out, part(G.torus(0.04, 0.01, Math.PI * 2, 4, 12), GOLD, { pos: [0, 0.4, 0.325], outline: false, metal: 0.9 }));
  band(rig, out, LEATHER, 0.12, 0.3, 0.23, 0.035, { map: lt });
  for (const s of [-1, 1]) {
    const pouch = new THREE.Group();
    pouch.add(part(G.box(0.11, 0.12, 0.07), LEATHER, { outline: false, map: lt }));
    pouch.add(part(G.box(0.115, 0.05, 0.075), 0x3a2414, { pos: [0, 0.045, 0.005], outline: false, map: lt }));
    pouch.add(part(G.sphere(0.012, 6, 4), GOLD, { pos: [0, 0.03, 0.045], outline: false, metal: 0.9 }));
    pouch.position.set(s * 0.26, 0.04, 0.14);
    pouch.rotation.y = s * 0.7;
    add(T, out, pouch);
  }
  add(rig.armL, out, part(G.halfSphere(0.16), col, { pos: [0, 0.03, 0], scale: [1.15, 0.8, 1.1], outline: false, map: lt }));
  for (const fore of [rig.foreL, rig.foreR]) {
    add(fore, out, part(G.cyl(0.068, 0.058, rig.foreLen * 0.55, 12), LEATHER, { pos: [0, -rig.foreLen * 0.6, 0], outline: false, map: lt }));
    for (const k of [0.45, 0.72]) add(fore, out, part(G.torus(0.068, 0.008, Math.PI * 2, 4, 12), GOLD, { pos: [0, -rig.foreLen * k, 0], rot: [Math.PI / 2, 0, 0], outline: false, metal: 0.9 }));
  }
  if (rank >= 1) {
    // Меховой воротник
    const fur = rank >= 3 ? 0xffe8c8 : rank >= 2 ? 0x3a3048 : 0xd8cbb4;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      add(T, out, part(G.ico(0.09, 1), fur, { pos: [Math.sin(a) * 0.22, 0.73, Math.cos(a) * 0.19], scale: [1, 0.8, 1], outline: false, rough: 0.95 }));
    }
  }
  if (rank >= 2) {
    // Заклёпки-шипы и кинжал на бедре
    rivets(T, out, 0xc8ced6, [[-0.18, 0.55, 0.28], [0.18, 0.55, 0.28], [-0.2, 0.3, 0.26], [0.2, 0.3, 0.26], [-0.12, 0.2, 0.27], [0.12, 0.2, 0.27]], 0.018);
    const dg = new THREE.Group();
    dg.add(part(G.cyl(0.022, 0.022, 0.1, 6), LEATHER, { outline: false }));
    dg.add(part(G.box(0.09, 0.02, 0.03), GOLD, { pos: [0, 0.06, 0], outline: false, metal: 0.9 }));
    dg.add(part(plate('lthdagger', [[-0.018, 0], [0.018, 0], [0, 0.2]], 0.012, 0.004), METAL[r], { pos: [0, 0.07, 0], outline: false, metal: 0.9, rough: 0.3 }));
    dg.position.set(0.3, -0.02, 0.05);
    dg.rotation.set(Math.PI, 0, 0.3);
    add(T, out, dg);
    add(T, out, gem(RARITY_HEX[r], 0.045, [0, 0.4, 0.34], out));
  }
  if (rank >= 3) {
    // Перья феникса на плече
    for (let i = 0; i < 5; i++) add(rig.armL, out, part(plate('phx', [[0, 0], [0.03, 0.06], [0.025, 0.24], [0, 0.3], [-0.025, 0.24], [-0.03, 0.06]], 0.008, 0.002), [0xff6a2a, 0xffb030, 0xffe060, 0xff6a2a, 0xffb030][i], { pos: [-0.05, 0.1, -0.14 + i * 0.07], rot: [0.3 - i * 0.15, 0, 0.9], outline: false }));
    add(T, out, halo(rank >= 4 ? 0xff3b2f : 0xff8a3a, 0.16, [0, 0.4, 0.34], out, 0.2));
  }
  return { torso: col, sleeve: col, metal: false, sleeveMap: lt };
}

/** Юбка мантии: конус с мягкими складками по подолу. */
function robeSkirt(): THREE.BufferGeometry {
  const g = lathe('robeskirt', [[0.3, 0], [0.34, -0.25], [0.44, -0.55], [0.55, -0.77], [0.55, -0.79]], 40);
  if (!g.userData.folded) {
    g.userData.folded = true;
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const a = Math.atan2(z, x);
      const k = 1 + Math.sin(a * 9) * 0.05 * Math.min(1, -y / 0.6);
      p.setXYZ(i, x * k, y, z * k * 0.88);
    }
    g.computeVertexNormals();
  }
  return g;
}

// ================================================================== Голова

/** Шлем или капюшон вместо классового головного убора (координаты головы радиуса 0.4). */
export function buildHelmet(g: THREE.Group, tpl: string, r: Rarity, out: Built) {
  const rank = RANK[r];
  if (tpl === 'helm') {
    if (rank === 0) {
      // Кожаная шапка: сшита из клиньев, с отворотом и наушами
      const lt = leatherTex();
      add(g, out, part(G.halfSphere(0.44), 0x8a5a33, { pos: [0, 0.03, 0], outline: false, map: lt }));
      for (let i = 0; i < 4; i++) add(g, out, part(G.torus(0.44, 0.008, Math.PI, 4, 16), 0x4a2e1a, { pos: [0, 0.03, 0], rot: [0, (i * Math.PI) / 4, 0], outline: false }));
      add(g, out, part(G.torus(0.43, 0.045, Math.PI * 2, 6, 24), 0x6a4428, { pos: [0, 0.03, 0], rot: [Math.PI / 2, 0, 0], outline: false, map: lt }));
      for (const s of [-1, 1]) add(g, out, part(G.box(0.08, 0.24, 0.18), 0x6a4428, { pos: [s * 0.4, -0.12, -0.02], rot: [0, 0, s * 0.15], outline: false, map: lt }));
      add(g, out, part(G.sphere(0.05, 8, 6), 0x4a2e1a, { pos: [0, 0.47, 0], outline: false }));
      return;
    }
    const metal = rank >= 4 ? 0x6a1c22 : rank >= 3 ? 0xe8c060 : ARMOR_COLORS.plate[r];
    const M = { metal: 0.7, rough: 0.34, map: metalTex() };
    // Сфероконический шлем из сегментов с рёбрами и заклёпками
    add(g, out, part(lathe('helmdome', [[0.455, 0.0], [0.45, 0.12], [0.41, 0.28], [0.3, 0.42], [0.14, 0.5], [0, 0.53]], 24), metal, { pos: [0, 0.02, 0], outline: false, ...M }));
    for (let i = 0; i < 4; i++) add(g, out, part(tube(`helmrib`, [[0, 0.02, 0.458], [0, 0.16, 0.44], [0, 0.32, 0.36], [0, 0.46, 0.2], [0, 0.55, 0]], 0.016, 0.012, 5, 16), TRIM[r], { rot: [0, (i * Math.PI) / 2, 0], outline: false, metal: 0.95, rough: 0.3 }));
    add(g, out, part(G.torus(0.455, 0.035, Math.PI * 2, 6, 32), TRIM[r], { pos: [0, 0.03, 0], rot: [Math.PI / 2, 0, 0], outline: false, metal: 0.95, rough: 0.3 }));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      add(g, out, part(G.sphere(0.018, 6, 4), TRIM[r], { pos: [Math.sin(a) * 0.475, 0.03, Math.cos(a) * 0.475], outline: false, metal: 0.95 }));
    }
    // Наносник и бармица из кольчуги
    add(g, out, part(plate('nasal', [[-0.035, 0.05], [0.035, 0.05], [0.03, -0.2], [0, -0.24], [-0.03, -0.2]], 0.03, 0.008), metal, { pos: [0, 0.0, 0.45], rot: [0.12, 0, 0], outline: false, ...M }));
    add(g, out, part(lathe('aventail', [[0.46, 0], [0.47, -0.12], [0.44, -0.3], [0.4, -0.36]], 24, ), 0xa8b0b8, { pos: [0, 0.03, -0.02], rot: [0, Math.PI, 0], outline: false, map: chainTex(), metal: 0.85, rough: 0.45, side: THREE.DoubleSide, scale: [1, 1, 1] }));
    if (rank >= 2) {
      // Нащёчники, гребень и плюмаж
      for (const s of [-1, 1]) add(g, out, part(plate('cheek', [[0, 0], [0.14, 0], [0.13, -0.22], [0.02, -0.3], [-0.02, -0.12]], 0.035, 0.01), metal, { pos: [s * 0.3, -0.02, 0.3], rot: [0, s * 0.75, 0], scale: [s, 1, 1], outline: false, ...M }));
      add(g, out, part(plate('crest', [[-0.32, 0], [0.3, 0], [0.24, 0.1], [0, 0.14], [-0.28, 0.09]], 0.04, 0.012), TRIM[r], { pos: [0, 0.49, 0], rot: [0, Math.PI / 2, 0], outline: false, metal: 0.95 }));
      const plume = new THREE.Group();
      for (let i = 0; i < 6; i++) plume.add(part(plate('plume', [[0, 0], [0.04, 0.05], [0.03, 0.22], [0, 0.26], [-0.03, 0.22], [-0.04, 0.05]], 0.03, 0.008), RARITY_HEX[r], { pos: [0, 0, -i * 0.07], rot: [-0.9 - i * 0.18, 0, 0], outline: false }));
      plume.position.set(0, 0.56, -0.05);
      add(g, out, plume);
    }
    if (rank >= 3) {
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        add(g, out, part(G.cone(0.05, 0.2, 6), LUX[r], { pos: [Math.sin(a) * 0.36, 0.32, Math.cos(a) * 0.36], rot: [Math.cos(a) * 0.3, 0, -Math.sin(a) * 0.3], outline: false, metal: 0.95, rough: 0.3 }));
      }
      add(g, out, gem(0xff3a5a, 0.06, [0, 0.2, 0.44], out));
      add(g, out, halo(LUX[r], 0.18, [0, 0.4, 0], out, 0.15));
    }
    if (rank >= 4) for (const s of [-1, 1]) add(g, out, part(tube(`helmhorn${s}`, [[s * 0.4, 0.2, 0], [s * 0.58, 0.32, -0.04], [s * 0.66, 0.55, -0.1], [s * 0.6, 0.75, -0.12]], 0.07, 0.01, 8, 16), 0x2a0a0a, { outline: false, rough: 0.4 }));
    return;
  }
  // Капюшон: ткань с напуском на лоб, складками и пелериной на плечи
  const col = { common: 0x7a6a55, rare: 0x2f6aa8, epic: 0x2a2238, legendary: 0xf2ecd8, relic: 0x5a0f14 }[r];
  const cl = clothTex();
  // Купол капюшона с вырезом для лица (спереди), внутри — тень
  const open = 0.75;
  for (const geo of [new THREE.SphereGeometry(0.47, 24, 6, 0, Math.PI * 2, 0, Math.PI * 0.3), new THREE.SphereGeometry(0.47, 24, 12, Math.PI / 2 + open, Math.PI * 2 - open * 2, Math.PI * 0.3, Math.PI * 0.48)]) {
    const hood = part(geo, col, { pos: [0, 0.04, -0.03], outline: false, map: cl, rough: 0.92, side: THREE.DoubleSide });
    hood.scale.set(1.02, 1.05, 1.06);
    add(g, out, hood);
  }
  // Мягкий отворот по краю выреза
  add(g, out, part(G.torus(0.33, 0.055, Math.PI * 1.15, 8, 24), col, { pos: [0, 0.03, 0.27], rot: [-0.25, 0, -Math.PI * 0.075 - Math.PI * 0.5 + Math.PI], scale: [1.1, 1.2, 0.7], outline: false, map: cl }));
  add(g, out, part(G.cone(0.22, 0.55, 12), col, { pos: [0, 0.03, -0.52], rot: [-2.0, 0, 0], outline: false, map: cl }));
  add(g, out, part(lathe('hoodcape', [[0.28, -0.3], [0.44, -0.42], [0.62, -0.56], [0.66, -0.6]], 22), col, { pos: [0, 0, -0.04], outline: false, map: cl, side: THREE.DoubleSide }));
  if (rank >= 1) {
    add(g, out, part(G.torus(0.37, 0.025, Math.PI * 2, 6, 28), rank >= 3 ? GOLD : 0xd8c8a0, { pos: [0, -0.02, 0.21], scale: [1, 1.08, 1], outline: false, metal: rank >= 3 ? 0.9 : 0 }));
    add(g, out, part(plate('hoodfeather', [[0, 0], [0.035, 0.06], [0.03, 0.26], [0, 0.32], [-0.03, 0.26], [-0.035, 0.06]], 0.008, 0.002), RARITY_HEX[r], { pos: [0.34, 0.3, -0.22], rot: [-0.5, 0, -0.6], outline: false }));
  }
  if (rank === 2) add(g, out, part(G.sphere(0.3, 16, 12), 0x2a2232, { pos: [0, -0.24, 0.17], scale: [0.95, 0.42, 0.8], outline: false, map: cl }));
  if (rank >= 3) {
    add(g, out, part(G.torus(0.4, 0.025, Math.PI * 2, 6, 28), LUX[r], { pos: [0, 0.2, 0.04], rot: [Math.PI / 2 - 0.25, 0, 0], outline: false, metal: 0.95 }));
    add(g, out, gem(0x5ac8ff, 0.065, [0, 0.27, 0.41], out));
    add(g, out, halo(0x8ad8ff, 0.14, [0, 0.27, 0.41], out, 0.2));
  }
}

// ================================================================== Обувь

export function buildBoots(rig: Rig, tpl: string, r: Rarity, out: Built): number {
  const rank = RANK[r];
  const greaves = tpl === 'greaves';
  const color = greaves
    ? { common: 0x8a6a4a, rare: 0x9aa6b2, epic: 0x8e62c9, legendary: 0xe7b84a, relic: 0x6a1c22 }[r]
    : { common: 0xc8a46a, rare: 0x6a4428, epic: 0x34557f, legendary: LUX[r], relic: 0x8a1020 }[r];
  const SL = rig.shinLen;
  const M = { metal: 0.7, rough: 0.34, map: metalTex() };
  const lt = leatherTex();
  for (const [shin, foot, s] of [
    [rig.shinL, rig.footL, -1],
    [rig.shinR, rig.footR, 1],
  ] as const) {
    if (greaves) {
      if (rank >= 1) {
        // Поножи: изогнутый щиток, наколенник с веером, сабатоны из пластин
        add(shin, out, part(lathe('greave', [[0.08, 0], [0.085, -0.3], [0.075, -0.6], [0.07, -0.72]], 14, ), color, { pos: [0, -SL * 0.12, 0.012], scale: [1, SL / 0.78, 0.9], outline: false, ...M }));
        add(shin, out, part(G.sphere(0.08, 12, 10), color, { pos: [0, 0, 0.04], scale: [1, 0.85, 0.85], outline: false, ...M }));
        add(shin, out, part(G.cone(0.07, 0.07, 10), color, { pos: [s * 0.065, 0.0, 0.03], rot: [0, 0, -s * Math.PI / 2], scale: [1, 1, 0.3], outline: false, ...M }));
        for (let i = 0; i < 3; i++) add(foot, out, part(G.halfSphere(0.075 - i * 0.008), color, { pos: [0, -0.05, 0.06 + i * 0.06], rot: [Math.PI / 2 - 0.4, 0, 0], scale: [1, 1, 0.6], outline: false, ...M }));
        add(shin, out, part(G.torus(0.088, 0.01, Math.PI * 2, 4, 16), TRIM[r], { pos: [0, -SL * 0.15, 0.01], rot: [Math.PI / 2, 0, 0], outline: false, metal: 0.95 }));
        rivets(shin, out, TRIM[r], [[s * 0.06, -SL * 0.4, 0.06], [s * 0.06, -SL * 0.7, 0.06]], 0.012);
      } else {
        // Деревянные башмаки на кожаных ремешках
        add(foot, out, part(G.box(0.16, 0.06, 0.34), WOOD, { pos: [0, -0.09, 0.05], outline: false, map: lt }));
        for (const z of [0, 0.12]) add(foot, out, part(G.torus(0.075, 0.012, Math.PI, 4, 10), LEATHER, { pos: [0, -0.06, z], rot: [0, Math.PI / 2, 0], outline: false }));
      }
      if (rank >= 3) add(shin, out, part(G.cone(0.035, 0.13, 6), GOLD, { pos: [s * 0.05, 0.03, 0.1], rot: [1.2, 0, 0], outline: false, metal: 0.95 }));
    } else if (rank === 0) {
      // Лапти: плетёные ремешки крест-накрест до колена
      for (let i = 0; i < 5; i++) add(shin, out, part(G.torus(0.068, 0.008, Math.PI * 2, 4, 14), 0x8a6a3a, { pos: [0, -SL + 0.03 + i * 0.07, 0], rot: [Math.PI / 2 + (i % 2 ? 0.2 : -0.2), 0, 0], outline: false }));
    } else {
      // Сапоги с отворотом, шнуровкой и пряжкой
      add(shin, out, part(G.cyl(0.074, 0.07, SL * 0.6, 14), color, { pos: [0, -SL * 0.68, 0], outline: false, map: lt, rough: 0.6 }));
      add(shin, out, part(lathe('bootcuff', [[0.074, 0], [0.09, 0.02], [0.095, 0.07], [0.09, 0.09]], 14), rank >= 3 ? 0xf4ecd8 : 0x3a2414, { pos: [0, -SL * 0.42, 0], outline: false, map: lt }));
      for (let i = 0; i < 4; i++) add(shin, out, part(G.box(0.05, 0.006, 0.008), 0x2a1a10, { pos: [0, -SL * (0.5 + i * 0.08), 0.074], rot: [0, 0, i % 2 ? 0.5 : -0.5], outline: false }));
      add(shin, out, part(G.torus(0.074, 0.012, Math.PI * 2, 4, 14), LEATHER, { pos: [0, -SL * 0.85, 0], rot: [Math.PI / 2, 0, 0], outline: false }));
      add(shin, out, part(G.box(0.04, 0.035, 0.015), GOLD, { pos: [s * 0.06, -SL * 0.85, 0.045], rot: [0, s * 0.9, 0], outline: false, metal: 0.9 }));
      if (rank >= 2) {
        // Крылышки на пятке
        const wing = new THREE.Group();
        for (let i = 0; i < 4; i++) wing.add(part(plate('bootwing', [[0, 0], [0.02, 0.03], [0.015, 0.12], [0, 0.14], [-0.015, 0.12], [-0.02, 0.03]], 0.008, 0.002), 0xf4f0e8, { pos: [0, i * 0.025, -i * 0.04], rot: [0.6 + i * 0.25, 0, 0], outline: false }));
        wing.position.set(s * 0.08, 0.0, -0.03);
        wing.scale.setScalar(rank >= 3 ? 1.4 : 1);
        add(foot, out, wing);
      }
    }
  }
  return color;
}

// ================================================================== Амулет и кольцо

export function buildAmulet(T: THREE.Group, tpl: string, r: Rarity, out: Built) {
  const rank = RANK[r];
  // Цепочка-шнурок вокруг шеи
  const chain = tpl === 'talisman' ? LEATHER : GOLD;
  add(T, out, part(tube(`amuletcord`, [[-0.2, 0.68, 0.1], [-0.14, 0.58, 0.22], [0, 0.5, 0.29], [0.14, 0.58, 0.22], [0.2, 0.68, 0.1]], 0.009, 0.009, 5, 20), chain, { outline: false, metal: tpl === 'talisman' ? 0 : 0.9 }));
  if (tpl === 'talisman') {
    // Клык в обмотке с бусинами
    add(T, out, part(tube('fang', [[0, 0.47, 0.3], [0.01, 0.41, 0.315], [0.03, 0.36, 0.31]], 0.026, 0.004, 6, 10), rank >= 3 ? LUX[r] : 0xf4ecd8, { outline: false, rough: 0.4, metal: rank >= 3 ? 0.9 : 0 }));
    add(T, out, part(wrap(0.027, 0.455, 0.49, 3, 0.005), LEATHER, { pos: [0, 0, 0.3], outline: false }));
    for (const x of [-0.06, 0.06]) add(T, out, part(G.sphere(0.022, 8, 6), RARITY_HEX[r], { pos: [x, 0.52, 0.28], outline: false, rough: 0.3 }));
    if (rank >= 2) add(T, out, gem(RARITY_HEX[r], 0.035, [0, 0.49, 0.32], out));
    return;
  }
  // Медальон: оправа с зубчатым ободком и камнем
  add(T, out, part(lathe('medal', [[0, -0.012], [0.07, -0.012], [0.078, 0], [0.07, 0.012], [0.05, 0.016], [0, 0.016]], 20), GOLD, { pos: [0, 0.45, 0.3], rot: [Math.PI / 2, 0, 0], outline: false, metal: 0.95, rough: 0.3 }));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    add(T, out, part(G.cone(0.012, 0.03, 4), GOLD, { pos: [Math.cos(a) * 0.085, 0.45 + Math.sin(a) * 0.085, 0.3], rot: [0, 0, a - Math.PI / 2], outline: false, metal: 0.95 }));
  }
  add(T, out, gem(RARITY_HEX[r], 0.045 + rank * 0.007, [0, 0.45, 0.32], out));
  if (rank >= 3) add(T, out, halo(RARITY_HEX[r], 0.11, [0, 0.45, 0.33], out, 0.25));
}

export function buildRing(hand: THREE.Object3D, r: Rarity, out: Built) {
  const rank = RANK[r];
  add(hand, out, part(G.torus(0.055, 0.016, Math.PI * 2, 8, 20), rank >= 3 ? LUX[r] : GOLD, { pos: [0, 0.04, 0], rot: [Math.PI / 2, 0, 0], outline: false, metal: 0.95, rough: 0.25 }));
  add(hand, out, part(lathe('ringbezel', [[0, 0], [0.03, 0], [0.034, 0.015], [0.025, 0.025]], 10), GOLD, { pos: [0, 0.04, 0.06], rot: [Math.PI / 2, 0, 0], outline: false, metal: 0.95 }));
  add(hand, out, gem(RARITY_HEX[r], 0.028 + rank * 0.004, [0, 0.04, 0.085], out));
}
