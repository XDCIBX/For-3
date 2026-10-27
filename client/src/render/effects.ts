import * as THREE from 'three';
import type { MobKind, ProjKind, ZoneSnap } from '@game/shared';
import { G, addOutline, glow, toon } from './toon';
import type { Particles } from './particles';

interface Fx {
  obj: THREE.Object3D;
  t: number;
  dur: number;
  tick: (k: number, dt: number) => void;
}

const ringGeo = new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2);
const discGeo = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2);
const slashGeo = new THREE.RingGeometry(1.2, 2.9, 24, 1, -1.15, 2.3).rotateX(-Math.PI / 2);

function fadeMat(color: number, opacity = 1, additive = true) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

/** Одноразовые визуальные эффекты: взмахи, ударные волны, взрывы, монеты. */
export class Effects {
  private list: Fx[] = [];
  scene: THREE.Scene | null = null;
  private fx: Particles;
  shake = 0;

  constructor(fx: Particles) {
    this.fx = fx;
  }

  private add(obj: THREE.Object3D, dur: number, tick: Fx['tick']) {
    this.scene?.add(obj);
    this.list.push({ obj, t: 0, dur, tick });
  }

  clear() {
    for (const f of this.list) f.obj.removeFromParent();
    this.list = [];
  }

  update(dt: number) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      f.tick(k, dt);
      if (k >= 1) {
        f.obj.removeFromParent();
        this.list.splice(i, 1);
      }
    }
    this.shake = Math.max(0, this.shake - dt * 2.5);
  }

  ring(x: number, z: number, r: number, color: number, dur = 0.5, y = 0.08, from = 0.2) {
    const mat = fadeMat(color, 0.9);
    const m = new THREE.Mesh(ringGeo, mat);
    m.position.set(x, y, z);
    this.add(m, dur, (k) => {
      const e = 1 - Math.pow(1 - k, 3);
      m.scale.setScalar(r * (from + (1 - from) * e));
      mat.opacity = 0.9 * (1 - k);
    });
  }

  flashDisc(x: number, z: number, r: number, color: number, dur = 0.35) {
    const mat = fadeMat(color, 0.6);
    const m = new THREE.Mesh(discGeo, mat);
    m.position.set(x, 0.06, z);
    m.scale.setScalar(r);
    this.add(m, dur, (k) => (mat.opacity = 0.6 * (1 - k)));
  }

  slash(x: number, z: number, rot: number, color = 0xffffff) {
    const mat = fadeMat(color, 0.85);
    const m = new THREE.Mesh(slashGeo, mat);
    m.position.set(x, 0.9, z);
    m.rotation.y = rot - Math.PI / 2;
    this.add(m, 0.22, (k) => {
      mat.opacity = 0.85 * (1 - k);
      m.rotation.y = rot - Math.PI / 2 + (0.5 - k) * 0.9;
      m.scale.setScalar(0.85 + k * 0.25);
    });
    this.fx.burst(x + Math.sin(rot) * 1.8, 0.9, z + Math.cos(rot) * 1.8, { n: 6, speed: 3, up: 1, life: 0.3, size: 0.18, colors: [0xffffff, 0xfff0a0] });
  }

  whirlTrail(x: number, z: number) {
    const mat = fadeMat(0xcfe8ff, 0.5);
    const m = new THREE.Mesh(new THREE.RingGeometry(2.0, 3.0, 32, 1, 0, Math.PI * 1.2).rotateX(-Math.PI / 2), mat);
    m.position.set(x, 0.7, z);
    this.add(m, 0.25, (k, dt) => {
      m.rotation.y -= dt * 18;
      mat.opacity = 0.5 * (1 - k);
    });
  }

  explosion(x: number, z: number, r: number) {
    const mat = fadeMat(0xffa030, 0.95);
    const ball = new THREE.Mesh(G.sphere(1, 20, 14), mat);
    ball.position.set(x, 0.5, z);
    this.add(ball, 0.45, (k) => {
      ball.scale.setScalar(r * (0.3 + k * 0.8));
      mat.opacity = 0.95 * (1 - k);
      mat.color.setHex(k < 0.3 ? 0xfff0a0 : 0xff7020);
    });
    this.ring(x, z, r * 1.3, 0xffb040, 0.5);
    this.flashDisc(x, z, r, 0xff8a30, 0.5);
    this.fx.burst(x, 0.6, z, { n: 40, speed: r * 3.2, up: 4, life: 0.7, size: 0.45, colors: [0xffe14a, 0xff8a30, 0xff4a1a], gravity: 4, drag: 2.5 });
    this.fx.burst(x, 0.8, z, { n: 12, speed: r * 1.5, up: 1.6, life: 1.2, size: 0.8, grow: 1.2, colors: [0xb0a8a0, 0x9a9290], drag: 2, alpha: 0.35 }, false);
    this.shake = Math.max(this.shake, 0.35);
  }

  meteor(x: number, z: number, r: number) {
    this.explosion(x, z, r);
    this.ring(x, z, r * 1.6, 0xff5a1a, 0.7);
    this.fx.burst(x, 0.3, z, { n: 24, speed: r * 2, up: 7, life: 1.2, size: 0.35, colors: [0x6a5a4a, 0x8a7a6a], gravity: 14, drag: 0.5 }, false);
    this.shake = Math.max(this.shake, 0.7);
    // Кратер
    const mat = new THREE.MeshBasicMaterial({ color: 0x3a2418, transparent: true, opacity: 0.55, depthWrite: false });
    const crater = new THREE.Mesh(discGeo, mat);
    crater.position.set(x, 0.05, z);
    crater.scale.setScalar(r * 0.8);
    this.add(crater, 4, (k) => (mat.opacity = 0.55 * (1 - k * k)));
  }

  nova(x: number, z: number, r: number) {
    this.ring(x, z, r, 0x7ae0ff, 0.5);
    this.ring(x, z, r * 0.7, 0xffffff, 0.4);
    this.flashDisc(x, z, r, 0x4ab8ff, 0.4);
    const spikes = new THREE.Group();
    const mat = toon(0xbff4ff, { transparent: true, opacity: 0.85, emissive: 0x4ab8ff, emissiveIntensity: 0.5 });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const d = r * (0.55 + (i % 3) * 0.15);
      const sp = new THREE.Mesh(G.cone(0.22, 1.2, 5), mat);
      sp.position.set(Math.cos(a) * d, 0.4, Math.sin(a) * d);
      sp.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4);
      spikes.add(sp);
    }
    spikes.position.set(x, 0, z);
    this.add(spikes, 0.9, (k) => {
      const s = k < 0.2 ? k / 0.2 : k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
      spikes.scale.set(1, Math.max(0.01, s), 1);
    });
    this.fx.burst(x, 0.5, z, { n: 40, speed: r * 2.4, up: 1.5, life: 0.7, size: 0.25, colors: [0xffffff, 0xbff4ff, 0x7ae0ff], drag: 2 });
  }

  warcry(x: number, z: number, r: number) {
    this.ring(x, z, r, 0xff5a2a, 0.7, 0.1);
    this.ring(x, z, r * 0.6, 0xffc040, 0.5, 0.1);
    this.fx.burst(x, 1.4, z, { n: 30, speed: 5, up: 2, life: 0.6, size: 0.3, colors: [0xff5a2a, 0xffc040] });
    this.shake = Math.max(this.shake, 0.25);
  }

  slam(x: number, z: number, r: number) {
    this.ring(x, z, r, 0xffa060, 0.6);
    this.flashDisc(x, z, r, 0xff3020, 0.3);
    this.fx.burst(x, 0.2, z, { n: 30, speed: r * 2, up: 5, life: 0.9, size: 0.35, colors: [0x7a6a5a, 0x9a8a7a, 0x5a4a3a], gravity: 12 }, false);
    this.fx.burst(x, 0.4, z, { n: 12, speed: r, up: 1, life: 1.2, size: 0.9, grow: 1, colors: [0xc8b090], alpha: 0.45 }, false);
    this.shake = Math.max(this.shake, 0.8);
  }

  spawn(x: number, z: number, boss = false) {
    this.ring(x, z, boss ? 3 : 1.4, 0xb06aff, 0.8, 0.08, 1);
    this.fx.burst(x, 0.2, z, { n: boss ? 50 : 18, speed: boss ? 4 : 2, up: boss ? 5 : 3, life: 0.9, size: boss ? 0.45 : 0.25, colors: [0xb06aff, 0xff7aff, 0x6a2ad0], drag: 2 });
    if (boss) this.shake = Math.max(this.shake, 0.6);
  }

  hit(x: number, z: number, kind: string) {
    const colors: Record<string, number[]> = {
      arrow: [0xffffff, 0xfff0a0],
      bolt: [0xc8a0ff, 0x8a5cff, 0xffffff],
      earrow: [0xff6a5a, 0xffffff],
      slime: [0x8aff6a],
    };
    this.fx.burst(x, 0.9, z, { n: 8, speed: 3, up: 1.5, life: 0.3, size: 0.2, colors: colors[kind] ?? [0xffffff, 0xffd080] });
  }

  blood(x: number, z: number, kind: MobKind | 'hero') {
    const c: Record<string, number[]> = {
      slime: [0x8aff6a, 0x5ad04a],
      goblin: [0xfff0a0, 0xffffff],
      skeleton: [0xf2ebd6, 0xd8d0b8],
      orc: [0xfff0a0, 0xffffff],
      troll: [0xfff0a0, 0xffffff],
      hero: [0xff6a5a, 0xffffff],
    };
    this.fx.burst(x, 1.0, z, { n: 5, speed: 2.5, up: 2, life: 0.35, size: 0.16, colors: c[kind], gravity: 6 }, kind !== 'slime' && kind !== 'skeleton');
  }

  death(x: number, z: number, kind: MobKind) {
    const big = kind === 'troll' ? 3 : kind === 'orc' ? 1.6 : 1;
    this.fx.burst(x, 0.6, z, { n: Math.round(12 * big), speed: 2 * big, up: 1.5, life: 1.0, size: 0.6 * big, grow: 0.8, colors: [0xf2efe6, 0xd8d0c8], drag: 2.5, alpha: 0.7 }, false);
    if (kind === 'skeleton') this.fx.burst(x, 0.8, z, { n: 10, speed: 3, up: 4, life: 1, size: 0.18, colors: [0xf2ebd6], gravity: 12 }, false);
    if (kind === 'slime') this.fx.burst(x, 0.5, z, { n: 14, speed: 3, up: 3, life: 0.8, size: 0.25, colors: [0x8aff6a, 0x5ad04a], gravity: 10 }, false);
    if (kind === 'troll') this.shake = Math.max(this.shake, 0.6);
  }

  /** Монеты вылетают из моба и летят к убийце. */
  coins(x: number, z: number, n: number, target: () => THREE.Vector3 | null) {
    const mat = toon(0xffd23a, { emissive: 0xb07a00, emissiveIntensity: 0.4 });
    for (let i = 0; i < n; i++) {
      const coin = new THREE.Mesh(G.cyl(0.16, 0.16, 0.05, 12), mat);
      addOutline(coin, 0.015);
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 1.5;
      const start = new THREE.Vector3(x, 0.8, z);
      const v = new THREE.Vector3(Math.cos(a) * sp, 4 + Math.random() * 2, Math.sin(a) * sp);
      const pos = start.clone();
      const delay = 0.35 + Math.random() * 0.2;
      coin.position.copy(pos);
      this.add(coin, delay + 0.45, (k, dt) => {
        const t = k * (delay + 0.45);
        coin.rotation.x += dt * 9;
        coin.rotation.y += dt * 5;
        if (t < delay) {
          v.y -= 14 * dt;
          pos.addScaledVector(v, dt);
          if (pos.y < 0.15) {
            pos.y = 0.15;
            v.y = Math.abs(v.y) * 0.4;
            v.x *= 0.6;
            v.z *= 0.6;
          }
          coin.position.copy(pos);
        } else {
          const tgt = target();
          if (!tgt) return;
          const kk = (t - delay) / 0.45;
          const e = kk * kk;
          coin.position.lerpVectors(pos, tgt.clone().setY(tgt.y + 1.2), e);
          coin.position.y += Math.sin(kk * Math.PI) * 1.2;
          coin.scale.setScalar(1 - kk * 0.5);
          if (kk > 0.95 && Math.random() < 0.5) this.fx.burst(coin.position.x, coin.position.y, coin.position.z, { n: 3, speed: 1.5, up: 1, life: 0.3, size: 0.15, colors: [0xffe14a, 0xffffff] });
        }
      });
    }
  }

  sparkle(x: number, y: number, z: number, color: number) {
    this.fx.burst(x, y, z, { n: 30, speed: 2, up: 3, life: 1.0, size: 0.25, colors: [color, 0xffffff, 0xffe14a], drag: 1.5, radius: 0.6 });
    this.ring(x, z, 1.6, color, 0.7, 0.08, 0.3);
  }

  respawn(x: number, z: number) {
    this.ring(x, z, 1.6, 0xfff0a0, 0.8, 0.08, 1);
    this.fx.burst(x, 0.2, z, { n: 30, speed: 1, up: 5, life: 1.0, size: 0.25, colors: [0xfff0a0, 0xffffff], drag: 1, radius: 0.8 });
  }

  dust(x: number, z: number, n = 6) {
    this.fx.burst(x, 0.15, z, { n, speed: 1.2, up: 0.6, life: 0.6, size: 0.4, grow: 0.6, colors: [0xd8c8a8, 0xc8b898], drag: 3, alpha: 0.5 }, false);
  }
}

