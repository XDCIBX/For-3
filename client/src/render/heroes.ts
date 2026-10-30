import * as THREE from 'three';
import type { Equip, HeroClass, Item, Rarity } from '@game/shared';
import { G, RARITY_HEX, blobShadow, glow, part, toon } from './toon';
import { clothTex, texturize, woodTex } from './textures';
import { bake, unbake } from './bake';
import { earShape, footShape, gait, handShape, headShape, legHeight, limb, noseShape, torsoShape, type LegPose } from './anatomy';
import { buildAmulet, buildArmor, buildBoots, buildHelmet, buildRing, type Built, type Rig } from './equipment';
import { buildWeapon } from './weapons';

const SKIN = 0xdfa983;
/**
 * Анатомия класса: длины бедра/голени/плеча/предплечья, размер головы (доля от
 * базовой), общий масштаб, коренастость торса и толщина конечностей.
 */
const BUILD: Record<HeroClass, { thigh: number; shin: number; upper: number; fore: number; head: number; k: number; stout: number; limb: number }> = {
  warrior: { thigh: 0.42, shin: 0.4, upper: 0.3, fore: 0.27, head: 0.56, k: 0.9, stout: 0.3, limb: 1.1 },
  mage: { thigh: 0.42, shin: 0.4, upper: 0.3, fore: 0.27, head: 0.56, k: 0.9, stout: 0, limb: 0.9 },
  archer: { thigh: 0.43, shin: 0.41, upper: 0.3, fore: 0.28, head: 0.55, k: 0.9, stout: 0, limb: 0.92 },
  hunter: { thigh: 0.43, shin: 0.41, upper: 0.3, fore: 0.28, head: 0.55, k: 0.9, stout: 0.1, limb: 0.97 },
  summoner: { thigh: 0.42, shin: 0.4, upper: 0.3, fore: 0.27, head: 0.56, k: 0.9, stout: 0, limb: 0.9 },
  werewolf: { thigh: 0.44, shin: 0.44, upper: 0.33, fore: 0.32, head: 0.66, k: 0.92, stout: 0.5, limb: 1.25 },
  dwarf: { thigh: 0.3, shin: 0.27, upper: 0.25, fore: 0.22, head: 0.7, k: 1, stout: 0.8, limb: 1.3 },
};
/** Высота лодыжки над землёй (стопа с подошвой). */
const ANKLE_H = 0.11;
const DARK = 0x24160f;

export interface HeroAnimInput {
  speed: number;
  dead: boolean;
  stun: boolean;
  frozen: boolean;
  whirl: boolean;
  dash: boolean;
  invuln: boolean;
  buff: boolean;
  demon?: boolean;
  beast?: boolean;
}

const LEG_COL: Record<HeroClass, number> = { warrior: 0x5a4636, mage: 0x3a2a5a, archer: 0x5a4636, hunter: 0x2c2733, summoner: 0x3b5552, werewolf: 0x34405a, dwarf: 0x5a4636 };
const TORSO_COL: Record<HeroClass, number> = { warrior: 0xa9b4bf, mage: 0x6b3fc4, archer: 0x3f8f3a, hunter: 0x3b2f2a, summoner: 0x2a8f9a, werewolf: 0x6f5a4a, dwarf: 0x3f6a8a };
const SLEEVE_COL: Record<HeroClass, number> = { warrior: 0x8e9aa6, mage: 0x6b3fc4, archer: 0x3f8f3a, hunter: 0xe8b890, summoner: 0x2a8f9a, werewolf: 0x6f5a4a, dwarf: 0x3f6a8a };
const DEFAULT_WEAPON: Record<HeroClass, string> = { warrior: 'sword', mage: 'staff', archer: 'bow', hunter: 'glaives', summoner: 'totemstaff', werewolf: 'claws', dwarf: 'blunderbuss' };
const HAND_COL: Partial<Record<HeroClass, number>> = { warrior: 0x7d8894, hunter: 0x2c2733, werewolf: 0x5a3a24, dwarf: 0x5a3a22 };
/** Насколько крупнее рисуется оружие в руках — чтобы его было видно сверху. */
const WEAPON_SCALE: Record<HeroClass, number> = { warrior: 1.3, mage: 1.15, archer: 1.2, hunter: 1.25, summoner: 1.15, werewolf: 1.35, dwarf: 1.3 };
const FUR = 0x6f5a4a;
const FUR_LIGHT = 0xcdb79e;
const BEARD = 0xd8742a;
const FEL = 0x5dff8a;
const SPIRIT = 0x6ff0ff;

const HELM_COLORS: Record<string, Record<Rarity, number>> = {
  helm: { common: 0x9aa6b2, rare: 0x5b8fd0, epic: 0x8a5ac7, legendary: 0xf0c04a, relic: 0x6a1c22 },
  hood: { common: 0x7a6a55, rare: 0x2f6aa8, epic: 0x4a2f78, legendary: 0xc9343a, relic: 0x5a0f14 },
};
function eye(x: number, iris = 0x5a3a22): THREE.Group {
  const g = new THREE.Group();
  const white = new THREE.Mesh(G.sphere(0.075, 12, 8), toon(0xece6dc, { rough: 0.25 }));
  white.scale.set(1, 0.55, 0.45);
  const pupil = new THREE.Mesh(G.sphere(0.04, 10, 8), toon(iris, { rough: 0.2 }));
  pupil.position.set(0, 0, 0.022);
  pupil.scale.set(1, 1, 0.55);
  const dot = new THREE.Mesh(G.sphere(0.018, 8, 6), toon(0x0a0806, { rough: 0.15 }));
  dot.position.set(0, 0, 0.042);
  g.add(white, pupil, dot);
  g.position.set(x, 0.03, 0.345);
  g.rotation.y = x * 0.9;
  return g;
}

/** Модель героя: реалистичные пропорции, процедурная анимация, видимая экипировка. */
export class HeroModel {
  readonly cls: HeroClass;
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  private hips = new THREE.Group();
  private torsoG = new THREE.Group();
  private torso!: THREE.Mesh;
  private head = new THREE.Group();
  private eyes: THREE.Group[] = [];
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private handL = new THREE.Group();
  private handR = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  /** Колени, лодыжки и локти — вторые звенья конечностей. */
  private kneeL = new THREE.Group();
  private kneeR = new THREE.Group();
  private ankleL = new THREE.Group();
  private ankleR = new THREE.Group();
  private elbowL = new THREE.Group();
  private elbowR = new THREE.Group();
  /** Детали сапог (стопа и голенище) — перекрашиваются обувью. */
  private bootParts: THREE.Mesh[] = [];
  private readonly B: (typeof BUILD)[HeroClass];
  private poseL: LegPose = { thigh: 0, knee: 0, ankle: 0 };
  private poseR: LegPose = { thigh: 0, knee: 0, ankle: 0 };
  private headgear = new THREE.Group();
  private weapon = new THREE.Group();
  private weapon2: THREE.Group | null = null;
  private demonG = new THREE.Group();
  private wings: THREE.Group[] = [];
  private spiritOrbs: THREE.Group | null = null;
  /** Оборотень: хвост и облик зверя (грива, горящие глаза). */
  private tail: THREE.Group | null = null;
  private beastG = new THREE.Group();
  private beastTorso = new THREE.Group();
  private beastHead = new THREE.Group();
  private demonTorso = new THREE.Group();
  private demonHead = new THREE.Group();
  private beastK = 0;
  /** Базовые пропорции тела (гном — коренастый). */
  private bodyScale = new THREE.Vector3(1, 1, 1);
  private built: Built = { parts: [], glow: [], spin: [] };
  private sleeves: THREE.Mesh[] = [];
  private baseSleeveColor = 0;
  private spinParts: THREE.Object3D[] = [];
  /** Светящиеся и вращающиеся детали самого класса (не экипировки). */
  private classGlow: THREE.Object3D[] = [];
  private classSpin: THREE.Object3D[] = [];
  private beastRing: THREE.Object3D | null = null;
  private stunStars = new THREE.Group();
  private ice: THREE.Mesh;
  private aura: THREE.Mesh;
  private buffRing: THREE.Mesh;
  private shieldBubble: THREE.Mesh;
  private trimMeshes: THREE.Mesh[] = [];
  private glowParts: THREE.Object3D[] = [];
  private t = Math.random() * 10;
  private walkPhase = 0;
  private castT = 99;
  private castS = 0;
  /** Оборотень бьёт поочерёдно правой и левой лапой. */
  private clawSide = 1;
  private castDur = 0.3;
  private blinkT = 2 + Math.random() * 3;
  private popT = 0;
  private deadT = 0;
  private cheerT = 99;
  private whirlA = 0;
  private equipKey = '';
  private baseTorsoColor: number;
  weaponTpl = '';
  /** Насколько ярко «искрит» оружие: 0 — нет, больше — чаще (эпические и выше, посохи). */
  weaponSparkle = 0;
  weaponSparkleColor = 0xffffff;

