import * as THREE from 'three';
import type { MinionKind } from '@game/shared';
import { G, blobShadow, faceted, glow, part, toon } from './toon';
import { bake } from './bake';

const SPIRIT = 0x6ff0ff;

/** Модели помощников призывателя: дух-волк, каменный голем, тотем духов. */
export class MinionModel {
  readonly kind: MinionKind;
  readonly root = new THREE.Group();
  readonly height: number;
  private body = new THREE.Group();
  private legs: THREE.Object3D[] = [];
  private head = new THREE.Group();
  private tail: THREE.Object3D | null = null;
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private top: THREE.Object3D | null = null;
  private glows: THREE.Object3D[] = [];
  private t = Math.random() * 10;
  private walk = 0;
  private atkT = 9;
  private popT = 0;
  private appearT = 0;
  dying = 0;

  constructor(kind: MinionKind) {
    this.kind = kind;
    this.root.add(blobShadow(kind === 'golem' ? 1.9 : kind === 'wolf' ? 1.1 : 0.9));
    this.root.add(this.body);
    if (kind === 'wolf') this.height = this.buildWolf();
    else if (kind === 'golem') this.height = this.buildGolem();
    else this.height = this.buildTotem();
    bake(this.body);
  }

  private buildWolf(): number {
    const fur = toon(0x8af4ff, { emissive: 0x2ab8c8, emissiveIntensity: 0.45 });
    const furDark = toon(0x4ad0e0, { emissive: 0x1a8898, emissiveIntensity: 0.4 });
    const B = this.body;
    const torso = new THREE.Mesh(G.capsule(0.24, 0.5), fur);
    torso.rotation.x = Math.PI / 2;
    torso.position.set(0, 0.62, 0);
    B.add(torso);
    // Грива
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(G.cone(0.1, 0.28, 5), furDark);
      m.position.set(0, 0.86, 0.2 - i * 0.12);
      m.rotation.x = -0.9;
      B.add(m);
    }
    this.head.userData.anim = true;
    this.head.position.set(0, 0.82, 0.46);
    const skull = new THREE.Mesh(G.sphere(0.22, 14, 10), fur);
    const snout = new THREE.Mesh(G.cone(0.13, 0.32, 8), fur);
    snout.rotation.x = Math.PI / 2;
    snout.position.set(0, -0.05, 0.25);
    const nose = new THREE.Mesh(G.sphere(0.045, 8, 6), toon(0x1a3a44));
    nose.position.set(0, -0.03, 0.4);
    this.head.add(skull, snout, nose);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(G.cone(0.07, 0.2, 4), furDark);
      ear.position.set(s * 0.12, 0.2, -0.02);
      ear.rotation.z = -s * 0.25;
      this.head.add(ear);
      const eye = new THREE.Mesh(G.sphere(0.04, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      eye.position.set(s * 0.1, 0.05, 0.17);
      this.head.add(eye);
    }
    B.add(this.head);
    for (const [x, z] of [
      [-0.14, 0.3],
      [0.14, 0.3],
      [-0.14, -0.28],
      [0.14, -0.28],
    ]) {
      const leg = new THREE.Group();
      leg.userData.anim = true;
      leg.position.set(x, 0.55, z);
      const l = new THREE.Mesh(G.capsule(0.06, 0.32), furDark);
      l.position.y = -0.27;
      leg.add(l);
      B.add(leg);
      this.legs.push(leg);
    }
    const tail = new THREE.Group();
    tail.userData.anim = true;
    tail.position.set(0, 0.7, -0.45);
    const tm = new THREE.Mesh(G.cone(0.1, 0.45, 6), fur);
    tm.rotation.x = -2.2;
    tm.position.set(0, 0.1, -0.16);
    tail.add(tm);
    B.add(tail);
    this.tail = tail;
    // Призрачное сияние
    const halo = new THREE.Mesh(G.sphere(0.6, 12, 8), glow(SPIRIT, 0.07));
    halo.position.y = 0.8;
    halo.scale.set(0.9, 0.8, 1.4);
    this.root.add(halo);
    this.glows.push(halo);
    for (const m of [torso, skull, snout]) m.userData.noBake = true;
    B.scale.setScalar(1.3);
    return 1.4;
  }

