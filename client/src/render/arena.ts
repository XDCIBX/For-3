import * as THREE from 'three';
import { ARENA_OBSTACLES, ARENA_RADIUS } from '@game/shared';
import { G, addOutline, faceted, part, toon } from './toon';
import { Flame, makeSun, skyTexture, type Stage } from './env';
import type { Particles } from './particles';

/** Арена для дуэлей: песок, каменные стены, трибуны с ликующей толпой. */
export class ArenaStage implements Stage {
  readonly name = 'arena';
  readonly scene = new THREE.Scene();
  readonly sun: THREE.DirectionalLight;
  shadowsDirty = true;
  private crowd: THREE.InstancedMesh;
  private crowdHeads: THREE.InstancedMesh;
  private crowdBase: { x: number; y: number; z: number; ph: number; a: number }[] = [];
  private flames: { f: Flame; x: number; y: number; z: number }[] = [];
  private banners: THREE.Mesh[] = [];
  private t = 0;
  private emitT = 0;
  excitement = 0;

  constructor() {
    const s = this.scene;
    s.background = skyTexture('#ff9a5a', '#ffc78a', '#ffe8c8');
    s.add(new THREE.HemisphereLight(0xffe2c0, 0x7a5a3a, 1.3));
    this.sun = makeSun(2.2, 0xffd0a0, [-20, 34, 14], 26, 2048);
    s.add(this.sun, this.sun.target);

    const R = ARENA_RADIUS;
    // Песок с узором
    const sand = new THREE.Mesh(new THREE.CircleGeometry(R + 1, 64).rotateX(-Math.PI / 2), toon(0xe9c98a));
    sand.receiveShadow = true;
    s.add(sand);
    for (const [r, w, c] of [
      [R - 0.6, 0.25, 0xd4ae6a],
      [4, 0.2, 0xd4ae6a],
      [1.4, 0.15, 0xc79a5a],
    ] as const) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r - w, r, 64).rotateX(-Math.PI / 2), toon(c));
      ring.position.y = 0.02;
      ring.receiveShadow = true;
      s.add(ring);
    }
    // Эмблема скрещённых мечей в центре
    for (const a of [Math.PI / 4, -Math.PI / 4]) {
      const sw = new THREE.Mesh(G.box(0.25, 0.02, 2.4), toon(0xb5864a));
      sw.position.y = 0.03;
      sw.rotation.y = a;
      s.add(sw);
    }

    // Стена
    const wallSegs = 28;
    for (let i = 0; i < wallSegs; i++) {
      const a = (i / wallSegs) * Math.PI * 2;
      const w = part(G.box(3.0, 2.2, 1.0), i % 2 ? 0xb0a494 : 0xa0968a, { outline: 0.035 });
      w.position.set(Math.cos(a) * (R + 1.0), 1.1, Math.sin(a) * (R + 1.0));
      w.rotation.y = -a + Math.PI / 2;
      w.castShadow = w.receiveShadow = true;
      s.add(w);
      if (i % 2 === 0) {
        const cren = part(G.box(1.0, 0.6, 1.0), 0xb0a494, { outline: 0.03 });
        cren.position.set(Math.cos(a) * (R + 1.0), 2.5, Math.sin(a) * (R + 1.0));
        cren.rotation.y = -a + Math.PI / 2;
        s.add(cren);
      }
    }
    // Ворота
    for (const a of [0, Math.PI]) {
      const g = new THREE.Group();
      g.add(part(G.box(2.6, 2.6, 0.4), 0x5a3a22, { pos: [0, 1.3, 0], outline: 0.035 }));
      for (let i = 0; i < 5; i++) g.add(part(G.box(0.1, 2.5, 0.1), 0x3a3a3a, { pos: [-1 + i * 0.5, 1.3, 0.25], outline: false }));
      g.add(part(G.box(3.2, 0.5, 1.2), 0x8a8078, { pos: [0, 2.8, 0], outline: 0.03 }));
      g.position.set(Math.cos(a) * (R + 0.6), 0, Math.sin(a) * (R + 0.6));
      g.rotation.y = -a - Math.PI / 2;
      s.add(g);
    }

    // Трибуны
    const tiers = 4;
    for (let t = 0; t < tiers; t++) {
      const r0 = R + 2 + t * 1.5;
      const tier = new THREE.Mesh(new THREE.CylinderGeometry(r0 + 1.5, r0 + 1.5, 1, 48, 1, true), toon(t % 2 ? 0x9a8a78 : 0x8a7a6a, { side: THREE.DoubleSide }));
      tier.position.y = 2.2 + t * 1.0;
      s.add(tier);
      const top = new THREE.Mesh(new THREE.RingGeometry(r0, r0 + 1.5, 48).rotateX(-Math.PI / 2), toon(t % 2 ? 0xa89a88 : 0x988a78, { side: THREE.DoubleSide }));
      top.position.y = 2.7 + t * 1.0;
      s.add(top);
    }
    // Толпа
    const n = 300;
    const body = new THREE.CapsuleGeometry(0.25, 0.3, 4, 8).translate(0, 0.45, 0);
    const head = new THREE.SphereGeometry(0.22, 10, 8).translate(0, 0.98, 0);
    this.crowd = new THREE.InstancedMesh(body, toon(0xffffff), n);
    this.crowdHeads = new THREE.InstancedMesh(head, toon(0xffd3ac), n);
    const c = new THREE.Color();
    const shirts = [0xe0533d, 0x3a7ad0, 0x3dbb5a, 0xffd54a, 0x8a5cff, 0xff8a3a, 0xf2efe6, 0x5a3a22];
    for (let i = 0; i < n; i++) {
      const tier = i % tiers;
      const a = Math.random() * Math.PI * 2;
      const r = R + 2.75 + tier * 1.5;
      this.crowdBase.push({ x: Math.cos(a) * r, y: 2.7 + tier * 1.0, z: Math.sin(a) * r, ph: Math.random() * 10, a });
      this.crowd.setColorAt(i, c.set(shirts[i % shirts.length]));
      this.crowdHeads.setColorAt(i, c.set([0xffd3ac, 0xe8b088, 0xc08a5a, 0x8ad35e][i % 7 === 0 ? 3 : i % 3]));
    }
    s.add(this.crowd, this.crowdHeads);

    // Колонны (препятствия)
    for (const o of ARENA_OBSTACLES) {
      const g = new THREE.Group();
      g.add(part(G.box(1.5, 0.35, 1.5), 0x9a9088, { pos: [0, 0.17, 0], outline: 0.03 }));
      const col = part(new THREE.CylinderGeometry(0.7, 0.8, 2.2, 12), 0xd0c6b6, { pos: [0, 1.45, 0], outline: 0.04 });
      col.castShadow = true;
      g.add(col);
      g.add(part(G.box(1.5, 0.35, 1.5), 0x9a9088, { pos: [0, 2.7, 0], outline: 0.03 }));
      // Факел на колонне
      g.add(part(G.cyl(0.12, 0.08, 0.4, 8), 0x5a3a22, { pos: [0, 3.05, 0], outline: 0.02 }));
      g.position.set(o.x, 0, o.z);
      s.add(g);
      const f = new Flame(0.7);
      f.group.position.set(o.x, 3.2, o.z);
      s.add(f.group);
      this.flames.push({ f, x: o.x, y: 3.6, z: o.z });
    }

    // Знамёна на стене
    const bcols = [0xe0533d, 0x8a5cff, 0x3dbb5a, 0xffb321];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const b = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.4, 1, 6), toon(bcols[i % 4], { side: THREE.DoubleSide }));
      b.position.set(Math.cos(a) * (R + 0.45), 1.6, Math.sin(a) * (R + 0.45));
      b.rotation.y = -a - Math.PI / 2;
      addOutline(b, 0.02);
      const emblem = new THREE.Mesh(faceted(new THREE.OctahedronGeometry(0.3, 0)), toon(0xffe14a));
      emblem.position.z = 0.05;
      emblem.scale.z = 0.2;
      b.add(emblem);
      s.add(b);
      this.banners.push(b);
    }
  }

  update(dt: number, fx: Particles) {
    this.t += dt;
    this.excitement = Math.max(0, this.excitement - dt * 0.5);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3(1, 1, 1);
    const up = new THREE.Vector3(0, 1, 0);
    const amp = 0.12 + this.excitement * 0.35;
    this.crowdBase.forEach((b, i) => {
      const jump = Math.max(0, Math.sin(this.t * (6 + (i % 5)) + b.ph)) * amp;
      v.set(b.x, b.y + jump, b.z);
      q.setFromAxisAngle(up, -b.a - Math.PI / 2);
      m.compose(v, q, sc);
      this.crowd.setMatrixAt(i, m);
      this.crowdHeads.setMatrixAt(i, m);
    });
    this.crowd.instanceMatrix.needsUpdate = true;
    this.crowdHeads.instanceMatrix.needsUpdate = true;
    for (const f of this.flames) f.f.update(dt);
    this.banners.forEach((b, i) => (b.rotation.x = Math.sin(this.t * 2 + i) * 0.05));
    this.emitT -= dt;
    if (this.emitT <= 0) {
      this.emitT = 0.07;
      const f = this.flames[(Math.random() * this.flames.length) | 0];
      if (f) fx.glow({ x: f.x, y: f.y, z: f.z, vx: (Math.random() - 0.5) * 0.4, vy: 1.4, vz: (Math.random() - 0.5) * 0.4, life: 0.8, size: 0.12, color: 0xffa040 });
      if (this.excitement > 0.3 && Math.random() < 0.6) {
        // Конфетти с трибун
        const a = Math.random() * Math.PI * 2;
        fx.puff({ x: Math.cos(a) * 15, y: 5, z: Math.sin(a) * 15, vx: -Math.cos(a) * 3, vy: 3, vz: -Math.sin(a) * 3, life: 2.5, size: 0.18, color: [0xff5a5a, 0xffe14a, 0x5ab0ff, 0x7aff7a][(Math.random() * 4) | 0], gravity: 3, drag: 0.8 });
      }
    }
  }
}