  constructor(cls: HeroClass) {
    this.cls = cls;
    // Группы с собственной анимацией (остальные склеиваются с родителем)
    this.B = BUILD[cls];
    for (const g of [this.torsoG, this.head, this.armL, this.armR, this.legL, this.legR, this.kneeL, this.kneeR, this.ankleL, this.ankleR, this.elbowL, this.elbowR, this.handL, this.handR]) g.userData.anim = true;
    this.root.add(blobShadow(1.4));
    this.root.add(this.body);
    this.body.add(this.hips, this.torsoG);
    this.hips.position.y = 0.55;
    this.torsoG.position.y = 0.55;

    const B = this.B;
    const L = B.limb;
    const hipH = B.thigh + B.shin + ANKLE_H;
    this.hips.position.y = this.torsoG.position.y = hipH;
    const skin = cls === 'werewolf' ? FUR : SKIN;

    // Ноги: бедро → колено → голень → лодыжка → стопа
    for (const [leg, knee, ankle, x] of [
      [this.legL, this.kneeL, this.ankleL, -0.13],
      [this.legR, this.kneeR, this.ankleR, 0.13],
    ] as const) {
      leg.position.x = x;
      this.hips.add(leg);
      leg.add(part(limb(0.115 * L, 0.078 * L, B.thigh, 0.1), LEG_COL[cls], { pos: [0, 0, 0] }));
      knee.position.y = -B.thigh;
      leg.add(knee);
      knee.add(part(limb(0.078 * L, 0.055 * L, B.shin, 0.2), LEG_COL[cls], {}));
      // Голенище сапога
      const shaft = part(G.cyl(0.072 * L, 0.066 * L, B.shin * 0.55, 12), 0x6a4428, { pos: [0, -B.shin * 0.72, 0] });
      knee.add(shaft);
      ankle.position.y = -B.shin;
      knee.add(ankle);
      const foot = part(footShape(L), 0x6a4428, {});
      ankle.add(foot);
      this.bootParts.push(shaft, foot);
    }

    // Торс: таз, талия, грудная клетка
    this.baseTorsoColor = TORSO_COL[cls];
    this.torso = part(torsoShape(1, 1.12, B.stout), this.baseTorsoColor, {});
    this.torsoG.add(this.torso);
    const belt = part(G.cyl(0.272, 0.272, 0.09, 20), 0x5a3a22, { pos: [0, 0.12, 0], scale: [1.02, 1, 0.82] });
    const buckle = part(G.box(0.11, 0.08, 0.03), 0xffc93c, { pos: [0, 0.12, 0.225], rot: [0, 0, 0] });
    this.torsoG.add(belt, buckle);

    // Руки: плечо → локоть → предплечье → кисть
    for (const [arm, elbow, hand, x] of [
      [this.armL, this.elbowL, this.handL, -0.34],
      [this.armR, this.elbowR, this.handR, 0.34],
    ] as const) {
      arm.position.set(x, 0.6, 0);
      this.torsoG.add(arm);
      const sleeve = SLEEVE_COL[cls];
      this.baseSleeveColor = sleeve;
      const up = part(limb(0.088 * L, 0.066 * L, B.upper, 0.16), sleeve, {});
      elbow.position.y = -B.upper;
      arm.add(up, elbow);
      const fore = part(limb(0.066 * L, 0.048 * L, B.fore, 0.14), sleeve, {});
      elbow.add(fore);
      this.sleeves.push(up, fore);
      elbow.add(part(handShape(cls === 'werewolf' ? 1.3 : cls === 'dwarf' ? 1.15 : 1, cls === 'werewolf'), HAND_COL[cls] ?? SKIN, { pos: [0, -B.fore - 0.01, 0], rot: [0, x < 0 ? Math.PI : 0, 0] }));
      hand.position.set(0, -B.fore - 0.07, 0.01);
      elbow.add(hand);
      arm.rotation.z = x < 0 ? -0.08 : 0.08;
    }

    // Голова: череп с челюстью, скулами и глазницами
    this.head.scale.setScalar(B.head);
    this.head.position.y = 0.83 + 0.4 * B.head;
    this.torsoG.add(this.head);
    const headM = part(headShape(cls === 'werewolf' || cls === 'dwarf' ? 'brute' : 'human'), skin, { rough: 0.6 });
    this.head.add(headM);
    if (cls !== 'werewolf') for (const s of [-1, 1]) this.head.add(part(earShape(), skin, { pos: [s * 0.355, 0.0, -0.03], rot: [0, s * 0.35, 0] }));
    // Шея с кадыком и трапециями
    const neckCol = cls === 'werewolf' ? FUR : cls === 'warrior' ? 0x7d8894 : SKIN;
    const nk = cls === 'werewolf' ? 1.6 : cls === 'dwarf' ? 1.35 : 1;
    this.torsoG.add(part(G.cyl(0.075 * nk, 0.1 * nk, 0.2, 12), neckCol, { pos: [0, 0.8, 0.0] }));
    this.torsoG.add(part(G.sphere(0.16 * nk, 12, 8), neckCol, { pos: [0, 0.72, -0.02], scale: [1.5, 0.45, 0.9] }));
    // У охотника глаза скрыты повязкой
    const iris = cls === 'werewolf' ? 0xd8a020 : cls === 'mage' ? 0x4a6a8a : cls === 'summoner' ? 0x3a6a5a : 0x5a3a22;
    this.eyes = cls === 'hunter' ? [] : [eye(-0.14, iris), eye(0.14, iris)];
    for (const e of this.eyes) e.userData.anim = true;
    if (this.eyes.length) this.head.add(...this.eyes);
    if (cls !== 'werewolf') {
      // У гнома нос картошкой
      const nose = part(noseShape(cls === 'dwarf' ? 1.5 : 1), 0xd59a76, { pos: [0, -0.01, 0.385], rot: [0.15, 0, 0], rough: 0.6 });
      this.head.add(nose);
    }
    this.head.add(this.headgear);

    // Рот: у каждого свой характер (у мага и гнома его прячет борода, у оборотня — морда)
    if (cls === 'archer' || cls === 'summoner') {
      this.head.add(part(G.torus(0.055, 0.014, Math.PI, 4, 10), 0x7a2a1a, { pos: [0, -0.17, 0.37], rot: [0, 0, Math.PI], outline: false }));
    } else if (cls === 'warrior' || cls === 'hunter') {
      this.head.add(part(G.box(0.1, 0.022, 0.02), 0x5a2a1a, { pos: [0, -0.18, 0.375], rot: [0, 0, cls === 'warrior' ? 0.12 : 0], outline: false }));
    }
    // Отвороты сапог и манжеты на запястьях
    for (const knee of [this.kneeL, this.kneeR]) {
      const cuff = part(G.torus(0.074 * L, 0.018, Math.PI * 2, 5, 14), cls === 'warrior' ? 0x6d7680 : 0x7a5434, { pos: [0, -B.shin * 0.45, 0], rot: [Math.PI / 2, 0, 0] });
      knee.add(cuff);
    }
    for (const elbow of [this.elbowL, this.elbowR]) {
      elbow.add(part(G.torus(0.052 * L, 0.016, Math.PI * 2, 4, 12), cls === 'warrior' ? 0xc7ced6 : cls === 'mage' ? 0xffc93c : 0x4a2e1a, { pos: [0, -B.fore + 0.02, 0], rot: [Math.PI / 2, 0, 0] }));
    }
    // Поясная сумка с клапаном и пряжкой
    if (cls !== 'dwarf' && cls !== 'werewolf') {
      this.torsoG.add(part(G.box(0.12, 0.13, 0.09), 0x6a4428, { pos: [-0.27, 0.06, 0.14], rot: [0, -0.7, 0], outline: 0.012 }));
      this.torsoG.add(part(G.box(0.13, 0.05, 0.1), 0x5a3a22, { pos: [-0.275, 0.12, 0.145], rot: [0, -0.7, 0], outline: false }));
      this.torsoG.add(part(G.sphere(0.018, 6, 4), 0xffc93c, { pos: [-0.31, 0.1, 0.2], outline: false }));
    }

    this.buildClassParts();
    this.applyProportions();

    // Эффекты состояния
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(G.ico(0.07, 0), glow(0xffe14a, 1, false));
      s.position.set(Math.cos((i / 3) * Math.PI * 2) * 0.45, 0, Math.sin((i / 3) * Math.PI * 2) * 0.45);
      this.stunStars.add(s);
    }
    this.stunStars.position.y = 2.15;
    this.stunStars.visible = false;
    this.root.add(this.stunStars);

    this.ice = new THREE.Mesh(G.box(1.2, 2.1, 1.2), toon(0x9fe8ff, { transparent: true, opacity: 0.55, emissive: 0x2a88aa, emissiveIntensity: 0.4 }));
    this.ice.position.y = 1.0;
    this.ice.visible = false;
    this.root.add(this.ice);

