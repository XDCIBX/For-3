import * as THREE from 'three';
import type { MobKind } from '@game/shared';
import { G, blobShadow, glow, part, toon } from './toon';
import { bake, releaseBaked } from './bake';
import { buildWeapon, makeBowDraw, poseBowDraw, type BowDraw } from './weapons';
import { buildCreature, type Creature } from './dragons';
import { footShape, gait, handShape, headShape, legHeight, limb, torsoShape, type LegPose } from './anatomy';
import { cape, fine, finest, foldedSkirt, furPatch, ribcage, rivetRing, strands } from './details';
import { chainTex, clothTex, hairTex, leatherTex, metalTex, texturize, woodTex } from './textures';
import { lathe, plate } from './forge';

export interface MobAnimInput {
  moving: boolean;
  windup: boolean;
  /** Замах для броска молота. */
  throwWind?: boolean;
  /** Молот в полёте — рука пуста. */
  hammerOut?: boolean;
  stun: boolean;
  frozen: boolean;
  burn: boolean;
  slow: boolean;
  spawning: boolean;
  /** Умение дракона (B, L, S, R) или пусто. */
  skill?: string;
}

interface Rig {
  body: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  handR: THREE.Group;
  handL: THREE.Group;
  kneeL: THREE.Group;
  kneeR: THREE.Group;
  elbowL: THREE.Group;
  elbowR: THREE.Group;
  thigh: number;
  shin: number;
  /** Высота плеч в координатах торса. */
  chestY: number;
}

/**
 * Боевой молот тролля-вождя: окованная рукоять и каменное навершие с железными
 * обручами и шипами. Ось рукояти — +y, хват в начале координат.
 */
export function buildTrollHammer(): THREE.Group {
  const g = new THREE.Group();
  const wood = 0x6a4024;
  const iron = 0x5a6470;
  const stone = 0x8a8478;
  g.add(part(G.cyl(0.055, 0.07, 1.05, 8), wood, { pos: [0, 0.35, 0], outline: 0.02 }));
  for (const y of [0.0, 0.12, 0.24]) g.add(part(G.torus(0.075, 0.018, Math.PI * 2, 4, 10), 0x3a2414, { pos: [0, y, 0], rot: [Math.PI / 2, 0, 0], outline: false }));
  g.add(part(G.sphere(0.09, 8, 6), iron, { pos: [0, -0.2, 0], outline: 0.015 }));
  // Навершие: тяжёлый каменный блок поперёк рукояти
  const headY = 0.95;
  g.add(part(G.box(0.62, 0.36, 0.38), stone, { pos: [0, headY, 0], outline: 0.03 }));
  for (const sx of [-1, 1]) {
    g.add(part(G.box(0.08, 0.42, 0.44), iron, { pos: [sx * 0.33, headY, 0], outline: 0.02 }));
    g.add(part(G.box(0.06, 0.44, 0.46), iron, { pos: [sx * 0.12, headY, 0], outline: false }));
    // Ударная грань с шипами
    for (const [dy, dz] of [
      [0.1, 0.1],
      [-0.1, 0.1],
      [0.1, -0.1],
      [-0.1, -0.1],
    ])
      g.add(part(G.cone(0.05, 0.14, 5), 0xcfd8dc, { pos: [sx * 0.42, headY + dy, dz], rot: [0, 0, -sx * Math.PI / 2], outline: 0.01 }));
  }
  g.add(part(G.cone(0.07, 0.22, 6), iron, { pos: [0, headY + 0.28, 0], outline: 0.015 }));
  // Светящаяся руна на камне
  const rune = new THREE.Mesh(G.torus(0.09, 0.02, Math.PI * 2, 4, 6), toon(0xffb030, { emissive: 0xff7a10, emissiveIntensity: 1 }));
  rune.position.set(0, headY, 0.2);
  g.add(rune);
  return g;
}

function eyePair(head: THREE.Group, x: number, y: number, z: number, r: number, iris: number, pupil = 0x1a1210, angry = false) {
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(G.sphere(r, 12, 8), toon(iris));
    e.position.set(s * x, y, z);
    e.scale.set(1, 0.6, 0.5);
    const p = new THREE.Mesh(G.sphere(r * 0.45, 8, 6), toon(pupil, { rough: 0.15 }));
    p.scale.set(0.6, 1, 1);
    p.position.set(s * x, y - r * 0.1, z + r * 0.4);
    head.add(e, p);
    if (angry) {
      const brow = part(G.box(r * 2.2, r * 0.45, r * 0.5), 0x1a1210, { pos: [s * x, y + r * 1.1, z + r * 0.2], rot: [0, 0, s * 0.45], outline: false });
      head.add(brow);
    }
  }
}

/** Голова поменьше — пропорции ближе к реальным. */
function shrinkHead(r: Rig, headR: number, k: number) {
  r.head.scale.setScalar(k);
  r.head.position.y -= headR * 0.85 * (1 - k);
}

function biped(o: { skin: number; torsoCol: number; legCol: number; bodyR: number; bodyH: number; headR: number; legLen: number; armLen: number; armR: number; hipW: number; bones?: boolean; barefoot?: boolean; stout?: number; noTorso?: boolean }): Rig {
  const body = new THREE.Group();
  const fs = o.armR * 13;
  const ankle = 0.1 * fs;
  const thigh = o.legLen * 0.52;
  const shin = o.legLen - thigh;
  const hipY = o.legLen + ankle;
  const r = o.armR;
  const bulge = o.bones ? 0 : 0.14;
  const legL = new THREE.Group();
  const legR = new THREE.Group();
  const kneeL = new THREE.Group();
  const kneeR = new THREE.Group();
  for (const [leg, knee, s] of [
    [legL, kneeL, -1],
    [legR, kneeR, 1],
  ] as const) {
    leg.position.set(s * o.hipW, hipY, 0);
    leg.add(part(limb(r * (o.bones ? 0.8 : 1.55), r * (o.bones ? 0.7 : 1.1), thigh, bulge), o.legCol, {}));
    knee.position.y = -thigh;
    leg.add(knee);
    knee.add(part(limb(r * (o.bones ? 0.7 : 1.1), r * (o.bones ? 0.6 : 0.8), shin, bulge * 1.4), o.legCol, {}));
    if (o.bones) knee.add(part(G.sphere(r * 1.1, 8, 6), o.legCol, {}));
    knee.add(part(footShape(fs, !o.barefoot), o.barefoot ? o.skin : o.legCol === o.skin ? o.skin : 0x3a2a1c, { pos: [0, -shin, 0] }));
    body.add(leg);
  }
  const torso = new THREE.Group();
  torso.position.y = hipY;
  body.add(torso);
  // Торс: анатомическая форма, подогнанная под размеры старой капсулы
  const sy = (o.bodyH + 2 * o.bodyR) / 0.945;
  const sxz = o.bodyR / 0.29;
  const ty = -0.4 * o.bodyR + 0.16 * sy;
  if (!o.noTorso) torso.add(part(torsoShape(1, 1.1, o.stout ?? 0), o.torsoCol, { pos: [0, ty, 0], scale: [sxz, sy, sxz] }));
  const shoulderY = ty + 0.62 * sy;
  const armL = new THREE.Group();
  const armR = new THREE.Group();
  const handL = new THREE.Group();
  const handR = new THREE.Group();
  const elbowL = new THREE.Group();
  const elbowR = new THREE.Group();
  const upper = o.armLen * 0.5;
  const fore = o.armLen * 0.45;
  for (const [arm, elbow, hand, s] of [
    [armL, elbowL, handL, -1],
    [armR, elbowR, handR, 1],
  ] as const) {
    arm.position.set(s * (o.bodyR * 1.02 + r * 0.5), shoulderY, 0);
    arm.add(part(limb(r * (o.bones ? 0.75 : 1.2), r * (o.bones ? 0.65 : 0.95), upper, bulge * 1.2), o.skin, {}));
    elbow.position.y = -upper;
    arm.add(elbow);
    elbow.add(part(limb(r * (o.bones ? 0.65 : 0.95), r * (o.bones ? 0.55 : 0.75), fore, bulge), o.skin, {}));
    if (o.bones) elbow.add(part(G.sphere(r, 8, 6), o.skin, {}));
    elbow.add(part(handShape(fs * 0.85), o.skin, { pos: [0, -fore, 0], rot: [0, s < 0 ? Math.PI : 0, 0] }));
    hand.position.y = -fore - 0.06 * fs;
    elbow.add(hand);
    arm.rotation.z = s * 0.12;
    torso.add(arm);
  }
  // Шея
  torso.add(part(G.cyl(o.bodyR * 0.32, o.bodyR * 0.42, 0.14, 10), o.skin, { pos: [0, ty + 0.78 * sy, 0] }));
  const head = new THREE.Group();
  head.position.y = ty + 0.785 * sy + o.headR * 0.85;
  torso.add(head);
  for (const g of [body, torso, head, armL, armR, legL, legR, kneeL, kneeR, elbowL, elbowR, handL, handR]) g.userData.anim = true;
  return { body, torso, head, armL, armR, legL, legR, handL, handR, kneeL, kneeR, elbowL, elbowR, thigh, shin, chestY: shoulderY };
}

