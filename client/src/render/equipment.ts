import * as THREE from 'three';
import type { HeroClass, Rarity } from '@game/shared';
import { G, RARITY_HEX, addOutline, faceted, glow, part, toon } from './toon';
import { clothTex } from './textures';

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
const TRIM: Record<Rarity, number> = { common: 0x6a4a2a, rare: 0xd8dee4, epic: 0xffc93c, legendary: 0xfff0a0, relic: 0xff5a46 };
const METAL: Record<Rarity, number> = { common: 0xd6dde3, rare: 0x9fd4ff, epic: 0xd4a6ff, legendary: 0xffe07a, relic: 0xff7a6a };
/** Цвет «драгоценных» деталей: золото у легендарных, алое пламя у реликвий. */
const LUX: Record<Rarity, number> = { common: 0xffd54a, rare: 0xffd54a, epic: 0xffd54a, legendary: 0xffd54a, relic: 0xff3b2f };
const GOLD = 0xffc93c;
const LEATHER = 0x5a3a22;
const WOOD = 0x8a5a2b;
const SKIN = 0xffd3ac;

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
}

/** Что построено — чтобы при смене экипировки всё убрать. */
export interface Built {
  parts: THREE.Object3D[];
  glow: THREE.Object3D[];
  spin: THREE.Object3D[];
}

function add(parent: THREE.Object3D, out: Built, o: THREE.Object3D) {
  parent.add(o);
  out.parts.push(o);
  return o;
}

function gem(color: number, size: number, pos: V3, out?: Built): THREE.Mesh {
  const m = new THREE.Mesh(faceted(new THREE.OctahedronGeometry(size, 0)), toon(color, { emissive: color, emissiveIntensity: 0.75 }));
  m.position.set(...pos);
  addOutline(m, 0.012);
  if (out) out.glow.push(m);
  return m;
}

function halo(color: number, size: number, pos: V3, out: Built, opacity = 0.3): THREE.Mesh {
  const m = new THREE.Mesh(G.sphere(size, 12, 8), glow(color, opacity));
  m.position.set(...pos);
  out.glow.push(m);
  return m;
}

// ================================================================== Доспехи

export function buildArmor(rig: Rig, tpl: string, r: Rarity, cls: HeroClass, out: Built): { torso: number; sleeve: number; metal: boolean } {
  const rank = RANK[r];
  const col = ARMOR_COLORS[tpl]?.[r] ?? 0x8a5a33;
  const trim = TRIM[r];
  const T = rig.torso;
  if (tpl === 'plate') {
    // Кираса поверх торса
    add(T, out, part(G.sphere(0.32, 18, 12), col, { pos: [0, 0.42, 0.06], scale: [1.04, 1.12, 0.72], outline: 0.03 }));
    // Пластины живота
    for (const [y, rr] of [
      [0.2, 0.31],
      [0.1, 0.32],
    ] as const)
      add(T, out, part(G.torus(rr, 0.035, Math.PI * 2, 6, 24), col, { pos: [0, y, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 0.88, 1], outline: 0.015 }));
    // Горжет
    add(T, out, part(G.torus(0.2, 0.06, Math.PI * 2, 8, 20), col, { pos: [0, 0.72, 0], rot: [Math.PI / 2, 0, 0], outline: 0.02 }));
    // Набедренные пластины (тассеты)
    for (const a of [-0.55, 0, 0.55]) {
      add(T, out, part(G.box(0.17, 0.2, 0.04), col, { pos: [Math.sin(a) * 0.3, -0.02, Math.cos(a) * 0.27], rot: [0.18, a, 0], outline: 0.015 }));
      if (rank >= 1) add(T, out, part(G.box(0.17, 0.03, 0.045), trim, { pos: [Math.sin(a) * 0.31, -0.11, Math.cos(a) * 0.285], rot: [0.18, a, 0], outline: false }));
    }
    // Многослойные наплечники и наручи
    for (const arm of [rig.armL, rig.armR]) {
      const s = arm === rig.armL ? -1 : 1;
      const fore = s < 0 ? rig.foreL : rig.foreR;
      add(arm, out, part(G.halfSphere(0.17), col, { pos: [0, 0.03, 0], scale: [1.15, 0.85, 1.1], rot: [0, 0, s * 0.15], outline: 0.025 }));
      add(arm, out, part(G.halfSphere(0.15), col, { pos: [s * 0.02, -0.06, 0], scale: [1.2, 0.6, 1.15], outline: 0.02 }));
      // Налокотник и наруч
      add(fore, out, part(G.sphere(0.065, 10, 8), col, { pos: [0, 0.0, -0.03], scale: [1, 0.9, 1.1], outline: 0.012 }));
      add(fore, out, part(G.cyl(0.07, 0.058, rig.foreLen * 0.62, 12), col, { pos: [0, -rig.foreLen * 0.58, 0], outline: 0.018 }));
      if (rank >= 1) add(arm, out, part(G.torus(0.2, 0.022, Math.PI * 2, 6, 20), trim, { pos: [0, -0.04, 0], rot: [Math.PI / 2, 0, 0], scale: [1.1, 1.05, 1], outline: false }));
      if (rank >= 3) for (const z of [-0.08, 0.08]) add(arm, out, part(G.cone(0.04, 0.16, 6), GOLD, { pos: [s * 0.08, 0.17, z], rot: [0, 0, -s * 0.5], outline: 0.012 }));
    }
    // Заклёпки и отделка
    if (rank >= 1) {
      for (const [x, y] of [
        [-0.2, 0.55],
        [0.2, 0.55],
        [-0.22, 0.3],
        [0.22, 0.3],
      ])
        add(T, out, part(G.sphere(0.025, 6, 4), trim, { pos: [x, y, 0.27], outline: false }));
    }
    if (rank >= 2) {
      add(T, out, part(G.box(0.05, 0.42, 0.03), trim, { pos: [0, 0.42, 0.3], outline: false }));
      add(T, out, gem(RARITY_HEX[r], 0.07, [0, 0.5, 0.32], out));
    }
    if (rank >= 3) {
      add(T, out, part(G.box(0.66, 0.9, 0.05), LUX[r], { pos: [0, 0.22, -0.34], rot: [0.14, 0, 0], outline: 0.025 }));
      add(T, out, halo(LUX[r], 0.18, [0, 0.5, 0.33], out, 0.35));
    }
    return { torso: col, sleeve: cls === 'mage' ? 0x6b3fc4 : col, metal: true };
  }
  if (tpl === 'robe') {
    if (cls !== 'mage') {
      // Длинная юбка мантии
      add(T, out, part(G.cyl(0.32, 0.55, 0.7, 18), col, { pos: [0, -0.2, 0], outline: 0.03, map: clothTex() }));
    }
    // Пелерина на плечах и широкие рукава
    add(T, out, part(G.cyl(0.22, 0.44, 0.17, 18), col, { pos: [0, 0.66, 0], outline: 0.025, map: clothTex() }));
    // Расширяющиеся рукава
    for (const fore of [rig.foreL, rig.foreR]) add(fore, out, part(G.cyl(0.075, 0.13, rig.foreLen * 0.8, 14), col, { pos: [0, -rig.foreLen * 0.5, 0], outline: 0.02, map: clothTex() }));
    // Кушак с концами
    const sash = rank >= 1 ? GOLD : 0x5a3a22;
    add(T, out, part(G.torus(0.315, 0.045, Math.PI * 2, 6, 24), sash, { pos: [0, 0.13, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 0.88, 1], outline: 0.012 }));
    for (const x of [0.08, 0.16]) add(T, out, part(G.box(0.07, 0.3, 0.02), sash, { pos: [x, -0.04, 0.27], rot: [0.1, 0, x * 0.8], outline: 0.01 }));
    if (rank >= 1) {
      add(T, out, part(G.torus(0.44, 0.03, Math.PI * 2, 6, 24), GOLD, { pos: [0, 0.58, 0], rot: [Math.PI / 2, 0, 0], outline: false }));
      if (cls !== 'mage') add(T, out, part(G.torus(0.55, 0.035, Math.PI * 2, 6, 28), GOLD, { pos: [0, -0.54, 0], rot: [Math.PI / 2, 0, 0], outline: false }));
      for (const fore of [rig.foreL, rig.foreR]) add(fore, out, part(G.torus(0.128, 0.018, Math.PI * 2, 6, 16), GOLD, { pos: [0, -rig.foreLen * 0.9, 0], rot: [Math.PI / 2, 0, 0], outline: false }));
    }
    if (rank >= 2) {
      // Руны по подолу
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        add(T, out, gem(RARITY_HEX[r], 0.035, [Math.sin(a) * 0.5, -0.42, Math.cos(a) * 0.47], out));
      }
      add(T, out, gem(RARITY_HEX[r], 0.07, [0, 0.45, 0.3], out));
    }
    if (rank >= 3) {
      // Звёздная мантия: сияющий воротник
      for (let i = 0; i < 5; i++) {
        const a = -0.9 + i * 0.45;
        add(T, out, part(G.cone(0.05, 0.22, 5), LUX[r], { pos: [Math.sin(a) * 0.3, 0.82, -Math.cos(a) * 0.12 - 0.06], rot: [-0.4, a, 0], outline: 0.012 }));
      }
      add(T, out, halo(rank >= 4 ? 0xff3b2f : 0xffb070, 0.2, [0, 0.45, 0.32], out, 0.35));
    }
    return { torso: col, sleeve: col, metal: false };
  }
  // Кожаный доспех
  add(T, out, part(G.sphere(0.32, 18, 12), col, { pos: [0, 0.4, 0.04], scale: [1.03, 1.1, 0.7], outline: 0.025, map: clothTex() }));
  // Перекрещённые ремни с пряжкой
  for (const a of [-0.6, 0.6]) add(T, out, part(G.box(0.07, 0.62, 0.03), LEATHER, { pos: [0, 0.4, 0.29], rot: [0, 0, a], outline: 0.012 }));
  add(T, out, part(G.box(0.1, 0.1, 0.04), GOLD, { pos: [0, 0.4, 0.31], outline: 0.012 }));
  // Подсумки на поясе
  for (const s of [-1, 1]) add(T, out, part(G.box(0.12, 0.12, 0.08), LEATHER, { pos: [s * 0.26, 0.06, 0.15], rot: [0, s * 0.7, 0], outline: 0.015 }));
  // Наплечник на левом плече и наручи
  add(rig.armL, out, part(G.halfSphere(0.17), col, { pos: [0, 0.03, 0], scale: [1.15, 0.8, 1.1], outline: 0.02, map: clothTex() }));
  for (const fore of [rig.foreL, rig.foreR]) {
    add(fore, out, part(G.cyl(0.066, 0.056, rig.foreLen * 0.55, 10), LEATHER, { pos: [0, -rig.foreLen * 0.6, 0], outline: 0.015 }));
    add(fore, out, part(G.torus(0.064, 0.012, Math.PI * 2, 4, 12), GOLD, { pos: [0, -rig.foreLen * 0.6, 0], rot: [Math.PI / 2, 0, 0], outline: false }));
  }
  if (rank >= 1) {
    // Меховой воротник
    const fur = rank >= 3 ? 0xffe8c8 : rank >= 2 ? 0x3a3048 : 0xe8dcc8;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      add(T, out, part(G.ico(0.1, 1), fur, { pos: [Math.sin(a) * 0.22, 0.73, Math.cos(a) * 0.19], outline: 0.012 }));
    }
  }
  if (rank >= 2) {
    // Кинжал на бедре
    const dg = new THREE.Group();
    dg.add(part(G.cyl(0.025, 0.025, 0.1, 6), LEATHER, { outline: 0.01 }));
    dg.add(part(G.box(0.1, 0.025, 0.03), GOLD, { pos: [0, 0.06, 0], outline: 0.01 }));
    dg.add(part(G.box(0.04, 0.2, 0.015), METAL[r], { pos: [0, 0.17, 0], outline: 0.01 }));
    dg.position.set(0.3, -0.02, 0.05);
    dg.rotation.set(Math.PI, 0, 0.3);
    add(T, out, dg);
    add(T, out, gem(RARITY_HEX[r], 0.05, [0, 0.4, 0.34], out));
  }
  if (rank >= 3) {
    // Перья феникса на плече
    for (let i = 0; i < 4; i++) add(rig.armL, out, part(G.cone(0.04, 0.28, 5), [0xff6a2a, 0xffb030, 0xffe060, 0xff6a2a][i], { pos: [-0.05, 0.1, -0.12 + i * 0.07], rot: [0.3 - i * 0.2, 0, 0.9], outline: 0.01 }));
    add(T, out, halo(rank >= 4 ? 0xff3b2f : 0xff8a3a, 0.18, [0, 0.4, 0.34], out, 0.35));
  }
  return { torso: col, sleeve: col, metal: false };
}