    this.aura = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 40).rotateX(-Math.PI / 2), glow(0xffb321, 0.7));
    this.aura.position.y = 0.05;
    this.aura.visible = false;
    this.root.add(this.aura);

    this.buffRing = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.8, 32).rotateX(-Math.PI / 2), glow(0xff5a2a, 0.8));
    this.buffRing.position.y = 0.06;
    this.buffRing.visible = false;
    this.root.add(this.buffRing);

    this.shieldBubble = new THREE.Mesh(G.sphere(1.05, 20, 14), glow(0x9b7bff, 0.16));
    this.shieldBubble.position.y = 1.0;
    this.shieldBubble.visible = false;
    this.root.add(this.shieldBubble);

    this.setEquip(null);
  }

  /** Общий масштаб класса — рост остаётся примерно прежним. */
  private applyProportions() {
    this.bodyScale.multiplyScalar(this.B.k);
  }

  private buildClassParts() {
    const cls = this.cls;
    if (cls === 'warrior') {
      // Наплечники
      for (const x of [-0.37, 0.37]) {
        const p = part(G.halfSphere(0.17), 0x8e9aa6, { pos: [x, 0.62, 0], scale: [1.1, 0.8, 1], outline: 0.025 });
        this.torsoG.add(p);
        this.trimMeshes.push(p);
      }
      // Плащ с золотой каймой и застёжками
      const cape = part(G.box(0.62, 0.8, 0.05), 0xc8412f, { pos: [0, 0.26, -0.3], rot: [0.12, 0, 0], outline: 0.025 });
      this.torsoG.add(cape);
      this.torsoG.add(part(G.box(0.63, 0.05, 0.06), 0xffc93c, { pos: [0, -0.13, -0.35], rot: [0.12, 0, 0], outline: false }));
      for (const x of [-0.24, 0.24]) this.torsoG.add(part(G.sphere(0.045, 8, 6), 0xffc93c, { pos: [x, 0.66, -0.24], outline: 0.008 }));
      // Кольчужная юбка под поясом
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        this.torsoG.add(part(G.box(0.1, 0.14, 0.03), 0x8a96a0, { pos: [Math.sin(a) * 0.3, 0.0, Math.cos(a) * 0.27], rot: [0.15, a, 0], outline: 0.008 }));
      }
      // Щит
      const shield = new THREE.Group();
      const disc = part(G.cyl(0.34, 0.34, 0.07, 20), 0xb5452f, { rot: [Math.PI / 2, 0, 0], outline: 0.03 });
      const rim = part(G.torus(0.34, 0.035, Math.PI * 2, 6, 24), 0xc7ced6, { outline: false });
      const boss = part(G.sphere(0.1, 12, 8), 0xffc93c, { pos: [0, 0, 0.05], scale: [1, 1, 0.6], outline: 0.02 });
      const stripe = part(G.box(0.1, 0.6, 0.02), 0xffe08a, { pos: [0, 0, 0.04], outline: false });
      shield.add(disc, rim, stripe, boss);
      shield.position.set(-0.08, -0.05, 0.08);
      shield.rotation.y = -Math.PI / 2 + 0.2;
      this.handL.add(shield);
    } else if (cls === 'mage') {
      // Мантия до земли
      const robe = part(G.cyl(0.3, 0.52, 0.62, 18), 0x6b3fc4, { pos: [0, -0.18, 0], outline: 0.035 });
      this.torsoG.add(robe);
      this.trimMeshes.push(robe);
      const trim = part(G.torus(0.51, 0.04, Math.PI * 2, 6, 28), 0xffc93c, { pos: [0, -0.48, 0], rot: [Math.PI / 2, 0, 0], outline: false });
      this.torsoG.add(trim);
      // Звёзды на мантии и стоячий воротник
      for (const [a, y] of [[0.4, -0.3], [-0.7, -0.15], [1.6, -0.38], [2.6, -0.25], [-1.8, -0.35]] as const) {
        this.torsoG.add(part(G.ico(0.035, 0), 0xffe14a, { pos: [Math.sin(a) * (0.38 + (-y) * 0.25), y, Math.cos(a) * (0.38 + (-y) * 0.25)], outline: false }));
      }
      this.torsoG.add(part(G.cyl(0.24, 0.2, 0.12, 14, ), 0x4e2a9a, { pos: [0, 0.74, -0.02], outline: 0.015 }));
      // Борода
      const beard = part(G.cone(0.24, 0.5, 14), 0xf3f1ec, { pos: [0, -0.33, 0.24], rot: [Math.PI + 0.35, 0, 0], outline: 0.025 });
      this.head.add(beard);
      const mous = part(G.capsule(0.05, 0.22), 0xf3f1ec, { pos: [0, -0.13, 0.35], rot: [0, 0, Math.PI / 2], outline: 0.015 });
      this.head.add(mous);
      // Брови
      for (const x of [-0.14, 0.14]) this.head.add(part(G.box(0.14, 0.035, 0.04), 0xf3f1ec, { pos: [x, 0.16, 0.36], rot: [0, 0, x * -1.2], outline: false }));
    } else if (cls === 'hunter') {
      this.buildHunter();
    } else if (cls === 'summoner') {
      this.buildSummoner();
    } else if (cls === 'werewolf') {
      this.buildWerewolf();
    } else if (cls === 'dwarf') {
      this.buildDwarf();
    } else {
      // Плащ лучника и колчан
      const cape = part(G.box(0.6, 0.85, 0.05), 0x2f6b2c, { pos: [0, 0.22, -0.3], rot: [0.14, 0, 0], outline: 0.025 });
      this.torsoG.add(cape);
      const quiver = new THREE.Group();
      quiver.add(part(G.cyl(0.11, 0.09, 0.55, 12), 0x7a4a26, { outline: 0.025 }));
      for (let i = 0; i < 4; i++) {
        const a = new THREE.Group();
        a.add(part(G.cyl(0.012, 0.012, 0.3, 4), 0xc9a36a, { outline: false }));
        a.add(part(G.box(0.07, 0.1, 0.01), [0xe94b3c, 0xffffff, 0xe94b3c, 0xffd54a][i], { pos: [0, 0.14, 0], outline: false }));
        a.position.set((i - 1.5) * 0.045, 0.32, (i % 2) * 0.04 - 0.02);
        quiver.add(a);
      }
      quiver.position.set(0.12, 0.42, -0.36);
      quiver.rotation.set(-0.25, 0, -0.5);
      this.torsoG.add(quiver);
      // Ремень колчана через грудь и кожаный наруч на руке с луком
      this.torsoG.add(part(G.box(0.06, 0.72, 0.03), 0x7a4a26, { pos: [-0.02, 0.4, 0.29], rot: [0, 0, -0.75], outline: 0.008 }));
      this.elbowL.add(part(G.cyl(0.068, 0.058, 0.16, 10), 0x7a4a26, { pos: [0, -0.15, 0], outline: 0.012 }));
      for (const y of [-0.09, -0.2]) this.elbowL.add(part(G.torus(0.066, 0.012, Math.PI * 2, 4, 12), 0x4a2e1a, { pos: [0, y, 0], rot: [Math.PI / 2, 0, 0], outline: false }));
      // Шарф
      const scarf = part(G.torus(0.27, 0.07, Math.PI * 2, 8, 20), 0xd9a441, { pos: [0, 0.68, 0], rot: [Math.PI / 2, 0, 0], outline: 0.02 });
      this.torsoG.add(scarf);
      // Решительные брови
      for (const x of [-0.14, 0.14]) this.head.add(part(G.box(0.13, 0.03, 0.04), 0x5a3a22, { pos: [x, 0.17, 0.36], rot: [0, 0, x * 1.4], outline: false }));
    }
    if (cls === 'warrior') {
      for (const x of [-0.14, 0.14]) this.head.add(part(G.box(0.15, 0.04, 0.04), 0x4a3020, { pos: [x, 0.16, 0.36], rot: [0, 0, x * 2], outline: false }));
    }
  }

  /** Охотник на демонов: повязка на глазах, рожки, татуировки скверны, демонические крылья. */
  private buildHunter() {
    const T = this.torsoG;
    const H = this.head;
    // Повязка на глазах со светящимися прорезями
    H.add(part(G.torus(0.395, 0.07, Math.PI * 2, 6, 28), 0x1c1820, { pos: [0, 0.02, 0], rot: [Math.PI / 2 - 0.08, 0, 0], scale: [1.03, 1, 1], outline: 0.02 }));
    for (const x of [-0.14, 0.14]) {
      const slit = new THREE.Mesh(G.box(0.13, 0.03, 0.03), toon(FEL, { emissive: FEL, emissiveIntensity: 1 }));
      slit.position.set(x, 0.02, 0.4);
      slit.rotation.y = x * 0.9;
      H.add(slit);
      this.classGlow.push(slit);
    }
    // Концы повязки развеваются сзади
    for (const s of [-1, 1]) H.add(part(G.box(0.07, 0.3, 0.02), 0x1c1820, { pos: [s * 0.06, -0.12, -0.42], rot: [0.4, 0, s * 0.25], outline: 0.012 }));
    // Брови хмурые
    for (const x of [-0.14, 0.14]) H.add(part(G.box(0.15, 0.035, 0.04), 0x1a1210, { pos: [x, 0.15, 0.37], rot: [0, 0, x * 2], outline: false }));
    // Татуировки скверны на груди
    for (const s of [-1, 1]) {
      const tat = new THREE.Mesh(G.box(0.03, 0.22, 0.02), toon(FEL, { emissive: FEL, emissiveIntensity: 0.8 }));
      tat.position.set(s * 0.12, 0.45, 0.27);
      tat.rotation.z = s * 0.35;
      T.add(tat);
      this.classGlow.push(tat);
    }
    // Кожаный жилет с ремнями и шипастыми наплечниками
    for (const a of [-0.55, 0.55]) T.add(part(G.box(0.06, 0.6, 0.03), 0x1c1820, { pos: [0, 0.38, 0.28], rot: [0, 0, a], outline: 0.01 }));
    for (const x of [-0.37, 0.37]) {
      const pad = part(G.halfSphere(0.16), 0x2c2733, { pos: [x, 0.62, 0], scale: [1.1, 0.75, 1], outline: 0.022 });
      T.add(pad);
      this.trimMeshes.push(pad);
      for (const z of [-0.07, 0.07]) {
        const spike = part(G.cone(0.04, 0.16, 5), 0xd8d2c8, { pos: [x * 1.12, 0.72, z], rot: [0, 0, -Math.sign(x) * 0.6], outline: 0.012 });
        T.add(spike);
        this.trimMeshes.push(spike);
      }
    }
    // Рваная набедренная повязка
    for (const a of [-0.5, 0, 0.5]) T.add(part(G.box(0.15, 0.3, 0.03), 0x2c2733, { pos: [Math.sin(a) * 0.3, -0.08, Math.cos(a) * 0.27], rot: [0.12, a, 0], outline: 0.012 }));
    // Светящиеся полосы татуировок на руках
    for (const arm of [this.armL, this.armR]) {
      for (const y of [-0.12, -0.22]) {
        const band = new THREE.Mesh(G.torus(0.086, 0.012, Math.PI * 2, 4, 14), toon(FEL, { emissive: FEL, emissiveIntensity: 0.8 }));
        band.position.y = y;
        band.rotation.x = Math.PI / 2;
        arm.add(band);
      }
    }
    for (const elbow of [this.elbowL, this.elbowR]) elbow.add(part(G.cyl(0.07, 0.06, 0.14, 10), 0x1c1820, { pos: [0, -0.15, 0], outline: 0.012 }));
    // Демонические крылья и пламя скверны — видны в демонической форме
    this.demonG.userData.anim = true;
    // Крыло летучей мыши: перепонка-силуэт и костяные пальцы
    const shape = new THREE.Shape();
    const pts: [number, number][] = [[0, 0.05], [0.35, 0.32], [0.75, 0.52], [1.05, 0.42], [0.92, 0.1], [0.98, -0.25], [0.72, -0.08], [0.6, -0.42], [0.42, -0.14], [0.22, -0.38], [0.12, -0.08]];
    shape.moveTo(...pts[0]);
    for (const p of pts.slice(1)) shape.lineTo(...p);
    const membGeo = new THREE.ShapeGeometry(shape);
    const membMat = toon(0x4a1a5a, { emissive: 0x13602e, emissiveIntensity: 0.35, side: THREE.DoubleSide });
    for (const s of [-1, 1]) {
      const wing = new THREE.Group();
      wing.userData.anim = true;
      const wm = new THREE.Group();
      const memb = new THREE.Mesh(membGeo, membMat);
      memb.userData.noBake = true;
      wm.add(memb);
      for (const [x, y] of [[1.05, 0.42], [0.98, -0.25], [0.6, -0.42], [0.22, -0.38]] as const) {
        const len = Math.hypot(x, y);
        const bone = part(G.cyl(0.018, 0.03, len, 5), 0x1a1220, { outline: 0.01 });
        bone.position.set(x / 2, y / 2, 0.01);
        bone.rotation.z = Math.atan2(y, x) - Math.PI / 2;
        wm.add(bone);
      }
      wm.add(part(G.cone(0.035, 0.12, 5), 0xd8d2c8, { pos: [0.78, 0.55, 0.01], rot: [0, 0, -0.3], outline: 0.008 }));
      wm.scale.set(s * 1.25, 1.25, 1);
      wing.add(wm);
      wing.position.set(s * 0.12, 0.55, -0.22);
      this.wings.push(wing);
      this.demonTorso.add(wing);
    }
    const flame = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.95, 32).rotateX(-Math.PI / 2), glow(FEL, 0.55));
    flame.position.y = 0.06;
    this.demonG.add(flame);
    for (const s of [-1, 1]) {
      const horn = part(G.cone(0.13, 0.7, 8), 0x1a1210, { pos: [s * 0.3, 0.42, 0.05], rot: [-0.5, 0, -s * 0.35], outline: 0.015 });
      this.demonHead.add(horn);
    }
    this.demonG.visible = false;
    this.body.add(this.demonG);
    for (const g of [this.demonTorso, this.demonHead]) {
      g.userData.anim = true;
      g.visible = false;
    }
    this.torsoG.add(this.demonTorso);
    this.head.add(this.demonHead);
  }

  /** Призыватель: перья, раскраска, меховая накидка, бусы из клыков, парящие огоньки духов. */
  private buildSummoner() {
    const T = this.torsoG;
    const H = this.head;
    // Юбка-тотем с узором
    const skirt = part(G.cyl(0.31, 0.47, 0.5, 16), 0x2a8f9a, { pos: [0, -0.13, 0], outline: 0.03 });
    T.add(skirt);
    this.trimMeshes.push(skirt);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      T.add(part(G.box(0.08, 0.08, 0.02), i % 2 ? 0xd9a441 : 0xe94b3c, { pos: [Math.sin(a) * 0.45, -0.3, Math.cos(a) * 0.45], rot: [0.25, a, Math.PI / 4], outline: false }));
    }
    T.add(part(G.torus(0.46, 0.03, Math.PI * 2, 5, 28), 0xd9a441, { pos: [0, -0.37, 0], rot: [Math.PI / 2, 0, 0], outline: false }));
    // Меховая накидка
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      T.add(part(G.ico(0.11, 1), 0xe8dcc8, { pos: [Math.sin(a) * 0.25, 0.7, Math.cos(a) * 0.2], outline: 0.012 }));
    }
    // Бусы из клыков
    for (let i = 0; i < 5; i++) {
      const a = -0.7 + i * 0.35;
      T.add(part(G.cone(0.025, 0.09, 5), 0xfff6e0, { pos: [Math.sin(a) * 0.22, 0.52 - Math.cos(a * 1.4) * 0.04, 0.24], rot: [Math.PI, 0, a * 0.3], outline: 0.008 }));
    }
    const amulet = new THREE.Mesh(G.ico(0.06, 0), toon(SPIRIT, { emissive: SPIRIT, emissiveIntensity: 0.9 }));
    amulet.position.set(0, 0.44, 0.29);
    T.add(amulet);
    this.classGlow.push(amulet);
    // Раскраска на щеках и брови
    for (const x of [-0.24, 0.24]) {
      for (const y of [-0.06, -0.12]) H.add(part(G.box(0.1, 0.022, 0.02), SPIRIT, { pos: [x, y, 0.3], rot: [0, x * 1.6, 0], outline: false }));
      H.add(part(G.box(0.13, 0.032, 0.04), 0x2a1a10, { pos: [x * 0.6, 0.16, 0.36], rot: [0, 0, -x * 0.8], outline: false }));
    }
    // Тёмные волосы с косичками
    H.add(part(G.sphere(0.41, 18, 12), 0x2a1a10, { pos: [0, 0.07, -0.06], scale: [1.03, 0.95, 1], outline: 0.025 }));
    for (const s of [-1, 1]) {
      H.add(part(G.capsule(0.05, 0.32), 0x2a1a10, { pos: [s * 0.36, -0.3, -0.02], outline: 0.015 }));
      H.add(part(G.sphere(0.04, 6, 4), SPIRIT, { pos: [s * 0.36, -0.52, -0.02], outline: false }));
    }
    // Огоньки-духи, кружащие вокруг призывателя
    const orbs = new THREE.Group();
    orbs.userData.anim = true;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const o = new THREE.Mesh(G.sphere(0.07, 10, 8), toon(SPIRIT, { emissive: SPIRIT, emissiveIntensity: 1 }));
      o.position.set(Math.cos(a) * 0.75, 0, Math.sin(a) * 0.75);
      const h = new THREE.Mesh(G.sphere(0.15, 10, 8), glow(SPIRIT, 0.3));
      o.add(h);
      orbs.add(o);
    }
    orbs.position.y = 1.25;
    this.spiritOrbs = orbs;
    this.root.add(orbs);
  }

  /** Оборотень: волчья морда, уши, мех, хвост; в звериной форме — грива и горящие глаза. */
  private buildWerewolf() {
    const T = this.torsoG;
    const H = this.head;
    // Вытянутая волчья морда: нос на кончике, клыки торчат из-под губы
    H.add(part(G.capsule(0.13, 0.2), FUR_LIGHT, { pos: [0, -0.1, 0.42], rot: [Math.PI / 2 - 0.12, 0, 0], scale: [1.05, 1, 0.85], outline: 0.02 }));
    H.add(part(G.sphere(0.075, 10, 8), 0x1a1210, { pos: [0, -0.05, 0.66], scale: [1.25, 0.85, 1], outline: 0.01 }));
    H.add(part(G.box(0.16, 0.025, 0.12), 0x3a2414, { pos: [0, -0.2, 0.53], outline: false }));
    for (const s of [-1, 1]) H.add(part(G.cone(0.028, 0.1, 5), 0xfff6e0, { pos: [s * 0.08, -0.25, 0.55], rot: [Math.PI, 0, 0], outline: 0.006 }));
    // Высокие острые уши
    for (const s of [-1, 1]) {
      H.add(part(G.cone(0.14, 0.46, 4), FUR, { pos: [s * 0.22, 0.46, -0.06], rot: [-0.12, s * 0.25, -s * 0.22], scale: [1, 1, 0.5], outline: 0.02 }));
      H.add(part(G.cone(0.08, 0.3, 4), 0xe8a0a0, { pos: [s * 0.22, 0.43, -0.02], rot: [-0.12, s * 0.25, -s * 0.22], scale: [1, 1, 0.35], outline: false }));
    }
    // Бакенбарды и косматая макушка
    for (const s of [-1, 1]) H.add(part(G.cone(0.1, 0.24, 5), FUR_LIGHT, { pos: [s * 0.36, -0.12, 0.08], rot: [0, 0, s * 1.9], outline: 0.012 }));
    for (let i = 0; i < 4; i++) H.add(part(G.cone(0.09, 0.22, 5), 0x6a4024, { pos: [(i - 1.5) * 0.1, 0.36, 0.12 - Math.abs(i - 1.5) * 0.06], rot: [-0.5, 0, (i - 1.5) * 0.3], outline: 0.012 }));
    // Хмурые брови
    for (const x of [-0.14, 0.14]) H.add(part(G.box(0.15, 0.04, 0.05), 0x3a2414, { pos: [x, 0.16, 0.36], rot: [0, 0, x * 2], outline: false }));
    // Светлая шерсть на груди и рваная жилетка
    T.add(part(G.sphere(0.24, 14, 10), FUR_LIGHT, { pos: [0, 0.42, 0.14], scale: [1, 1.1, 0.7], outline: 0.015 }));
    for (const s of [-1, 1]) T.add(part(G.box(0.16, 0.5, 0.05), 0x4a3a5a, { pos: [s * 0.22, 0.36, 0.22], rot: [0, s * 0.45, s * 0.1], outline: 0.012 }));
    // Клочья шерсти на плечах и рваные штанины
    for (const x of [-0.37, 0.37]) for (let i = 0; i < 3; i++) T.add(part(G.cone(0.07, 0.18, 5), FUR, { pos: [x * (1 + i * 0.05), 0.68 - i * 0.04, -0.06 + i * 0.07], rot: [0, 0, -Math.sign(x) * (0.8 + i * 0.2)], outline: 0.01 }));
    for (const knee of [this.kneeL, this.kneeR]) for (let i = 0; i < 3; i++) knee.add(part(G.cone(0.05, 0.12, 4), 0x34405a, { pos: [(i - 1) * 0.06, -0.12, 0.05], rot: [Math.PI, 0, 0], outline: false }));
    // Пушистый хвост
    const tail = new THREE.Group();
    tail.userData.anim = true;
    tail.add(part(G.capsule(0.11, 0.38), FUR, { pos: [0, 0, -0.2], rot: [-1.0, 0, 0], outline: 0.02 }));
    tail.add(part(G.sphere(0.11, 10, 8), FUR_LIGHT, { pos: [0, 0.16, -0.38], outline: 0.015 }));
    tail.position.set(0, 0.04, -0.2);
    this.tail = tail;
    this.hips.add(tail);
    // Облик зверя: грива вдоль спины, горящие глаза
    this.beastG.userData.anim = true;
    // Грива по плечам и хребту — в координатах торса
    for (let i = 0; i < 7; i++) {
      const a = (i - 3) * 0.32;
      this.beastTorso.add(part(G.cone(0.1, 0.34, 5), 0x4a2a1a, { pos: [Math.sin(a) * 0.3, 0.78 - Math.abs(i - 3) * 0.05, -0.12 - Math.cos(a) * 0.1], rot: [-0.9, 0, -a * 0.8], outline: 0.012 }));
    }
    for (let i = 0; i < 5; i++) this.beastTorso.add(part(G.cone(0.09, 0.3, 5), 0x4a2a1a, { pos: [0, 0.6 - i * 0.14, -0.28], rot: [-1.4, 0, 0], outline: 0.012 }));
    // Горящие глаза — в координатах головы
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(G.sphere(0.07, 8, 6), toon(0xff3a1a, { emissive: 0xff2a10, emissiveIntensity: 1 }));
      e.position.set(s * 0.14, 0.04, 0.35);
      this.beastHead.add(e);
      this.beastHead.add(new THREE.Mesh(G.sphere(0.15, 8, 6), glow(0xff4a1a, 0.35)).translateX(s * 0.14).translateY(0.04).translateZ(0.36));
    }
    for (const g of [this.beastTorso, this.beastHead]) {
      g.userData.anim = true;
      g.visible = false;
    }
    this.torsoG.add(this.beastTorso);
    this.head.add(this.beastHead);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 1.0, 32).rotateX(-Math.PI / 2), glow(0xffa040, 0.45));
    ring.position.y = 0.05;
    this.beastG.add(ring);
    this.beastRing = ring;
    this.beastG.visible = false;
    this.body.add(this.beastG);
  }

  /** Гном: коренастый, рыжая борода с косами, фартук, ранец с пороховым бочонком. */
  private buildDwarf() {
    const T = this.torsoG;
    const H = this.head;
    this.bodyScale.set(1.12, 0.86, 1.1);
    // Борода: широкая, с двумя косами и кольцами
    H.add(part(G.sphere(0.3, 14, 10), BEARD, { pos: [0, -0.24, 0.2], scale: [1.2, 1.1, 0.8], outline: 0.025 }));
    H.add(part(G.cone(0.26, 0.42, 12), BEARD, { pos: [0, -0.52, 0.22], rot: [Math.PI + 0.2, 0, 0], outline: 0.025 }));
    for (const s of [-1, 1]) {
      H.add(part(G.capsule(0.055, 0.3), BEARD, { pos: [s * 0.14, -0.72, 0.28], rot: [0.2, 0, s * 0.15], outline: 0.012 }));
      H.add(part(G.torus(0.06, 0.02, Math.PI * 2, 4, 10), 0xffc93c, { pos: [s * 0.15, -0.86, 0.3], rot: [Math.PI / 2, 0, 0], outline: false }));
    }
    // Усы
    for (const s of [-1, 1]) H.add(part(G.capsule(0.05, 0.18), BEARD, { pos: [s * 0.12, -0.12, 0.36], rot: [0, 0, s * 1.1], outline: 0.012 }));
    // Кустистые брови
    for (const x of [-0.15, 0.15]) H.add(part(G.box(0.17, 0.06, 0.06), BEARD, { pos: [x, 0.17, 0.36], rot: [0, 0, -x * 1.2], outline: 0.008 }));
    // Кожаный фартук с заклёпками
    T.add(part(G.box(0.46, 0.56, 0.05), 0x7a4a2a, { pos: [0, 0.28, 0.27], outline: 0.015 }));
    for (const [x, y] of [[-0.18, 0.5], [0.18, 0.5], [-0.18, 0.06], [0.18, 0.06]]) T.add(part(G.sphere(0.025, 6, 4), 0xc7ced6, { pos: [x, y, 0.3], outline: false }));
    // Патронташ через плечо
    T.add(part(G.box(0.08, 0.75, 0.04), 0x4a2e1a, { pos: [0.02, 0.4, 0.3], rot: [0, 0, 0.75], outline: 0.01 }));
    for (let i = 0; i < 5; i++) T.add(part(G.cyl(0.025, 0.025, 0.08, 6), 0xd8a441, { pos: [-0.2 + i * 0.1, 0.18 + i * 0.1, 0.33], rot: [0, 0, 0.75], outline: 0.006 }));
    // Ранец: пороховой бочонок, шестерня и труба
    const pack = new THREE.Group();
    pack.add(part(G.box(0.46, 0.5, 0.22), 0x6a4428, { outline: 0.02 }));
    pack.add(part(G.cyl(0.14, 0.14, 0.4, 12), 0x8a5a2b, { pos: [0, 0.1, -0.2], rot: [0, 0, Math.PI / 2], outline: 0.015 }));
    for (const x of [-0.13, 0.13]) pack.add(part(G.torus(0.145, 0.018, Math.PI * 2, 4, 14), 0x4a4a52, { pos: [x, 0.1, -0.2], rot: [0, Math.PI / 2, 0], outline: false }));
    pack.add(part(G.cyl(0.04, 0.05, 0.36, 8), 0x8a8a92, { pos: [0.16, 0.42, 0], outline: 0.012 }));
    pack.add(part(G.cone(0.07, 0.08, 8), 0x4a4a52, { pos: [0.16, 0.62, 0], rot: [Math.PI, 0, 0], outline: 0.01 }));
    const gear = new THREE.Group();
    gear.add(part(G.cyl(0.12, 0.12, 0.04, 10), 0xc8a24a, { rot: [Math.PI / 2, 0, 0], outline: 0.012 }));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      gear.add(part(G.box(0.05, 0.05, 0.04), 0xc8a24a, { pos: [Math.cos(a) * 0.14, Math.sin(a) * 0.14, 0], rot: [0, 0, a], outline: false }));
    }
    gear.position.set(-0.12, -0.08, -0.12);
    gear.userData.anim = true;
    gear.userData.spinAxis = 'z';
    this.classSpin.push(gear);
    pack.add(gear);
    pack.position.set(0, 0.42, -0.34);
    T.add(pack);
    // Пояс с массивной пряжкой
    T.add(part(G.box(0.18, 0.13, 0.05), 0xc8a24a, { pos: [0, 0.12, 0.3], outline: 0.012 }));
  }

  private buildHeadgear(it: Item | null) {
    this.headgear.clear();
    const r = it?.rarity ?? 'common';
    const glowing = r === 'relic' || r === 'legendary' || r === 'epic';
    if (this.cls === 'warrior') {
      const col = it ? HELM_COLORS[it.tpl]?.[r] ?? 0x9aa6b2 : 0x9aa6b2;
      const helm = part(G.halfSphere(0.43), col, { pos: [0, 0.03, 0], outline: 0.03 });
      this.headgear.add(helm);
      this.headgear.add(part(G.torus(0.42, 0.04, Math.PI * 2, 6, 24), 0xffc93c, { pos: [0, 0.04, 0], rot: [Math.PI / 2, 0, 0], outline: false }));
      this.headgear.add(part(G.box(0.06, 0.24, 0.06), col, { pos: [0, -0.02, 0.41], outline: 0.015 }));
      for (const s of [-1, 1]) {
        const horn = part(G.cone(0.08, 0.38, 10), 0xfff2d6, { pos: [s * 0.4, 0.22, 0], rot: [0, 0, -s * 0.9], outline: 0.02 });
        this.headgear.add(horn);
      }
      if (it && it.tpl === 'hood') {
        const plume = part(G.capsule(0.07, 0.3), RARITY_HEX[r], { pos: [0, 0.48, -0.1], rot: [-0.7, 0, 0], outline: 0.02 });
        this.headgear.add(plume);
      }
    } else if (this.cls === 'hunter') {
      // Тёмные волосы, изогнутые рога и ирокез
      this.headgear.add(part(G.sphere(0.415, 18, 12), 0x1a1612, { pos: [0, 0.08, -0.07], scale: [1.03, 0.92, 1], outline: 0.025 }));
      for (const s of [-1, 1]) {
        this.headgear.add(part(G.cone(0.1, 0.34, 8), 0x3a2e3e, { pos: [s * 0.3, 0.38, 0.02], rot: [-0.25, 0, -s * 0.7], outline: 0.018 }));
        this.headgear.add(part(G.cone(0.065, 0.24, 6), 0x3a2e3e, { pos: [s * 0.44, 0.56, -0.08], rot: [-0.9, 0, -s * 0.15], outline: 0.014 }));
      }
      for (let i = 0; i < 5; i++) this.headgear.add(part(G.cone(0.08, 0.24, 5), 0x1a1612, { pos: [0, 0.42 - i * 0.03, 0.18 - i * 0.13], rot: [-0.4 - i * 0.3, 0, 0], outline: 0.012 }));
    } else if (this.cls === 'werewolf') {
      // Своя шерсть вместо головного убора
    } else if (this.cls === 'dwarf') {
      // Шахтёрская каска с фонарём и очками-гогглами
      this.headgear.add(part(G.halfSphere(0.43), 0xc8a24a, { pos: [0, 0.05, -0.01], outline: 0.03 }));
      this.headgear.add(part(G.cyl(0.47, 0.47, 0.04, 22), 0xa8822a, { pos: [0, 0.05, 0.02], outline: 0.02 }));
      this.headgear.add(part(G.box(0.06, 0.14, 0.5), 0xa8822a, { pos: [0, 0.38, 0.0], outline: 0.012 }));
      this.headgear.add(part(G.cyl(0.09, 0.07, 0.1, 10), 0x4a4a52, { pos: [0, 0.24, 0.4], rot: [Math.PI / 2 - 0.3, 0, 0], outline: 0.012 }));
      const lamp = new THREE.Mesh(G.sphere(0.07, 10, 8), toon(0xfff2b0, { emissive: 0xffd060, emissiveIntensity: 1 }));
      lamp.position.set(0, 0.25, 0.45);
      this.headgear.add(lamp);
      this.built.glow.push(lamp);
      for (const s of [-1, 1]) {
        this.headgear.add(part(G.cyl(0.085, 0.085, 0.06, 12), 0x4a4a52, { pos: [s * 0.13, 0.12, 0.38], rot: [Math.PI / 2 - 0.4, 0, 0], outline: 0.01 }));
        this.headgear.add(part(G.cyl(0.06, 0.06, 0.065, 12), 0x8ad8ff, { pos: [s * 0.13, 0.12, 0.385], rot: [Math.PI / 2 - 0.4, 0, 0], outline: false }));
      }
      this.headgear.add(part(G.torus(0.42, 0.025, Math.PI * 2, 4, 20), 0x3a2414, { pos: [0, 0.12, 0], rot: [Math.PI / 2 - 0.15, 0, 0], outline: false }));
    } else if (this.cls === 'summoner') {
      // Головная повязка с перьями
      this.headgear.add(part(G.torus(0.4, 0.045, Math.PI * 2, 6, 24), 0xc9343a, { pos: [0, 0.13, 0], rot: [Math.PI / 2 - 0.1, 0, 0], outline: 0.015 }));
      const fc = [0xffffff, 0xd9a441, SPIRIT, 0xd9a441, 0xffffff];
      for (let i = 0; i < 5; i++) {
        const a = -0.6 + i * 0.3;
        const f = part(G.capsule(0.045, 0.3), fc[i], { pos: [Math.sin(a) * 0.32, 0.42, -Math.cos(a) * 0.25], rot: [-0.35, 0, -a * 0.8], scale: [1, 1, 0.4], outline: 0.012 });
        this.headgear.add(f);
      }
      this.headgear.add(part(G.sphere(0.05, 8, 6), SPIRIT, { pos: [0, 0.16, 0.4], outline: 0.01 }));
    } else if (this.cls === 'mage') {
      const col = it ? (it.tpl === 'helm' ? HELM_COLORS.helm[r] : HELM_COLORS.hood[r]) : 0x4e2a9a;
      const brim = part(G.cyl(0.62, 0.62, 0.05, 24), col, { pos: [0, 0.22, 0], outline: 0.025 });
      const hat = new THREE.Group();
      hat.add(part(G.cone(0.38, 0.55, 18), col, { pos: [0, 0.27, 0], outline: 0.03 }));
      const tip = part(G.cone(0.17, 0.4, 12), col, { pos: [0, 0.65, -0.08], rot: [-0.6, 0, 0], outline: 0.02 });
      hat.add(tip);
      hat.position.y = 0.22;
      const band = part(G.torus(0.36, 0.04, Math.PI * 2, 6, 24), 0xffc93c, { pos: [0, 0.27, 0], rot: [Math.PI / 2, 0, 0], outline: false });
      const star = new THREE.Mesh(G.ico(0.07, 0), toon(0xffe14a, { emissive: 0xffc93c, emissiveIntensity: 0.6 }));
      star.position.set(0, 0.42, 0.3);
      this.headgear.add(brim, hat, band, star);
    } else {
      const col = it ? (it.tpl === 'helm' ? HELM_COLORS.helm[r] : HELM_COLORS.hood[r]) : 0x2f6b2c;
      const hood = part(G.sphere(0.45, 18, 14, ), col, { pos: [0, 0.05, -0.06], outline: 0.03 });
      hood.scale.set(1.04, 1.02, 1.05);
      // Вырез для лица — «маска» цвета кожи поверх
      const face = new THREE.Mesh(G.sphere(0.395, 18, 14), toon(SKIN));
      face.position.set(0, -0.02, 0.06);
      face.scale.set(0.98, 0.93, 0.95);
      const tail = part(G.cone(0.2, 0.5, 10), col, { pos: [0, 0.05, -0.5], rot: [-2.0, 0, 0], outline: 0.025 });
      this.headgear.add(hood, face, tail);
      if (it?.tpl === 'helm') {
        this.headgear.add(part(G.torus(0.42, 0.05, Math.PI * 2, 6, 24), 0xc7ced6, { pos: [0, 0.18, 0], rot: [Math.PI / 2 - 0.2, 0, 0], outline: false }));
      }
      // Перо
      this.headgear.add(part(G.capsule(0.04, 0.32), it ? RARITY_HEX[r] : 0xe94b3c, { pos: [0.33, 0.35, -0.2], rot: [-0.5, 0, -0.6], outline: 0.015 }));
    }
    if (it?.rarity === 'legendary' || it?.rarity === 'relic') {
      const crown = new THREE.Group();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        crown.add(part(G.cone(0.05, 0.14, 6), 0xffd54a, { pos: [Math.cos(a) * 0.17, 0.07, Math.sin(a) * 0.17], outline: false }));
      }
      crown.add(part(G.torus(0.17, 0.03, Math.PI * 2, 6, 16), 0xffd54a, { rot: [Math.PI / 2, 0, 0], outline: false }));
      crown.position.y = this.cls === 'mage' ? 0.6 : 0.47;
      this.headgear.add(crown);
    }
    if (glowing && it) {
      const gem = new THREE.Mesh(G.ico(0.07, 0), toon(RARITY_HEX[r], { emissive: RARITY_HEX[r], emissiveIntensity: 0.8 }));
      gem.position.set(0, this.cls === 'mage' ? 0.32 : 0.22, 0.4);
      this.headgear.add(gem);
    }
  }

  setEquip(eq: Equip | null) {
    const key = eq ? Object.values(eq).map((i) => (i ? i.id : '-')).join('|') : 'none';
    if (key === this.equipKey) return;
    this.equipKey = key;
    unbake(this.body);
    // Снимаем всё, что было надето
    for (const o of this.built.parts) o.removeFromParent();
    this.weapon.removeFromParent();
    this.weapon2?.removeFromParent();
    this.weapon2 = null;
    this.built = { parts: [], glow: [], spin: [] };
    const rig: Rig = { torso: this.torsoG, head: this.head, armL: this.armL, armR: this.armR, legL: this.legL, legR: this.legR, foreL: this.elbowL, foreR: this.elbowR, shinL: this.kneeL, shinR: this.kneeR, footL: this.ankleL, footR: this.ankleR, shinLen: this.B.shin, foreLen: this.B.fore, torsoMesh: this.torso };

    // Доспех: своя модель для лат, мантии и кожаного доспеха
    const armor = eq?.armor ?? null;
    let torsoCol = this.baseTorsoColor;
    let sleeveCol = this.baseSleeveColor;
    let metal = this.cls === 'warrior';
    let sleeveMap: THREE.Texture | undefined;
    if (armor) ({ torso: torsoCol, sleeve: sleeveCol, metal, sleeveMap } = buildArmor(rig, armor.tpl, armor.rarity, this.cls, this.built));
    this.torso.material = toon(torsoCol, metal ? {} : { map: clothTex() });
    for (const sl of this.sleeves) sl.material = toon(sleeveCol, sleeveMap ? { map: sleeveMap, metal: metal ? 0.85 : 0 } : metal ? {} : { map: clothTex() });
    for (const m of this.trimMeshes) {
      if (this.cls === 'mage') m.material = toon(armor?.tpl === 'robe' ? torsoCol : this.baseTorsoColor, { map: clothTex() });
      else m.visible = !armor; // классовые наплечники воина заменяет доспех
    }

    // Обувь
    const boots = eq?.boots ?? null;
    const bc = boots ? buildBoots(rig, boots.tpl, boots.rarity, this.built) : 0x6a4428;
    const bm = toon(bc, { rough: 0.55 });
    for (const b of this.bootParts) b.material = bm;

    if (eq?.amulet) buildAmulet(this.torsoG, eq.amulet.tpl, eq.amulet.rarity, this.built);
    if (eq?.ring) buildRing(this.handR, eq.ring.rarity, this.built);

    // Голова: шлем/капюшон заменяет классовый головной убор
    this.headgear.clear();
    if (eq?.helmet) buildHelmet(this.headgear, eq.helmet.tpl, eq.helmet.rarity, this.built);
    else this.buildHeadgear(null);

    // Оружие
    const wIt = eq?.weapon ?? null;
    const tpl = wIt?.tpl ?? DEFAULT_WEAPON[this.cls];
    this.weaponTpl = tpl;
    this.weapon = buildWeapon(tpl, wIt?.rarity ?? 'common', this.built);
    if (this.cls === 'hunter' || this.cls === 'werewolf') {
      // Парное оружие: по клинку (когтю) в каждой руке
      this.weapon2 = buildWeapon(tpl, wIt?.rarity ?? 'common', this.built);
      for (const [w, hand, s] of [
        [this.weapon, this.handR, 1],
        [this.weapon2, this.handL, -1],
      ] as const) {
        hand.add(w);
        w.rotation.set(this.cls === 'werewolf' ? Math.PI / 2 : Math.PI / 2 - 0.35, 0, 0);
        w.scale.set(s, 1, 1);
        w.position.set(0, 0, 0.02);
      }
    } else if (this.cls === 'summoner' && tpl === 'tome') {
      this.handR.add(this.weapon);
      this.weapon.rotation.set(0.3, 0, 0);
      this.weapon.position.set(0, -0.05, 0.08);
    } else if (this.cls === 'dwarf') {
      // Мушкетон: ствол вперёд, приклад под мышкой
      this.handR.add(this.weapon);
      this.weapon.rotation.set(Math.PI / 2, 0, 0);
      this.weapon.position.set(0, 0.02, -0.05);
    } else if (this.cls === 'archer') {
      this.handL.add(this.weapon);
      // Арбалет держат за шейку ложи ровно, болтом вперёд
      this.weapon.rotation.set(tpl === 'crossbow' ? 0 : Math.PI / 2, 0, 0);
    } else if (tpl === 'staff' || tpl === 'totemstaff') {
      // Посох держит вертикально, как настоящий посох, чуть впереди руки
      this.handR.add(this.weapon);
      this.weapon.rotation.set(0.3, 0, 0);
      this.weapon.position.set(0, -0.32, 0.02);
    } else {
      this.handR.add(this.weapon);
      this.weapon.rotation.set(this.cls === 'warrior' ? Math.PI / 2 - 0.45 : Math.PI / 2, 0, 0);
      this.weapon.position.set(0, 0, 0.02);
    }

    // Крупнее в руках; мирорное отражение у второго клинка сохраняется
    const wRank = ['common', 'rare', 'epic', 'legendary', 'relic'].indexOf(wIt?.rarity ?? 'common');
    const magic = ['staff', 'wand', 'orb', 'tome', 'totemstaff', 'bell', 'runerifle'].includes(tpl);
    this.weaponSparkle = (wRank >= 2 ? wRank - 1 : 0) + (magic ? 1 : 0);
    this.weaponSparkleColor = wRank >= 1 ? RARITY_HEX[wIt!.rarity] : this.cls === 'summoner' ? 0x6ff0ff : 0x9ad8ff;
    const ws = WEAPON_SCALE[this.cls];
    this.weapon.scale.multiplyScalar(ws);
    this.weapon2?.scale.multiplyScalar(ws);
    this.glowParts = [...this.classGlow, ...this.built.glow];
    this.spinParts = [...this.classSpin, ...this.built.spin];

    // Фактура ткани на плащах, мантиях и шляпах, дерево на щите
    const cloth = clothTex();
    texturize(this.root, { 0x34405a: cloth, 0x3f6a8a: cloth, 0x7a4a2a: cloth, 0x2a8f9a: cloth, 0x3b2f2a: cloth, 0x2c2733: cloth, 0x3b5552: cloth, 0xc8412f: cloth, 0x2f6b2c: cloth, 0x6b3fc4: cloth, 0x3f8f3a: cloth, 0x4e2a9a: cloth, 0x5a4636: cloth, 0x3a2a5a: cloth, 0xb5452f: woodTex() }, (hex, map) => toon(hex, { map }));
    bake(this.body);

    const relicCount = eq ? Object.values(eq).filter((i) => i?.rarity === 'relic').length : 0;
    const legendaryCount = eq ? Object.values(eq).filter((i) => i?.rarity === 'legendary').length : 0;
    const epicCount = eq ? Object.values(eq).filter((i) => i?.rarity === 'epic').length : 0;
    this.aura.visible = relicCount > 0 || legendaryCount > 0 || epicCount >= 2;
    (this.aura.material as THREE.MeshBasicMaterial) = relicCount > 0 ? glow(0xff2a2a, 0.7, false) : glow(legendaryCount > 0 ? 0xffb321 : 0xbe6bff, 0.6);
  }

  playCast(s: number) {
    this.castS = s;
    this.castT = 0;
    if (this.cls === 'werewolf' && s === 0) this.clawSide = -this.clawSide;
    const durs: Record<HeroClass, number[]> = {
      warrior: [0.32, 0.4, 0.3, 0.7],
      mage: [0.3, 0.4, 0.45, 0.8],
      archer: [0.28, 0.35, 0.35, 0.6],
      hunter: [0.22, 0.25, 0.32, 0.7],
      summoner: [0.3, 0.55, 0.6, 0.45],
      werewolf: [0.34, 0.4, 0.8, 0.9],
      dwarf: [0.3, 0.45, 0.55, 0.65],
    };
    this.castDur = durs[this.cls][s];
  }

  pop() {
    this.popT = 0.18;
  }

  cheer() {
    this.cheerT = 0;
  }

  update(dt: number, st: HeroAnimInput) {
    this.t += dt;
    this.castT += dt;
    this.cheerT += dt;
    const t = this.t;

    // Моргание
    this.blinkT -= dt;
    const blink = this.blinkT < 0.1 && this.blinkT > 0;
    if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 3.5;
    for (const e of this.eyes) e.scale.y = blink || st.dead ? 0.15 : 1;

    // Смерть
    if (st.dead) this.deadT = Math.min(1, this.deadT + dt * 3);
    else this.deadT = Math.max(0, this.deadT - dt * 4);

    const sp = st.frozen || st.stun ? 0 : Math.min(1.2, st.speed);
    this.walkPhase += dt * (4 + sp * 9) * (sp > 0.05 ? 1 : 0);
    const swing = Math.sin(this.walkPhase) * 0.75 * Math.min(1, sp * 1.5);

    // База. Вертикаль тела теперь даёт сгиб ног (см. «прилипание» стоп ниже),
    // bodyY < 0 означает присед, > 0 — прыжок
    let bodyY = 0;
    const mvK = Math.min(1, sp * 1.5);
    const runK = Math.min(1, Math.max(0, (sp - 0.35) / 0.45));
    let elbL = NaN;
    let elbR = NaN;
    /** Держит ли рука оружие, которое должно оставаться ровным при сгибе локтя. */
    let keepL = false;
    let keepR = false;
    const breathe = 1 + Math.sin(t * 2.2) * 0.018;
    let armLx = -swing * 0.9;
    let armRx = swing * 0.9;
    let armLz = -0.12;
    let armRz = 0.12;
    let torsoYaw = 0;
    let lean = sp * 0.12;
    let headTilt = 0;
    let bodyRoll = 0;
    let legAmp = 1;

    // Оружие в руке в покое
    if (this.cls === 'warrior') {
      // Меч у бедра остриём вперёд, щит прикрывает корпус
      armRx = Math.min(armRx, 0) * 0.6 - 0.1;
      armLx = -0.35 + armLx * 0.3;
      elbR = 0.3 + runK * 0.5;
      elbL = 1.25;
      keepL = true;
    } else if (this.cls === 'mage' || this.cls === 'summoner') {
      armRx = -0.2 + swing * 0.25;
      elbR = 0.85;
      keepR = this.weaponTpl !== 'tome';
    } else if (this.cls === 'hunter') {
      // Клинки наготове
      armRx = -0.1 + swing * 0.5;
      armLx = -0.1 - swing * 0.5;
      armLz = -0.25;
      armRz = 0.25;
      elbL = elbR = 0.55 + runK * 0.5;
    } else if (this.cls === 'werewolf') {
      // Звериная стойка: сутулится, когти растопырены
      armRx = -0.6 + swing * 0.6;
      armLx = -0.6 - swing * 0.6;
      armLz = -0.45;
      armRz = 0.45;
      elbL = elbR = 0.55;
      lean += 0.18 + this.beastK * 0.2;
      headTilt = -0.1 - this.beastK * 0.15;
      const run = Math.min(1, sp * 1.4);
      if (run > 0.05) {
        // Волчий бег: низко, длинными прыжками, когти отведены назад
        const ph = this.walkPhase;
        legAmp = 1 + run * 0.45;
        bodyY = Math.abs(Math.sin(ph)) * 0.2 * run;
        lean += run * (0.06 + Math.sin(ph * 2) * 0.03);
        armRx = -0.35 * (1 - run) + Math.sin(ph) * 1.15 * run + 0.35 * run;
        armLx = -0.35 * (1 - run) - Math.sin(ph) * 1.15 * run + 0.35 * run;
        armLz = -0.45 - run * 0.2;
        armRz = 0.45 + run * 0.2;
        elbL = elbR = 0.6 + run * 0.6;
        torsoYaw = Math.sin(ph) * 0.18 * run;
        bodyRoll = Math.sin(ph) * 0.05 * run;
        headTilt = -0.28 * run - this.beastK * 0.15;
      }
    } else if (this.cls === 'dwarf') {
      // Мушкетон у бедра, обеими руками
      armRx = -0.35 + swing * 0.15;
      armLx = -0.55 + swing * 0.15;
      armLz = 0.3;
      armRz = 0.05;
      elbR = 0.45;
      elbL = 0.75;
      keepR = true;
    } else {
      // Лук в опущенной левой руке
      armLx = -0.25 + armLx * 0.5;
      elbL = 0.35;
      keepL = true;
    }

    // Атаки и умения
    const k = this.castT / this.castDur;
    if (k < 1) {
      const e = Math.sin(k * Math.PI);
      const ease = 1 - Math.pow(1 - k, 3);
      if (this.cls === 'warrior') {
        if (this.castS === 0) {
          armRx = -2.6 + ease * 2.4;
          armRz = 0.4 - ease * 0.8;
          elbR = 1.6 * (1 - ease) + 0.15;
          torsoYaw = 0.6 - ease * 1.2;
        } else if (this.castS === 1) {
          armLx = -1.5;
          lean = 0.5 * e;
        } else if (this.castS === 3) {
          armLx = armRx = -2.8 * e;
          armLz = -0.5 * e;
          armRz = 0.5 * e;
          headTilt = -0.4 * e;
        }
      } else if (this.cls === 'mage') {
        if (this.castS === 0) {
          armRx = -1.6 * e - 0.2;
          lean = -0.1 * e;
        } else if (this.castS === 1) {
          armRx = armLx = -1.5 * e;
          lean = 0.15 * e;
        } else if (this.castS === 2) {
          armLz = -1.4 * e;
          armRz = 1.4 * e;
          bodyY += 0.25 * e;
        } else {
          armRx = armLx = -2.9 * e;
          headTilt = -0.5 * e;
        }
      } else if (this.cls === 'hunter') {
        if (this.castS === 0) {
          // Удар правым, затем левым клинком
          const k1 = Math.min(1, k * 2);
          const k2 = Math.max(0, k * 2 - 1);
          armRx = -2.3 + (1 - Math.pow(1 - k1, 3)) * 2.5;
          armRz = 0.6 - k1 * 0.9;
          armLx = k < 0.5 ? -1.2 : -2.3 + (1 - Math.pow(1 - k2, 3)) * 2.5;
          armLz = k < 0.5 ? -0.6 : -0.6 + k2 * 0.9;
          elbR = 1.4 * (1 - k1) + 0.15;
          elbL = k < 0.5 ? 1.3 : 1.4 * (1 - k2) + 0.15;
          torsoYaw = k < 0.5 ? 0.5 - k1 : -0.5 + k2;
        } else if (this.castS === 1) {
          armLx = armRx = 0.9;
          armLz = -0.4;
          armRz = 0.4;
          lean = 0.6 * e;
        } else if (this.castS === 2) {
          armRx = -1.4;
          armRz = 1.4 - ease * 2.2;
          torsoYaw = 0.8 - ease * 1.4;
        } else {
          armLz = -1.8 * e;
          armRz = 1.8 * e;
          armLx = armRx = -0.4 * e;
          headTilt = -0.5 * e;
          bodyY += 0.2 * e;
        }
      } else if (this.cls === 'werewolf') {
        if (this.castS === 0) {
          // Удар когтями поочерёдно: замах из-за плеча, рывок наискось через корпус с выпадом, возврат
          const sd = this.clawSide;
          let ax: number;
          let az: number;
          let yaw: number;
          let lunge = 0;
          if (k < 0.3) {
            const w = Math.sin((k / 0.3) * Math.PI * 0.5);
            ax = -2.7 * w;
            az = sd * (0.45 + 0.8 * w);
            yaw = -sd * 0.5 * w;
            lean -= 0.12 * w;
          } else if (k < 0.62) {
            const w = (k - 0.3) / 0.32;
            const f = 1 - Math.pow(1 - w, 3);
            ax = -2.7 + f * 3.2;
            az = sd * (1.25 - f * 1.6);
            yaw = -sd * 0.5 + f * sd * 1.1;
            lunge = Math.sin(w * Math.PI);
          } else {
            const w = (k - 0.62) / 0.38;
            ax = 0.5 - w * 1.1;
            az = sd * (-0.35 + w * 0.8);
            yaw = sd * 0.6 * (1 - w);
          }
          if (sd > 0) {
            armRx = ax;
            armRz = az;
            armLx = -1.0;
            armLz = -0.5;
          } else {
            armLx = ax;
            armLz = az;
            armRx = -1.0;
            armRz = 0.5;
          }
          const bend = k < 0.3 ? 1.3 * Math.sin((k / 0.3) * Math.PI * 0.5) : k < 0.62 ? 1.3 * (1 - (k - 0.3) / 0.32) + 0.1 : 0.1 + ((k - 0.62) / 0.38) * 0.45;
          if (sd > 0) elbR = bend;
          else elbL = bend;
          torsoYaw = yaw;
          lean += 0.3 * lunge;
          bodyY += 0.12 * lunge;
          headTilt = 0.15 * lunge;
        } else if (this.castS === 1) {
          // Присед перед прыжком
          bodyY -= 0.2 * e;
          armLx = armRx = 0.8 * e;
          lean += 0.35 * e;
        } else if (this.castS === 2) {
          // Вой: голова запрокинута, лапы разведены
          headTilt = -0.9 * e;
          armLz = -1.3 * e;
          armRz = 1.3 * e;
          armLx = armRx = 0.4 * e;
          lean = -0.35 * e;
        } else {
          // Превращение: тело сотрясает, лапы вверх
          armLx = armRx = -2.6 * e;
          armLz = -0.6 * e;
          armRz = 0.6 * e;
          bodyRoll = Math.sin(k * 40) * 0.06 * e;
          headTilt = -0.6 * e;
        }
      } else if (this.cls === 'dwarf') {
        if (this.castS === 0) {
          // Отдача мушкетона
          armRx = -1.55 + e * 0.5;
          armLx = -1.45 + e * 0.5;
          armLz = 0.3;
          lean = -0.25 * e;
        } else if (this.castS === 1) {
          // Бросок бочки левой рукой из-за головы
          armLx = -2.9 + ease * 3.2;
          armLz = -0.3;
          torsoYaw = 0.5 - ease * 0.9;
        } else if (this.castS === 2) {
          // Ставит турель: присел, руки вперёд
          bodyY -= 0.18 * e;
          armLx = armRx = -1.2 * e;
          lean = 0.35 * e;
        } else {
          // Прыжок и удар прикладом о землю
          const up = k < 0.5 ? Math.sin(k * 2 * Math.PI * 0.5) : 1 - (k - 0.5) * 2;
          bodyY += 0.5 * Math.max(0, up);
          armLx = armRx = k < 0.5 ? -2.8 : -2.8 + (k - 0.5) * 2 * 3.2;
          lean = k < 0.5 ? -0.2 : 0.35 * e;
        }
      } else if (this.cls === 'summoner') {
        if (this.castS === 0) {
          armRx = -1.7 * e - 0.2;
          lean = -0.08 * e;
        } else if (this.castS === 1 || this.castS === 2) {
          armLx = armRx = -2.6 * e;
          armLz = -0.4 * e;
          armRz = 0.4 * e;
          headTilt = -0.35 * e;
          bodyY += 0.15 * e;
        } else {
          armRx = -1.5 * e;
          armLx = -0.8 * e;
          lean = 0.15 * e;
        }
      } else {
        if ((this.castS === 0 || this.castS === 1) && this.weaponTpl === 'crossbow') {
          // Арбалет вскинут к плечу: ложа ровно, правая рука поддерживает цевьё, отдача в конце
          const kick = k > 0.45 ? Math.sin(((k - 0.45) / 0.55) * Math.PI) : 0;
          armLx = -0.95 + kick * 0.15;
          elbL = 0.7 - kick * 0.1;
          armRx = -1.25;
          armRz = -0.3;
          elbR = 0.35;
          torsoYaw = -0.25;
          headTilt = 0.12;
          lean -= kick * 0.06;
        } else if (this.castS === 0 || this.castS === 1) {
          // Лучная рука прямая, правая натягивает тетиву к щеке
          const draw = k < 0.7 ? k / 0.7 : 0;
          armLx = -1.55;
          elbL = 0.05;
          armRx = -1.5;
          armRz = 0.35 + draw * 0.35;
          elbR = 1.2 + draw * 1.0;
          torsoYaw = -0.35;
        } else if (this.castS === 3) {
          armLx = -2.4;
          armRx = -2.2;
          headTilt = -0.4;
        }
      }
    }
    if (st.whirl) {
      this.whirlA += dt * 18;
      armLz = -1.4;
      armRz = 1.4;
      armRx = -0.2;
    } else this.whirlA = 0;
    if (st.dash) lean = this.cls === 'warrior' ? 0.55 : this.cls === 'hunter' ? 0.7 : 0;
    if (this.cls === 'hunter' && st.dash) {
      armLx = armRx = 1.0;
      armLz = -0.5;
      armRz = 0.5;
    }
    if (this.cls === 'werewolf' && st.dash) {
      // Прыжок по дуге, лапы вперёд
      const pk = Math.min(1, this.castT / 0.4);
      bodyY = Math.sin(pk * Math.PI) * 1.3;
      armLx = armRx = -2.2;
      lean = 0.5 - pk * 0.6;
    }
    if (this.cls === 'archer' && st.dash) {
      // Кувырок
      bodyRoll = (this.castT / 0.3) * Math.PI * 2;
      bodyY = 0.2;
    }

    // Ликование (покупка в таверне)
    if (this.cheerT < 0.9) {
      const e = Math.sin((this.cheerT / 0.9) * Math.PI);
      bodyY += Math.abs(Math.sin(this.cheerT * 14)) * 0.25 * e;
      armLx = armRx = -2.8 * e;
    }

    // Ноги: шаг с коленями и стопами; присед — сгибом ног, а не опусканием тела
    const crouch = Math.max(0, -bodyY) + (this.cls === 'werewolf' ? 0.05 + this.beastK * 0.05 : 0);
    if (bodyY < 0) bodyY = 0;
    const B = this.B;
    for (const [pose, ph] of [
      [this.poseL, this.walkPhase],
      [this.poseR, this.walkPhase + Math.PI],
    ] as const) {
      gait(ph, mvK, runK, pose);
      pose.thigh *= legAmp;
      if (mvK < 0.05) pose.thigh += Math.sin(t * 0.8 + (pose === this.poseL ? 0 : Math.PI)) * 0.025;
      if (crouch > 0) {
        pose.thigh -= crouch * 1.7;
        pose.knee += crouch * 3.3;
        pose.ankle = -(pose.thigh + pose.knee);
      }
    }
    this.legL.rotation.set(this.poseL.thigh, 0, -0.03);
    this.legR.rotation.set(this.poseR.thigh, 0, 0.03);
    this.kneeL.rotation.x = this.poseL.knee;
    this.kneeR.rotation.x = this.poseR.knee;
    this.ankleL.rotation.x = this.poseL.ankle;
    this.ankleR.rotation.x = this.poseR.ankle;
    // Стопы на земле: тело опускается ровно настолько, насколько согнута опорная нога
    const drop = B.thigh + B.shin - Math.max(legHeight(this.poseL.thigh, this.poseL.knee, B.thigh, B.shin), legHeight(this.poseR.thigh, this.poseR.knee, B.thigh, B.shin));

    // Руки: плечо и локоть; по умолчанию локоть расслабленно согнут, на бегу — сильнее
    const relaxed = (ax: number) => 0.2 + Math.max(0, Math.min(1.6, -ax)) * 0.22 + runK * mvK * 0.95;
    if (Number.isNaN(elbL)) elbL = relaxed(armLx);
    if (Number.isNaN(elbR)) elbR = relaxed(armRx);
    if (st.whirl) elbL = elbR = 0.15;
    if (this.cheerT < 0.9) elbL = elbR = 0.3;
    this.armL.rotation.set(armLx, 0, armLz);
    this.armR.rotation.set(armRx, 0, armRz);
    this.elbowL.rotation.x = -elbL;
    this.elbowR.rotation.x = -elbR;
    // Посох, лук, мушкетон остаются ровными, когда сгибается локоть
    this.handL.rotation.x = keepL ? elbL : 0;
    // Арбалет остаётся ровным при любом взмахе плеча; на «Дожде стрел» — вверх
    if (this.cls === 'archer' && this.weaponTpl === 'crossbow') this.handL.rotation.x = elbL - armLx - (k < 1 && this.castS === 3 ? 1.0 : 0);
    this.handR.rotation.x = keepR ? elbR : 0;

    // Таз и плечи вращаются навстречу друг другу, таз покачивается
    const ps = Math.sin(this.walkPhase);
    this.hips.rotation.set(0, -ps * 0.14 * mvK, Math.cos(this.walkPhase) * 0.035 * mvK);
    this.torsoG.rotation.set(0, torsoYaw + ps * 0.12 * mvK, -Math.cos(this.walkPhase) * 0.02 * mvK);
    // Голова держит горизонт, слегка гасит наклон корпуса
    this.head.rotation.set(headTilt - lean * 0.45 + Math.sin(t * 1.3) * 0.02, -ps * 0.06 * mvK, 0);
    this.body.rotation.set(lean + bodyRoll, this.whirlA, 0);
    this.torsoG.scale.set(1, breathe, 1);

    // Мёртв — падает на спину
    if (this.deadT > 0) {
      this.body.rotation.x = -Math.PI / 2 * this.deadT;
      this.body.position.y = 0.3 * this.deadT;
    }

    // Отскок при ударе
    if (this.popT > 0) {
      this.popT -= dt;
      const p = Math.max(0, this.popT / 0.18);
      this.body.scale.set(1 + p * 0.12, 1 - p * 0.12, 1 + p * 0.12);
    } else this.body.scale.setScalar(1);
    // Пропорции класса и рост в звериной форме
    const beastOn = !!st.beast && !st.dead;
    this.beastK += ((beastOn ? 1 : 0) - this.beastK) * Math.min(1, dt * 5);
    const grow = 1 + this.beastK * 0.3;
    this.body.scale.multiply(this.bodyScale).multiplyScalar(grow);
    if (this.deadT <= 0) this.body.position.y = bodyY - drop * this.body.scale.y;
    this.beastG.visible = this.beastTorso.visible = this.beastHead.visible = this.beastK > 0.05;
    if (this.beastG.visible) this.beastRing?.scale.setScalar(1 + Math.sin(t * 8) * 0.1);
    if (this.tail) {
      this.tail.rotation.y = Math.sin(t * (sp > 0.1 ? 10 : 4)) * 0.35;
      this.tail.rotation.x = -0.2 + Math.sin(t * 2) * 0.08;
    }

    this.stunStars.visible = st.stun && !st.dead;
    if (this.stunStars.visible) this.stunStars.rotation.y += dt * 5;
    this.ice.visible = st.frozen && !st.dead;
    this.buffRing.visible = st.buff && !st.dead;
    if (this.buffRing.visible) this.buffRing.scale.setScalar(1 + Math.sin(t * 6) * 0.08);
    this.shieldBubble.visible = st.invuln && !st.dead;
    if (this.aura.visible) {
      this.aura.rotation.y += dt;
      this.aura.scale.setScalar(1 + Math.sin(t * 3) * 0.06);
    }
    for (const g of this.glowParts) g.scale.setScalar(1 + Math.sin(t * 4 + g.id) * 0.15);
    // Демоническая форма охотника
    const demon = !!st.demon && !st.dead;
    this.demonG.visible = this.demonTorso.visible = this.demonHead.visible = demon;
    if (demon) {
      const flap = Math.sin(t * 7) * 0.35;
      if (this.wings[0]) this.wings[0].rotation.y = 0.4 + flap;
      if (this.wings[1]) this.wings[1].rotation.y = -0.4 - flap;
      this.demonG.children[0]?.scale.setScalar(1 + Math.sin(t * 9) * 0.08);
    }
    if (this.spiritOrbs) {
      this.spiritOrbs.visible = !st.dead;
      this.spiritOrbs.rotation.y += dt * 1.6;
      this.spiritOrbs.children.forEach((o, i) => (o.position.y = Math.sin(t * 2.5 + i * 2.1) * 0.15));
    }
    for (const sp of this.spinParts) {
      if (sp.userData.spinAxis === 'z') sp.rotation.z += dt * 2.5;
      else sp.rotation.y += dt * 1.8;
    }
  }

  /** Позиция наконечника оружия/руки в мировых координатах — для эффектов. */
  handWorld(target: THREE.Vector3): THREE.Vector3 {
    return (this.cls === 'archer' ? this.handL : this.handR).getWorldPosition(target);
  }

  /** Кончик оружия в мировых координатах (для искр). */
  weaponTip(target: THREE.Vector3): THREE.Vector3 | null {
    const tip = this.weapon.userData.tip as THREE.Object3D | undefined;
    return tip ? tip.getWorldPosition(target) : null;
  }

  /** Вторая рука — для эффектов парного оружия. */
  offHandWorld(target: THREE.Vector3): THREE.Vector3 {
    return this.handL.getWorldPosition(target);
  }

  dispose() {
    this.root.removeFromParent();
  }
}

export const HERO_COLORS: Record<HeroClass, number> = { warrior: 0xe0533d, mage: 0x8a5cff, archer: 0x3dbb5a, hunter: 0x2fd07a, summoner: 0x2ab8c8, werewolf: 0xc27a3a, dwarf: 0xd08a2a };
export { DARK };