  private buildGolem(): number {
    const B = this.body;
    const rock = 0x8a8478;
    const dark = 0x6a655c;
    const torso = part(faceted(new THREE.DodecahedronGeometry(0.62, 0)), rock, { pos: [0, 1.25, 0], scale: [1.15, 1, 0.9], outline: 0.035 });
    B.add(torso);
    B.add(part(faceted(new THREE.DodecahedronGeometry(0.4, 0)), dark, { pos: [0, 0.65, 0], scale: [1.1, 0.8, 0.9], outline: 0.03 }));
    // Мох на плечах
    for (const s of [-1, 1]) B.add(part(G.ico(0.18, 0), 0x5aa04a, { pos: [s * 0.45, 1.68, -0.05], scale: [1.2, 0.5, 1], outline: 0.015 }));
    // Голова-валун со светящимися глазами
    this.head.userData.anim = true;
    this.head.position.set(0, 1.86, 0.12);
    this.head.add(part(faceted(new THREE.DodecahedronGeometry(0.28, 0)), rock, { outline: 0.025 }));
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(G.box(0.1, 0.05, 0.05), toon(SPIRIT, { emissive: SPIRIT, emissiveIntensity: 1 }));
      eye.position.set(s * 0.1, 0.02, 0.24);
      this.head.add(eye);
    }
    B.add(this.head);
    // Руна на груди
    const rune = new THREE.Mesh(G.torus(0.14, 0.03, Math.PI * 2, 4, 6), toon(SPIRIT, { emissive: SPIRIT, emissiveIntensity: 1 }));
    rune.position.set(0, 1.3, 0.55);
    B.add(rune);
    this.glows.push(rune);
    // Руки-глыбы
    for (const [arm, s] of [
      [this.armL, -1],
      [this.armR, 1],
    ] as const) {
      arm.userData.anim = true;
      arm.position.set(s * 0.75, 1.55, 0);
      arm.add(part(faceted(new THREE.DodecahedronGeometry(0.24, 0)), dark, { pos: [0, -0.2, 0], outline: 0.02 }));
      arm.add(part(faceted(new THREE.DodecahedronGeometry(0.3, 0)), rock, { pos: [0, -0.62, 0.05], scale: [1, 1.1, 1], outline: 0.025 }));
      B.add(arm);
    }
    for (const s of [-1, 1]) {
      const leg = new THREE.Group();
      leg.userData.anim = true;
      leg.position.set(s * 0.3, 0.55, 0);
      leg.add(part(faceted(new THREE.DodecahedronGeometry(0.24, 0)), dark, { pos: [0, -0.3, 0], scale: [1, 1.2, 1], outline: 0.02 }));
      B.add(leg);
      this.legs.push(leg);
    }
    return 2.3;
  }

  private buildTotem(): number {
    const B = this.body;
    const woods = [0x8a5a2b, 0x6a4428, 0x9a6a3b];
    const paint = [0xc9343a, 0x2ab8c8, 0xd9a441];
    for (let i = 0; i < 3; i++) {
      const y = 0.35 + i * 0.5;
      B.add(part(G.cyl(0.3 - i * 0.03, 0.32 - i * 0.03, 0.48, 10), woods[i], { pos: [0, y, 0], outline: 0.025 }));
      // Вырезанное лицо
      for (const s of [-1, 1]) B.add(part(G.box(0.1, 0.07, 0.04), paint[i], { pos: [s * 0.11, y + 0.08, 0.29 - i * 0.03], outline: false }));
      B.add(part(G.box(0.22, 0.06, 0.04), 0x1a1210, { pos: [0, y - 0.1, 0.29 - i * 0.03], outline: false }));
      B.add(part(G.cone(0.06, 0.14, 4), woods[(i + 1) % 3], { pos: [0, y, 0.33 - i * 0.03], rot: [Math.PI / 2, 0, 0], outline: 0.01 }));
    }
    // Крылья
    for (const s of [-1, 1]) B.add(part(G.box(0.5, 0.18, 0.05), 0xd9a441, { pos: [s * 0.45, 1.3, 0], rot: [0, 0, s * 0.3], outline: 0.02 }));
    // Сияющий шар на вершине
    const top = new THREE.Group();
    top.userData.anim = true;
    const orb = new THREE.Mesh(G.sphere(0.18, 14, 10), toon(SPIRIT, { emissive: SPIRIT, emissiveIntensity: 1 }));
    top.add(orb);
    top.add(new THREE.Mesh(G.sphere(0.4, 12, 8), glow(SPIRIT, 0.25)));
    top.position.y = 1.95;
    B.add(top);
    this.top = top;
    // Круг лечения
    const ring = new THREE.Mesh(new THREE.RingGeometry(5.3, 5.5, 64).rotateX(-Math.PI / 2), glow(SPIRIT, 0.35));
    ring.position.y = 0.06;
    this.root.add(ring);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(5.5, 48).rotateX(-Math.PI / 2), glow(SPIRIT, 0.06));
    disc.position.y = 0.05;
    this.root.add(disc);
    return 2.3;
  }

  playAttack() {
    this.atkT = 0;
  }

  pop() {
    this.popT = 0.15;
  }

  update(dt: number, moving: boolean) {
    this.t += dt;
    this.atkT += dt;
    this.appearT = Math.min(1, this.appearT + dt * 3);
    const t = this.t;
    if (moving) this.walk += dt * (this.kind === 'wolf' ? 16 : 7);
    const sw = moving ? Math.sin(this.walk) : 0;
    const atk = this.atkT < 0.35 ? Math.sin((this.atkT / 0.35) * Math.PI) : 0;
    if (this.kind === 'wolf') {
      this.legs.forEach((l, i) => (l.rotation.x = sw * 0.8 * (i % 2 === 0 ? 1 : -1) * (i < 2 ? 1 : -1)));
      this.body.position.y = moving ? Math.abs(sw) * 0.08 : 0;
      this.body.rotation.x = -atk * 0.35;
      this.head.rotation.x = -atk * 0.5 + Math.sin(t * 2) * 0.05;
      if (this.tail) this.tail.rotation.y = Math.sin(t * 8) * 0.4;
    } else if (this.kind === 'golem') {
      this.legs.forEach((l, i) => (l.rotation.x = sw * 0.5 * (i === 0 ? 1 : -1)));
      this.body.rotation.z = sw * 0.06;
      const lift = this.atkT < 0.6 ? Math.sin((this.atkT / 0.6) * Math.PI) : 0;
      this.armL.rotation.x = -sw * 0.4 - lift * 2.4;
      this.armR.rotation.x = sw * 0.4 - lift * 2.4;
      this.head.rotation.y = Math.sin(t * 0.8) * 0.15;
    } else if (this.top) {
      this.top.position.y = 1.95 + Math.sin(t * 2.5) * 0.08;
      this.top.scale.setScalar(1 + atk * 0.35);
    }
    for (const g of this.glows) g.scale.setScalar(1 + Math.sin(t * 4) * 0.08);
    // Появление и исчезновение
    let s = this.appearT < 1 ? 0.3 + 0.7 * (1 - Math.pow(1 - this.appearT, 3)) : 1;
    if (this.dying > 0) {
      this.dying += dt;
      s *= Math.max(0, 1 - this.dying * 2.5);
    }
    if (this.popT > 0) {
      this.popT -= dt;
      s *= 1 + (this.popT / 0.15) * 0.1;
    }
    this.root.scale.setScalar(Math.max(0.001, s));
  }
}