// ================================================================== Голова

/** Шлем или капюшон вместо классового головного убора. */
export function buildHelmet(g: THREE.Group, tpl: string, r: Rarity, out: Built) {
  const rank = RANK[r];
  if (tpl === 'helm') {
    const metal = rank === 0 ? 0x8a5a33 : rank >= 4 ? 0x6a1c22 : rank >= 3 ? 0xffcf4a : ARMOR_COLORS.plate[r];
    const outline = 0.03;
    add(g, out, part(G.halfSphere(0.44), metal, { pos: [0, 0.03, 0], outline }));
    add(g, out, part(G.torus(0.43, 0.04, Math.PI * 2, 6, 24), rank === 0 ? 0x5a3a22 : TRIM[r], { pos: [0, 0.04, 0], rot: [Math.PI / 2, 0, 0], outline: false }));
    if (rank === 0) {
      // Кожаная шапка с пуговкой и швами
      add(g, out, part(G.sphere(0.05, 8, 6), 0x5a3a22, { pos: [0, 0.47, 0], outline: 0.01 }));
      for (const a of [0, Math.PI / 2]) add(g, out, part(G.torus(0.44, 0.012, Math.PI, 4, 16), 0x5a3a22, { pos: [0, 0.03, 0], rot: [0, a, 0], outline: false }));
      return;
    }
    // Наносник и заклёпки
    add(g, out, part(G.box(0.06, 0.27, 0.05), metal, { pos: [0, -0.03, 0.42], outline: 0.012 }));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      add(g, out, part(G.sphere(0.022, 6, 4), TRIM[r], { pos: [Math.sin(a) * 0.44, 0.06, Math.cos(a) * 0.44], outline: false }));
    }
    if (rank >= 2) {
      // Нащёчники, гребень и плюмаж
      for (const s of [-1, 1]) add(g, out, part(G.box(0.13, 0.24, 0.05), metal, { pos: [s * 0.31, -0.13, 0.27], rot: [0, s * 0.65, 0], outline: 0.015 }));
      add(g, out, part(G.box(0.05, 0.12, 0.62), TRIM[r], { pos: [0, 0.42, -0.02], outline: 0.012 }));
      const plume = new THREE.Group();
      for (let i = 0; i < 4; i++) plume.add(part(G.capsule(0.05, 0.22), RARITY_HEX[r], { pos: [0, 0, -i * 0.09], rot: [-0.9 - i * 0.15, 0, 0], outline: 0.012 }));
      plume.position.set(0, 0.5, -0.05);
      add(g, out, plume);
    }
    if (rank >= 3) {
      // Корона королей
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        add(g, out, part(G.cone(0.055, 0.2, 6), LUX[r], { pos: [Math.sin(a) * 0.36, 0.3, Math.cos(a) * 0.36], rot: [Math.cos(a) * 0.3, 0, -Math.sin(a) * 0.3], outline: 0.012 }));
      }
      add(g, out, gem(0xff3a5a, 0.06, [0, 0.22, 0.42], out));
      add(g, out, halo(LUX[r], 0.2, [0, 0.4, 0], out, 0.25));
    }
    return;
  }
  // Капюшон
  const col = { common: 0x7a6a55, rare: 0x2f6aa8, epic: 0x2a2238, legendary: 0xf2ecd8, relic: 0x5a0f14 }[r];
  const hood = part(G.sphere(0.45, 18, 14), col, { pos: [0, 0.05, -0.06], outline: 0.03, map: clothTex() });
  hood.scale.set(1.04, 1.02, 1.05);
  const face = new THREE.Mesh(G.sphere(0.395, 18, 14), toon(SKIN));
  face.position.set(0, -0.02, 0.06);
  face.scale.set(0.98, 0.93, 0.95);
  add(g, out, hood);
  add(g, out, face);
  add(g, out, part(G.cone(0.2, 0.5, 10), col, { pos: [0, 0.05, -0.5], rot: [-2.0, 0, 0], outline: 0.025, map: clothTex() }));
  if (rank >= 1) {
    // Окантовка лица и перо
    add(g, out, part(G.torus(0.37, 0.03, Math.PI * 2, 6, 24), rank >= 3 ? GOLD : 0xd8c8a0, { pos: [0, -0.02, 0.2], scale: [1, 1.05, 1], outline: false }));
    add(g, out, part(G.capsule(0.04, 0.32), RARITY_HEX[r], { pos: [0.33, 0.35, -0.2], rot: [-0.5, 0, -0.6], outline: 0.012 }));
  }
  if (rank === 2) {
    // Капюшон Тени: маска на нижнюю часть лица
    add(g, out, part(G.sphere(0.3, 14, 10), 0x2a2232, { pos: [0, -0.24, 0.16], scale: [0.95, 0.42, 0.8], outline: 0.012 }));
  }
  if (rank >= 3) {
    // Венец мудрости
    add(g, out, part(G.torus(0.4, 0.03, Math.PI * 2, 6, 24), LUX[r], { pos: [0, 0.2, 0.04], rot: [Math.PI / 2 - 0.25, 0, 0], outline: false }));
    add(g, out, gem(0x5ac8ff, 0.07, [0, 0.27, 0.4], out));
    add(g, out, halo(0x8ad8ff, 0.16, [0, 0.27, 0.4], out, 0.35));
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
  for (const [shin, foot, s] of [
    [rig.shinL, rig.footL, -1],
    [rig.shinR, rig.footR, 1],
  ] as const) {
    if (greaves) {
      if (rank >= 1) {
        // Поножи: щиток на голени и наколенник
        add(shin, out, part(G.box(0.13, SL * 0.7, 0.05), color, { pos: [0, -SL * 0.45, 0.065], rot: [-0.05, 0, 0], outline: 0.015 }));
        add(shin, out, part(G.sphere(0.075, 10, 8), color, { pos: [0, 0, 0.05], scale: [1, 0.9, 0.8], outline: 0.015 }));
      } else {
        // Деревянные башмаки: высокая подошва
        add(foot, out, part(G.box(0.16, 0.05, 0.33), WOOD, { pos: [0, -0.09, 0.05], outline: 0.015 }));
      }
      if (rank >= 2) add(shin, out, part(G.box(0.14, 0.025, 0.06), TRIM[r], { pos: [0, -SL * 0.15, 0.09], outline: false }));
      if (rank >= 3) add(shin, out, part(G.cone(0.035, 0.13, 6), GOLD, { pos: [s * 0.05, 0.02, 0.1], rot: [1.2, 0, 0], outline: 0.01 }));
    } else if (rank === 0) {
      // Лапти: плетёные ремешки вокруг лодыжки
      for (const y of [0.0, 0.07]) add(shin, out, part(G.torus(0.07, 0.01, Math.PI * 2, 4, 14), 0x8a6a3a, { pos: [0, -SL + y, 0], rot: [Math.PI / 2, 0, 0], outline: false }));
    } else {
      // Высокие сапоги с отворотом
      add(shin, out, part(G.cyl(0.074, 0.07, SL * 0.6, 12), color, { pos: [0, -SL * 0.68, 0], outline: 0.015 }));
      add(shin, out, part(G.torus(0.078, 0.022, Math.PI * 2, 6, 16), rank >= 3 ? 0xffffff : 0x3a2414, { pos: [0, -SL * 0.38, 0], rot: [Math.PI / 2, 0, 0], outline: false }));
      if (rank >= 2) add(shin, out, part(G.box(0.06, 0.04, 0.03), GOLD, { pos: [0, -SL * 0.8, 0.075], outline: 0.008 }));
      if (rank >= 2) {
        // Крылышки
        const wing = new THREE.Group();
        for (let i = 0; i < 3; i++) wing.add(part(G.box(0.02, 0.09 + i * 0.03, 0.07), 0xffffff, { pos: [0, i * 0.035, -i * 0.05], rot: [0.5 + i * 0.25, 0, 0], outline: 0.01 }));
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
  if (tpl === 'talisman') {
    add(T, out, part(G.torus(0.21, 0.014, Math.PI, 4, 16), LEATHER, { pos: [0, 0.6, 0.18], rot: [Math.PI / 2 + 0.6, 0, Math.PI], outline: false }));
    add(T, out, part(G.cone(0.045, 0.16, 6), rank >= 3 ? LUX[r] : 0xfff6e0, { pos: [0, 0.43, 0.31], rot: [Math.PI, 0, 0], outline: 0.012 }));
    for (const x of [-0.06, 0.06]) add(T, out, part(G.sphere(0.03, 6, 4), RARITY_HEX[r], { pos: [x, 0.5, 0.3], outline: false }));
    if (rank >= 2) add(T, out, gem(RARITY_HEX[r], 0.04, [0, 0.52, 0.32], out));
    return;
  }
  add(T, out, part(G.torus(0.21, 0.016, Math.PI, 4, 16), GOLD, { pos: [0, 0.6, 0.18], rot: [Math.PI / 2 + 0.6, 0, Math.PI], outline: false }));
  add(T, out, part(G.torus(0.065, 0.018, Math.PI * 2, 4, 14), GOLD, { pos: [0, 0.46, 0.3], outline: false }));
  add(T, out, gem(RARITY_HEX[r], 0.055 + rank * 0.008, [0, 0.46, 0.31], out));
  if (rank >= 3) add(T, out, halo(RARITY_HEX[r], 0.13, [0, 0.46, 0.33], out, 0.35));
}

export function buildRing(hand: THREE.Object3D, r: Rarity, out: Built) {
  const m = new THREE.Mesh(G.torus(0.08, 0.025, Math.PI * 2, 6, 12), toon(GOLD));
  m.rotation.x = Math.PI / 2;
  m.position.y = 0.04;
  add(hand, out, m);
  add(hand, out, gem(RARITY_HEX[r], 0.035, [0, 0.04, 0.1], out));
}

// ================================================================== Оружие

/**
 * Модель оружия. Локальная ось +y — вдоль клинка/древка (от рукояти к острию).
 */
export function buildWeapon(tpl: string, r: Rarity, out: Built): THREE.Group {
  const rank = RANK[r];
  const w = new THREE.Group();
  const metal = METAL[r];
  const glowCol = RARITY_HEX[r];
  const shine = rank >= 2;
  const metalMat = shine ? toon(metal, { emissive: glowCol, emissiveIntensity: 0.35 }) : toon(metal);
  const M = (geo: THREE.BufferGeometry, pos: V3, rot?: V3, scale?: V3, ol = 0.018) => {
    const m = new THREE.Mesh(geo, metalMat);
    m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    if (scale) m.scale.set(...scale);
    if (ol) addOutline(m, ol);
    w.add(m);
    return m;
  };
  const P = (geo: THREE.BufferGeometry, color: number, pos: V3, rot?: V3, scale?: V3, ol: number | false = 0.014) => {
    const m = part(geo, color, { pos, rot, scale, outline: ol });
    w.add(m);
    return m;
  };
  const wraps = (y0: number, n: number, rad: number, step = 0.05) => {
    for (let i = 0; i < n; i++) P(G.torus(rad, 0.012, Math.PI * 2, 4, 10), 0x3a2414, [0, y0 + i * step, 0], [Math.PI / 2, 0, 0], undefined, false);
  };
  const grip = rank >= 4 ? 0x2a0a0e : rank >= 3 ? 0x8a2a2a : LEATHER;
  // Светлая заточенная кромка по обеим сторонам клинка — блик, по которому оружие видно издалека
  // У обычных и редких кромка без свечения — так она склеивается с моделью и не добавляет отрисовок
  const edgeMat = rank >= 2 ? toon(0xffffff, { emissive: glowCol, emissiveIntensity: 0.45 }) : toon(0xf4f8ff);
  const edges = (width: number, len: number, y0: number, depth = 0.04) => {
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(G.box(0.022, len, depth), edgeMat);
      e.position.set(sx * (width / 2 - 0.004), y0 + len / 2, 0);
      w.add(e);
    }
  };
  // Навершие: кольцо и камень у редких
  const pommel = (y: number, r: number) => {
    P(G.sphere(r, 10, 8), guard, [0, y, 0]);
    P(G.torus(r * 0.95, r * 0.25, Math.PI * 2, 4, 12), rank >= 1 ? GOLD : 0x6a4a2a, [0, y + r * 0.6, 0], [Math.PI / 2, 0, 0], undefined, false);
    if (rank >= 1) w.add(gem(glowCol, r * 0.55, [0, y, r * 0.8], out));
  };
  const guard = rank >= 2 ? GOLD : rank === 1 ? 0xc7ced6 : 0x8a6a4a;

  switch (tpl) {
    case 'sword': {
      const len = 0.85 + rank * 0.07;
      P(G.cyl(0.04, 0.04, 0.24, 8), grip, [0, 0, 0]);
      wraps(-0.08, 4, 0.043);
      pommel(-0.15, 0.065);
      // Рикассо и камень в центре гарды
      M(G.box(0.1, 0.06, 0.05), [0, 0.19, 0], undefined, undefined, 0.01);
      if (rank >= 1) w.add(gem(glowCol, 0.04, [0, 0.13, 0.05], out));
      else P(G.sphere(0.035, 8, 6), 0x8a96a0, [0, 0.13, 0.05], undefined, undefined, 0.008);
      // Гарда: прямая или с загнутыми концами
      P(G.box(0.36, 0.06, 0.09), guard, [0, 0.13, 0]);
      for (const s of [-1, 1]) {
        if (rank >= 1) P(G.cone(0.045, 0.14, 6), guard, [s * 0.21, 0.17, 0], [0, 0, -s * 0.9]);
        else P(G.sphere(0.04, 6, 4), guard, [s * 0.19, 0.13, 0]);
      }
      // Клинок с долом
      M(G.box(0.13 + rank * 0.01, len, 0.035), [0, 0.16 + len / 2, 0]);
      edges(0.13 + rank * 0.01, len, 0.16);
      M(G.cone(0.09 + rank * 0.007, 0.2, 4), [0, 0.16 + len + 0.1, 0], [0, Math.PI / 4, 0], [1, 1, 0.35]);
      if (rank >= 1) for (let i = 0; i < 2 + rank; i++) P(G.box(0.035, 0.035, 0.045), glowCol, [0, 0.3 + i * 0.14, 0], [0, 0, Math.PI / 4], undefined, false);
      P(G.box(0.03, len * 0.75, 0.04), rank >= 2 ? glowCol : 0x8a96a0, [0, 0.16 + len * 0.42, 0], undefined, undefined, false);
      if (rank >= 3) {
        w.add(halo(glowCol, 0.16, [0, 0.16 + len * 0.5, 0], out, 0.3));
        w.add(halo(glowCol, 0.14, [0, 0.16 + len * 0.85, 0], out, 0.3));
      }
      break;
    }
    case 'axe': {
      P(G.cyl(0.04, 0.045, 1.0, 8), WOOD, [0, 0.35, 0], undefined, undefined, 0.015);
      wraps(-0.05, 3, 0.048);
      P(G.cyl(0.05, 0.05, 0.06, 8), 0x6a6a6a, [0, -0.15, 0]);
      // Полумесяц лезвия
      const head = (s: number) => {
        // Сектор цилиндра, обращённый в сторону ±x, положенный плашмя
        const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 18, 1, false, s * Math.PI / 2 - Math.PI * 0.4, Math.PI * 0.8), metalMat);
        blade.rotation.x = Math.PI / 2;
        blade.position.set(s * 0.04, 0.72, 0);
        blade.scale.set(1, 1.25, 1);
        addOutline(blade, 0.018);
        w.add(blade);
        // Режущая кромка
        const edge = new THREE.Mesh(G.torus(0.3, 0.018, Math.PI * 0.8, 4, 16), toon(rank >= 2 ? glowCol : 0xffffff));
        edge.rotation.z = s > 0 ? -Math.PI * 0.4 : Math.PI * 0.6;
        edge.position.set(s * 0.04, 0.72, 0);
        edge.scale.set(1, 1.25, 1);
        w.add(edge);
      };
      head(1);
      if (rank >= 2) head(-1);
      else if (rank >= 1) M(G.cone(0.05, 0.22, 6), [-0.16, 0.72, 0], [0, 0, Math.PI / 2]);
      M(G.box(0.12, 0.2, 0.09), [0, 0.72, 0]);
      P(G.cone(0.04, 0.12, 6), guard, [0, 0.9, 0]);
      if (rank >= 3) w.add(halo(glowCol, 0.22, [0.25, 0.72, 0], out, 0.3));
      break;
    }
    case 'hammer': {
      P(G.cyl(0.04, 0.045, 0.95, 8), WOOD, [0, 0.33, 0], undefined, undefined, 0.015);
      wraps(-0.08, 4, 0.048);
      P(G.sphere(0.055, 8, 6), guard, [0, -0.16, 0]);
      M(G.box(0.46, 0.27, 0.27), [0, 0.82, 0]);
      for (const s of [-1, 1]) M(G.cyl(0.16, 0.16, 0.06, 12), [s * 0.25, 0.82, 0], [0, 0, Math.PI / 2], undefined, 0.012);
      P(G.box(0.48, 0.06, 0.29), guard, [0, 0.82, 0], undefined, undefined, false);
      if (rank >= 1) {
        // Заклёпки и шип сверху
        for (const s of [-1, 1]) for (const z of [-1, 1]) P(G.sphere(0.025, 6, 4), guard, [s * 0.14, 0.93, z * 0.14], undefined, undefined, false);
        M(G.cone(0.06, 0.2, 6), [0, 1.05, 0]);
      }
      if (rank >= 3) {
        for (const s of [-1, 1]) w.add(gem(0x7ae0ff, 0.06, [s * 0.29, 0.82, 0], out));
        w.add(halo(0x7ae0ff, 0.3, [0, 0.82, 0], out, 0.25));
      }
      break;
    }
    case 'staff': {
      P(G.cyl(0.035, 0.05, 1.6, 8), WOOD, [0, 0.55, 0], undefined, undefined, 0.015);
      // Спиральная обмотка
      for (let i = 0; i < 6; i++) P(G.torus(0.05, 0.012, Math.PI, 4, 8), rank >= 1 ? GOLD : LEATHER, [0, 0.1 + i * 0.16, 0], [Math.PI / 2, i * 0.9, 0.3], undefined, false);
      // Навершие-крюк, держащее кристалл
      P(G.torus(0.13, 0.03, Math.PI * 1.4, 6, 14), WOOD, [0, 1.42, 0], [0, 0, -Math.PI * 0.2]);
      const crystal = new THREE.Mesh(faceted(new THREE.OctahedronGeometry(0.11, 0)), toon(rank === 0 ? 0x7fd8ff : glowCol, { emissive: rank === 0 ? 0x4ab8ff : glowCol, emissiveIntensity: 0.9 }));
      crystal.position.y = 1.42;
      crystal.scale.set(0.8, 1.4, 0.8);
      addOutline(crystal, 0.015);
      out.glow.push(crystal);
      w.add(crystal);
      w.add(halo(rank === 0 ? 0x7fd8ff : glowCol, 0.22, [0, 1.42, 0], out, 0.25));
      // Подвески на шнурках под навершием
      for (const sx of [-1, 1]) {
        P(G.cyl(0.006, 0.006, 0.2, 3), 0x3a2414, [sx * 0.07, 1.18, 0], undefined, undefined, false);
        P(G.sphere(0.03, 6, 4), rank >= 1 ? glowCol : 0xd8c8a0, [sx * 0.07, 1.07, 0], undefined, undefined, 0.006);
      }
      // Парящее кольцо рун вокруг кристалла
      const runeRing = new THREE.Mesh(G.torus(0.2, 0.014, Math.PI * 2, 4, 20), glow(rank === 0 ? 0x9ae0ff : glowCol, 0.7, false));
      runeRing.rotation.x = Math.PI / 2 - 0.3;
      runeRing.position.y = 1.42;
      runeRing.userData.anim = true;
      out.spin.push(runeRing);
      w.add(runeRing);
      if (rank >= 2) {
        // Камни, вращающиеся вокруг кристалла
        const orbit = new THREE.Group();
        orbit.userData.anim = true;
        for (let i = 0; i < (rank >= 3 ? 4 : 2); i++) {
          const a = (i / (rank >= 3 ? 4 : 2)) * Math.PI * 2;
          orbit.add(gem(glowCol, 0.04, [Math.cos(a) * 0.24, 0, Math.sin(a) * 0.24]));
        }
        orbit.position.y = 1.42;
        out.spin.push(orbit);
        w.add(orbit);
      }
      break;
    }
    case 'wand': {
      P(G.cyl(0.03, 0.04, 0.32, 8), grip, [0, 0, 0]);
      wraps(-0.1, 3, 0.042, 0.06);
      P(G.cyl(0.022, 0.03, 0.45, 8), 0xefe2c2, [0, 0.38, 0]);
      P(G.torus(0.04, 0.012, Math.PI * 2, 4, 10), GOLD, [0, 0.16, 0], [Math.PI / 2, 0, 0], undefined, false);
      // Звезда на кончике
      const star = new THREE.Group();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        star.add(new THREE.Mesh(G.cone(0.035, 0.1, 4), toon(rank === 0 ? 0xffe14a : glowCol, { emissive: rank === 0 ? 0xffb020 : glowCol, emissiveIntensity: 0.8 })));
        const c = star.children[i];
        c.position.set(Math.sin(a) * 0.05, Math.cos(a) * 0.05, 0);
        c.rotation.z = -a;
      }
      star.position.y = 0.66;
      star.rotation.x = Math.PI / 2;
      star.userData.anim = true;
      star.userData.spinAxis = 'z';
      out.spin.push(star);
      w.add(star);
      w.add(halo(rank === 0 ? 0xffe14a : glowCol, 0.13, [0, 0.66, 0], out, 0.3));
      if (rank >= 1) for (let i = 0; i < 5; i++) P(G.torus(0.035, 0.008, Math.PI, 4, 8), RARITY_HEX[r], [0, 0.22 + i * 0.07, 0], [Math.PI / 2, i * 1.2, 0], undefined, false);
      break;
    }
    case 'orb': {
      P(G.cyl(0.035, 0.045, 0.35, 8), grip, [0, 0, 0]);
      wraps(-0.1, 3, 0.048, 0.06);
      // Чаша-подставка с лепестками
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        P(G.cone(0.035, 0.22, 5), guard, [Math.cos(a) * 0.09, 0.27, Math.sin(a) * 0.09], [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5]);
      }
      const orbCol = rank === 0 ? 0x9ad8ff : glowCol;
      const orb = new THREE.Mesh(G.sphere(0.15, 16, 12), toon(orbCol, { emissive: orbCol, emissiveIntensity: 0.8 }));
      orb.position.y = 0.42;
      addOutline(orb, 0.015);
      out.glow.push(orb);
      w.add(orb);
      w.add(halo(orbCol, 0.26, [0, 0.42, 0], out, 0.25));
      // Вращающиеся кольца вокруг сферы
      const rings = new THREE.Group();
      rings.userData.anim = true;
      for (let i = 0; i <= Math.min(2, rank); i++) {
        const ring = new THREE.Mesh(G.torus(0.22 + i * 0.04, 0.012, Math.PI * 2, 4, 24), toon(GOLD));
        ring.rotation.set(Math.PI / 2 + i * 0.7, i * 0.9, 0);
        rings.add(ring);
      }
      rings.position.y = 0.42;
      out.spin.push(rings);
      w.add(rings);
      break;
    }
    case 'bow':
    case 'recurve': {
      const arc = tpl === 'recurve' ? Math.PI * 0.8 : Math.PI * 0.75;
      const rad = tpl === 'recurve' ? 0.52 : 0.62;
      const limbCol = rank === 0 ? WOOD : rank === 1 ? 0x6a4428 : metal;
      const limbG = new THREE.Group();
      const limb = new THREE.Mesh(G.torus(rad, 0.035, arc, 6, 20), toon(limbCol, shine ? { emissive: glowCol, emissiveIntensity: 0.3 } : {}));
      addOutline(limb, 0.018);
      limb.rotation.z = -arc / 2;
      limb.position.x = -rad * 0.82;
      limbG.add(limb);
      const tipX = rad * Math.cos(arc / 2) - rad * 0.82;
      const tipY = rad * Math.sin(arc / 2);
      // Загнутые концы (у рогатого лука) или наконечники
      for (const s of [-1, 1]) {
        if (tpl === 'recurve') {
          const curl = new THREE.Mesh(G.torus(0.08, 0.03, Math.PI * 0.9, 5, 10), toon(limbCol));
          curl.position.set(tipX - 0.02, s * tipY, 0);
          curl.rotation.z = s > 0 ? Math.PI * 0.1 : Math.PI * 1.0;
          addOutline(curl, 0.014);
          limbG.add(curl);
        } else limbG.add(part(G.sphere(0.035, 8, 6), GOLD, { pos: [tipX, s * tipY, 0], outline: 0.01 }));
        // Лезвия-листья на плечах эпического лука
        if (rank >= 2) limbG.add(part(G.cone(0.04, 0.2, 4), metal, { pos: [tipX + 0.08, s * tipY * 0.7, 0], rot: [0, 0, s > 0 ? -0.6 : -2.5], scale: [1, 1, 0.4], outline: 0.012 }));
      }
      const string = new THREE.Mesh(G.cyl(0.008, 0.008, tipY * 2, 4), rank >= 3 ? glow(rank >= 4 ? 0xff6a5a : 0xfff0a0, 1, false) : toon(0xf5f0e0));
      string.position.x = tipX;
      limbG.add(string);
      // Рукоять с обмоткой и накладками
      limbG.add(part(G.cyl(0.05, 0.05, 0.2, 8), grip, { pos: [rad * 0.18, 0, 0], outline: 0.012 }));
      for (const y of [-0.08, 0.08]) limbG.add(part(G.torus(0.052, 0.012, Math.PI * 2, 4, 10), guard, { pos: [rad * 0.18, y, 0], rot: [Math.PI / 2, 0, 0], outline: false }));
      if (rank >= 1) for (const s of [-1, 1]) limbG.add(part(G.box(0.03, 0.14, 0.05), guard, { pos: [rad * 0.12, s * 0.2, 0], rot: [0, 0, s * 0.25], outline: 0.01 }));
      if (rank >= 3) limbG.add(halo(glowCol, 0.18, [rad * 0.18, 0, 0], out, 0.3));
      limbG.rotation.set(Math.PI / 2, Math.PI / 2, 0);
      w.add(limbG);
      break;
    }
    case 'glaives': {
      // Боевая глефа: рукоять посередине, длинный клинок вверх и серп-крюк назад
      const edgeCol = rank >= 1 ? glowCol : 0x5dff8a;
      P(G.cyl(0.035, 0.035, 0.26, 8), grip, [0, 0, 0]);
      wraps(-0.09, 4, 0.04);
      P(G.box(0.2, 0.05, 0.08), guard, [0, 0.14, 0]);
      M(G.box(0.1, 0.6 + rank * 0.05, 0.03), [0.03, 0.47, 0], [0, 0, -0.12]);
      M(G.cone(0.07, 0.22, 4), [0.08 + rank * 0.006, 0.86 + rank * 0.05, 0], [0, Math.PI / 4, -0.12], [1, 1, 0.35]);
      const crescent = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 18, 1, false, -Math.PI / 2 - Math.PI * 0.42, Math.PI * 0.84), metalMat);
      crescent.rotation.x = Math.PI / 2;
      crescent.position.set(-0.02, 0.3, 0);
      crescent.scale.set(0.9, 1.3, 1);
      addOutline(crescent, 0.016);
      w.add(crescent);
      const edge = new THREE.Mesh(G.torus(0.3, 0.016, Math.PI * 0.84, 4, 16), toon(edgeCol, { emissive: edgeCol, emissiveIntensity: 0.6 }));
      edge.rotation.z = Math.PI / 2 + Math.PI * 0.08;
      edge.position.set(-0.02, 0.3, 0);
      edge.scale.set(0.9, 1.3, 1);
      w.add(edge);
      // Нижний шип у навершия
      M(G.cone(0.05, 0.22, 4), [0, -0.24, 0], [Math.PI, Math.PI / 4, 0], [1, 1, 0.4]);
      if (rank >= 2) w.add(gem(glowCol, 0.045, [0, 0.14, 0.05], out));
      if (rank >= 3) w.add(halo(glowCol, 0.2, [0, 0.5, 0], out, 0.3));
      break;
    }
    case 'daggers': {
      // Кинжал с изогнутой гардой
      const len = 0.42 + rank * 0.04;
      P(G.cyl(0.032, 0.032, 0.2, 8), grip, [0, 0, 0]);
      wraps(-0.07, 3, 0.036);
      P(G.sphere(0.05, 8, 6), guard, [0, -0.12, 0]);
      P(G.torus(0.09, 0.022, Math.PI, 5, 10), guard, [0, 0.13, 0], [0, 0, 0]);
      M(G.box(0.085, len, 0.025), [0, 0.13 + len / 2, 0]);
      edges(0.085, len, 0.13, 0.03);
      M(G.cone(0.06, 0.16, 4), [0, 0.13 + len + 0.08, 0], [0, Math.PI / 4, 0], [1, 1, 0.35]);
      P(G.box(0.022, len * 0.7, 0.03), rank >= 2 ? glowCol : 0x6f7b85, [0, 0.13 + len * 0.45, 0], undefined, undefined, false);
      if (rank >= 2) w.add(gem(glowCol, 0.035, [0, -0.12, 0.04], out));
      if (rank >= 3) w.add(halo(glowCol, 0.13, [0, 0.13 + len * 0.6, 0], out, 0.3));
      break;
    }
    case 'warblades': {
      // Изогнутый клинок-сабля с шипами на обухе
      P(G.cyl(0.036, 0.036, 0.24, 8), grip, [0, 0, 0]);
      wraps(-0.08, 4, 0.04);
      P(G.box(0.26, 0.05, 0.08), guard, [0, 0.14, 0]);
      for (let i = 0; i < 4; i++) {
        const a = i * 0.12;
        M(G.box(0.12, 0.2, 0.03), [Math.sin(a) * 0.12 + i * 0.03, 0.26 + i * 0.17, 0], [0, 0, -a]);
      }
      M(G.cone(0.07, 0.24, 4), [0.16, 0.98, 0], [0, Math.PI / 4, -0.55], [1, 1, 0.35]);
      for (let i = 0; i < 3; i++) M(G.cone(0.03, 0.1, 4), [-0.05 + i * 0.04, 0.32 + i * 0.18, 0], [0, 0, 0.9], undefined, 0.01);
      if (rank >= 2) w.add(gem(glowCol, 0.045, [0, 0.14, 0.05], out));
      if (rank >= 3) w.add(halo(glowCol, 0.2, [0.08, 0.6, 0], out, 0.3));
      break;
    }
    case 'tome': {
      // Книга духов с застёжкой и сияющей руной
      const cover = [0x2a6f78, 0x2f4f9a, 0x5a2f8a, 0xb8862a, 0x6a0c14][rank];
      const runeCol = rank === 0 ? 0x7af0ff : glowCol;
      const book = new THREE.Group();
      book.add(part(G.box(0.36, 0.46, 0.05), cover, { pos: [0, 0, 0.06], outline: 0.018 }));
      book.add(part(G.box(0.36, 0.46, 0.05), cover, { pos: [0, 0, -0.06], outline: 0.018 }));
      book.add(part(G.box(0.33, 0.43, 0.09), 0xf3ead2, { pos: [0.015, 0, 0], outline: false }));
      book.add(part(G.cyl(0.06, 0.06, 0.46, 10), cover, { pos: [-0.18, 0, 0], outline: 0.015 }));
      for (const y of [-0.17, 0.17]) book.add(part(G.box(0.08, 0.06, 0.18), guard, { pos: [0.16, y, 0], outline: 0.01 }));
      book.add(part(G.box(0.08, 0.05, 0.19), guard, { pos: [0.17, 0, 0], outline: 0.01 }));
      const rune = new THREE.Mesh(G.torus(0.09, 0.016, Math.PI * 2, 4, 16), toon(runeCol, { emissive: runeCol, emissiveIntensity: 0.9 }));
      rune.position.z = 0.09;
      book.add(rune);
      const eyeR = new THREE.Mesh(G.ico(0.04, 0), toon(runeCol, { emissive: runeCol, emissiveIntensity: 1 }));
      eyeR.position.z = 0.09;
      book.add(eyeR);
      out.glow.push(eyeR);
      book.add(halo(runeCol, 0.22, [0, 0, 0.1], out, rank >= 2 ? 0.3 : 0.18));
      book.position.set(0, 0.12, 0.08);
      book.rotation.set(-0.3, 0.3, 0);
      w.add(book);
      if (rank >= 1) {
        // Листки-духи, кружащие вокруг книги
        const orbit = new THREE.Group();
        orbit.userData.anim = true;
        for (let i = 0; i < 1 + rank; i++) {
          const a = (i / (1 + rank)) * Math.PI * 2;
          const pg = new THREE.Mesh(G.box(0.08, 0.1, 0.01), glow(runeCol, 0.7, false));
          pg.position.set(Math.cos(a) * 0.32, Math.sin(a * 2) * 0.05, Math.sin(a) * 0.32);
          orbit.add(pg);
        }
        orbit.position.set(0, 0.12, 0.08);
        out.spin.push(orbit);
        w.add(orbit);
      }
      break;
    }
    case 'totemstaff': {
      // Посох с резным тотемом, перьями и черепом-навершием
      P(G.cyl(0.035, 0.05, 1.5, 8), WOOD, [0, 0.5, 0], undefined, undefined, 0.015);
      wraps(0.0, 3, 0.05, 0.06);
      const faceCols = [0xd9a441, 0x2ab8c8, 0xc9343a];
      for (let i = 0; i < 2; i++) {
        const y = 1.12 + i * 0.2;
        P(G.cyl(0.11, 0.1, 0.19, 8), i === 0 ? 0x8a5a2b : 0x6a4428, [0, y, 0], undefined, undefined, 0.015);
        for (const x of [-0.04, 0.04]) P(G.box(0.035, 0.03, 0.02), faceCols[(i + 1) % 3], [x, y + 0.03, 0.1], undefined, undefined, false);
        P(G.box(0.08, 0.025, 0.02), 0x1a1210, [0, y - 0.04, 0.1], undefined, undefined, false);
      }
      // Рогатый череп
      P(G.sphere(0.12, 12, 10), 0xf3ead2, [0, 1.56, 0.02], undefined, [1, 0.9, 1.05], 0.015);
      const eyeCol = rank === 0 ? 0x7af0ff : glowCol;
      for (const x of [-0.045, 0.045]) {
        const e = new THREE.Mesh(G.sphere(0.025, 6, 4), toon(eyeCol, { emissive: eyeCol, emissiveIntensity: 1 }));
        e.position.set(x, 1.57, 0.12);
        w.add(e);
        out.glow.push(e);
      }
      for (const s of [-1, 1]) P(G.cone(0.035, 0.2, 6), 0xefe2c2, [s * 0.13, 1.66, 0], [0, 0, -s * 0.9], undefined, 0.012);
      // Перья на шнурках
      const featherCols = [0xe94b3c, 0xffffff, 0x2ab8c8];
      for (let i = 0; i < 2 + rank; i++) {
        const a = (i / (2 + rank)) * Math.PI * 2;
        P(G.cyl(0.006, 0.006, 0.18, 3), 0x3a2414, [Math.cos(a) * 0.12, 1.0, Math.sin(a) * 0.12], undefined, undefined, false);
        P(G.capsule(0.025, 0.12), featherCols[i % 3], [Math.cos(a) * 0.13, 0.86, Math.sin(a) * 0.13], [0, 0, 0.2], [1, 1, 0.4], 0.01);
      }
      w.add(halo(eyeCol, 0.24, [0, 1.56, 0], out, 0.2));
      if (rank >= 2) w.add(gem(glowCol, 0.05, [0, 1.12, 0.12], out));
      break;
    }
    case 'bell': {
      // Колокол духов на рукояти с лентами
      P(G.cyl(0.035, 0.04, 0.5, 8), grip, [0, 0.1, 0]);
      wraps(-0.08, 3, 0.044);
      P(G.torus(0.06, 0.015, Math.PI * 2, 4, 10), guard, [0, 0.37, 0], [Math.PI / 2, 0, 0], undefined, false);
      const bellCol = rank === 0 ? 0xc9a24a : metal;
      const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.2, 0.26, 16, 1, true), toon(bellCol, shine ? { emissive: glowCol, emissiveIntensity: 0.3, side: THREE.DoubleSide } : { side: THREE.DoubleSide }));
      bell.position.y = 0.55;
      bell.rotation.x = Math.PI;
      addOutline(bell, 0.015);
      w.add(bell);
      P(G.sphere(0.08, 10, 6), bellCol, [0, 0.67, 0], undefined, [1, 0.6, 1]);
      P(G.torus(0.2, 0.02, Math.PI * 2, 4, 20), guard, [0, 0.43, 0], [Math.PI / 2, 0, 0], undefined, false);
      const tongueCol = rank === 0 ? 0x7af0ff : glowCol;
      const tongue = new THREE.Mesh(G.sphere(0.05, 8, 6), toon(tongueCol, { emissive: tongueCol, emissiveIntensity: 1 }));
      tongue.position.y = 0.42;
      w.add(tongue);
      out.glow.push(tongue);
      for (const s of [-1, 1]) P(G.box(0.04, 0.3, 0.01), s < 0 ? 0xe94b3c : 0x2ab8c8, [s * 0.06, 0.18, 0.05], [0, 0, s * 0.25], undefined, false);
      w.add(halo(tongueCol, 0.24, [0, 0.5, 0], out, 0.2));
      if (rank >= 2) w.add(gem(glowCol, 0.04, [0, 0.62, 0.19], out));
      break;
    }
    case 'claws': {
      // Наруч и три изогнутых когтя вдоль пальцев
      const clawCol = rank >= 2 ? metal : 0xe8e0d0;
      P(G.cyl(0.11, 0.1, 0.16, 10), grip, [0, -0.06, 0]);
      P(G.torus(0.105, 0.02, Math.PI * 2, 4, 12), guard, [0, 0.02, 0], [Math.PI / 2, 0, 0], undefined, false);
      for (let i = -1; i <= 1; i++) {
        const c = new THREE.Group();
        const len = 0.34 + rank * 0.04 - Math.abs(i) * 0.05;
        c.add(new THREE.Mesh(G.cone(0.035, len, 4), shine ? metalMat : toon(clawCol)));
        c.children[0].position.y = len / 2;
        addOutline(c.children[0] as THREE.Mesh, 0.012);
        c.position.set(i * 0.06, 0.08, 0.04);
        c.rotation.set(0.35, 0, -i * 0.15);
        w.add(c);
      }
      if (rank >= 2) w.add(gem(glowCol, 0.04, [0, -0.04, 0.11], out));
      if (rank >= 3) w.add(halo(glowCol, 0.18, [0, 0.25, 0.08], out, 0.3));
      break;
    }
    case 'knuckles': {
      // Кастет с клыками зверя
      P(G.box(0.22, 0.08, 0.1), guard, [0, 0.04, 0.02]);
      for (let i = 0; i < 4; i++) P(G.torus(0.035, 0.014, Math.PI * 2, 4, 8), guard, [(i - 1.5) * 0.055, 0.04, 0.02], [0, 0, 0], undefined, false);
      for (let i = 0; i < 4; i++) P(G.cone(0.03, 0.16 + (i % 2) * 0.05, 5), 0xfff6e0, [(i - 1.5) * 0.055, 0.15, 0.04], [0.2, 0, 0], undefined, 0.008);
      P(G.cyl(0.1, 0.1, 0.12, 10), grip, [0, -0.08, 0]);
      if (rank >= 2) w.add(gem(glowCol, 0.04, [0, 0.05, 0.08], out));
      if (rank >= 3) w.add(halo(glowCol, 0.16, [0, 0.16, 0.04], out, 0.3));
      break;
    }
    case 'sickles': {
      // Серп-полумесяц на короткой рукояти
      P(G.cyl(0.03, 0.035, 0.22, 8), grip, [0, 0, 0]);
      wraps(-0.07, 3, 0.038);
      const blade = new THREE.Mesh(G.torus(0.22, 0.04, Math.PI * 1.1, 4, 14), metalMat);
      blade.position.set(0.12, 0.2, 0);
      blade.rotation.set(0, 0, Math.PI * 0.05);
      blade.scale.set(1, 1.1, 0.45);
      addOutline(blade, 0.014);
      w.add(blade);
      if (rank >= 1) P(G.torus(0.22, 0.012, Math.PI * 1.1, 3, 14), rank >= 2 ? glowCol : 0xffffff, [0.12, 0.2, 0.012], [0, 0, Math.PI * 0.05], [1.12, 1.22, 0.4], false);
      if (rank >= 3) w.add(halo(glowCol, 0.2, [0.12, 0.32, 0], out, 0.3));
      break;
    }
    case 'blunderbuss':
    case 'handcannon':
    case 'runerifle': {
      // Огнестрел гнома: приклад назад (-y), ствол вперёд (+y)
      const cannon = tpl === 'handcannon';
      const rifle = tpl === 'runerifle';
      const len = rifle ? 0.95 : cannon ? 0.55 : 0.75;
      const brass = rank >= 2 ? GOLD : 0xc8a24a;
      // Приклад и ложа
      P(G.box(0.1, 0.36, 0.14), WOOD, [0, -0.2, -0.04], [-0.25, 0, 0], undefined, 0.015);
      P(G.box(0.08, len * 0.7, 0.09), WOOD, [0, len * 0.3, -0.02], undefined, undefined, 0.012);
      // Ствол
      const barrel = new THREE.Mesh(G.cyl(cannon ? 0.085 : 0.05, cannon ? 0.075 : 0.05, len, 12), rank >= 1 ? metalMat : toon(0x6a6e76));
      barrel.position.set(0, len * 0.45, 0.06);
      addOutline(barrel, 0.014);
      w.add(barrel);
      // Раструб у мушкетона, дульное кольцо у пушки
      if (tpl === 'blunderbuss') P(G.cone(0.11, 0.18, 12), brass, [0, len * 0.95, 0.06], [Math.PI, 0, 0], undefined, 0.012);
      else P(G.torus(cannon ? 0.09 : 0.055, 0.025, Math.PI * 2, 4, 12), brass, [0, len * 0.92, 0.06], [Math.PI / 2, 0, 0], undefined, false);
      for (const f of [0.2, 0.55]) P(G.torus(cannon ? 0.09 : 0.055, 0.018, Math.PI * 2, 4, 12), brass, [0, len * f, 0.06], [Math.PI / 2, 0, 0], undefined, false);
      // Курок и спуск
      P(G.box(0.03, 0.08, 0.05), 0x4a4a52, [0, 0.04, 0.12], [0.4, 0, 0], undefined, 0.006);
      P(G.torus(0.035, 0.01, Math.PI * 2, 4, 8), 0x4a4a52, [0, -0.02, -0.07], [0, Math.PI / 2, 0], undefined, false);
      if (rifle) {
        // Светящиеся руны вдоль ствола и прицел
        for (let i = 0; i < 3; i++) {
          const r = new THREE.Mesh(G.box(0.06, 0.03, 0.02), toon(rank === 0 ? 0x7ae0ff : glowCol, { emissive: rank === 0 ? 0x4ab8ff : glowCol, emissiveIntensity: 0.9 }));
          r.position.set(0, len * (0.3 + i * 0.2), 0.115);
          w.add(r);
          out.glow.push(r);
        }
        P(G.cyl(0.025, 0.025, 0.2, 8), 0x2a2a30, [0, len * 0.35, 0.14], undefined, undefined, 0.008);
      }
      if (cannon) P(G.sphere(0.07, 8, 6), 0x4a4a52, [0, 0.0, 0.06], undefined, undefined, 0.01);
      if (rank >= 2) w.add(gem(glowCol, 0.04, [0.06, -0.1, -0.02], out));
      if (rank >= 3) w.add(halo(glowCol, 0.2, [0, len * 0.9, 0.06], out, 0.3));
      break;
    }
    case 'crossbow': {
      // Ложа с металлическими накладками
      P(G.box(0.1, 0.08, 0.72), WOOD, [0, 0, 0.15], undefined, undefined, 0.015);
      P(G.box(0.08, 0.12, 0.2), WOOD, [0, -0.07, -0.12], [0.3, 0, 0]);
      P(G.box(0.11, 0.03, 0.3), guard, [0, 0.045, 0.25], undefined, undefined, false);
      const arc = Math.PI * 0.7;
      const limbs = new THREE.Mesh(G.torus(0.36, 0.03, arc, 6, 16), metalMat);
      addOutline(limbs, 0.015);
      limbs.rotation.z = Math.PI / 2 - arc / 2;
      const lg = new THREE.Group();
      lg.add(limbs);
      lg.position.set(0, 0, 0.12);
      lg.rotation.x = Math.PI / 2;
      w.add(lg);
      const span = 0.36 * Math.sin(arc / 2) * 2;
      P(G.cyl(0.008, 0.008, span, 4), 0xf5f0e0, [0, 0, 0.12 + 0.36 * Math.cos(arc / 2)], [0, 0, Math.PI / 2], undefined, false);
      // Заряженный болт
      P(G.cyl(0.015, 0.015, 0.5, 4), 0xc9a36a, [0, 0.06, 0.3], [Math.PI / 2, 0, 0], undefined, false);
      P(G.cone(0.03, 0.08, 4), metal, [0, 0.06, 0.58], [Math.PI / 2, 0, 0], undefined, false);
      // Стремя спереди
      P(G.torus(0.07, 0.015, Math.PI * 2, 4, 12), 0x6a6a6a, [0, 0, 0.53], [0, 0, 0], undefined, false);
      if (rank >= 1) P(G.box(0.03, 0.08, 0.03), guard, [0, 0.09, 0.05]);
      if (rank >= 2) w.add(gem(glowCol, 0.04, [0, 0.07, -0.02], out));
      if (rank >= 3) w.add(halo(glowCol, 0.2, [0, 0, 0.3], out, 0.3));
      break;
    }
  }
  // Метка кончика оружия — откуда сыплются искры
  const box = new THREE.Box3().setFromObject(w);
  const tip = new THREE.Object3D();
  tip.position.set((box.min.x + box.max.x) / 2, box.max.y * 0.92, (box.min.z + box.max.z) / 2);
  w.add(tip);
  w.userData.tip = tip;
  return w;
}

