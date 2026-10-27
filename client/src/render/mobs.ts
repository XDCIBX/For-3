import * as THREE from 'three';
import type { MobKind } from '@game/shared';
import { G, addOutline, blobShadow, glow, part, toon } from './toon';

export interface MobAnimInput {
  moving: boolean;
  windup: boolean;
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

function eyePair(head: THREE.Group, x: number, y: number, z: number, r: number, iris: number, pupil = 0x1a1210, angry = false) {
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(G.sphere(r, 12, 8), toon(iris));
    e.position.set(s * x, y, z);
    e.scale.set(1, 1.1, 0.6);
    const p = new THREE.Mesh(G.sphere(r * 0.5, 8, 6), toon(pupil));
    p.position.set(s * x, y - r * 0.1, z + r * 0.4);
    head.add(e, p);
    if (angry) {
      const brow = part(G.box(r * 2.2, r * 0.45, r * 0.5), 0x1a1210, { pos: [s * x, y + r * 1.1, z + r * 0.2], rot: [0, 0, s * 0.45], outline: false });
      head.add(brow);
    }
  }
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
        const hue = [0x6fd64a, 0x4ab8e8, 0xe86ab8][Math.floor(Math.random() * 3)];
        const g = new THREE.Group();
        const blob = new THREE.Mesh(G.sphere(0.55, 20, 14), toon(hue, { transparent: true, opacity: 0.88 }));
        blob.scale.set(1, 0.8, 1);
        blob.position.y = 0.44;
        addOutline(blob, 0.035);
        const core = new THREE.Mesh(G.sphere(0.25, 12, 8), toon(new THREE.Color(hue).multiplyScalar(0.6)));
        core.position.y = 0.38;
        const shine = new THREE.Mesh(G.sphere(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
        shine.position.set(-0.22, 0.72, 0.25);
        shine.scale.set(1, 0.6, 0.5);
        const face = new THREE.Group();
        face.position.set(0, 0.5, 0.47);
        eyePair(face, 0.15, 0.05, 0, 0.09, 0xffffff);
        const mouth = part(G.torus(0.07, 0.02, Math.PI, 6, 10), 0x1a1210, { pos: [0, -0.1, 0.02], rot: [0, 0, Math.PI], outline: false });
        face.add(mouth);
        g.add(blob, core, shine, face);
        this.slime = g;
        this.inner.add(g);
        shadow = 1.3;
        height = 1.0;
        break;
      }
      case 'goblin': {
        const skin = 0x86c64f;
        const r = biped({ skin, torsoCol: 0x8a5a33, legCol: 0x5d4027, bodyR: 0.22, bodyH: 0.15, headR: 0.3, legLen: 0.36, armLen: 0.38, armR: 0.065, hipW: 0.1 });
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
        height = 1.35;
        break;
      }
      case 'skeleton': {
        const bone = 0xf2ebd6;
        const r = biped({ skin: bone, torsoCol: 0x4a4038, legCol: bone, bodyR: 0.17, bodyH: 0.2, headR: 0.28, legLen: 0.45, armLen: 0.42, armR: 0.045, hipW: 0.1 });
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
        height = 1.55;
        break;
      }
      case 'orc':
      case 'troll': {
        const troll = kind === 'troll';
        const skin = troll ? 0x8aa5b8 : 0x6f8f3a;
        const r = biped({
          skin,
          torsoCol: troll ? 0x8aa5b8 : 0x5a4636,
          legCol: troll ? 0x6a4a30 : 0x4a3a2c,
          bodyR: 0.38,
          bodyH: 0.3,
          headR: 0.3,
          legLen: 0.42,
          armLen: 0.55,
          armR: 0.12,
          hipW: 0.18,
        });
        // Пузо
        r.torso.add(part(G.sphere(0.36, 16, 12), troll ? 0xa8c0cf : 0x86a64a, { pos: [0, 0.35, 0.12], scale: [1, 0.9, 0.8], outline: 0.03 }));
        const head = part(G.sphere(0.3, 16, 12), skin, { outline: 0.03 });
        head.scale.set(1.1, 0.95, 1);
        r.head.add(head);
        r.head.position.z = 0.1;
        r.head.add(part(G.box(0.4, 0.16, 0.24), skin, { pos: [0, -0.16, 0.12], outline: 0.025 }));
        for (const s of [-1, 1]) r.head.add(part(G.cone(0.045, 0.16, 6), 0xfff6e0, { pos: [s * 0.13, -0.04, 0.26], outline: 0.012 }));
        eyePair(r.head, 0.11, 0.08, 0.23, 0.06, troll ? 0xffe14a : 0xff7a3a, 0x1a1210, true);
        r.head.add(part(G.sphere(0.08, 8, 6), troll ? 0x7d95a8 : 0x5f7f30, { pos: [0, 0.0, 0.3], scale: [1.2, 1, 1], outline: 0.015 }));
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
          const club = new THREE.Group();
          club.add(part(G.cyl(0.06, 0.08, 0.6, 8), 0x6a4024, { pos: [0, 0.2, 0], outline: 0.02 }));
          club.add(part(G.cyl(0.2, 0.1, 0.7, 10), 0x8a5a2b, { pos: [0, 0.75, 0], outline: 0.025 }));
          for (let i = 0; i < 6; i++) club.add(part(G.cone(0.05, 0.16, 5), 0xcfd8dc, { pos: [Math.cos(i) * 0.17, 0.6 + (i % 3) * 0.15, Math.sin(i) * 0.17], rot: [Math.sin(i) * 1.5, 0, -Math.cos(i) * 1.5], outline: false }));
          club.rotation.x = Math.PI / 2 - 0.5;
          r.handR.add(club);
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
        height = troll ? 3.4 : 2.2;
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
  }

  playAttack() {
    this.atkT = 0;
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