/** Визуал снаряда. */
export class ProjView {
  readonly obj = new THREE.Group();
  readonly kind: ProjKind;
  x = 0;
  z = 0;
  vx = 0;
  vz = 0;
  t0 = 0;
  private emitT = 0;
  constructor(kind: ProjKind) {
    this.kind = kind;
    const o = this.obj;
    if (kind === 'arrow' || kind === 'earrow') {
      const shaft = new THREE.Mesh(G.cyl(0.03, 0.03, 0.9, 5), toon(kind === 'arrow' ? 0xc9a36a : 0x3a2a2a));
      shaft.rotation.x = Math.PI / 2;
      const head = new THREE.Mesh(G.cone(0.08, 0.2, 5), toon(kind === 'arrow' ? 0xe0e8f0 : 0xd04a3a));
      head.rotation.x = Math.PI / 2;
      head.position.z = 0.5;
      const fl = new THREE.Mesh(G.box(0.02, 0.14, 0.22), toon(kind === 'arrow' ? 0xffffff : 0x6a2a2a));
      fl.position.z = -0.4;
      const fl2 = fl.clone();
      fl2.rotation.z = Math.PI / 2;
      o.add(shaft, head, fl, fl2);
      addOutline(shaft, 0.012);
    } else if (kind === 'bolt') {
      o.add(new THREE.Mesh(G.sphere(0.18, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff })));
      o.add(new THREE.Mesh(G.sphere(0.36, 12, 8), glow(0x9a6aff, 0.6)));
    } else if (kind === 'fireball') {
      o.add(new THREE.Mesh(G.sphere(0.28, 14, 10), new THREE.MeshBasicMaterial({ color: 0xfff0a0 })));
      o.add(new THREE.Mesh(G.sphere(0.5, 14, 10), glow(0xff7020, 0.6)));
    } else {
      o.add(new THREE.Mesh(G.dodeca(0.4), toon(0x8a7a6a)));
    }
    o.position.y = 1.0;
  }
  update(dt: number, now: number, fx: Particles) {
    const t = Math.min(0.15, (now - this.t0) / 1000);
    this.obj.position.set(this.x + this.vx * t, 1.0, this.z + this.vz * t);
    this.obj.rotation.y = Math.atan2(this.vx, this.vz);
    this.emitT -= dt;
    if (this.emitT <= 0) {
      this.emitT = this.kind === 'fireball' ? 0.015 : 0.03;
      const p = this.obj.position;
      if (this.kind === 'bolt') fx.glow({ x: p.x, y: p.y, z: p.z, vx: (Math.random() - 0.5), vy: (Math.random() - 0.5), vz: (Math.random() - 0.5), life: 0.35, size: 0.25, color: Math.random() < 0.5 ? 0x9a6aff : 0x6ab8ff });
      else if (this.kind === 'fireball') {
        fx.glow({ x: p.x, y: p.y, z: p.z, vx: (Math.random() - 0.5), vy: Math.random(), vz: (Math.random() - 0.5), life: 0.4, size: 0.45, grow: -0.6, color: Math.random() < 0.5 ? 0xff7020 : 0xffd040 });
        if (Math.random() < 0.3) fx.puff({ x: p.x, y: p.y, z: p.z, vy: 0.6, life: 0.8, size: 0.4, grow: 0.6, color: 0x5a5050, alpha: 0.35 });
      } else if (this.kind === 'arrow') fx.glow({ x: p.x, y: p.y, z: p.z, life: 0.2, size: 0.1, color: 0xffffff, alpha: 0.6 });
    }
  }
}

