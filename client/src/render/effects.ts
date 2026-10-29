import * as THREE from 'three';
import type { HeroClass, MobKind, ProjKind, ZoneSnap } from '@game/shared';
import { G, addOutline, toon } from './toon';
import { buildTrollHammer } from './mobs';
import type { Particles } from './particles';
import { dangerTex, frostTex, ringTex, runeTex, scorchTex, slashTex, softTex, trailTex } from './textures';

interface Fx {
  obj: THREE.Object3D;
  t: number;
  dur: number;
  tick: (k: number, dt: number) => void;
}

/** Плоскость на земле радиусом 1 (текстура занимает весь квадрат). */
const flatGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
/** Шлейф: нос в начале координат, хвост тянется назад по -z. */
const trailGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, -0.5);

function texMat(tex: THREE.Texture, color: number, opacity = 1, additive = true): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map: tex,
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
}

function glowSprite(color: number, size: number, opacity = 0.8): THREE.Sprite {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: softTex(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  s.scale.setScalar(size);
  return s;
}

const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);

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

  // ----------------------------------------------------------------- базовые элементы

  /** Ударная волна: мягкое кольцо, расходящееся по земле. */
  ring(x: number, z: number, r: number, color: number, dur = 0.5, y = 0.08, from = 0.2) {
    const mat = texMat(ringTex(), color, 1);
    const m = new THREE.Mesh(flatGeo, mat);
    m.position.set(x, y, z);
    this.add(m, dur, (k) => {
      m.scale.setScalar(Math.max(0.01, r * (from + (1 - from) * easeOut(k))));
      mat.opacity = 1 - k * k;
    });
  }

  flashDisc(x: number, z: number, r: number, color: number, dur = 0.35) {
    const mat = texMat(softTex(), color, 0.4);
    const m = new THREE.Mesh(flatGeo, mat);
    m.position.set(x, 0.07, z);
    m.scale.setScalar(r * 1.1);
    this.add(m, dur, (k) => (mat.opacity = 0.4 * (1 - k)));
  }

  /** Отметка на земле (иней, гарь, руны). */
  decal(tex: THREE.Texture, x: number, z: number, r: number, color: number, dur: number, opts: { additive?: boolean; spin?: number; grow?: number; opacity?: number } = {}) {
    const op = opts.opacity ?? 1;
    const mat = texMat(tex, color, op, opts.additive ?? true);
    const m = new THREE.Mesh(flatGeo, mat);
    m.position.set(x, 0.05, z);
    m.rotation.y = Math.random() * Math.PI * 2;
    m.renderOrder = 2;
    const grow = opts.grow ?? 0.12;
    this.add(m, dur, (k, dt) => {
      const g = grow > 0 ? Math.min(1, k / grow) : 1;
      m.scale.setScalar(Math.max(0.01, r * easeOut(g)));
      if (opts.spin) m.rotation.y += dt * opts.spin;
      mat.opacity = op * (k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1);
    });
  }

  private flash(x: number, y: number, z: number, color: number, size: number, dur: number) {
    const s = glowSprite(color, size, 0.65);
    s.position.set(x, y, z);
    this.add(s, dur, (k) => {
      s.scale.setScalar(size * (0.6 + easeOut(k) * 0.6));
      s.material.opacity = 0.65 * (1 - k);
    });
  }

  // ----------------------------------------------------------------- умения

  /** Взмах меча: два слоя серпа (цветной и белый) с проворотом. */
  slash(x: number, z: number, rot: number, color = 0xffffff) {
    const layers: [number, number, number][] = [
      [color === 0xffffff ? 0x8fd0ff : color, 3.1, 0.75],
      [0xffffff, 2.7, 1],
    ];
    for (const [c, size, op] of layers) {
      const mat = texMat(slashTex(), c, op, c !== 0xffffff);
      const m = new THREE.Mesh(flatGeo, mat);
      m.position.set(x, 0.95, z);
      m.scale.setScalar(size / 2);
      this.add(m, 0.24, (k) => {
        m.rotation.y = rot - Math.PI / 2 + (0.6 - easeOut(k) * 1.1);
        mat.opacity = op * (1 - k * k);
        m.scale.setScalar((size / 2) * (0.9 + k * 0.2));
      });
    }
    for (let i = 0; i < 8; i++) {
      const a = rot + (Math.random() - 0.5) * 1.6;
      const d = 1.4 + Math.random() * 0.9;
      this.fx.glow({ x: x + Math.sin(a) * d, y: 0.9 + Math.random() * 0.3, z: z + Math.cos(a) * d, vx: Math.sin(a) * 3, vy: 1 + Math.random(), vz: Math.cos(a) * 3, life: 0.3, size: 0.16, color: Math.random() < 0.5 ? 0xffffff : 0xfff0a0, drag: 3 });
    }
  }

  whirlTrail(x: number, z: number) {
    const mat = texMat(slashTex(), 0xe8f4ff, 0.75, false);
    const m = new THREE.Mesh(flatGeo, mat);
    m.position.set(x, 0.75, z);
    m.scale.setScalar(1.6);
    m.rotation.y = Math.random() * Math.PI * 2;
    this.add(m, 0.22, (k, dt) => {
      m.rotation.y -= dt * 20;
      mat.opacity = 0.75 * (1 - k);
    });
    if (Math.random() < 0.6) {
      const a = Math.random() * Math.PI * 2;
      this.fx.glow({ x: x + Math.cos(a) * 2.6, y: 0.8, z: z + Math.sin(a) * 2.6, vx: -Math.sin(a) * 4, vy: 0.5, vz: Math.cos(a) * 4, life: 0.3, size: 0.15, color: 0xffffff, drag: 2 });
    }
  }

  /** Рывок щитом: полосы скорости и ударная волна. */
  charge(x: number, z: number, rot: number) {
    this.ring(x, z, 1.6, 0xffffff, 0.3);
    for (let i = 0; i < 5; i++) {
      const mat = texMat(trailTex(), 0xdff0ff, 0.8);
      const m = new THREE.Mesh(trailGeo, mat);
      const side = (i - 2) * 0.3;
      m.position.set(x + Math.cos(rot) * side, 0.5 + Math.abs(side) * 0.6, z - Math.sin(rot) * side);
      m.rotation.y = rot;
      m.scale.set(0.12, 1, 3 + Math.random() * 2);
      this.add(m, 0.35, (k) => {
        mat.opacity = 0.8 * (1 - k);
        m.position.x += Math.sin(rot) * 0.4;
        m.position.z += Math.cos(rot) * 0.4;
      });
    }
    this.dust(x, z, 10);
  }

  explosion(x: number, z: number, r: number) {
    this.flash(x, 0.9, z, 0xfff3b0, r * 0.9, 0.22);
    this.flash(x, 1.0, z, 0xff7020, r * 1.4, 0.45);
    // Огненный «гриб» из нескольких мягких шаров
    for (let i = 0; i < 6; i++) {
      const s = glowSprite(i % 2 ? 0xff9a30 : 0xff5a1a, r * 0.6, 0.7);
      const a = (i / 6) * Math.PI * 2;
      const vx = Math.cos(a) * r * 0.9;
      const vz = Math.sin(a) * r * 0.9;
      s.position.set(x, 0.6, z);
      this.add(s, 0.55, (k) => {
        const e = easeOut(k);
        s.position.set(x + vx * e, 0.6 + e * 1.2, z + vz * e);
        s.scale.setScalar(r * (0.4 + e * 0.5));
        s.material.opacity = 0.7 * (1 - k);
      });
    }
    this.ring(x, z, r * 1.5, 0xffb040, 0.5);
    this.decal(scorchTex(), x, z, r * 0.9, 0xffffff, 3, { additive: false, grow: 0.05, opacity: 0.8 });
    this.fx.burst(x, 0.6, z, { n: 40, speed: r * 3.2, up: 4, life: 0.7, size: 0.45, colors: [0xffe14a, 0xff8a30, 0xff4a1a], gravity: 4, drag: 2.5 });
    this.fx.burst(x, 0.5, z, { n: 16, speed: r * 2.5, up: 6, life: 1.1, size: 0.14, colors: [0xffd04a, 0xff8a30], gravity: 9, drag: 0.6 });
    this.fx.burst(x, 1.0, z, { n: 10, speed: r * 1.2, up: 1.8, life: 1.3, size: 0.8, grow: 1.3, colors: [0xd8d0c8, 0xc0b8b0], drag: 2, alpha: 0.28 }, false);
    this.shake = Math.max(this.shake, 0.35);
  }

  meteor(x: number, z: number, r: number) {
    this.explosion(x, z, r);
    this.ring(x, z, r * 2, 0xff5a1a, 0.8);
    this.ring(x, z, r * 1.2, 0xffffff, 0.35);
    this.decal(scorchTex(), x, z, r * 1.2, 0xffffff, 4.5, { additive: false, grow: 0.03, opacity: 0.85 });
    this.fx.burst(x, 0.3, z, { n: 24, speed: r * 2, up: 8, life: 1.3, size: 0.38, colors: [0x6a5a4a, 0x8a7a6a, 0x4a3a2a], gravity: 14, drag: 0.5 }, false);
    // Столб огня
    const pillar = glowSprite(0xff7020, 2, 0.6);
    pillar.position.set(x, 3, z);
    this.add(pillar, 0.6, (k) => {
      pillar.scale.set(r * 0.6 * (1 - k * 0.5), 6 * (1 - k * 0.3), 1);
      pillar.material.opacity = 0.6 * (1 - k);
    });
    this.shake = Math.max(this.shake, 0.75);
  }

  nova(x: number, z: number, r: number) {
    this.ring(x, z, r * 1.05, 0x5ac8f0, 0.55);
    this.ring(x, z, r * 0.7, 0x9fe8ff, 0.4);
    this.flash(x, 1, z, 0x9fe8ff, 1.6, 0.25);
    this.decal(frostTex(), x, z, r * 1.05, 0x5ab8e8, 2.2, { grow: 0.12, opacity: 0.5 });
    const spikes = new THREE.Group();
    const mat = toon(0xbff4ff, { transparent: true, opacity: 0.85, emissive: 0x4ab8ff, emissiveIntensity: 0.5 });
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + Math.random() * 0.2;
      const d = r * (0.5 + (i % 3) * 0.17);
      const sp = new THREE.Mesh(G.cone(0.2 + (i % 2) * 0.08, 1.0 + (i % 3) * 0.4, 5), mat);
      sp.position.set(Math.cos(a) * d, 0.4, Math.sin(a) * d);
      sp.rotation.set(Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45);
      spikes.add(sp);
    }
    spikes.position.set(x, 0, z);
    this.add(spikes, 1.0, (k) => {
      const s = k < 0.15 ? k / 0.15 : k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
      spikes.scale.set(1, Math.max(0.01, s), 1);
      if (k > 0.75 && Math.random() < 0.5) {
        const a = Math.random() * Math.PI * 2;
        this.fx.glow({ x: x + Math.cos(a) * r * 0.7, y: 0.6, z: z + Math.sin(a) * r * 0.7, vy: 2, life: 0.4, size: 0.18, color: 0xffffff, gravity: 6 });
      }
    });
    this.fx.burst(x, 0.5, z, { n: 44, speed: r * 2.4, up: 1.5, life: 0.8, size: 0.25, colors: [0xffffff, 0xbff4ff, 0x7ae0ff], drag: 2 });
    // Снежинки
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * r;
      this.fx.glow({ x: x + Math.cos(a) * d, y: 2 + Math.random() * 1.5, z: z + Math.sin(a) * d, vx: (Math.random() - 0.5) * 0.4, vy: -0.8, life: 1.6, size: 0.12, color: 0xffffff, alpha: 0.9 });
    }
  }

  warcry(x: number, z: number, r: number) {
    this.ring(x, z, r, 0xff5a2a, 0.7, 0.1);
    this.ring(x, z, r * 0.6, 0xffc040, 0.5, 0.1);
    this.decal(runeTex(), x, z, 2.6, 0xff6a2a, 1.1, { spin: 2, grow: 0.15 });
    this.flash(x, 1.6, z, 0xff8a3a, 2, 0.35);
    // Кольцо искр, бегущее вверх
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      this.fx.glow({ x: x + Math.cos(a) * 1.2, y: 0.3, z: z + Math.sin(a) * 1.2, vx: Math.cos(a) * 2.5, vy: 3 + Math.random() * 2, vz: Math.sin(a) * 2.5, life: 0.7, size: 0.22, color: i % 2 ? 0xff5a2a : 0xffc040, drag: 1.5 });
    }
    this.shake = Math.max(this.shake, 0.3);
  }

  slam(x: number, z: number, r: number) {
    this.ring(x, z, r * 1.1, 0xffa060, 0.6);
    this.ring(x, z, r * 0.6, 0xffffff, 0.3);
    this.flashDisc(x, z, r, 0xff3020, 0.3);
    this.decal(scorchTex(), x, z, r * 0.65, 0xc8a080, 2.5, { additive: false, grow: 0.03, opacity: 0.6 });
    this.fx.burst(x, 0.2, z, { n: 34, speed: r * 2, up: 6, life: 0.9, size: 0.35, colors: [0x7a6a5a, 0x9a8a7a, 0x5a4a3a], gravity: 14 }, false);
    this.fx.burst(x, 0.4, z, { n: 14, speed: r, up: 1, life: 1.3, size: 1.0, grow: 1.1, colors: [0xc8b090], alpha: 0.42 }, false);
    this.shake = Math.max(this.shake, 0.8);
  }

  /** Двойной удар охотника: два перекрещённых серпа цвета скверны. */
  twin(x: number, z: number, rot: number) {
    for (const [c, size, op, off] of [
      [0x5dff8a, 2.7, 0.7, 0.35],
      [0xb070ff, 2.5, 0.6, -0.35],
    ] as const) {
      const mat = texMat(slashTex(), c, op);
      const m = new THREE.Mesh(flatGeo, mat);
      m.position.set(x, 0.9 + off * 0.3, z);
      m.scale.setScalar(size / 2);
      this.add(m, 0.2, (k) => {
        m.rotation.y = rot - Math.PI / 2 + off * 2 * (0.5 - easeOut(k));
        m.rotation.z = off * 0.6;
        mat.opacity = op * (1 - k * k);
      });
    }
    for (let i = 0; i < 6; i++) {
      const a = rot + (Math.random() - 0.5) * 1.2;
      const d = 1.2 + Math.random() * 0.8;
      this.fx.glow({ x: x + Math.sin(a) * d, y: 0.9 + Math.random() * 0.3, z: z + Math.cos(a) * d, vx: Math.sin(a) * 2.5, vy: 0.8, vz: Math.cos(a) * 2.5, life: 0.3, size: 0.15, color: Math.random() < 0.5 ? 0x5dff8a : 0xd0ffe0, drag: 3 });
    }
  }

  /** Теневой рывок: тёмные полосы и зелёные искры. */
  shadowDash(x: number, z: number, rot: number) {
    this.ring(x, z, 1.3, 0x5dff8a, 0.3);
    for (let i = 0; i < 4; i++) {
      const mat = texMat(trailTex(), i % 2 ? 0x5dff8a : 0x7a3aff, 0.7);
      const m = new THREE.Mesh(trailGeo, mat);
      const side = (i - 1.5) * 0.28;
      m.position.set(x + Math.cos(rot) * side, 0.6 + Math.abs(side), z - Math.sin(rot) * side);
      m.rotation.y = rot;
      m.scale.set(0.16, 1, 3 + Math.random() * 2);
      this.add(m, 0.35, (k) => {
        mat.opacity = 0.7 * (1 - k);
        m.position.x += Math.sin(rot) * 0.5;
        m.position.z += Math.cos(rot) * 0.5;
      });
    }
    this.fx.burst(x, 0.8, z, { n: 14, speed: 1.5, up: 1, life: 0.7, size: 0.5, grow: 0.6, colors: [0x2a1a3a, 0x3a2a4a], drag: 2, alpha: 0.6 }, false);
  }

  /** Превращение в демона: столб пламени скверны. */
  demon(x: number, z: number, r: number) {
    this.ring(x, z, r, 0x5dff8a, 0.6, 0.1);
    this.ring(x, z, r * 0.6, 0xb070ff, 0.45, 0.1);
    this.decal(runeTex(), x, z, 2.2, 0x5dff8a, 1.0, { spin: -3, grow: 0.15 });
    this.flash(x, 1.4, z, 0x5dff8a, 2.4, 0.4);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      this.fx.glow({ x: x + Math.cos(a) * 0.8, y: 0.2, z: z + Math.sin(a) * 0.8, vx: Math.cos(a) * 1.2, vy: 4 + Math.random() * 3, vz: Math.sin(a) * 1.2, life: 0.8, size: 0.3, grow: -0.3, color: i % 3 ? 0x5dff8a : 0xb070ff, drag: 1.2 });
    }
    this.shake = Math.max(this.shake, 0.35);
  }

  /** Удар голема о землю. */
  golemSlam(x: number, z: number, r: number) {
    this.ring(x, z, r * 1.1, 0x9fe8ff, 0.45);
    this.decal(scorchTex(), x, z, r * 0.6, 0xa89880, 1.6, { additive: false, grow: 0.05, opacity: 0.45 });
    this.fx.burst(x, 0.2, z, { n: 16, speed: r * 2, up: 4, life: 0.7, size: 0.28, colors: [0x7a7268, 0x9a9288, 0x6ff0ff], gravity: 12 }, false);
    this.shake = Math.max(this.shake, 0.2);
  }

  /** Появление помощника: круг рун и всполох духов. */
  summon(x: number, z: number, big = false) {
    const r = big ? 1.8 : 1.1;
    this.decal(runeTex(), x, z, r, 0x6ff0ff, 0.9, { spin: 3, grow: 0.2 });
    this.ring(x, z, r * 1.2, 0x6ff0ff, 0.6, 0.08, 0.2);
    this.flash(x, 0.8, z, 0x6ff0ff, big ? 2.4 : 1.5, 0.35);
    this.fx.burst(x, 0.3, z, { n: big ? 26 : 14, speed: 1.5, up: 4, life: 0.8, size: 0.2, colors: [0x6ff0ff, 0xffffff, 0x2ab8c8], drag: 1.5, radius: r * 0.5 });
  }

  /** Удар когтями: три рваные полосы веером. */
  rend(x: number, z: number, rot: number) {
    for (let i = -1; i <= 1; i++) {
      const mat = texMat(trailTex(), i === 0 ? 0xffe0b0 : 0xff9a4a, 0.85);
      const m = new THREE.Mesh(trailGeo, mat);
      const a = rot + i * 0.28;
      m.position.set(x + Math.sin(a) * 2.2, 0.9 + i * 0.15, z + Math.cos(a) * 2.2);
      m.rotation.set(0, a + Math.PI / 2 + 0.5, 0);
      m.scale.set(0.12, 1, 2.2);
      this.add(m, 0.22, (k) => {
        mat.opacity = 0.85 * (1 - k);
        m.scale.z = 2.2 * (0.6 + k * 0.6);
      });
    }
    for (let i = 0; i < 6; i++) {
      const a = rot + (Math.random() - 0.5) * 1.4;
      this.fx.glow({ x: x + Math.sin(a) * 1.8, y: 0.9, z: z + Math.cos(a) * 1.8, vx: Math.sin(a) * 2.5, vy: 0.8, vz: Math.cos(a) * 2.5, life: 0.3, size: 0.15, color: 0xffc080, drag: 3 });
    }
  }

  /** Оборотень оттолкнулся для прыжка. */
  pounce(x: number, z: number) {
    this.ring(x, z, 1.4, 0xffc080, 0.3);
    this.dust(x, z, 10);
  }

  /** Приземление после прыжка: ударная волна, комья земли. */
  pounceLand(x: number, z: number, r: number) {
    this.ring(x, z, r * 1.1, 0xffb060, 0.45);
    this.decal(scorchTex(), x, z, r * 0.6, 0xb8a080, 1.6, { additive: false, grow: 0.05, opacity: 0.5 });
    this.fx.burst(x, 0.2, z, { n: 18, speed: r * 2, up: 4, life: 0.7, size: 0.28, colors: [0x7a6a5a, 0x9a8a7a], gravity: 12 }, false);
    this.dust(x, z, 12);
    this.shake = Math.max(this.shake, 0.35);
  }

  /** Вой: звуковые волны расходятся кольцами. */
  howl(x: number, z: number, r: number) {
    for (let i = 0; i < 3; i++) {
      const mat = texMat(ringTex(), 0xffd070, 0.9);
      const m = new THREE.Mesh(flatGeo, mat);
      m.position.set(x, 1.4, z);
      m.rotation.x = 0.0;
      this.add(m, 0.7, (k) => {
        const kk = Math.max(0, k - i * 0.18) / (1 - i * 0.18);
        m.scale.setScalar(Math.max(0.01, r * (0.15 + easeOut(kk) * 0.9)));
        m.position.y = 1.4 - kk * 1.2;
        mat.opacity = 0.75 * (1 - kk) * (k > i * 0.18 ? 1 : 0);
      });
    }
    this.flash(x, 1.6, z, 0xffd070, 1.6, 0.3);
    this.shake = Math.max(this.shake, 0.3);
  }

  /** Превращение в зверя: вихрь шерсти и золотистая вспышка. */
  beast(x: number, z: number) {
    this.ring(x, z, 2.6, 0xffa040, 0.55, 0.1);
    this.decal(runeTex(), x, z, 1.8, 0xffa040, 0.9, { spin: -3, grow: 0.15 });
    this.flash(x, 1.4, z, 0xffb060, 2.6, 0.4);
    this.fx.burst(x, 1.0, z, { n: 26, speed: 4, up: 3, life: 0.8, size: 0.24, colors: [0x8a5a36, 0x4a2a1a, 0xd8b088], drag: 2, gravity: 4 }, false);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      this.fx.glow({ x: x + Math.cos(a) * 0.9, y: 0.3, z: z + Math.sin(a) * 0.9, vx: Math.cos(a) * 1.5, vy: 3.5, vz: Math.sin(a) * 1.5, life: 0.7, size: 0.25, color: i % 2 ? 0xffa040 : 0xff5a2a, drag: 1.5 });
    }
    this.shake = Math.max(this.shake, 0.4);
  }

  /** Выстрел мушкетона: вспышка у дула и клубы дыма. */
  muzzle(x: number, z: number, rot: number, big = true) {
    const mx = x + Math.sin(rot) * (big ? 1.0 : 0.75);
    const mz = z + Math.cos(rot) * (big ? 1.0 : 0.75);
    const y = big ? 0.95 : 0.95;
    this.flash(mx, y, mz, 0xffd070, big ? 1.4 : 0.8, 0.12);
    this.fx.burst(mx, y, mz, { n: big ? 8 : 4, speed: 2.5, up: 0.5, life: 0.25, size: 0.16, colors: [0xffe080, 0xff9a30], drag: 3 });
    for (let i = 0; i < (big ? 3 : 1); i++) this.fx.puff({ x: mx, y, z: mz, vx: Math.sin(rot) * 1.5, vy: 0.6, vz: Math.cos(rot) * 1.5, life: 0.9, size: 0.45, grow: 1.1, color: 0xd8d0c8, alpha: 0.4 });
  }

  /** Землетрясение: трещины и каменная волна. */
  quake(x: number, z: number, r: number) {
    this.ring(x, z, r * 1.1, 0xd8a050, 0.6);
    this.ring(x, z, r * 0.6, 0xffffff, 0.35);
    this.decal(scorchTex(), x, z, r * 0.75, 0x9a8a70, 2.5, { additive: false, grow: 0.04, opacity: 0.6 });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const d = r * (0.5 + Math.random() * 0.5);
      this.fx.burst(x + Math.cos(a) * d, 0.2, z + Math.sin(a) * d, { n: 3, speed: 1.5, up: 5, life: 0.8, size: 0.3, colors: [0x7a6a5a, 0x9a8a7a, 0x6a5a4a], gravity: 14 }, false);
    }
    this.fx.burst(x, 0.4, z, { n: 12, speed: r, up: 1, life: 1.2, size: 0.9, grow: 1, colors: [0xc8b090], alpha: 0.4 }, false);
    this.shake = Math.max(this.shake, 0.7);
  }

  /** Турель собрана: искры и болтики. */
  turretUp(x: number, z: number) {
    this.ring(x, z, 1.4, 0xffc040, 0.4);
    this.fx.burst(x, 0.8, z, { n: 16, speed: 3, up: 3, life: 0.6, size: 0.15, colors: [0xffd060, 0xffffff, 0xc8a24a], gravity: 8 });
    this.dust(x, z, 6);
  }

  /** Волна духов от тотема: бирюзовое кольцо расходится до края круга. */
  totemPulse(x: number, z: number, r: number) {
    this.ring(x, z, r, 0x6ff0ff, 0.45, 0.1, 0.1);
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = r * (0.3 + Math.random() * 0.7);
      this.fx.glow({ x: x + Math.cos(a) * d, y: 0.15, z: z + Math.sin(a) * d, vy: 1.6, life: 0.45, size: 0.16, color: Math.random() < 0.6 ? 0x6ff0ff : 0xe8ffff });
    }
  }

  /** Исчезновение помощника. */
  unsummon(x: number, z: number) {
    this.flash(x, 0.7, z, 0x6ff0ff, 1.2, 0.3);
    this.fx.burst(x, 0.6, z, { n: 14, speed: 1.2, up: 3, life: 0.8, size: 0.22, colors: [0x6ff0ff, 0xd0ffff], drag: 1.5 });
  }

  /** Подсказка броска молота: красная полоса на земле, наливается к моменту броска. */
  hammerLane(x: number, z: number, rot: number, len: number, dur: number) {
    const g = new THREE.Group();
    g.position.set(x, 0.12, z);
    g.rotation.y = rot;
    // Шевроны повторяются по длине полосы, а не растягиваются
    const geo = new THREE.PlaneGeometry(2.2, len).rotateX(-Math.PI / 2).translate(0, 0, len / 2);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * (len / 2.6));
    const strip = new THREE.Mesh(geo, texMat(laneTex(), 0xff3a2a, 0.0, false));
    strip.renderOrder = 2;
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5), texMat(laneTex(), 0xff7a3a, 0.0));
    fill.position.y = 0.01;
    fill.renderOrder = 3;
    const tip = new THREE.Mesh(flatGeo, texMat(ringTex(), 0xff3a2a, 0));
    tip.position.z = len;
    tip.scale.setScalar(1.3);
    g.add(strip, fill, tip);
    const sm = strip.material as THREE.MeshBasicMaterial;
    const fm = fill.material as THREE.MeshBasicMaterial;
    const tm = tip.material as THREE.MeshBasicMaterial;
    this.add(g, dur + 0.15, (k) => {
      if (k >= 1) geo.dispose();
      const a = Math.min(1, k * 4) * (k > 0.95 ? (1 - k) / 0.05 : 1);
      sm.opacity = 0.85 * a;
      tm.opacity = a;
      // Заполнение бежит от босса к концу полосы
      fill.scale.z = Math.max(0.01, len * Math.min(1, k * 1.05));
      fm.opacity = 0.7 * a;
    });
  }

  /** Бросок молота: хлопок воздуха у руки. */
  hammerThrow(x: number, z: number, rot: number) {
    const hx = x + Math.sin(rot) * 1.6;
    const hz = z + Math.cos(rot) * 1.6;
    this.flash(hx, 2.4, hz, 0xffd080, 2.2, 0.25);
    this.ring(hx, hz, 2.4, 0xffffff, 0.35, 1.6);
    this.dust(x, z, 10);
    this.shake = Math.max(this.shake, 0.3);
  }

  /** Молот развернулся: искры и вихрь. */
  hammerTurn(x: number, z: number) {
    this.ring(x, z, 2.2, 0xffb030, 0.45);
    this.fx.burst(x, 1.4, z, { n: 16, speed: 4, up: 2, life: 0.45, size: 0.2, colors: [0xffd060, 0xffffff, 0xff8a30], drag: 2 });
  }

  /** Босс поймал молот: вспышка и пыль от тяжёлого удара о ладонь. */
  hammerCatch(x: number, y: number, z: number) {
    this.flash(x, y, z, 0xffc060, 2.6, 0.3);
    this.fx.burst(x, y, z, { n: 18, speed: 3.5, up: 2.5, life: 0.5, size: 0.22, colors: [0xffd060, 0xffffff, 0xff9a40], drag: 2 });
    this.dust(x, z, 8);
    this.shake = Math.max(this.shake, 0.35);
  }

  /** Подсветка при применении умения: магический круг под ногами. */
  cast(cls: HeroClass, s: number, x: number, z: number) {
    if (cls === 'mage' && s >= 1) {
      const col = s === 1 ? 0xff7a2a : s === 2 ? 0x7ae0ff : 0xb07aff;
      this.decal(runeTex(), x, z, s === 3 ? 2.0 : 1.5, col, s === 3 ? 1.1 : 0.6, { spin: 3, grow: 0.2 });
      for (let i = 0; i < 12; i++) {
        const a = Math.random() * Math.PI * 2;
        this.fx.glow({ x: x + Math.cos(a) * 1.2, y: 0.1, z: z + Math.sin(a) * 1.2, vy: 2 + Math.random() * 2, life: 0.6, size: 0.16, color: col });
      }
    } else if (cls === 'summoner' && s >= 1) {
      this.decal(runeTex(), x, z, 1.6, 0x6ff0ff, 0.7, { spin: 3, grow: 0.2 });
      for (let i = 0; i < 10; i++) {
        const a = Math.random() * Math.PI * 2;
        this.fx.glow({ x: x + Math.cos(a) * 1.1, y: 0.1, z: z + Math.sin(a) * 1.1, vy: 2 + Math.random() * 2, life: 0.6, size: 0.16, color: 0x6ff0ff });
      }
    } else if (cls === 'hunter' && s === 2) {
      this.flash(x, 1.1, z, 0x5dff8a, 1.4, 0.2);
    } else if (cls === 'archer' && s === 3) {
      this.decal(runeTex(), x, z, 1.4, 0x7aff9a, 0.6, { spin: -3, grow: 0.2 });
    } else if (cls === 'archer' && s === 1) {
      this.flash(x, 1.2, z, 0xfff0a0, 1.6, 0.2);
    }
  }

  spawn(x: number, z: number, boss = false) {
    const r = boss ? 3.2 : 1.5;
    this.decal(runeTex(), x, z, r, 0xb06aff, boss ? 1.6 : 1.0, { spin: 2.5, grow: 0.2 });
    this.ring(x, z, r, 0xb06aff, 0.8, 0.08, 1);
    this.flash(x, 1, z, 0x9a4aff, boss ? 3.5 : 1.6, 0.5);
    this.fx.burst(x, 0.2, z, { n: boss ? 60 : 20, speed: boss ? 4 : 2, up: boss ? 6 : 3.5, life: 1.0, size: boss ? 0.45 : 0.25, colors: [0xb06aff, 0xff7aff, 0x6a2ad0], drag: 2, radius: r * 0.5 });
    if (boss) this.shake = Math.max(this.shake, 0.6);
  }

  hit(x: number, z: number, kind: string) {
    const colors: Record<string, number[]> = {
      arrow: [0xffffff, 0xfff0a0],
      bolt: [0xc8a0ff, 0x8a5cff, 0xffffff],
      glaive: [0x5dff8a, 0xffffff],
      spirit: [0x6ff0ff, 0xffffff, 0x2ab8c8],
      pellet: [0xffd070, 0xffffff, 0x9a9aa2],
      hammer: [0xffd060, 0x9a8a7a, 0xffffff],
      earrow: [0xff6a5a, 0xffffff],
      slime: [0x8aff6a],
    };
    const c = colors[kind] ?? [0xffffff, 0xffd080];
    this.flash(x, 0.95, z, c[0], kind === 'bolt' || kind === 'spirit' ? 1.2 : kind === 'hammer' ? 2.2 : 0.8, 0.15);
    if (kind === 'hammer') {
      this.ring(x, z, 2, 0xffd080, 0.35);
      this.fx.burst(x, 0.4, z, { n: 14, speed: 4, up: 4, life: 0.7, size: 0.3, colors: [0x7a6a5a, 0x9a8a7a], gravity: 12 }, false);
      this.shake = Math.max(this.shake, 0.45);
    }
    this.fx.burst(x, 0.9, z, { n: 9, speed: 3.2, up: 1.5, life: 0.32, size: 0.2, colors: c });
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
    this.flash(x, 0.8, z, 0xffffff, 1.1 * big, 0.2);
    this.fx.burst(x, 0.6, z, { n: Math.round(12 * big), speed: 2 * big, up: 1.5, life: 1.0, size: 0.6 * big, grow: 0.8, colors: [0xf2efe6, 0xd8d0c8], drag: 2.5, alpha: 0.7 }, false);
    this.fx.burst(x, 0.8, z, { n: Math.round(8 * big), speed: 1.5, up: 3, life: 0.8, size: 0.16, colors: [0xffe14a, 0xffffff], drag: 1 });
    if (kind === 'skeleton') this.fx.burst(x, 0.8, z, { n: 10, speed: 3, up: 4, life: 1, size: 0.18, colors: [0xf2ebd6], gravity: 12 }, false);
    if (kind === 'slime') this.fx.burst(x, 0.5, z, { n: 14, speed: 3, up: 3, life: 0.8, size: 0.25, colors: [0x8aff6a, 0x5ad04a], gravity: 10 }, false);
    if (kind === 'troll') {
      this.ring(x, z, 4, 0xffd04a, 0.8);
      this.shake = Math.max(this.shake, 0.6);
    }
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
          if (Math.random() < 0.3) this.fx.glow({ x: coin.position.x, y: coin.position.y, z: coin.position.z, life: 0.25, size: 0.14, color: 0xffe14a });
        }
      });
    }
  }

  sparkle(x: number, y: number, z: number, color: number) {
    this.fx.burst(x, y, z, { n: 34, speed: 2, up: 3, life: 1.0, size: 0.25, colors: [color, 0xffffff, 0xffe14a], drag: 1.5, radius: 0.6 });
    this.ring(x, z, 1.6, color, 0.7, 0.08, 0.3);
    this.decal(runeTex(), x, z, 1.3, color, 0.9, { spin: 2, grow: 0.2 });
  }

  respawn(x: number, z: number) {
    this.ring(x, z, 1.6, 0xfff0a0, 0.8, 0.08, 1);
    this.decal(runeTex(), x, z, 1.4, 0xfff0a0, 1.2, { spin: 2, grow: 0.15 });
    const col = glowSprite(0xfff0a0, 1);
    col.position.set(x, 2, z);
    this.add(col, 0.8, (k) => {
      col.scale.set(1.4 * (1 - k), 6, 1);
      col.material.opacity = 1 - k;
    });
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
  private glows: THREE.Sprite[] = [];
  private t = Math.random() * 10;
  private spin: THREE.Group | null = null;
  private tumble = false;
  private height = 1.0;
  constructor(kind: ProjKind) {
    this.kind = kind;
    const o = this.obj;
    const trail = (color: number, w: number, len: number, op: number) => {
      const m = new THREE.Mesh(trailGeo, texMat(trailTex(), color, op));
      m.scale.set(w, 1, len);
      o.add(m);
    };
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
      trail(kind === 'arrow' ? 0xffffff : 0xff5a4a, 0.22, 2.2, 0.55);
    } else if (kind === 'bolt') {
      o.add(new THREE.Mesh(G.sphere(0.14, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff })));
      for (const [c, s] of [
        [0x9a6aff, 1.3],
        [0x6ab8ff, 0.8],
      ] as const) {
        const g = glowSprite(c, s);
        this.glows.push(g);
        o.add(g);
      }
      trail(0xb08aff, 0.45, 2.4, 0.8);
    } else if (kind === 'fireball') {
      o.add(new THREE.Mesh(G.sphere(0.22, 14, 10), new THREE.MeshBasicMaterial({ color: 0xfff6c0 })));
      for (const [c, s] of [
        [0xff5a1a, 2.0],
        [0xffb030, 1.2],
      ] as const) {
        const g = glowSprite(c, s);
        this.glows.push(g);
        o.add(g);
      }
      trail(0xff7020, 0.8, 3.2, 0.9);
    } else if (kind === 'glaive') {
      // Вращающаяся глефа: два серпа и сияние скверны
      const spin = new THREE.Group();
      for (const a of [0, Math.PI]) {
        const blade = new THREE.Mesh(G.torus(0.42, 0.06, Math.PI * 0.75, 4, 14), toon(0xd8e8e0, { emissive: 0x2a8a4a, emissiveIntensity: 0.4 }));
        blade.rotation.set(Math.PI / 2, 0, a);
        blade.scale.set(1, 1, 0.4);
        addOutline(blade, 0.015);
        spin.add(blade);
      }
      spin.add(new THREE.Mesh(G.cyl(0.1, 0.1, 0.06, 10), toon(0x2c2733)));
      this.spin = spin;
      o.add(spin);
      const g = glowSprite(0x5dff8a, 1.4, 0.6);
      this.glows.push(g);
      o.add(g);
      trail(0x5dff8a, 0.5, 1.6, 0.5);
    } else if (kind === 'hammer') {
      // Молот тролля летит, кувыркаясь через рукоять
      const spin = new THREE.Group();
      const h = buildTrollHammer();
      h.position.y = -0.5;
      h.scale.setScalar(2.1);
      spin.add(h);
      spin.rotation.order = 'YXZ';
      this.spin = spin;
      this.tumble = true;
      o.add(spin);
      const g = glowSprite(0xffb040, 3.2, 0.35);
      this.glows.push(g);
      o.add(g);
      trail(0xffd8a0, 1.6, 3.2, 0.45);
      this.height = 1.6;
    } else if (kind === 'pellet') {
      // Дробина: раскалённый свинцовый шарик с дымным следом
      o.add(new THREE.Mesh(G.sphere(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff0c0 })));
      const g = glowSprite(0xffa040, 0.6, 0.7);
      this.glows.push(g);
      o.add(g);
      trail(0xffd8a0, 0.14, 1.4, 0.6);
    } else if (kind === 'spirit') {
      o.add(new THREE.Mesh(G.sphere(0.13, 12, 8), new THREE.MeshBasicMaterial({ color: 0xe8ffff })));
      for (const [c, s] of [
        [0x2ab8c8, 1.3],
        [0x6ff0ff, 0.8],
      ] as const) {
        const g = glowSprite(c, s);
        this.glows.push(g);
        o.add(g);
      }
      trail(0x6ff0ff, 0.4, 2.2, 0.75);
    } else {
      o.add(new THREE.Mesh(G.dodeca(0.4), toon(0x8a7a6a)));
    }
    o.position.y = 1.0;
  }
  update(dt: number, now: number, fx: Particles) {
    this.t += dt;
    const t = Math.min(0.15, (now - this.t0) / 1000);
    this.obj.position.set(this.x + this.vx * t, this.height, this.z + this.vz * t);
    this.obj.rotation.y = Math.atan2(this.vx, this.vz);
    this.glows.forEach((g, i) => {
      const base = (this.kind === 'fireball' ? [2.0, 1.2] : this.kind === 'glaive' ? [1.4] : this.kind === 'hammer' ? [3.2] : this.kind === 'pellet' ? [0.6] : [1.3, 0.8])[i];
      g.scale.setScalar(base * (1 + Math.sin(this.t * (20 + i * 7)) * 0.12));
    });
    if (this.spin && this.tumble) this.spin.rotation.x += dt * 16;
    else if (this.spin) this.spin.rotation.y += dt * 22;
    this.emitT -= dt;
    if (this.emitT <= 0) {
      this.emitT = this.kind === 'fireball' ? 0.015 : 0.03;
      const p = this.obj.position;
      if (this.kind === 'spirit') fx.glow({ x: p.x, y: p.y, z: p.z, vx: Math.random() - 0.5, vy: Math.random() * 0.8, vz: Math.random() - 0.5, life: 0.4, size: 0.2, color: Math.random() < 0.5 ? 0x6ff0ff : 0xffffff });
      else if (this.kind === 'hammer') {
        fx.glow({ x: p.x + (Math.random() - 0.5), y: p.y + (Math.random() - 0.5), z: p.z + (Math.random() - 0.5), vy: 0.5, life: 0.35, size: 0.25, color: Math.random() < 0.5 ? 0xffb040 : 0xffffff });
        if (Math.random() < 0.35) fx.puff({ x: p.x, y: 0.3, z: p.z, vy: 0.4, life: 0.6, size: 0.6, grow: 0.8, color: 0xd8c8a8, alpha: 0.35 });
      } else if (this.kind === 'glaive') fx.glow({ x: p.x, y: p.y, z: p.z, vx: Math.random() - 0.5, vy: 0.3, vz: Math.random() - 0.5, life: 0.3, size: 0.18, color: 0x5dff8a });
      else if (this.kind === 'bolt') fx.glow({ x: p.x, y: p.y, z: p.z, vx: Math.random() - 0.5, vy: Math.random() - 0.5, vz: Math.random() - 0.5, life: 0.35, size: 0.22, color: Math.random() < 0.5 ? 0x9a6aff : 0x6ab8ff });
      else if (this.kind === 'fireball') {
        fx.glow({ x: p.x, y: p.y, z: p.z, vx: Math.random() - 0.5, vy: Math.random(), vz: Math.random() - 0.5, life: 0.4, size: 0.45, grow: -0.6, color: Math.random() < 0.5 ? 0xff7020 : 0xffd040 });
        if (Math.random() < 0.15) fx.puff({ x: p.x, y: p.y, z: p.z, vy: 0.6, life: 0.7, size: 0.4, grow: 0.6, color: 0xd0c8c0, alpha: 0.25 });
      }
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
  private arrows: THREE.Group[] = [];
  private emitT = 0;
  data: ZoneSnap;
  localT = 0;
  constructor(z: ZoneSnap) {
    this.kind = z.k;
    this.data = z;
    this.localT = z.t;
    const col = z.k === 'rain' ? 0x8ad0ff : z.k === 'burn' ? 0xff6a20 : z.k === 'meteor' ? 0xff6a1a : z.k === 'bomb' ? 0xffa030 : 0xff2a2a;
    if (z.k === 'slam' || z.k === 'bomb') {
      this.fill = new THREE.Mesh(flatGeo, texMat(dangerTex(), col, 0.85, false));
      this.ring = new THREE.Mesh(flatGeo, texMat(ringTex(), col, 1, false));
    } else if (z.k === 'burn') {
      this.fill = new THREE.Mesh(flatGeo, texMat(softTex(), col, 0.4));
      this.ring = new THREE.Mesh(flatGeo, texMat(scorchTex(), 0xffffff, 0.85, false));
    } else {
      this.fill = new THREE.Mesh(flatGeo, texMat(softTex(), col, z.k === 'meteor' ? 0.16 : 0.3));
      this.ring = new THREE.Mesh(flatGeo, texMat(runeTex(), col, 0.95));
    }
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
      m.add(rock, glowSprite(0xff7020, 3.2), glowSprite(0xfff0a0, 1.6));
      this.meteor = m;
      this.obj.add(m);
    }
    if (z.k === 'bomb') {
      // Пороховая бочка с тлеющим фитилём
      const b = new THREE.Group();
      const barrel = new THREE.Mesh(G.cyl(0.3, 0.3, 0.55, 12), toon(0x8a5a2b));
      addOutline(barrel, 0.025);
      b.add(barrel);
      for (const y of [-0.18, 0.18]) {
        const hoop = new THREE.Mesh(G.torus(0.31, 0.03, Math.PI * 2, 4, 14), toon(0x4a4a52));
        hoop.rotation.x = Math.PI / 2;
        hoop.position.y = y;
        b.add(hoop);
      }
      const fuse = glowSprite(0xffb030, 0.7, 0.9);
      fuse.position.y = 0.4;
      b.add(fuse);
      this.meteor = b;
      this.obj.add(b);
    }
    if (z.k === 'rain') {
      for (let i = 0; i < 12; i++) {
        const a = new THREE.Group();
        const shaft = new THREE.Mesh(G.cyl(0.025, 0.025, 0.8, 4), toon(0xe8f0ff));
        const tr = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 1.6).translate(0, 0.9, 0), texMat(trailTex(), 0xbfe4ff, 0.7));
        a.add(shaft, tr);
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
    if (z.k === 'bomb' && this.meteor) {
      // Бочка прилетает по дуге и, подскочив, ждёт взрыва
      const k = Math.min(1, t / Math.max(0.01, z.delay));
      const fk = Math.min(1, k / 0.6);
      this.fill.scale.setScalar(Math.max(0.01, z.r * k));
      (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.sin(t * 30) * 0.4;
      const hop = fk < 1 ? Math.sin(fk * Math.PI) * 3.5 : Math.abs(Math.sin((k - 0.6) * 14)) * 0.25 * (1 - k);
      this.meteor.position.set(-(1 - fk) * 4, 0.3 + hop, -(1 - fk) * 1.5);
      this.meteor.rotation.z = (1 - fk) * 6;
      this.meteor.scale.setScalar(1 + (k > 0.8 ? Math.sin(t * 50) * 0.08 : 0));
      if (Math.random() < 0.6) {
        const p = this.meteor.position;
        fx.glow({ x: z.x + p.x, y: p.y + 0.45, z: z.z + p.z, vx: Math.random() - 0.5, vy: 1.5, vz: Math.random() - 0.5, life: 0.35, size: 0.14, color: Math.random() < 0.5 ? 0xffd060 : 0xff7a20 });
      }
    } else if (z.k === 'slam' || z.k === 'meteor') {
      const k = Math.min(1, t / Math.max(0.01, z.delay));
      this.fill.scale.setScalar(Math.max(0.01, z.r * k));
      (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.sin(t * 22) * 0.4;
      if (z.k === 'meteor') this.ring.rotation.y += dt * 1.5;
      if (this.meteor) {
        const h = (1 - k) * 16;
        this.meteor.position.set(-(1 - k) * 7, h + 0.5, -(1 - k) * 5);
        this.meteor.children[0].rotation.x += dt * 4;
        const p = this.meteor.position;
        for (let i = 0; i < 2; i++) fx.glow({ x: z.x + p.x, y: p.y, z: z.z + p.z, vx: Math.random() - 0.5, vy: 1, vz: Math.random() - 0.5, life: 0.5, size: 0.9, grow: -1.2, color: Math.random() < 0.5 ? 0xff7020 : 0xffd040 });
        if (Math.random() < 0.3) fx.puff({ x: z.x + p.x, y: p.y, z: z.z + p.z, vy: 0.5, life: 0.9, size: 0.6, grow: 0.8, color: 0xa09890, alpha: 0.3 });
      }
    } else {
      this.ring.rotation.y += dt * (z.k === 'rain' ? 0.8 : 0.2);
      const fade = Math.max(0, Math.min(1, (z.dur - t) / 0.3, t / 0.15));
      (this.fill.material as THREE.MeshBasicMaterial).opacity = (z.k === 'burn' ? 0.4 : 0.3) * fade;
      (this.ring.material as THREE.MeshBasicMaterial).opacity = (z.k === 'burn' ? 0.85 : 0.95) * fade;
      this.emitT -= dt;
      if (this.emitT <= 0) {
        this.emitT = z.k === 'rain' ? 0.035 : 0.04;
        const a = Math.random() * Math.PI * 2;
        const d = Math.sqrt(Math.random()) * z.r;
        if (z.k === 'burn') {
          fx.glow({ x: z.x + Math.cos(a) * d, y: 0.1, z: z.z + Math.sin(a) * d, vy: 1.5 + Math.random(), life: 0.6, size: 0.5, grow: -0.6, color: Math.random() < 0.5 ? 0xff7020 : 0xffc040 });
          if (Math.random() < 0.3) fx.glow({ x: z.x + Math.cos(a) * d, y: 0.2, z: z.z + Math.sin(a) * d, vy: 2.5, life: 1, size: 0.1, color: 0xffd04a });
        } else {
          const ar = this.arrows.find((x) => !x.visible);
          if (ar) {
            ar.visible = true;
            ar.position.set(Math.cos(a) * d, 7, Math.sin(a) * d);
            ar.userData.vy = -30;
          }
        }
      }
      for (const ar of this.arrows) {
        if (!ar.visible) continue;
        ar.position.y += ar.userData.vy * dt;
        if (ar.position.y < 0.3) {
          ar.visible = false;
          fx.glow({ x: z.x + ar.position.x, y: 0.2, z: z.z + ar.position.z, vy: 0.5, life: 0.25, size: 0.3, color: 0xbfe4ff });
          fx.puff({ x: z.x + ar.position.x, y: 0.15, z: z.z + ar.position.z, vy: 0.3, life: 0.4, size: 0.3, grow: 0.6, color: 0xd8c8a8, alpha: 0.4 });
        }
      }
    }
  }
}

let laneCanvas: THREE.CanvasTexture | null = null;
/** Полоса-подсказка: мягкие края и шевроны, указывающие направление. */
function laneTex(): THREE.CanvasTexture {
  if (laneCanvas) return laneCanvas;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d')!;
  const edge = g.createLinearGradient(0, 0, 64, 0);
  edge.addColorStop(0, 'rgba(255,255,255,1)');
  edge.addColorStop(0.12, 'rgba(255,255,255,0.55)');
  edge.addColorStop(0.88, 'rgba(255,255,255,0.55)');
  edge.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = edge;
  g.fillRect(0, 0, 64, 256);
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = 6;
  for (let y = 16; y < 256; y += 48) {
    g.beginPath();
    g.moveTo(14, y + 18);
    g.lineTo(32, y);
    g.lineTo(50, y + 18);
    g.stroke();
  }
  laneCanvas = new THREE.CanvasTexture(c);
  laneCanvas.colorSpace = THREE.SRGBColorSpace;
  laneCanvas.wrapT = THREE.RepeatWrapping;
  return laneCanvas;
}
