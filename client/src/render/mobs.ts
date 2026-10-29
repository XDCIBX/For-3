import * as THREE from 'three';
import type { MobKind } from '@game/shared';
import { G, addOutline, blobShadow, glow, part, toon } from './toon';
import { bake } from './bake';

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

function biped(o: { skin: number; torsoCol: number; legCol: number; bodyR: number; bodyH: number; headR: number; legLen: number; armLen: number; armR: number; hipW: number }): Rig {
  const body = new THREE.Group();
  const hipY = o.legLen + 0.05;
  const legL = new THREE.Group();
  const legR = new THREE.Group();
  for (const [leg, s] of [
    [legL, -1],
    [legR, 1],
  ] as const) {
    leg.position.set(s * o.hipW, hipY, 0);
    leg.add(part(G.capsule(o.armR * 1.1, o.legLen * 0.6), o.legCol, { pos: [0, -o.legLen / 2, 0], outline: 0.025 }));
    leg.add(part(G.sphere(o.armR * 1.4, 10, 8), o.skin, { pos: [0, -o.legLen + 0.02, 0.05], scale: [1, 0.6, 1.4], outline: 0.02 }));
    body.add(leg);
  }
  const torso = new THREE.Group();
  torso.position.y = hipY;
  body.add(torso);
  torso.add(part(G.capsule(o.bodyR, o.bodyH), o.torsoCol, { pos: [0, o.bodyH / 2 + o.bodyR * 0.6, 0], scale: [1, 1, 0.85], outline: 0.035 }));
  const shoulderY = o.bodyH + o.bodyR * 0.9;
  const armL = new THREE.Group();
  const armR = new THREE.Group();
  const handL = new THREE.Group();
  const handR = new THREE.Group();
  for (const [arm, hand, s] of [
    [armL, handL, -1],
    [armR, handR, 1],
  ] as const) {
    arm.position.set(s * (o.bodyR + o.armR * 0.6), shoulderY, 0);
    arm.add(part(G.capsule(o.armR, o.armLen * 0.7), o.skin, { pos: [0, -o.armLen / 2, 0], outline: 0.022 }));
    arm.add(part(G.sphere(o.armR * 1.3, 10, 8), o.skin, { pos: [0, -o.armLen, 0], outline: 0.02 }));
    hand.position.y = -o.armLen;
    arm.add(hand);
    arm.rotation.z = s * 0.15;
    torso.add(arm);
  }
  const head = new THREE.Group();
  head.position.y = shoulderY + o.headR * 0.85;
  torso.add(head);
  for (const g of [body, torso, head, armL, armR, legL, legR]) g.userData.anim = true;
  return { body, torso, head, armL, armR, legL, legR, handL, handR };
}

