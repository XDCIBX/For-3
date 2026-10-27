import * as THREE from 'three';
import type { Equip, HeroClass, Item, Rarity } from '@game/shared';
import { G, RARITY_HEX, blobShadow, glow, part, toon } from './toon';
import { clothTex, texturize, woodTex } from './textures';
import { bake, unbake } from './bake';
import { buildAmulet, buildArmor, buildBoots, buildHelmet, buildRing, buildWeapon, type Built, type Rig } from './equipment';

const SKIN = 0xffd3ac;
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
}

const LEG_COL: Record<HeroClass, number> = { warrior: 0x5a4636, mage: 0x3a2a5a, archer: 0x5a4636, hunter: 0x2c2733, summoner: 0x3b5552 };
const TORSO_COL: Record<HeroClass, number> = { warrior: 0xa9b4bf, mage: 0x6b3fc4, archer: 0x3f8f3a, hunter: 0x3b2f2a, summoner: 0x2a8f9a };
const SLEEVE_COL: Record<HeroClass, number> = { warrior: 0x8e9aa6, mage: 0x6b3fc4, archer: 0x3f8f3a, hunter: 0xe8b890, summoner: 0x2a8f9a };
const DEFAULT_WEAPON: Record<HeroClass, string> = { warrior: 'sword', mage: 'staff', archer: 'bow', hunter: 'glaives', summoner: 'totemstaff' };
const FEL = 0x5dff8a;
const SPIRIT = 0x6ff0ff;