/** Визуал области (метеор, дождь стрел, огонь, удар босса). */
export class ZoneView {
  readonly obj = new THREE.Group();
  readonly kind: string;
  private fill: THREE.Mesh;
  private ring: THREE.Mesh;
  private meteor: THREE.Group | null = null;
  private arrows: THREE.Mesh[] = [];
  private emitT = 0;
  data: ZoneSnap;
  localT = 0;
  constructor(z: ZoneSnap) {
    this.kind = z.k;
    this.data = z;
    this.localT = z.t;
    const col = z.k === 'rain' ? 0x8ad0ff : z.k === 'burn' ? 0xff6a20 : z.k === 'meteor' ? 0xff5a1a : 0xff2a2a;
    this.fill = new THREE.Mesh(discGeo, fadeMat(col, z.k === 'burn' ? 0.35 : 0.25, z.k !== 'slam'));
    this.ring = new THREE.Mesh(ringGeo, fadeMat(col, 0.85, false));
    this.fill.position.y = 0.07;
    this.ring.position.y = 0.08;
    this.obj.add(this.fill, this.ring);
    this.obj.position.set(z.x, 0, z.z);
    this.fill.scale.setScalar(z.r);
    this.ring.scale.setScalar(z.r);
    if (z.k === 'meteor') {
      const m = new THREE.Group();
      const rock = new THREE.Mesh(G.dodeca(0.8), toon(0x5a4030, { emissive: 0xff4a10, emissiveIntensity: 0.6 }));
      addOutline(rock, 0.04);
      m.add(rock, new THREE.Mesh(G.sphere(1.3, 14, 10), glow(0xff7020, 0.5)));
      this.meteor = m;
      this.obj.add(m);
    }
    if (z.k === 'rain') {
      for (let i = 0; i < 10; i++) {
        const a = new THREE.Mesh(G.cyl(0.025, 0.025, 0.8, 4), toon(0xe8f0ff));
        a.visible = false;
        this.arrows.push(a);
        this.obj.add(a);
      }
    }
  }
  update(dt: number, fx: Particles) {
    this.localT += dt;
    const z = this.data;
    const t = this.localT;
    if (z.k === 'slam' || z.k === 'meteor') {
      const k = Math.min(1, t / Math.max(0.01, z.delay));
      this.fill.scale.setScalar(z.r * k);
      (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.sin(t * 20) * 0.35;
      if (this.meteor) {
        const h = (1 - k) * 16;
        this.meteor.position.set(-(1 - k) * 7, h + 0.5, -(1 - k) * 5);
        this.meteor.rotation.x += dt * 4;
        if (Math.random() < 0.8) {
          const p = this.meteor.position;
          fx.glow({ x: z.x + p.x, y: p.y, z: z.z + p.z, vx: (Math.random() - 0.5), vy: 1, vz: (Math.random() - 0.5), life: 0.5, size: 0.8, grow: -1, color: Math.random() < 0.5 ? 0xff7020 : 0xffd040 });
        }
      }
    } else {
      this.ring.rotation.y += dt * 0.6;
      const fade = Math.min(1, (z.dur - t) / 0.3);
      (this.fill.material as THREE.MeshBasicMaterial).opacity = (z.k === 'burn' ? 0.35 : 0.22) * Math.max(0, fade);
      (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.8 * Math.max(0, fade);
      this.emitT -= dt;
      if (this.emitT <= 0) {
        this.emitT = z.k === 'rain' ? 0.04 : 0.05;
        const a = Math.random() * Math.PI * 2;
        const d = Math.sqrt(Math.random()) * z.r;
        if (z.k === 'burn') {
          fx.glow({ x: z.x + Math.cos(a) * d, y: 0.1, z: z.z + Math.sin(a) * d, vy: 1.5 + Math.random(), life: 0.6, size: 0.45, grow: -0.6, color: Math.random() < 0.5 ? 0xff7020 : 0xffc040 });
        } else {
          const ar = this.arrows.find((x) => !x.visible);
          if (ar) {
            ar.visible = true;
            ar.position.set(Math.cos(a) * d, 6, Math.sin(a) * d);
            ar.userData.vy = -28;
          }
        }
      }
      for (const ar of this.arrows) {
        if (!ar.visible) continue;
        ar.position.y += ar.userData.vy * dt;
        if (ar.position.y < 0.3) {
          ar.visible = false;
          fx.glow({ x: z.x + ar.position.x, y: 0.2, z: z.z + ar.position.z, vy: 0.5, life: 0.2, size: 0.2, color: 0xffffff });
        }
      }
    }
  }
}