export class MobModel {
  readonly kind: MobKind;
  readonly root = new THREE.Group();
  private rig: Rig | null = null;
  private slime: THREE.Group | null = null;
  private inner = new THREE.Group();
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
        g.userData.anim = true;
        this.slime = g;
        this.inner.add(g);
        shadow = 1.3;
        height = 1.0;
        break;
      }
      case 'goblin': {
        const skin = 0x7a8f4a;
        const r = biped({ skin, torsoCol: 0x6a4a30, legCol: 0x4d3a27, bodyR: 0.2, bodyH: 0.24, headR: 0.3, legLen: 0.52, armLen: 0.5, armR: 0.06, hipW: 0.1 });
        shrinkHead(r, 0.3, 0.72);
        const head = part(G.sphere(0.3, 16, 12), skin, { outline: 0.03 });
        head.scale.set(1.15, 0.95, 1);
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
        const bone = 0xd8ceb4;
        const r = biped({ skin: bone, torsoCol: 0x3a342e, legCol: bone, bodyR: 0.16, bodyH: 0.32, headR: 0.28, legLen: 0.64, armLen: 0.56, armR: 0.04, hipW: 0.1 });
        shrinkHead(r, 0.28, 0.7);
        // Рёбра поверх торса
        for (let i = 0; i < 3; i++) r.torso.add(part(G.torus(0.17 - i * 0.015, 0.025, Math.PI * 2, 4, 14), bone, { pos: [0, 0.26 + i * 0.1, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 0.8, 1], outline: false }));
        const skull = part(G.sphere(0.28, 16, 12), bone, { outline: 0.03 });
        r.head.add(skull);
        r.head.add(part(G.box(0.28, 0.12, 0.2), bone, { pos: [0, -0.2, 0.08], outline: 0.02 }));
        for (const s of [-1, 1]) {
          const sock = new THREE.Mesh(G.sphere(0.075, 10, 8), toon(0x1a1210));
          sock.position.set(s * 0.1, 0.0, 0.23);
          sock.scale.set(1, 1.1, 0.5);
          const glowEye = new THREE.Mesh(G.sphere(0.03, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff4a3a }));
          glowEye.position.set(s * 0.1, 0.0, 0.26);
          r.head.add(sock, glowEye);
        }
        // Шлем-шапка
        r.head.add(part(G.halfSphere(0.3), 0x6a5a48, { pos: [0, 0.06, 0], outline: 0.02 }));
        // Лук
        const bow = new THREE.Group();
        const arc = Math.PI * 0.75;
        const limb = new THREE.Mesh(G.torus(0.5, 0.03, arc, 6, 16), toon(0x4a3626));
        addOutline(limb, 0.015);
        limb.rotation.z = -arc / 2;
        limb.position.x = -0.42;
        bow.add(limb);
        bow.rotation.set(Math.PI / 2, Math.PI / 2, 0);
        const holder = new THREE.Group();
        holder.add(bow);
        holder.rotation.x = Math.PI / 2;
        r.handL.add(holder);
        this.rig = r;
        this.inner.add(r.body);
        height = 1.8;
        break;
      }
      case 'orc':
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
          hipW: 0.18,
        });
        // Пузо
        r.torso.add(part(G.sphere(0.36, 16, 12), troll ? 0x8e9a92 : 0x6a7f40, { pos: [0, 0.4, 0.12], scale: [1, 0.9, 0.8], outline: 0.03 }));
        const head = part(G.sphere(0.3, 16, 12), skin, { outline: 0.03 });
        head.scale.set(1.1, 0.95, 1);
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
          const hammer = buildTrollHammer();
          hammer.rotation.x = Math.PI / 2 - 0.5;
          // Своя группа: молот прячется, пока летит
          hammer.userData.anim = true;
          r.handR.add(hammer);
          this.weapon = hammer;
        } else {
          // Шлем и наплечник
          r.head.add(part(G.halfSphere(0.32), 0x6d7680, { pos: [0, 0.07, -0.02], outline: 0.02 }));
          r.torso.add(part(G.halfSphere(0.2), 0x6d7680, { pos: [-0.46, 0.7, 0], rot: [0, 0, 0.4], outline: 0.02 }));
          r.torso.add(part(G.box(0.08, 0.6, 0.06), 0x5a3a22, { pos: [0, 0.4, 0.3], rot: [0, 0, 0.7], outline: false }));
          const axe = new THREE.Group();
          axe.add(part(G.cyl(0.04, 0.05, 1.0, 8), 0x6a4024, { pos: [0, 0.35, 0], outline: 0.015 }));
          axe.add(part(G.cyl(0.3, 0.3, 0.05, 14), 0xb8c2cc, { pos: [0.15, 0.72, 0], rot: [Math.PI / 2, 0, 0], scale: [0.8, 1, 1.1], outline: 0.02 }));
          axe.rotation.x = Math.PI / 2 - 0.4;
          r.handR.add(axe);
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
    // Склеиваем детали — в разы меньше отрисовок на каждого моба
    bake(this.inner);
  }

  playAttack() {
    this.atkT = 0;
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

    if (this.slime) {
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
      const sw = mv ? Math.sin(this.walk) * 0.7 : 0;
      r.legL.rotation.x = sw;
      r.legR.rotation.x = -sw;
      r.armL.rotation.x = -sw * 0.7;
      let armR = sw * 0.7;
      if (st.windup) armR = this.kind === 'skeleton' ? -1.5 : -2.6;
      if (strike > 0) armR = this.kind === 'skeleton' ? -1.5 : -2.6 + (this.atkT / 0.25) * 2.6;
      r.armR.rotation.x = armR;
      if (this.kind === 'skeleton' && (st.windup || strike > 0)) r.armL.rotation.x = -1.5;
      r.body.position.y = mv ? Math.abs(Math.sin(this.walk)) * 0.06 * this.scale : 0;
      r.torso.rotation.x = windupLean + strike * 0.35 + (mv ? 0.12 : 0);
      r.torso.rotation.y = 0;
      r.armR.rotation.z = 0;
      if (wind) {
        // Замах: молот заведён далеко за голову, корпус откинут и развёрнут
        const k = Math.min(1, this.windT / 0.5);
        const e = 1 - Math.pow(1 - k, 3);
        r.armR.rotation.x = -3.3 * e + Math.sin(t * 30) * 0.03 * k;
        r.armR.rotation.z = 0.35 * e;
        r.armL.rotation.x = -1.0 * e;
        r.torso.rotation.x = -0.45 * e;
        r.torso.rotation.y = -0.6 * e;
      } else if (this.throwT < 0.35) {
        // Бросок: рука хлёстко уходит вперёд
        const k = this.throwT / 0.35;
        const e = 1 - Math.pow(1 - k, 4);
        r.armR.rotation.x = -3.3 + e * 3.0;
        r.armL.rotation.x = -1.0 + e * 0.6;
        r.torso.rotation.x = -0.45 + e * 0.7;
        r.torso.rotation.y = -0.6 + e * 0.9;
      } else if (out) {
        // Молот летит — тянет его к себе вытянутой рукой
        const pull = Math.sin(t * 9) * 0.06;
        r.armR.rotation.x = -1.55 + pull;
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
