import * as THREE from 'three';
import type { Equip, HeroClass, Item, Rarity } from '@game/shared';
import { G, RARITY_HEX, addOutline, blobShadow, glow, part, toon } from './toon';
import { clothTex, texturize, woodTex } from './textures';
import { bake, unbake } from './bake';

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
}

const ARMOR_COLORS: Record<string, Record<Rarity, number>> = {
  plate: { common: 0xa9b4bf, rare: 0x6f9ed8, epic: 0x8e62c9, legendary: 0xe7b84a },
  robe: { common: 0x8d7c62, rare: 0x3f6fcc, epic: 0x7b3fc6, legendary: 0xd2493a },
  leather: { common: 0x8a5a33, rare: 0x2f7c6c, epic: 0x433468, legendary: 0xcf5a22 },
};
const HELM_COLORS: Record<string, Record<Rarity, number>> = {
  helm: { common: 0x9aa6b2, rare: 0x5b8fd0, epic: 0x8a5ac7, legendary: 0xf0c04a },
  hood: { common: 0x7a6a55, rare: 0x2f6aa8, epic: 0x4a2f78, legendary: 0xc9343a },
};
const BOOT_COLORS: Record<Rarity, number> = { common: 0x6a4428, rare: 0x34557f, epic: 0x55307a, legendary: 0xd9a52a };
const METAL: Record<Rarity, number> = { common: 0xd6dde3, rare: 0x8fd0ff, epic: 0xd4a6ff, legendary: 0xffe07a };

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
  private extras = new THREE.Group();
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
      const l = part(G.capsule(0.1, 0.22), cls === 'mage' ? 0x3a2a5a : 0x5a4636, { pos: [0, -0.25, 0], outline: 0.025 });
      leg.add(l);
      const boot = part(G.sphere(0.14, 12, 8), 0x6a4428, { pos: [0, -0.47, 0.04], scale: [1, 0.7, 1.35], outline: 0.025 });
      leg.add(boot);
      if (x < 0) this.bootL = boot;
      else this.bootR = boot;
    }

    // Торс
    this.baseTorsoColor = cls === 'warrior' ? 0xa9b4bf : cls === 'mage' ? 0x6b3fc4 : 0x3f8f3a;
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
      const sleeve = cls === 'mage' ? 0x6b3fc4 : cls === 'warrior' ? 0x8e9aa6 : 0x3f8f3a;
      arm.add(part(G.capsule(0.085, 0.22), sleeve, { pos: [0, -0.2, 0], outline: 0.022 }));
      const h = part(G.sphere(0.1, 12, 8), cls === 'warrior' ? 0x7d8894 : SKIN, { pos: [0, -0.42, 0], outline: 0.022 });
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
    this.eyes = [eye(-0.14), eye(0.14)];
    for (const e of this.eyes) e.userData.anim = true;
    this.head.add(...this.eyes);
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

  private buildWeapon(it: Item | null) {
    this.weapon.clear();
    this.weapon.removeFromParent();
    const r: Rarity = it?.rarity ?? 'common';
    const metal = METAL[r];
    const shine = r === 'epic' || r === 'legendary';
    const metalMat = shine ? toon(metal, { emissive: RARITY_HEX[r], emissiveIntensity: 0.45 }) : toon(metal);
    const tpl = it?.tpl ?? (this.cls === 'warrior' ? 'sword' : this.cls === 'mage' ? 'staff' : 'bow');
    this.weaponTpl = tpl;
    const w = this.weapon;
    const metalPart = (geo: THREE.BufferGeometry, pos: [number, number, number], rot?: [number, number, number], scale?: [number, number, number]) => {
      const m = new THREE.Mesh(geo, metalMat);
      m.position.set(...pos);
      if (rot) m.rotation.set(...rot);
      if (scale) m.scale.set(...scale);
      addOutline(m, 0.02);
      return m;
    };
    const wood = 0x8a5a2b;
    switch (tpl) {
      case 'sword': {
        w.add(part(G.cyl(0.04, 0.04, 0.22, 8), 0x5a3a22, { pos: [0, 0, 0], outline: 0.015 }));
        w.add(part(G.sphere(0.06, 8, 6), 0xffc93c, { pos: [0, -0.13, 0], outline: 0.015 }));
        w.add(part(G.box(0.36, 0.06, 0.08), 0xffc93c, { pos: [0, 0.12, 0], outline: 0.015 }));
        w.add(metalPart(G.box(0.12, 0.85, 0.035), [0, 0.57, 0]));
        w.add(metalPart(G.cone(0.085, 0.16, 4), [0, 1.07, 0], [0, Math.PI / 4, 0], [1, 1, 0.35]));
        break;
      }
      case 'axe': {
        w.add(part(G.cyl(0.04, 0.045, 0.95, 8), wood, { pos: [0, 0.35, 0], outline: 0.015 }));
        const blade = metalPart(G.cyl(0.32, 0.32, 0.05, 16, ), [0.16, 0.7, 0], [Math.PI / 2, 0, 0], [0.8, 1, 1.1]);
        w.add(blade);
        w.add(metalPart(G.box(0.1, 0.16, 0.08), [-0.08, 0.7, 0]));
        break;
      }
      case 'hammer': {
        w.add(part(G.cyl(0.04, 0.045, 0.9, 8), wood, { pos: [0, 0.32, 0], outline: 0.015 }));
        w.add(metalPart(G.box(0.48, 0.28, 0.28), [0, 0.82, 0]));
        w.add(part(G.box(0.5, 0.06, 0.3), 0xffc93c, { pos: [0, 0.82, 0], outline: false }));
        break;
      }
      case 'staff':
      case 'wand':
      case 'orb': {
        const long = tpl === 'staff';
        const len = long ? 1.55 : tpl === 'wand' ? 0.7 : 0.5;
        w.add(part(G.cyl(0.035, 0.045, len, 8), tpl === 'wand' ? 0xe8d9b5 : wood, { pos: [0, len / 2 - 0.25, 0], outline: 0.015 }));
        const top = len - 0.25;
        const orbCol = r === 'common' ? 0x7fd8ff : RARITY_HEX[r];
        const orb = new THREE.Mesh(G.sphere(tpl === 'orb' ? 0.16 : 0.12, 16, 12), toon(orbCol, { emissive: orbCol, emissiveIntensity: 0.9 }));
        orb.position.y = top + 0.12;
        addOutline(orb, 0.02);
        const halo = new THREE.Mesh(G.sphere(0.24, 12, 8), glow(orbCol, 0.25));
        halo.position.copy(orb.position);
        this.glowParts.push(halo);
        w.add(orb, halo);
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2;
          w.add(metalPart(G.cone(0.03, 0.2, 5), [Math.cos(a) * 0.1, top + 0.03, Math.sin(a) * 0.1], [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5]));
        }
        break;
      }
      case 'bow':
      case 'recurve':
      case 'crossbow': {
        if (tpl === 'crossbow') {
          w.add(part(G.box(0.1, 0.08, 0.7), wood, { pos: [0, 0, 0.15], outline: 0.015 }));
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
          w.add(part(G.cyl(0.008, 0.008, span, 4), 0xf5f0e0, { pos: [0, 0, 0.12 + 0.36 * Math.cos(arc / 2)], rot: [0, 0, Math.PI / 2], outline: false }));
          w.add(part(G.cyl(0.015, 0.015, 0.5, 4), 0xc9a36a, { pos: [0, 0.06, 0.3], rot: [Math.PI / 2, 0, 0], outline: false }));
        } else {
          const arc = tpl === 'recurve' ? Math.PI * 0.95 : Math.PI * 0.75;
          const rad = tpl === 'recurve' ? 0.5 : 0.62;
          const limb = new THREE.Mesh(G.torus(rad, 0.035, arc, 6, 20), toon(r === 'common' ? wood : metal, shine ? { emissive: RARITY_HEX[r], emissiveIntensity: 0.4 } : {}));
          addOutline(limb, 0.018);
          limb.rotation.z = -arc / 2;
          limb.position.x = -rad * 0.82;
          const limbG = new THREE.Group();
          limbG.add(limb);
          const sx = rad * Math.cos(arc / 2) - rad * 0.82;
          const sy = rad * Math.sin(arc / 2);
          const string = new THREE.Mesh(G.cyl(0.008, 0.008, sy * 2, 4), toon(0xf5f0e0));
          string.position.x = sx;
          limbG.add(string);
          limbG.add(part(G.cyl(0.05, 0.05, 0.18, 8), 0x5a3a22, { pos: [rad * 0.18, 0, 0], outline: 0.012 }));
          // Лук вертикально, тетива к стрелку
          limbG.rotation.set(Math.PI / 2, Math.PI / 2, 0);
          w.add(limbG);
        }
        break;
      }
    }
    if (this.cls === 'archer') {
      this.handL.add(w);
      w.position.set(0, 0, 0);
      w.rotation.set(0, 0, 0);
      w.rotation.set(tpl === 'crossbow' ? 0 : Math.PI / 2, 0, 0);
    } else {
      this.handR.add(w);
      w.rotation.set(this.cls === 'warrior' ? Math.PI / 2 - 0.45 : Math.PI / 2, 0, 0);
      w.position.set(0, 0, 0.02);
    }
    if (shine) {
      const sparkle = new THREE.Mesh(G.sphere(0.12, 8, 6), glow(RARITY_HEX[r], 0.5));
      sparkle.position.y = this.cls === 'mage' ? 1.3 : 0.7;
      this.glowParts.push(sparkle);
      w.add(sparkle);
    }
  }

  setEquip(eq: Equip | null) {
    const key = eq ? Object.values(eq).map((i) => (i ? i.id : '-')).join('|') : 'none';
    if (key === this.equipKey) return;
    this.equipKey = key;
    unbake(this.body);
    this.glowParts = [];
    this.extras.clear();
    this.extras.removeFromParent();
    this.torsoG.add(this.extras);

    const armor = eq?.armor ?? null;
    const torsoCol = armor ? ARMOR_COLORS[armor.tpl]?.[armor.rarity] ?? this.baseTorsoColor : this.baseTorsoColor;
    const isMetal = this.cls === 'warrior' && (!armor || armor.tpl === 'plate');
    this.torso.material = toon(torsoCol, isMetal ? {} : { map: clothTex() });
    const trimCol = this.cls === 'mage' ? torsoCol : armor ? ARMOR_COLORS[armor.tpl]?.[armor.rarity] ?? 0x8e9aa6 : 0x8e9aa6;
    for (const m of this.trimMeshes) m.material = toon(trimCol, this.cls === 'mage' ? { map: clothTex() } : {});
    if (armor && armor.rarity !== 'common') {
      // Наплечники/воротник цвета редкости
      for (const x of [-0.36, 0.36]) {
        const pad = part(G.halfSphere(0.15), RARITY_HEX[armor.rarity], { pos: [x, 0.66, 0], scale: [1.15, 0.7, 1.1], outline: 0.02 });
        this.extras.add(pad);
      }
    }
    if (armor && (armor.rarity === 'epic' || armor.rarity === 'legendary')) {
      const emblem = new THREE.Mesh(G.ico(0.08, 0), toon(RARITY_HEX[armor.rarity], { emissive: RARITY_HEX[armor.rarity], emissiveIntensity: 0.6 }));
      emblem.position.set(0, 0.35, 0.29);
      this.extras.add(emblem);
    }

    const boots = eq?.boots ?? null;
    const bc = boots ? BOOT_COLORS[boots.rarity] : 0x6a4428;
    this.bootL.material = this.bootR.material = toon(bc);
    for (const b of [this.bootL, this.bootR]) b.children.filter((c) => c.name === 'wing').forEach((c) => b.remove(c));
    if (boots && (boots.rarity === 'legendary' || boots.rarity === 'epic')) {
      for (const b of [this.bootL, this.bootR]) {
        const wing = part(G.box(0.03, 0.12, 0.22), 0xffffff, { pos: [b === this.bootL ? -0.14 : 0.14, 0.12, -0.08], rot: [0.5, 0, 0], outline: 0.015 });
        wing.name = 'wing';
        b.add(wing);
      }
    }

    const am = eq?.amulet ?? null;
    if (am) {
      const chain = part(G.torus(0.2, 0.015, Math.PI, 4, 16), 0xffd54a, { pos: [0, 0.6, 0.18], rot: [Math.PI / 2 + 0.6, 0, Math.PI], outline: false });
      const gem = new THREE.Mesh(G.ico(0.07, 0), toon(RARITY_HEX[am.rarity], { emissive: RARITY_HEX[am.rarity], emissiveIntensity: 0.7 }));
      gem.position.set(0, 0.47, 0.3);
      addOutline(gem, 0.015);
      this.extras.add(chain, gem);
    }
    const ring = eq?.ring ?? null;
    this.handR.children.filter((c) => c.name === 'ring').forEach((c) => this.handR.remove(c));
    if (ring) {
      const rm = new THREE.Mesh(G.torus(0.08, 0.025, Math.PI * 2, 6, 12), toon(RARITY_HEX[ring.rarity], { emissive: RARITY_HEX[ring.rarity], emissiveIntensity: 0.5 }));
      rm.name = 'ring';
      rm.rotation.x = Math.PI / 2;
      rm.position.y = 0.04;
      this.handR.add(rm);
    }

    this.buildHeadgear(eq?.helmet ?? null);
    // Фактура ткани на плащах, мантиях и шляпах, дерево на щите
    const cloth = clothTex();
    texturize(this.root, { 0xc8412f: cloth, 0x2f6b2c: cloth, 0x6b3fc4: cloth, 0x3f8f3a: cloth, 0x4e2a9a: cloth, 0x5a4636: cloth, 0x3a2a5a: cloth, 0xb5452f: woodTex() }, (hex, map) => toon(hex, { map }));
    bake(this.body);
    this.buildWeapon(eq?.weapon ?? null);

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
    } else if (this.cls === 'mage') {
      armRx = -0.25 + swing * 0.3;
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
    if (st.dash) lean = this.cls === 'warrior' ? 0.55 : 0;
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
  }

  /** Позиция наконечника оружия/руки в мировых координатах — для эффектов. */
  handWorld(target: THREE.Vector3): THREE.Vector3 {
    return (this.cls === 'archer' ? this.handL : this.handR).getWorldPosition(target);
  }

  dispose() {
    this.root.removeFromParent();
  }
}

export const HERO_COLORS: Record<HeroClass, number> = { warrior: 0xe0533d, mage: 0x8a5cff, archer: 0x3dbb5a };
export { DARK };