export class MobModel {
  readonly kind: MobKind;
  readonly root = new THREE.Group();
  private rig: Rig | null = null;
  private slime: THREE.Group | null = null;
  /** Обитатели логова и дракон — свои модели. */
  private creature: Creature | null = null;
  private inner = new THREE.Group();
  /** Скелет-лучник: тетива и стрела; drawK — насколько натянута тетива (0..1). */
  private bowDraw: BowDraw | null = null;
  private drawK = 0;
  private t = Math.random() * 10;
  private walk = 0;
  private atkT = 99;
  private popT = 0;
  private weapon: THREE.Object3D | null = null;
  /** Бросок молота: время с начала замаха, с броска и с поимки. */
  private windT = 99;
  private throwT = 99;
  private catchT = 99;
  private wasOut = false;
  private wasWind = false;
  private poseL: LegPose = { thigh: 0, knee: 0, ankle: 0 };
  private poseR: LegPose = { thigh: 0, knee: 0, ankle: 0 };
  private spawnK = 0;
  dying = 0;
  private stars = new THREE.Group();
  private ice: THREE.Mesh;
  readonly height: number;
  readonly scale: number;

  constructor(kind: MobKind) {
    this.kind = kind;
    this.root.add(this.inner);
    let shadow = 1.2;
    let height = 1.4;
    let scale = 1;
    const cr = buildCreature(kind);
    if (cr) {
      this.creature = cr;
      this.inner.add(cr.group);
      const dims: Record<string, [number, number]> = { ember: [1.4, 1.0], drake: [1.8, 1.4], spitter: [1.8, 1.4], dragon: [4.8, 6.5] };
      [height, shadow] = dims[kind] ?? [1.5, 1.2];
    }
    switch (kind) {
      case 'slime': {
        const hue = [0x5a8a3a, 0x3a7290, 0x7a4a6a][Math.floor(Math.random() * 3)];
        const g = new THREE.Group();
        // Студенистая масса: блестящая, полупрозрачная, с ядром и обломками внутри
        const blob = new THREE.Mesh(G.sphere(0.55, 24, 16), toon(hue, { transparent: true, opacity: 0.78, rough: 0.12 }));
        blob.scale.set(1, 0.8, 1);
        blob.position.y = 0.44;
        const core = new THREE.Mesh(G.sphere(0.25, 12, 8), toon(new THREE.Color(hue).multiplyScalar(0.45).getHex(), { rough: 0.4 }));
        core.position.y = 0.36;
        g.add(blob, core);
        for (let i = 0; i < 4; i++) {
          const a = i * 1.7;
          const bit = new THREE.Mesh(i % 2 ? G.box(0.1, 0.04, 0.04) : G.ico(0.05, 0), toon(i % 2 ? 0xcfc4a8 : 0x5a5248));
          bit.position.set(Math.cos(a) * 0.28, 0.3 + (i % 3) * 0.12, Math.sin(a) * 0.28);
          bit.rotation.set(a, a * 0.7, 0);
          g.add(bit);
        }
        // Злые глаза внутри студня, пузырьки, натёки у основания
        for (const sd of [-1, 1]) {
          // Глаза на поверхности студня (внутри полупрозрачного тела они читались как пятна)
          g.add(part(G.sphere(0.08, 10, 8), 0xf4f0e0, { pos: [sd * 0.15, 0.6, 0.47], scale: [1, 1.1, 0.6], rough: 0.2, outline: false }));
          g.add(part(G.sphere(0.038, 8, 6), 0x1a1210, { pos: [sd * 0.14, 0.59, 0.52], rough: 0.1, outline: false }));
          g.add(part(G.box(0.11, 0.024, 0.03), new THREE.Color(hue).multiplyScalar(0.4).getHex(), { pos: [sd * 0.15, 0.7, 0.5], rot: [0, 0, sd * 0.45], outline: false }));
        }
        if (fine()) {
          for (let i = 0; i < 6; i++) {
            const a = i * 2.1;
            g.add(part(G.sphere(0.03 + (i % 3) * 0.015, 6, 5), new THREE.Color(hue).lerp(new THREE.Color(0xffffff), 0.45).getHex(), { pos: [Math.cos(a) * 0.3, 0.3 + (i % 3) * 0.13, Math.sin(a) * 0.3], rough: 0.1, outline: false }));
          }
          for (let i = 0; i < 7; i++) {
            const a = (i / 7) * Math.PI * 2 + 0.3;
            g.add(part(G.sphere(0.09, 8, 6), hue, { pos: [Math.cos(a) * 0.5, 0.05, Math.sin(a) * 0.5], scale: [1, 0.45, 1], rough: 0.15, outline: false }));
          }
        }
        g.userData.anim = true;
        this.slime = g;
        this.inner.add(g);
        shadow = 1.3;
        height = 1.0;
        break;
      }
      case 'goblin': {
        const skin = 0x7a8f4a;
        const r = biped({ skin, torsoCol: 0x6a4a30, legCol: skin, bodyR: 0.19, bodyH: 0.24, headR: 0.3, legLen: 0.5, armLen: 0.52, armR: 0.055, hipW: 0.09, barefoot: true });
        // Рваные штаны до колен
        for (const leg of [r.legL, r.legR]) leg.add(part(limb(0.09, 0.075, 0.24, 0.05), 0x4d3a27, {}));
        shrinkHead(r, 0.3, 0.72);
        const head = part(headShape('human'), skin, { rough: 0.6 });
        head.scale.set(0.8, 0.72, 0.75);
        r.head.add(head);
        for (const s of [-1, 1]) {
          const ear = part(G.cone(0.1, 0.45, 8), skin, { pos: [s * 0.4, 0.05, -0.02], rot: [0, 0, -s * 1.25], outline: 0.02 });
          r.head.add(ear);
        }
        r.head.add(part(G.cone(0.07, 0.25, 8), 0x6fae3d, { pos: [0, -0.04, 0.33], rot: [Math.PI / 2 - 0.3, 0, 0], outline: 0.015 }));
        eyePair(r.head, 0.12, 0.08, 0.24, 0.07, 0xffe14a, 0xc0201a, true);
        const mouth = part(G.box(0.18, 0.03, 0.03), 0x2a1810, { pos: [0, -0.15, 0.27], outline: false });
        r.head.add(mouth);
        for (const s of [-1, 1]) r.head.add(part(G.cone(0.025, 0.07, 4), 0xffffff, { pos: [s * 0.06, -0.12, 0.28], outline: false }));
        if (fine()) {
          // Набедренная тряпка спереди и сзади, верёвочный пояс, серьга, бородавка, клочья волос
          for (const [z, ry] of [[0.16, Math.PI], [-0.16, 0]] as const) r.torso.add(part(cape(0.2, 0.26, { wrap: -0.03, folds: 2, amp: 0.012, flare: 0.3, lift: -0.03 }), 0x5a4430, { pos: [0, 0.02, z], rot: [0, ry, 0], outline: 0.01 }));
          r.torso.add(part(G.torus(0.2, 0.018, Math.PI * 2, 4, 16), 0x8a7048, { pos: [0, 0.03, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 0.8, 1], outline: false }));
          r.torso.add(part(G.box(0.09, 0.08, 0.05), 0x6a4428, { pos: [0.15, -0.02, 0.1], rot: [0, 0.6, 0], outline: 0.008 }));
          r.head.add(part(G.torus(0.035, 0.008, Math.PI * 2, 4, 10), 0xc8a24a, { pos: [-0.5, -0.02, -0.02], rot: [0, 0.3, 0], outline: false }));
          r.head.add(part(G.sphere(0.022, 5, 4), 0x5a7a30, { pos: [0.03, 0.02, 0.45], outline: false }));
          r.head.add(part(strands('gobHair', 7, 0.16, 0.025, 0.14, { fan: 0.5, depth: 0.2, curl: -0.4 }), 0x2a2214, { pos: [0, 0.2, -0.06], rot: [-1.2, 0, 0], outline: false }));
          for (const el of [r.elbowL, r.elbowR]) el.add(part(G.torus(0.05, 0.012, Math.PI * 2, 4, 10), 0xc9b48a, { pos: [0, -0.12, 0], rot: [Math.PI / 2, 0, 0], outline: false }));
          const cy = r.chestY;
          // Распахнутая кожаная жилетка с заклёпками, заплата на рубахе
          for (const sd of [-1, 1]) {
            r.torso.add(part(G.box(0.13, 0.3, 0.03), 0x5a3a20, { pos: [sd * 0.12, cy - 0.17, 0.17], rot: [0.12, sd * 0.4, 0], outline: false, map: leatherTex() }));
            for (let k = 0; k < 3; k++) r.torso.add(part(G.sphere(0.01, 4, 3), 0xb8c2cc, { pos: [sd * 0.065, cy - 0.06 - k * 0.09, 0.2], outline: false }));
          }
          r.torso.add(part(G.box(0.07, 0.06, 0.012), 0x8a6a3a, { pos: [0.04, cy - 0.3, 0.19], rot: [0, 0, 0.2], outline: false }));
          // Кинжал в ножнах на поясе
          r.torso.add(part(G.box(0.035, 0.16, 0.025), 0x3a2414, { pos: [-0.17, -0.04, 0.12], rot: [0, 0.4, 0.25], outline: false }));
          r.torso.add(part(G.cyl(0.012, 0.012, 0.07, 5), 0x6a4428, { pos: [-0.19, 0.07, 0.12], rot: [0, 0, 0.25], outline: false }));
          // Обмотки на голенях
          // Плотные тряпичные обмотки на голенях
          for (const kn of [r.kneeL, r.kneeR]) for (let k = 0; k < 4; k++) kn.add(part(G.torus(0.058 - k * 0.003, 0.02, Math.PI * 2, 5, 12), 0x8a7a5a, { pos: [0, -0.07 - k * 0.04, 0], rot: [Math.PI / 2, 0, (k % 2 ? 0.25 : -0.25)], outline: false, map: clothTex() }));
          // Нос крючком, бородавки, кривые зубы
          r.head.add(part(G.sphere(0.045, 8, 6), 0x6a8a3a, { pos: [0, -0.12, 0.44], outline: false }));
          for (const [x, y] of [[0.17, 0.08], [-0.2, -0.05]]) r.head.add(part(G.sphere(0.018, 5, 4), 0x5a7a30, { pos: [x, y, 0.3], outline: false }));
          for (let k = 0; k < 4; k++) r.head.add(part(G.cone(0.014, 0.04, 4), 0xf0e8c8, { pos: [(k - 1.5) * 0.035, -0.16, 0.28], rot: [Math.PI + (k % 2 ? 0.2 : -0.2), 0, 0], outline: false }));
        }
        // Дубина
        const club = new THREE.Group();
        club.add(part(G.cyl(0.03, 0.04, 0.4, 6), 0x7a4a26, { pos: [0, 0.15, 0], outline: 0.015 }));
        club.add(part(G.cyl(0.1, 0.06, 0.32, 8), 0x8a5a2b, { pos: [0, 0.48, 0], outline: 0.02 }));
        for (let i = 0; i < 3; i++) club.add(part(G.cone(0.03, 0.08, 4), 0xcfd8dc, { pos: [Math.cos(i * 2) * 0.1, 0.5 + i * 0.07, Math.sin(i * 2) * 0.1], rot: [0, 0, -Math.cos(i * 2) * 1.5], outline: false }));
        club.rotation.x = Math.PI / 2 - 0.4;
        r.handR.add(club);
        this.rig = r;
        this.inner.add(r.body);
        height = 1.5;
        break;
      }
      case 'skeleton': {
        // Скелет-лучник: голые кости (позвоночник, грудная клетка, таз), ржавый шлем с полями,
        // истлевшие лоскуты, колчан за спиной и ремень через грудь
        const bone = 0xd8ceb4;
        const boneDk = 0xb4a888;
        const rag = 0x3a3228;
        const rust = 0x6a5a4c;
        const strap = 0x4a3020;
        const r = biped({ skin: bone, torsoCol: bone, legCol: bone, bodyR: 0.16, bodyH: 0.32, headR: 0.28, legLen: 0.64, armLen: 0.58, armR: 0.045, hipW: 0.1, bones: true, noTorso: true });
        shrinkHead(r, 0.28, 0.7);
        const T = r.torso;
        const cy = r.chestY;
        // Грудная клетка с грудиной и грудными позвонками
        T.add(part(ribcage(0.15, 0.27, fine() ? 6 : 4), bone, { pos: [0, cy - 0.15, 0.01], outline: false }));
        // Поясничные позвонки и диски
        for (let i = 0; i < 4; i++) {
          T.add(part(G.cyl(0.026, 0.028, 0.045, 7), bone, { pos: [0, 0.03 + i * 0.055, -0.07], outline: false }));
          if (fine()) T.add(part(G.cone(0.016, 0.05, 4), boneDk, { pos: [0, 0.035 + i * 0.055, -0.1], rot: [-1.9, 0, 0], outline: false }));
        }
        // Таз: подвздошные крылья и лобковая дуга
        for (const sd of [-1, 1]) T.add(part(G.sphere(0.085, 10, 8), bone, { pos: [sd * 0.08, 0.02, -0.02], rot: [0, 0, sd * 0.5], scale: [1, 0.75, 0.38], outline: false }));
        T.add(part(G.torus(0.08, 0.022, Math.PI, 5, 12), bone, { pos: [0, -0.02, 0.03], rot: [Math.PI / 2 + 0.3, 0, Math.PI], outline: false }));
        // Ключицы, лопатки, плечевые суставы
        for (const sd of [-1, 1]) {
          T.add(part(G.cyl(0.014, 0.017, 0.19, 5), bone, { pos: [sd * 0.095, cy + 0.01, 0.07], rot: [0.25, 0, sd * 1.4], outline: false }));
          T.add(part(G.sphere(0.075, 8, 6), boneDk, { pos: [sd * 0.09, cy - 0.06, -0.1], scale: [0.9, 1.1, 0.25], rot: [0, sd * 0.4, 0], outline: false }));
          T.add(part(G.sphere(0.036, 8, 6), bone, { pos: [sd * 0.18, cy, 0], outline: false }));
        }
        // Шейные позвонки
        for (let i = 0; i < 3; i++) T.add(part(G.cyl(0.022, 0.024, 0.03, 6), bone, { pos: [0, cy + 0.07 + i * 0.04, -0.01], outline: false }));
        // Ремень колчана через грудь с пряжкой и истлевшая набедренная повязка
        T.add(part(G.box(0.045, 0.5, 0.016), strap, { pos: [0, cy - 0.17, 0.155], rot: [0.08, 0, -0.62], outline: false, map: leatherTex() }));
        T.add(part(G.box(0.05, 0.045, 0.02), 0x9a8a5a, { pos: [-0.05, cy - 0.2, 0.17], rot: [0, 0, -0.62], outline: false, metal: 0.8, rough: 0.4 }));
        T.add(part(G.torus(0.105, 0.016, Math.PI * 2, 4, 16), strap, { pos: [0, 0.07, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 0.8, 1], outline: false }));
        for (const [z, ry] of [[0.08, Math.PI], [-0.08, 0]] as const) T.add(part(cape(0.17, 0.24, { wrap: -0.02, folds: 2, amp: 0.015, flare: 0.35, lift: -0.02 }), rag, { pos: [0, 0.08, z], rot: [0, ry, 0], outline: false, map: clothTex() }));
        if (fine()) {
          // Клочья истлевшего плаща на одном плече
          T.add(part(cape(0.26, 0.42, { wrap: 0.05, folds: 3, amp: 0.025, flare: 0.4, lift: 0.06 }), rag, { pos: [-0.04, cy + 0.04, -0.13], rot: [0.06, 0, 0.12], outline: false, map: clothTex() }));
        }
        // Колчан за спиной: кожа, обручи, стрелы с красным оперением
        const quiver = new THREE.Group();
        quiver.add(part(G.cyl(0.065, 0.055, 0.42, 10), strap, { outline: false, map: leatherTex() }));
        for (const y of [-0.17, 0.17]) quiver.add(part(G.torus(0.066, 0.01, Math.PI * 2, 4, 12), 0x8a7a5a, { pos: [0, y, 0], rot: [Math.PI / 2, 0, 0], outline: false, metal: 0.7 }));
        const na = fine() ? 5 : 3;
        for (let i = 0; i < na; i++) {
          const a = (i / na) * Math.PI * 2;
          const ar = new THREE.Group();
          ar.add(part(G.cyl(0.006, 0.006, 0.2, 4), 0xb89a6a, { outline: false }));
          ar.add(part(G.box(0.004, 0.07, 0.03), i % 2 ? 0xc03a2a : 0xe8dcc0, { pos: [0, 0.07, 0], outline: false }));
          ar.position.set(Math.cos(a) * 0.03, 0.27, Math.sin(a) * 0.03);
          ar.rotation.set(Math.sin(a) * 0.12, 0, Math.cos(a) * 0.12);
          quiver.add(ar);
        }
        quiver.position.set(0.06, cy - 0.12, -0.17);
        quiver.rotation.set(-0.2, 0, -0.38);
        T.add(quiver);
        // Череп: глазницы с огоньками, носовая впадина, скулы, челюсть с зубами
        const skull = part(headShape('skull'), bone, { scale: 0.7 });
        r.head.add(skull);
        r.head.add(part(G.box(0.24, 0.07, 0.19), bone, { pos: [0, -0.21, 0.07], outline: false }));
        r.head.add(part(G.cone(0.035, 0.07, 3), 0x1a1210, { pos: [0, -0.06, 0.27], rot: [0.3, 0, Math.PI], outline: false }));
        for (const sd of [-1, 1]) {
          r.head.add(part(G.sphere(0.05, 8, 6), bone, { pos: [sd * 0.15, -0.07, 0.17], scale: [1, 0.7, 0.8], outline: false }));
          const sock = new THREE.Mesh(G.sphere(0.075, 10, 8), toon(0x1a1210));
          sock.position.set(sd * 0.1, 0.0, 0.23);
          sock.scale.set(1, 1.1, 0.5);
          const glowEye = new THREE.Mesh(G.sphere(0.03, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff4a3a }));
          glowEye.position.set(sd * 0.1, 0.0, 0.26);
          r.head.add(sock, glowEye);
        }
        const nt = fine() ? 7 : 4;
        for (let i = 0; i < nt; i++) {
          const x = (i / (nt - 1) - 0.5) * 0.2;
          r.head.add(part(G.box(0.024, 0.035, 0.02), 0xf0e8d0, { pos: [x, -0.15, 0.22 - Math.abs(x) * 0.5], outline: false }));
          r.head.add(part(G.box(0.022, 0.03, 0.02), 0xe8e0c8, { pos: [x * 0.9, -0.185, 0.2 - Math.abs(x) * 0.5], outline: false }));
        }
        // Ржавый железный шлем-шапель: купол, широкие опущенные поля, обод с заклёпками
        const M = { metal: 0.6, rough: 0.55, map: metalTex() };
        r.head.add(part(lathe('skelhelm', [[0.33, 0], [0.33, 0.06], [0.3, 0.16], [0.22, 0.26], [0.1, 0.31], [0, 0.32]], 18), rust, { pos: [0, 0.07, -0.01], outline: false, ...M }));
        r.head.add(part(lathe('skelbrim', [[0.31, 0.02], [0.44, -0.04], [0.47, -0.07], [0.31, 0.0]], 20), rust, { pos: [0, 0.07, -0.01], outline: false, side: THREE.DoubleSide, ...M }));
        r.head.add(part(G.torus(0.33, 0.018, Math.PI * 2, 4, 22), 0x4a4038, { pos: [0, 0.1, -0.01], rot: [Math.PI / 2, 0, 0], outline: false, metal: 0.7, rough: 0.5 }));
        if (fine()) {
          r.head.add(part(rivetRing(0.335, 10, 0.016), 0x8a7a68, { pos: [0, 0.1, -0.01], outline: false }));
          r.head.add(part(G.cyl(0.012, 0.02, 0.06, 5), rust, { pos: [0, 0.4, -0.01], outline: false, ...M }));
        }
        // Лук — тот же, что у героя-лучника: держится за рукоять посередине, стоит вертикально,
        // тетива натягивается к правой руке (poseBowDraw)
        const bow = buildWeapon('bow', 'common', { parts: [], glow: [], spin: [] });
        bow.rotation.set(Math.PI / 2, 0, 0);
        bow.scale.setScalar(1.05);
        r.handL.add(bow);
        this.bowDraw = makeBowDraw(bow);
        this.rig = r;
        this.inner.add(r.body);
        height = 1.8;
        break;
      }
      case 'orc': {
        // Орк-громила: широкоплечий воин без пуза — ремни крест-накрест, тяжёлый стальной наплечник,
        // кольчужная юбка, клыки, пучок волос на макушке, боевая раскраска, большой топор-тесак
        const skin = 0x5f7438;
        const skinLt = 0x6e8646;
        const leather = 0x4a3020;
        const steel = 0x7d8894;
        const M = { metal: 0.75, rough: 0.38, map: metalTex() };
        const L = { map: leatherTex() };
        const r = biped({ skin, torsoCol: skin, legCol: 0x3a2e24, bodyR: 0.32, bodyH: 0.44, headR: 0.3, legLen: 0.6, armLen: 0.72, armR: 0.115, hipW: 0.15, stout: 0.1 });
        const T = r.torso;
        const cy = r.chestY;
        // Грудные мышцы и пресс
        // Грудные мышцы — того же цвета, слегка выступают из торса
        for (const sd of [-1, 1]) T.add(part(G.sphere(0.17, 12, 8), skin, { pos: [sd * 0.11, cy - 0.18, 0.15], scale: [1, 0.62, 0.42], outline: false }));
        void skinLt;
        // Ремни крест-накрест с кольцом и заклёпками
        for (const a of [-0.55, 0.55]) {
          T.add(part(G.box(0.07, 0.78, 0.025), leather, { pos: [0, cy - 0.27, 0.27], rot: [0.1, 0, a], outline: false, ...L }));
          T.add(part(G.box(0.07, 0.6, 0.025), leather, { pos: [0, cy - 0.2, -0.27], rot: [-0.1, 0, -a], outline: false, ...L }));
          if (fine()) for (let i = 0; i < 4; i++) T.add(part(G.sphere(0.013, 5, 4), 0xb8c2cc, { pos: [-Math.sin(a) * (i - 1.5) * 0.15, cy - 0.27 + Math.cos(a) * (i - 1.5) * 0.15, 0.295], outline: false, metal: 0.9 }));
        }
        T.add(part(G.torus(0.045, 0.014, Math.PI * 2, 5, 12), steel, { pos: [0, cy - 0.27, 0.3], outline: false, ...M }));
        // Левое плечо: три стальные пластины внахлёст с шипами; правое — кожаная подушка с мехом
        for (let i = 0; i < 3; i++) {
          T.add(part(G.halfSphere(0.21 - i * 0.025), steel, { pos: [-0.4 - i * 0.03, cy + 0.02 - i * 0.075, 0], rot: [0, 0, 0.45 + i * 0.12], scale: [1.15, 0.7, 1.05], outline: false, ...M }));
          if (fine()) T.add(part(rivetRing(0.205 - i * 0.025, 7, 0.013, Math.PI * 1.1, -Math.PI / 2), 0xc7ced6, { pos: [-0.4 - i * 0.03, cy + 0.02 - i * 0.075, 0], rot: [0, 0, 0.45 + i * 0.12], scale: [1.15, 1, 1.05], outline: false }));
        }
        for (const z of [-0.08, 0, 0.08]) T.add(part(G.cone(0.035, 0.17, 6), 0xd8dee4, { pos: [-0.48, cy + 0.17, z], rot: [0, 0, 0.5], outline: false, metal: 0.9, rough: 0.3 }));
        T.add(part(G.halfSphere(0.17), leather, { pos: [0.41, cy, 0], rot: [0, 0, -0.45], scale: [1.1, 0.6, 1], outline: false, ...L }));
        if (fine()) T.add(part(finest() ? furPatch('orcFur', 30, 0.16, 0.1, 0.035, { yMin: 0.1, yMax: 0.95, down: 1.2 }) : strands('orcFur2', 7, 0.16, 0.05, 0.2, { fan: 0.5, depth: 0.3 }), 0x4a3a2a, { pos: [0.42, cy + 0.06, 0], outline: false }));
        // Пояс с пряжкой-черепом, кольчужная юбка, набедренная повязка спереди и сзади
        T.add(part(G.torus(0.33, 0.045, Math.PI * 2, 5, 22), leather, { pos: [0, 0.12, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 0.85, 1], outline: false, ...L }));
        if (fine()) T.add(part(rivetRing(0.34, 14, 0.015), 0xb8c2cc, { pos: [0, 0.12, 0], scale: [1, 1, 0.85], outline: false }));
        T.add(part(G.sphere(0.07, 10, 8), 0xe8e0cc, { pos: [0, 0.12, 0.3], scale: [1, 1.1, 0.7], outline: false }));
        for (const sd of [-1, 1]) T.add(part(G.sphere(0.018, 5, 4), 0x1a1210, { pos: [sd * 0.025, 0.135, 0.345], outline: false }));
        T.add(part(foldedSkirt(0.31, 0.4, 0.32, 10, 0.02), 0x8a929a, { pos: [0, -0.03, 0], outline: false, map: chainTex(), metal: 0.8, rough: 0.45 }));
        for (const [z, ry] of [[0.3, Math.PI], [-0.3, 0]] as const) T.add(part(cape(0.26, 0.4, { wrap: -0.04, folds: 2, amp: 0.018, flare: 0.25, lift: -0.04 }), 0x5a2018, { pos: [0, 0.1, z], rot: [0, ry, 0], outline: false, map: clothTex() }));
        // Наручи с шипами и наколенники
        for (const el of [r.elbowL, r.elbowR]) {
          el.add(part(G.cyl(0.115, 0.1, 0.22, 10), leather, { pos: [0, -0.2, 0], outline: false, ...L }));
          for (const y of [-0.12, -0.28]) el.add(part(G.torus(0.113, 0.012, Math.PI * 2, 4, 12), steel, { pos: [0, y, 0], rot: [Math.PI / 2, 0, 0], outline: false, metal: 0.85 }));
          if (fine()) for (const y of [-0.16, -0.24]) el.add(part(G.cone(0.025, 0.09, 5), 0xd8dee4, { pos: [0, y, -0.12], rot: [-Math.PI / 2, 0, 0], outline: false, metal: 0.9 }));
        }
        for (const kn of [r.kneeL, r.kneeR]) kn.add(part(G.halfSphere(0.085), steel, { pos: [0, -0.02, 0.07], rot: [Math.PI / 2 - 0.2, 0, 0], scale: [1, 1, 0.7], outline: false, ...M }));
        // Голова: тяжёлая челюсть с нижними клыками, надбровье, острые уши с серьгами, кольцо в носу
        const head = part(headShape('brute'), skin, { rough: 0.65 });
        head.scale.set(0.82, 0.72, 0.78);
        r.head.add(head);
        r.head.position.z = 0.08;
        shrinkHead(r, 0.3, 0.8);
        r.head.add(part(G.box(0.38, 0.15, 0.24), skin, { pos: [0, -0.17, 0.12], outline: false }));
        for (const sd of [-1, 1]) r.head.add(part(G.cone(0.05, 0.22, 7), 0xfff2d8, { pos: [sd * 0.13, -0.08, 0.27], rot: [-0.25, 0, -sd * 0.22], outline: false }));
        // Тяжёлое надбровье — валик над глазами
        r.head.add(part(G.sphere(0.17, 12, 8), 0x56692f, { pos: [0, 0.11, 0.24], scale: [1.05, 0.28, 0.4], outline: false }));
        eyePair(r.head, 0.11, 0.07, 0.25, 0.055, 0xff6a2a, 0x1a1210, true);
        r.head.add(part(G.sphere(0.075, 8, 6), 0x52662e, { pos: [0, -0.01, 0.31], scale: [1.35, 0.85, 0.9], outline: false }));
        r.head.add(part(G.torus(0.03, 0.008, Math.PI * 2, 4, 10), 0xd8a441, { pos: [0, -0.06, 0.34], outline: false, metal: 0.9 }));
        for (const sd of [-1, 1]) {
          r.head.add(part(G.cone(0.07, 0.26, 6), skin, { pos: [sd * 0.33, 0.04, -0.04], rot: [0.2, 0, -sd * 1.25], scale: [1, 1, 0.45], outline: false }));
          if (fine()) for (const k of [0, 1]) r.head.add(part(G.torus(0.025, 0.006, Math.PI * 2, 4, 10), 0xd8a441, { pos: [sd * (0.38 + k * 0.05), 0.02 + k * 0.01, -0.04], rot: [0, Math.PI / 2, 0], outline: false, metal: 0.9 }));
        }
        // Боевая раскраска, шрам, пучок волос на бритой голове
        for (const sd of [-1, 1]) for (let k = 0; k < 2; k++) r.head.add(part(G.box(0.1, 0.018, 0.02), 0x9a1a12, { pos: [sd * 0.17, -0.02 - k * 0.04, 0.27 - k * 0.01], rot: [0, sd * 0.5, sd * 0.25], outline: false }));
        if (fine()) r.head.add(part(G.box(0.012, 0.16, 0.012), 0x9a6a5a, { pos: [0.09, 0.02, 0.31], rot: [0.2, 0, 0.35], outline: false }));
        r.head.add(part(G.sphere(0.075, 10, 8), 0x1a1612, { pos: [0, 0.3, -0.08], scale: [1, 0.8, 1], outline: false }));
        r.head.add(part(G.torus(0.04, 0.014, Math.PI * 2, 4, 10), 0xd8a441, { pos: [0, 0.34, -0.12], rot: [0.6, 0, 0], outline: false, metal: 0.9 }));
        if (fine()) r.head.add(part(strands('orcTail', 9, 0.42, 0.05, 0.08, { fan: 0.08, depth: 0.2, curl: -0.4, jitter: 0.1 }), 0x1a1612, { pos: [0, 0.32, -0.16], rot: [-0.9, 0, 0], outline: false }));
        // Большой топор-тесак: рукоять с обмоткой, широкое лезвие с выщербинами, шип на обухе
        const axe = new THREE.Group();
        axe.add(part(G.cyl(0.035, 0.045, 1.15, 8), 0x5a3a20, { pos: [0, 0.38, 0], outline: false, map: woodTex() }));
        for (const y of [-0.05, 0.05, 0.15]) axe.add(part(G.torus(0.046, 0.012, Math.PI * 2, 4, 10), leather, { pos: [0, y, 0], rot: [Math.PI / 2, 0, 0], outline: false }));
        axe.add(part(plate('orcaxe', [[0.03, 0.62], [0.18, 0.6], [0.36, 0.52], [0.46, 0.66], [0.47, 0.84], [0.42, 1.0], [0.3, 1.06], [0.16, 0.98], [0.03, 0.94]], 0.035, 0.012), 0xb8c2cc, { outline: false, metal: 0.9, rough: 0.3, map: metalTex() }));
        axe.add(part(G.box(0.08, 0.36, 0.06), 0x4a4a52, { pos: [0, 0.78, 0], outline: false, metal: 0.8 }));
        axe.add(part(G.cone(0.04, 0.2, 6), 0xb8c2cc, { pos: [-0.14, 0.8, 0], rot: [0, 0, Math.PI / 2], outline: false, metal: 0.9 }));
        axe.add(part(G.sphere(0.05, 8, 6), 0x4a4a52, { pos: [0, -0.2, 0], outline: false, metal: 0.8 }));
        axe.rotation.x = Math.PI / 2 - 0.4;
        r.handR.add(axe);
        scale = 1.3;
        r.body.scale.setScalar(scale);
        this.rig = r;
        this.inner.add(r.body);
        shadow = 2.0;
        height = 2.6;
        break;
      }
      case 'troll': {
        const troll = kind === 'troll';
        const skin = troll ? 0x7d8a86 : 0x5f7438;
        const r = biped({
          skin,
          torsoCol: troll ? 0x7d8a86 : 0x4a3a2c,
          legCol: troll ? 0x6a4a30 : 0x4a3a2c,
          bodyR: 0.38,
          bodyH: 0.4,
          headR: 0.3,
          legLen: 0.56,
          armLen: 0.68,
          armR: 0.12,
          hipW: 0.17,
          stout: 0.6,
        });
        // Пузо
        r.torso.add(part(G.sphere(0.36, 16, 12), troll ? 0x8e9a92 : 0x6a7f40, { pos: [0, 0.4, 0.12], scale: [1, 0.9, 0.8], outline: 0.03 }));
        const head = part(headShape('brute'), skin, { rough: 0.65 });
        head.scale.set(0.82, 0.72, 0.78);
        r.head.add(head);
        r.head.position.z = 0.1;
        shrinkHead(r, 0.3, troll ? 0.74 : 0.78);
        r.head.add(part(G.box(0.4, 0.16, 0.24), skin, { pos: [0, -0.16, 0.12], outline: 0.025 }));
        for (const s of [-1, 1]) r.head.add(part(G.cone(0.045, 0.16, 6), 0xfff6e0, { pos: [s * 0.13, -0.04, 0.26], outline: 0.012 }));
        eyePair(r.head, 0.11, 0.08, 0.23, 0.06, troll ? 0xffe14a : 0xff7a3a, 0x1a1210, true);
        r.head.add(part(G.sphere(0.08, 8, 6), troll ? 0x6f7c78 : 0x52662e, { pos: [0, 0.0, 0.3], scale: [1.2, 1, 1], outline: 0.015 }));
        if (troll) {
          for (const s of [-1, 1]) r.head.add(part(G.cone(0.08, 0.35, 8), 0xfff2d6, { pos: [s * 0.22, 0.28, -0.02], rot: [-0.3, 0, -s * 0.5], outline: 0.02 }));
          // Корона из костей
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            r.head.add(part(G.cone(0.04, 0.12, 5), 0xffd54a, { pos: [Math.cos(a) * 0.18, 0.3, Math.sin(a) * 0.18], outline: false }));
          }
          // Ожерелье из клыков
          for (let i = -3; i <= 3; i++) r.torso.add(part(G.cone(0.035, 0.12, 5), 0xfff6e0, { pos: [i * 0.08, 0.72 - Math.abs(i) * 0.02, 0.3 - Math.abs(i) * 0.03], rot: [Math.PI, 0, 0], outline: false }));
          // Набедренная повязка
          r.torso.add(part(G.cyl(0.4, 0.44, 0.22, 14), 0x7a4a26, { pos: [0, 0.03, 0], outline: 0.02 }));
          if (fine()) {
            // Свисающие лоскуты шкуры, верёвка, когти, бородавки на коже, клочья шерсти на плечах и спине
            for (const a of [0, Math.PI, 0.9, -0.9]) r.torso.add(part(cape(0.3, 0.34, { wrap: -0.05, folds: 2, amp: 0.02, flare: 0.3, lift: -0.03 }), 0x6a4024, { pos: [Math.sin(a) * 0.43, 0.06, Math.cos(a) * 0.43], rot: [0, a + Math.PI, 0], outline: 0.01 }));
            r.torso.add(part(G.torus(0.43, 0.03, Math.PI * 2, 4, 22), 0xa08858, { pos: [0, 0.12, 0], rot: [Math.PI / 2, 0, 0], outline: false }));
            for (const el of [r.elbowL, r.elbowR]) for (let i = 0; i < 3; i++) el.add(part(G.cone(0.025, 0.09, 5), 0x2a2420, { pos: [(i - 1) * 0.05, -0.68 * 0.45 - 0.14, 0.07], rot: [Math.PI * 0.85, 0, 0], outline: false }));
            for (const [x, y, z] of [[0.2, 0.55, 0.28], [-0.25, 0.35, 0.3], [0.05, 0.62, 0.32], [-0.1, 0.2, 0.36]]) r.torso.add(part(G.sphere(0.03, 6, 4), 0x6f7c78, { pos: [x, y, z], outline: false }));
            if (finest()) {
              for (const x of [-0.42, 0.42]) r.torso.add(part(furPatch('trollShoulder', 36, 0.2, 0.12, 0.04, { yMin: 0, yMax: 0.95, down: 1.3 }), 0x5a4a3a, { pos: [x, 0.72, -0.02], outline: false }));
            }
            r.head.add(part(strands('trollBeard', 9, 0.22, 0.04, 0.2, { fan: 0.3, depth: 0.3, curl: 0.2 }), 0x5a4a3a, { pos: [0, -0.22, 0.2], rot: [0.3, 0, 0], outline: false }));
            const cy = r.chestY;
            const boneC = 0xe8dcc0;
            // Длинные обвисшие уши, лохматые волосы, нос крючком с бородавками
            for (const sd of [-1, 1]) r.head.add(part(G.cone(0.075, 0.34, 7), skin, { pos: [sd * 0.31, 0.0, -0.05], rot: [0.35, 0, -sd * 1.05], scale: [1, 1, 0.42], outline: false }));
            r.head.add(part(strands('trollHair', 12, 0.36, 0.065, 0.42, { fan: 0.25, depth: 0.3, curl: -0.3, jitter: 0.2 }), 0x3a3228, { pos: [0, 0.26, -0.14], rot: [-1.15, 0, 0], outline: false }));
            r.head.add(part(G.sphere(0.055, 8, 6), 0x6f7c78, { pos: [0, -0.07, 0.36], scale: [1, 0.9, 1], outline: false }));
            for (const [x, y, z] of [[0.06, 0.02, 0.36], [-0.17, 0.1, 0.27], [0.2, -0.12, 0.25]]) r.head.add(part(G.sphere(0.02, 5, 4), 0x5f6c68, { pos: [x, y, z], outline: false }));
            // Череп на левом плече вместо наплечника, привязан верёвкой
            const sk = new THREE.Group();
            sk.add(part(G.sphere(0.13, 12, 10), boneC, { scale: [1, 0.95, 1.05], outline: false }));
            sk.add(part(G.box(0.15, 0.06, 0.12), boneC, { pos: [0, -0.11, 0.04], outline: false }));
            for (const sd of [-1, 1]) sk.add(part(G.sphere(0.035, 6, 5), 0x1a1210, { pos: [sd * 0.05, 0.0, 0.11], scale: [1, 1.1, 0.5], outline: false }));
            for (let i = 0; i < 4; i++) sk.add(part(G.box(0.022, 0.03, 0.02), 0xf4ecd8, { pos: [(i - 1.5) * 0.03, -0.08, 0.11], outline: false }));
            sk.position.set(-0.44, cy + 0.06, 0.02);
            sk.rotation.set(0, -0.6, 0.3);
            r.torso.add(sk);
            r.torso.add(part(G.torus(0.16, 0.018, Math.PI * 2, 4, 16), 0xa08858, { pos: [-0.38, cy - 0.02, 0], rot: [0, 0, 0.9], outline: false }));
            // Железные браслеты с шипами на плечах, верёвки на коленях, трофейные черепа на поясе
            for (const arm of [r.armL, r.armR]) {
              arm.add(part(G.torus(0.15, 0.025, Math.PI * 2, 5, 16), 0x5a6470, { pos: [0, -0.16, 0], rot: [Math.PI / 2, 0, 0], outline: false, metal: 0.8, rough: 0.4 }));
              for (let i = 0; i < 4; i++) {
                const a = (i / 4) * Math.PI * 2 + 0.4;
                arm.add(part(G.cone(0.025, 0.09, 5), 0xc7ced6, { pos: [Math.cos(a) * 0.17, -0.16, Math.sin(a) * 0.17], rot: [0, -a, Math.PI / 2], outline: false, metal: 0.9 }));
              }
            }
            for (const kn of [r.kneeL, r.kneeR]) for (const y of [-0.03, -0.09]) kn.add(part(G.torus(0.13, 0.016, Math.PI * 2, 4, 14), 0xa08858, { pos: [0, y, 0], rot: [Math.PI / 2, 0, 0.2], outline: false }));
            for (const sd of [-1, 1]) {
              const tro = new THREE.Group();
              tro.add(part(G.sphere(0.06, 8, 6), boneC, { outline: false }));
              for (const k of [-1, 1]) tro.add(part(G.sphere(0.016, 5, 4), 0x1a1210, { pos: [k * 0.022, 0.0, 0.052], outline: false }));
              tro.position.set(sd * 0.36, 0.0, 0.2);
              r.torso.add(tro);
              r.torso.add(part(G.cyl(0.006, 0.006, 0.12, 3), 0xa08858, { pos: [sd * 0.36, 0.08, 0.2], outline: false }));
            }
            if (finest()) for (const [x, y, z] of [[-0.3, cy + 0.12, -0.12], [0.34, cy + 0.08, -0.1], [0.1, cy - 0.05, -0.32]]) r.torso.add(part(G.sphere(0.09, 8, 6), 0x5a7a3a, { pos: [x, y, z], scale: [1, 0.35, 0.8], outline: false }));
          }
          const hammer = buildTrollHammer();
          hammer.rotation.x = Math.PI / 2 - 0.5;
          // Своя группа: молот прячется, пока летит
          hammer.userData.anim = true;
          hammer.userData.ownMesh = true;
          r.handR.add(hammer);
          this.weapon = hammer;
        }
        scale = troll ? 2.1 : 1.3;
        r.body.scale.setScalar(scale);
        this.rig = r;
        this.inner.add(r.body);
        shadow = troll ? 3.6 : 2.0;
        height = troll ? 3.9 : 2.5;
        break;
      }
    }
    this.height = height;
    this.scale = scale;
    const sh = blobShadow(shadow);
    this.root.add(sh);

    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(G.ico(0.07, 0), glow(0xffe14a, 1, false));
      s.position.set(Math.cos((i / 3) * Math.PI * 2) * 0.4, 0, Math.sin((i / 3) * Math.PI * 2) * 0.4);
      this.stars.add(s);
    }
    this.stars.position.y = height + 0.15;
    this.stars.visible = false;
    this.root.add(this.stars);
    const w = kind === 'troll' ? 2.6 : kind === 'orc' ? 1.5 : 1.0;
    this.ice = new THREE.Mesh(G.box(w, height * 0.95, w), toon(0x9fe8ff, { transparent: true, opacity: 0.55, emissive: 0x2a88aa, emissiveIntensity: 0.4 }));
    this.ice.position.y = height * 0.47;
    this.ice.visible = false;
    this.root.add(this.ice);
    if (fine()) {
      const hair = hairTex();
      const leather = leatherTex();
      texturize(this.inner, { 0x5a4a3a: hair, 0x1a1612: hair, 0x2a2214: hair, 0x3a2414: leather, 0x4a3020: leather, 0x6a4428: leather, 0x7a4a26: leather, 0x6a4024: leather }, (hex, map) => toon(hex, { map }));
    }
    // Склеиваем детали — в разы меньше отрисовок на каждого моба
    bake(this.inner);
  }

  playAttack() {
    this.atkT = 0;
  }

  /** Модель больше не нужна (пул переполнен): освободить склейку и скелет. */
  dispose() {
    releaseBaked(this.root);
    this.root.removeFromParent();
  }

  /** Сброс состояния для повторного использования модели из пула. */
  reset() {
    this.dying = 0;
    this.spawnK = 0;
    this.atkT = 99;
    this.popT = 0;
    this.inner.rotation.set(0, 0, 0);
    this.inner.scale.setScalar(1);
    this.inner.position.set(0, 0, 0);
    this.stars.visible = false;
    this.ice.visible = false;
    this.windT = this.throwT = this.catchT = 99;
    this.wasOut = this.wasWind = false;
    if (this.weapon) this.weapon.visible = true;
  }

  /** Мировая позиция пасти (дракон и дракончики) — оттуда вырывается огонь. */
  mouthWorld(target: THREE.Vector3): THREE.Vector3 | null {
    return this.creature ? this.creature.mouth.getWorldPosition(target) : null;
  }

  /** Мировая позиция правой руки — откуда летит и куда возвращается молот. */
  handWorld(target: THREE.Vector3): THREE.Vector3 {
    return this.rig ? this.rig.handR.getWorldPosition(target) : target.copy(this.root.position).setY(this.height * 0.6);
  }

  pop() {
    this.popT = 0.15;
  }

  update(dt: number, st: MobAnimInput) {
    this.t += dt;
    this.atkT += dt;
    const t = this.t;
    const frozen = st.frozen;
    const mv = st.moving && !frozen && !st.stun;
    if (mv) this.walk += dt * (this.kind === 'troll' ? 6 : this.kind === 'goblin' ? 13 : 10);

    // Появление: вырастают из земли
    this.spawnK = st.spawning ? Math.min(1, this.spawnK + dt * 1.2) : 1;
    const sk = st.spawning ? this.spawnK : 1;
    this.inner.position.y = (sk - 1) * this.height;

    if (this.dying > 0) {
      this.dying += dt;
      const k = Math.min(1, this.dying / 0.7);
      this.inner.rotation.x = -k * Math.PI / 2;
      this.inner.scale.setScalar(Math.max(0.01, 1 - k * 0.8));
      this.inner.position.y = -k * 0.4;
      return;
    }

    // Бросок молота
    const wind = !!st.throwWind;
    const out = !!st.hammerOut;
    if (wind && !this.wasWind) this.windT = 0;
    if (out && !this.wasOut) this.throwT = 0;
    if (!out && this.wasOut) this.catchT = 0;
    this.wasWind = wind;
    this.wasOut = out;
    this.windT += dt;
    this.throwT += dt;
    this.catchT += dt;
    if (this.weapon) this.weapon.visible = !out;

    const windupLean = st.windup ? -0.3 : 0;
    const strike = this.atkT < 0.25 ? Math.sin((this.atkT / 0.25) * Math.PI) : 0;

    if (this.creature) {
      this.creature.update(dt, { moving: mv, windup: st.windup, stun: st.stun, frozen, atk: this.atkT, skill: st.skill ?? '' });
    } else if (this.slime) {
      const hop = mv ? Math.abs(Math.sin(this.walk * 0.6)) : 0;
      const squash = mv ? 1 - Math.abs(Math.cos(this.walk * 0.6)) * 0.2 : 1 + Math.sin(t * 3) * 0.04;
      this.slime.position.y = hop * 0.35;
      this.slime.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
      if (st.windup) this.slime.scale.set(1.2, 0.75, 1.2);
      if (strike > 0) {
        this.slime.scale.set(0.85, 1.25, 1.1);
        this.slime.position.z = strike * 0.4;
      } else this.slime.position.z = 0;
    } else if (this.rig) {
      const r = this.rig;
      // Шаг с коленями: тяжёлые идут вразвалку, гоблины семенят
      const mvK = mv ? 1 : 0;
      const runK = this.kind === 'goblin' ? 0.6 : this.kind === 'troll' ? 0 : 0.25;
      gait(this.walk, mvK, runK, this.poseL);
      gait(this.walk + Math.PI, mvK, runK, this.poseR);
      const heavy = this.kind === 'troll' || this.kind === 'orc';
      const crouch = (heavy ? 0.06 : 0.02) + (st.windup ? 0.12 : 0) + strike * 0.08;
      for (const pose of [this.poseL, this.poseR]) {
        pose.thigh -= crouch * 1.7;
        pose.knee += crouch * 3.3;
      }
      r.legL.rotation.set(this.poseL.thigh, 0, heavy ? -0.08 : -0.03);
      r.legR.rotation.set(this.poseR.thigh, 0, heavy ? 0.08 : 0.03);
      r.kneeL.rotation.x = this.poseL.knee;
      r.kneeR.rotation.x = this.poseR.knee;
      const sw = mv ? Math.sin(this.walk) * 0.6 : 0;
      r.armL.rotation.x = -sw * 0.7;
      let armR = sw * 0.7;
      let elbR = 0.3 + Math.max(0, -armR) * 0.3 + (heavy ? 0.15 : 0);
      let elbL = 0.3 + Math.max(0, sw * 0.7) * 0.3 + (heavy ? 0.15 : 0);
      const archer = this.kind === 'skeleton';
      if (st.windup && !archer) {
        armR = -2.6;
        elbR = 1.2;
      }
      if (strike > 0 && !archer) {
        const k = this.atkT / 0.25;
        armR = -2.6 + k * 2.4;
        elbR = 1.2 * (1 - k) + 0.1;
      }
      let armRz = 0;
      let armLz = 0;
      if (archer) {
        // Выстрел из лука: левая рука с луком вытянута к цели, правая на уровне плеча локтем назад
        // натягивает тетиву к щеке; после выстрела (strike) тетива отпущена, руки опускаются
        const aiming = st.windup || this.atkT < 0.45;
        this.drawK = st.windup ? Math.min(1, this.drawK + dt * 2.5) : Math.max(0, this.drawK - dt * 12);
        const aimK = aiming ? 1 : 0;
        if (aimK) {
          r.armL.rotation.x = -1.5;
          armLz = -0.05;
          elbL = 0.05;
          armR = 0.05 + this.drawK * 0.45;
          armRz = 1.3;
          elbR = 1.6 + this.drawK * 0.85;
        }
      }
      r.armR.rotation.x = armR;
      r.armR.rotation.z = armRz;
      r.armL.rotation.z = armLz;
      r.elbowL.rotation.x = -elbL;
      r.elbowR.rotation.x = -elbR;
      if (archer) {
        // Кисть с луком компенсирует наклон плеча и локтя — лук всегда стоит вертикально
        r.handL.rotation.x = elbL - r.armL.rotation.x;
        if (this.bowDraw) poseBowDraw(this.bowDraw, st.windup && this.drawK > 0.15, this.root, r.handR);
      }
      // Стопы на земле: тело опускается вместе со сгибом ног
      const drop = r.thigh + r.shin - Math.max(legHeight(this.poseL.thigh, this.poseL.knee, r.thigh, r.shin), legHeight(this.poseR.thigh, this.poseR.knee, r.thigh, r.shin));
      r.body.position.y = -drop * this.scale;
      r.body.rotation.z = mv && heavy ? Math.sin(this.walk) * 0.05 : 0;
      // Лучник стоит ровно и целится, остальные откидываются для замаха и подаются вперёд в ударе
      r.torso.rotation.x = this.kind === 'skeleton' ? (mv ? 0.12 : 0.04) : windupLean + strike * 0.35 + (mv ? 0.12 : 0);
      r.torso.rotation.y = 0;
      if (this.kind !== 'skeleton') r.armR.rotation.z = 0;
      if (wind) {
        // Замах: молот заведён далеко за голову, корпус откинут и развёрнут
        const k = Math.min(1, this.windT / 0.5);
        const e = 1 - Math.pow(1 - k, 3);
        r.armR.rotation.x = -3.3 * e + Math.sin(t * 30) * 0.03 * k;
        r.armR.rotation.z = 0.35 * e;
        r.elbowR.rotation.x = -1.0 * e;
        r.armL.rotation.x = -1.0 * e;
        r.torso.rotation.x = -0.45 * e;
        r.torso.rotation.y = -0.6 * e;
      } else if (this.throwT < 0.35) {
        // Бросок: рука хлёстко уходит вперёд
        const k = this.throwT / 0.35;
        const e = 1 - Math.pow(1 - k, 4);
        r.armR.rotation.x = -3.3 + e * 3.0;
        r.elbowR.rotation.x = -1.0 * (1 - e) - 0.05;
        r.armL.rotation.x = -1.0 + e * 0.6;
        r.torso.rotation.x = -0.45 + e * 0.7;
        r.torso.rotation.y = -0.6 + e * 0.9;
      } else if (out) {
        // Молот летит — тянет его к себе вытянутой рукой
        const pull = Math.sin(t * 9) * 0.06;
        r.armR.rotation.x = -1.55 + pull;
        r.elbowR.rotation.x = -0.1 - pull;
        r.armL.rotation.x = -0.6;
        r.torso.rotation.x = -0.12 + pull * 0.5;
        r.torso.rotation.y = 0.15;
      } else if (this.catchT < 0.45) {
        // Поймал: отдача тяжёлого молота
        const k = this.catchT / 0.45;
        const e = Math.sin(k * Math.PI);
        r.armR.rotation.x = -1.55 * (1 - k) - e * 0.8;
        r.torso.rotation.x = -0.3 * e;
        r.body.position.y -= 0.1 * e * this.scale;
      }
      r.head.rotation.z = Math.sin(t * 1.7) * 0.06;
      r.torso.scale.y = 1 + Math.sin(t * 2.4) * 0.02;
    }

    if (this.popT > 0) {
      this.popT -= dt;
      const p = Math.max(0, this.popT / 0.15);
      this.inner.scale.set(1 + p * 0.15, 1 - p * 0.15, 1 + p * 0.15);
    } else this.inner.scale.setScalar(1);

    this.stars.visible = st.stun && !frozen;
    if (this.stars.visible) this.stars.rotation.y += dt * 5;
    this.ice.visible = frozen;
  }
}