const HELM_COLORS: Record<string, Record<Rarity, number>> = {
  helm: { common: 0x9aa6b2, rare: 0x5b8fd0, epic: 0x8a5ac7, legendary: 0xf0c04a },
  hood: { common: 0x7a6a55, rare: 0x2f6aa8, epic: 0x4a2f78, legendary: 0xc9343a },
};
function eye(x: number): THREE.Group {
  const g = new THREE.Group();
  const white = new THREE.Mesh(G.sphere(0.1, 14, 10), toon(0xffffff));
  white.scale.set(0.85, 1.15, 0.5);
  const pupil = new THREE.Mesh(G.sphere(0.06, 12, 8), toon(0x1a1210));
  pupil.position.set(0, -0.01, 0.04);
  pupil.scale.set(0.9, 1.1, 0.6);
  const hl = new THREE.Mesh(G.sphere(0.022, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  hl.position.set(0.02, 0.03, 0.075);
  g.add(white, pupil, hl);
  g.position.set(x, 0.02, 0.33);
  g.rotation.y = x * 0.9;
  return g;
}

/** Модель героя: чиби-пропорции, процедурная анимация, видимая экипировка. */
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
  private bootL!: THREE.Mesh;
  private bootR!: THREE.Mesh;
  private headgear = new THREE.Group();
  private weapon = new THREE.Group();
  private weapon2: THREE.Group | null = null;
  private demonG = new THREE.Group();
  private wings: THREE.Group[] = [];
  private spiritOrbs: THREE.Group | null = null;
  private built: Built = { parts: [], glow: [], spin: [] };
  private sleeves: THREE.Mesh[] = [];
  private baseSleeveColor = 0;
  private spinParts: THREE.Object3D[] = [];
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
  private castDur = 0.3;
  private blinkT = 2 + Math.random() * 3;
  private popT = 0;
  private deadT = 0;
  private cheerT = 99;
  private whirlA = 0;
  private equipKey = '';
  private baseTorsoColor: number;
  weaponTpl = '';

  constructor(cls: HeroClass) {
    this.cls = cls;
    // Группы с собственной анимацией (остальные склеиваются с родителем)
    for (const g of [this.torsoG, this.head, this.armL, this.armR, this.legL, this.legR]) g.userData.anim = true;
    this.root.add(blobShadow(1.4));
    this.root.add(this.body);
    this.body.add(this.hips, this.torsoG);
    this.hips.position.y = 0.55;
    this.torsoG.position.y = 0.55;

    // Ноги
    for (const [leg, x] of [
      [this.legL, -0.15],
      [this.legR, 0.15],
    ] as const) {
      leg.position.x = x;
      this.hips.add(leg);
      const l = part(G.capsule(0.1, 0.22), LEG_COL[cls], { pos: [0, -0.25, 0], outline: 0.025 });
      leg.add(l);
      const boot = part(G.sphere(0.14, 12, 8), 0x6a4428, { pos: [0, -0.47, 0.04], scale: [1, 0.7, 1.35], outline: 0.025 });
      leg.add(boot);
      if (x < 0) this.bootL = boot;
      else this.bootR = boot;
    }

    // Торс
    this.baseTorsoColor = TORSO_COL[cls];
    this.torso = part(G.capsule(0.3, 0.26), this.baseTorsoColor, { pos: [0, 0.32, 0], scale: [1, 1, 0.85], outline: 0.035 });
    this.torsoG.add(this.torso);
    const belt = part(G.cyl(0.31, 0.31, 0.09, 16), 0x5a3a22, { pos: [0, 0.12, 0], scale: [1, 1, 0.86], outline: 0.02 });
    const buckle = part(G.box(0.12, 0.09, 0.04), 0xffc93c, { pos: [0, 0.12, 0.27], outline: 0.015 });
    this.torsoG.add(belt, buckle);

    // Руки
    for (const [arm, hand, x] of [
      [this.armL, this.handL, -0.37],
      [this.armR, this.handR, 0.37],
    ] as const) {
      arm.position.set(x, 0.6, 0);
      this.torsoG.add(arm);
      const sleeve = SLEEVE_COL[cls];
      this.baseSleeveColor = sleeve;
      const sl = part(G.capsule(0.085, 0.22), sleeve, { pos: [0, -0.2, 0], outline: 0.022 });
      this.sleeves.push(sl);
      arm.add(sl);
      const h = part(G.sphere(0.1, 12, 8), cls === 'warrior' ? 0x7d8894 : cls === 'hunter' ? 0x2c2733 : SKIN, { pos: [0, -0.42, 0], outline: 0.022 });
      arm.add(h);
      hand.position.set(0, -0.42, 0);
      arm.add(hand);
      arm.rotation.z = x < 0 ? -0.12 : 0.12;
    }

    // Голова
    this.head.position.y = 0.98;
    this.torsoG.add(this.head);
    const headM = part(G.sphere(0.4, 20, 16), SKIN, { outline: 0.035 });
    headM.scale.set(1.05, 0.97, 1);
    this.head.add(headM);
    // У охотника глаза скрыты повязкой
    this.eyes = cls === 'hunter' ? [] : [eye(-0.14), eye(0.14)];
    for (const e of this.eyes) e.userData.anim = true;
    if (this.eyes.length) this.head.add(...this.eyes);
    const cheek = toon(0xff9a8a, { transparent: true, opacity: 0.6 });
    for (const x of [-0.23, 0.23]) {
      const c = new THREE.Mesh(G.sphere(0.06, 8, 6), cheek);
      c.position.set(x, -0.1, 0.3);
      c.scale.set(1, 0.6, 0.4);
      this.head.add(c);
    }
    const nose = part(G.sphere(0.055, 8, 6), 0xf5b98f, { pos: [0, -0.04, 0.39], outline: 0.015 });
    this.head.add(nose);
    this.head.add(this.headgear);

    this.buildClassParts();

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

  private buildClassParts() {
    const cls = this.cls;
    if (cls === 'warrior') {
      // Наплечники
      for (const x of [-0.37, 0.37]) {
        const p = part(G.halfSphere(0.17), 0x8e9aa6, { pos: [x, 0.62, 0], scale: [1.1, 0.8, 1], outline: 0.025 });
        this.torsoG.add(p);
        this.trimMeshes.push(p);
      }
      // Плащ
      const cape = part(G.box(0.62, 0.8, 0.05), 0xc8412f, { pos: [0, 0.26, -0.3], rot: [0.12, 0, 0], outline: 0.025 });
      this.torsoG.add(cape);
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
      this.glowParts.push(slit);
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
      this.glowParts.push(tat);
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
        const band = new THREE.Mesh(G.torus(0.088, 0.012, Math.PI * 2, 4, 14), toon(FEL, { emissive: FEL, emissiveIntensity: 0.8 }));
        band.position.y = y;
        band.rotation.x = Math.PI / 2;
        arm.add(band);
      }
      arm.add(part(G.cyl(0.1, 0.09, 0.13, 10), 0x1c1820, { pos: [0, -0.33, 0], outline: 0.012 }));
    }
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
      wing.position.set(s * 0.12, 1.05, -0.3);
      this.wings.push(wing);
      this.demonG.add(wing);
    }
    const flame = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.95, 32).rotateX(-Math.PI / 2), glow(FEL, 0.55));
    flame.position.y = 0.06;
    this.demonG.add(flame);
    for (const s of [-1, 1]) {
      const horn = part(G.cone(0.07, 0.38, 8), 0x1a1210, { pos: [s * 0.25, 1.38, 0.05], rot: [-0.5, 0, -s * 0.35], outline: 0.015 });
      this.demonG.add(horn);
    }
    this.demonG.visible = false;
    this.body.add(this.demonG);
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
    this.glowParts.push(amulet);
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

  private buildHeadgear(it: Item | null) {
    this.headgear.clear();
    const r = it?.rarity ?? 'common';
    const glowing = r === 'legendary' || r === 'epic';
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
    if (it?.rarity === 'legendary') {
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
    const rig: Rig = { torso: this.torsoG, head: this.head, armL: this.armL, armR: this.armR, legL: this.legL, legR: this.legR };

    // Доспех: своя модель для лат, мантии и кожаного доспеха
    const armor = eq?.armor ?? null;
    let torsoCol = this.baseTorsoColor;
    let sleeveCol = this.baseSleeveColor;
    let metal = this.cls === 'warrior';
    if (armor) ({ torso: torsoCol, sleeve: sleeveCol, metal } = buildArmor(rig, armor.tpl, armor.rarity, this.cls, this.built));
    this.torso.material = toon(torsoCol, metal ? {} : { map: clothTex() });
    for (const sl of this.sleeves) sl.material = toon(sleeveCol, metal ? {} : { map: clothTex() });
    for (const m of this.trimMeshes) {
      if (this.cls === 'mage') m.material = toon(armor?.tpl === 'robe' ? torsoCol : this.baseTorsoColor, { map: clothTex() });
      else m.visible = !armor; // классовые наплечники воина заменяет доспех
    }

    // Обувь
    const boots = eq?.boots ?? null;
    const bc = boots ? buildBoots(rig, boots.tpl, boots.rarity, this.built) : 0x6a4428;
    this.bootL.material = this.bootR.material = toon(bc);

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
    if (this.cls === 'hunter') {
      // Парное оружие: по клинку в каждой руке
      this.weapon2 = buildWeapon(tpl, wIt?.rarity ?? 'common', this.built);
      for (const [w, hand, s] of [
        [this.weapon, this.handR, 1],
        [this.weapon2, this.handL, -1],
      ] as const) {
        hand.add(w);
        w.rotation.set(Math.PI / 2 - 0.35, 0, 0);
        w.scale.set(s, 1, 1);
        w.position.set(0, 0, 0.02);
      }
    } else if (this.cls === 'summoner' && tpl === 'tome') {
      this.handR.add(this.weapon);
      this.weapon.rotation.set(0.3, 0, 0);
      this.weapon.position.set(0, -0.05, 0.08);
    } else if (this.cls === 'archer') {
      this.handL.add(this.weapon);
      this.weapon.rotation.set(tpl === 'crossbow' ? 0 : Math.PI / 2, 0, 0);
    } else {
      this.handR.add(this.weapon);
      this.weapon.rotation.set(this.cls === 'warrior' ? Math.PI / 2 - 0.45 : Math.PI / 2, 0, 0);
      this.weapon.position.set(0, 0, 0.02);
    }

    this.glowParts = this.built.glow;
    this.spinParts = this.built.spin;

    // Фактура ткани на плащах, мантиях и шляпах, дерево на щите
    const cloth = clothTex();
    texturize(this.root, { 0x2a8f9a: cloth, 0x3b2f2a: cloth, 0x2c2733: cloth, 0x3b5552: cloth, 0xc8412f: cloth, 0x2f6b2c: cloth, 0x6b3fc4: cloth, 0x3f8f3a: cloth, 0x4e2a9a: cloth, 0x5a4636: cloth, 0x3a2a5a: cloth, 0xb5452f: woodTex() }, (hex, map) => toon(hex, { map }));
    bake(this.body);

    const legendaryCount = eq ? Object.values(eq).filter((i) => i?.rarity === 'legendary').length : 0;
    const epicCount = eq ? Object.values(eq).filter((i) => i?.rarity === 'epic').length : 0;
    this.aura.visible = legendaryCount > 0 || epicCount >= 2;
    (this.aura.material as THREE.MeshBasicMaterial) = glow(legendaryCount > 0 ? 0xffb321 : 0xbe6bff, 0.6);
  }

  playCast(s: number) {
    this.castS = s;
    this.castT = 0;
    const durs: Record<HeroClass, number[]> = {
      warrior: [0.32, 0.4, 0.3, 0.7],
      mage: [0.3, 0.4, 0.45, 0.8],
      archer: [0.28, 0.35, 0.35, 0.6],
      hunter: [0.22, 0.25, 0.32, 0.7],
      summoner: [0.3, 0.55, 0.6, 0.45],
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

    // База
    let bodyY = Math.abs(Math.sin(this.walkPhase)) * 0.09 * Math.min(1, sp * 1.5);
    const breathe = 1 + Math.sin(t * 2.2) * 0.018;
    let armLx = -swing * 0.9;
    let armRx = swing * 0.9;
    let armLz = -0.12;
    let armRz = 0.12;
    let torsoYaw = 0;
    let lean = sp * 0.12;
    let headTilt = 0;
    let bodyRoll = 0;

    // Оружие в руке в покое
    if (this.cls === 'warrior') {
      armRx = Math.min(armRx, 0) - 0.35;
      armLx = -0.5 + armLx * 0.3;
    } else if (this.cls === 'mage' || this.cls === 'summoner') {
      armRx = -0.25 + swing * 0.3;
    } else if (this.cls === 'hunter') {
      // Клинки наготове
      armRx = -0.45 + swing * 0.4;
      armLx = -0.45 - swing * 0.4;
      armLz = -0.3;
      armRz = 0.3;
    } else {
      armLx = -0.3 + armLx * 0.5;
    }

    // Атаки и умения
    const k = this.castT / this.castDur;
    if (k < 1) {
      const e = Math.sin(k * Math.PI);
      const ease = 1 - Math.pow(1 - k, 3);
      if (this.cls === 'warrior') {
        if (this.castS === 0) {
          armRx = -2.6 + ease * 2.6;
          armRz = 0.4 - ease * 0.8;
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
        if (this.castS === 0 || this.castS === 1) {
          armLx = -1.55;
          armRx = -1.45;
          armRz = 0.3 + (k < 0.7 ? k * 0.6 : 0);
          torsoYaw = -0.25;
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

    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.set(armLx, 0, armLz);
    this.armR.rotation.set(armRx, 0, armRz);
    this.torsoG.rotation.y = torsoYaw;
    this.head.rotation.x = headTilt + Math.sin(t * 1.3) * 0.03;
    this.body.position.y = bodyY;
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
    this.demonG.visible = demon;
    if (demon) {
      const flap = Math.sin(t * 7) * 0.35;
      if (this.wings[0]) this.wings[0].rotation.y = 0.4 + flap;
      if (this.wings[1]) this.wings[1].rotation.y = -0.4 - flap;
      this.demonG.children[2]?.scale.setScalar(1 + Math.sin(t * 9) * 0.08);
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

  /** Вторая рука — для эффектов парного оружия. */
  offHandWorld(target: THREE.Vector3): THREE.Vector3 {
    return this.handL.getWorldPosition(target);
  }

  dispose() {
    this.root.removeFromParent();
  }
}

export const HERO_COLORS: Record<HeroClass, number> = { warrior: 0xe0533d, mage: 0x8a5cff, archer: 0x3dbb5a, hunter: 0x2fd07a, summoner: 0x2ab8c8 };
export { DARK };
