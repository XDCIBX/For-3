import * as THREE from 'three';
import { G, glow, part, toon } from './toon';
import { scaleTex } from './textures';
import { limb } from './anatomy';

/**
 * Обитатели логова: огненный сгусток, дракончик, огнеплюй и финальный босс —
 * большой красный дракон. Каждое существо — своя модель и анимация,
 * подключаемая к MobModel.
 */

export interface CreatureInput {
  moving: boolean;
  windup: boolean;
  stun: boolean;
  frozen: boolean;
  /** Время с последней атаки (с). */
  atk: number;
  /** Умение дракона: B — дыхание, L — шары, S — удар, R — рёв. */
  skill: string;
}

export interface Creature {
  readonly group: THREE.Group;
  /** Где пасть (для огня из пасти). */
  readonly mouth: THREE.Object3D;
  update(dt: number, s: CreatureInput): void;
}

/** Перепончатое крыло: плечо в начале координат, размах вдоль +x, задняя кромка — к −z. */
function wing(span: number, membrane: number, bone: number): THREE.Group {
  const g = new THREE.Group();
  const pts: [number, number][] = [[0, 0.06], [0.42, 0.2], [0.72, 0.16], [1.0, -0.02], [0.86, -0.32], [0.66, -0.22], [0.5, -0.52], [0.32, -0.3], [0.16, -0.5], [0.04, -0.28], [0, -0.16]];
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) shape.lineTo(p[0], p[1]);
  const geo = new THREE.ShapeGeometry(shape).rotateX(Math.PI / 2);
  const memb = new THREE.Mesh(geo, toon(membrane, { side: THREE.DoubleSide, rough: 0.7 }));
  memb.userData.noBake = true;
  const inner = new THREE.Group();
  inner.add(memb);
  // Кости крыла: плечевая, кисть и пальцы-спицы
  const boneTo = (x0: number, z0: number, x1: number, z1: number, r: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const b = part(G.cyl(r * 0.6, r, len, 6), bone, { rough: 0.6 });
    b.position.set((x0 + x1) / 2, 0.01, (z0 + z1) / 2);
    // Цилиндр вдоль y → кладём вдоль отрезка в плоскости крыла
    b.rotation.order = 'YXZ';
    b.rotation.set(Math.PI / 2, Math.atan2(x1 - x0, z1 - z0), 0);
    inner.add(b);
  };
  boneTo(0, 0.06, 0.42, 0.2, 0.032);
  boneTo(0.42, 0.2, 1.0, -0.02, 0.022);
  boneTo(0.42, 0.2, 0.86, -0.32, 0.016);
  boneTo(0.42, 0.2, 0.5, -0.52, 0.016);
  boneTo(0.42, 0.2, 0.16, -0.5, 0.014);
  inner.add(part(G.cone(0.04, 0.12, 5), 0xe8dcc0, { pos: [0.44, 0.03, 0.24], rot: [-Math.PI / 2, 0, 0] }));
  inner.scale.setScalar(span);
  g.add(inner);
  return g;
}

/** Хвост из звеньев: каждое следующее тоньше; возвращает звенья для анимации. */
function tail(n: number, r0: number, r1: number, segLen: number, col: number, spike: number, map?: THREE.Texture): THREE.Group[] {
  const segs: THREE.Group[] = [];
  let parent: THREE.Group | null = null;
  for (let i = 0; i < n; i++) {
    const g = new THREE.Group();
    g.userData.anim = true;
    const r = THREE.MathUtils.lerp(r0, r1, i / (n - 1));
    const m = part(limb(r, r * 0.85, segLen, 0.04, 10), col, { rot: [Math.PI / 2, 0, 0], map });
    g.add(m);
    if (spike) g.add(part(G.cone(r * 0.45, r * 1.4 * spike, 5), 0x2a1410, { pos: [0, r * 0.95, -segLen * 0.4], rot: [-0.5, 0, 0] }));
    if (parent) {
      g.position.z = -segLen;
      parent.add(g);
    }
    segs.push(g);
    parent = g;
  }
  return segs;
}

// ================================================================== Огненный сгусток

class Ember implements Creature {
  readonly group = new THREE.Group();
  readonly mouth = new THREE.Object3D();
  private core: THREE.Mesh;
  private shells: THREE.Mesh[] = [];
  private tongues = new THREE.Group();
  private t = Math.random() * 10;
  constructor() {
    const g = this.group;
    this.core = new THREE.Mesh(G.ico(0.32, 2), toon(0xffd070, { emissive: 0xff8a20, emissiveIntensity: 2.2 }));
    g.add(this.core);
    for (const [r, c, o] of [
      [0.5, 0xff6a10, 0.45],
      [0.72, 0xff3a00, 0.22],
    ] as const) {
      const sh = new THREE.Mesh(G.sphere(r, 14, 10), glow(c, o));
      this.shells.push(sh);
      g.add(sh);
    }
    // Языки пламени
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const f = new THREE.Mesh(G.cone(0.13, 0.55, 6), toon(0xffa030, { emissive: 0xff6010, emissiveIntensity: 1.8 }));
      f.position.set(Math.cos(a) * 0.22, 0.25, Math.sin(a) * 0.22);
      f.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
      this.tongues.add(f);
    }
    g.add(this.tongues);
    // Тёмные провалы-глаза
    for (const x of [-0.1, 0.1]) {
      const e = new THREE.Mesh(G.sphere(0.05, 6, 4), new THREE.MeshBasicMaterial({ color: 0x2a0a00 }));
      e.position.set(x, 0.06, 0.3);
      e.scale.set(1, 0.5, 0.5);
      g.add(e);
    }
    g.position.y = 0.9;
  }
  update(dt: number, s: CreatureInput) {
    this.t += dt;
    const t = this.t;
    const swell = s.windup ? 1 + Math.min(1, s.atk) * 0 + 0.35 + Math.sin(t * 40) * 0.12 : 1;
    this.group.position.y = 0.9 + Math.sin(t * 4) * 0.12;
    this.core.scale.setScalar(swell * (1 + Math.sin(t * 13) * 0.06));
    this.shells.forEach((sh, i) => sh.scale.setScalar(swell * (1 + Math.sin(t * (9 + i * 4)) * 0.1)));
    this.tongues.rotation.y += dt * 3;
    this.tongues.children.forEach((f, i) => (f.scale.y = 0.8 + Math.sin(t * 11 + i * 1.7) * 0.35));
  }
}

// ================================================================== Дракончик и огнеплюй

class Drake implements Creature {
  readonly group = new THREE.Group();
  readonly mouth = new THREE.Object3D();
  private body = new THREE.Group();
  private neck: THREE.Group[] = [];
  private head = new THREE.Group();
  private jaw = new THREE.Group();
  private wings: THREE.Group[] = [];
  private tail: THREE.Group[];
  private throat: THREE.Mesh | null = null;
  private t = Math.random() * 10;
  private spit: boolean;
  constructor(spit: boolean) {
    this.spit = spit;
    const col = spit ? 0x3a2a34 : 0x8a2a16;
    const belly = spit ? 0xd86a20 : 0xd8a058;
    const horn = 0xe0d2b4;
    const map = scaleTex();
    const g = this.group;
    g.add(this.body);
    this.body.position.y = 1.15;
    for (const o of [this.body, this.head, this.jaw]) o.userData.anim = true;
    // Туловище и брюхо
    this.body.add(part(G.capsule(0.24, 0.55), col, { rot: [Math.PI / 2, 0, 0], map, rough: 0.55 }));
    this.body.add(part(G.capsule(0.19, 0.45), belly, { rot: [Math.PI / 2, 0, 0], pos: [0, -0.07, 0.03], rough: 0.6 }));
    for (let i = 0; i < 5; i++) this.body.add(part(G.cone(0.05, 0.16, 5), 0x2a1410, { pos: [0, 0.24, 0.3 - i * 0.15], rot: [-0.4, 0, 0] }));
    // Шея из двух звеньев и голова
    let parent: THREE.Object3D = this.body;
    const nl = 0.22;
    for (let i = 0; i < 2; i++) {
      const n = new THREE.Group();
      n.userData.anim = true;
      n.position.set(0, i === 0 ? 0.08 : 0, i === 0 ? 0.4 : nl);
      n.rotation.x = -0.45;
      n.add(part(limb(0.12 - i * 0.02, 0.1 - i * 0.02, nl, 0.05, 8), col, { rot: [-Math.PI / 2, 0, 0], map }));
      n.add(part(G.cone(0.035, 0.12, 5), 0x2a1410, { pos: [0, 0.11, 0.1], rot: [-0.5, 0, 0] }));
      parent.add(n);
      this.neck.push(n);
      parent = n;
    }
    this.head.position.z = nl;
    this.head.rotation.x = 0.5;
    parent.add(this.head);
    const H = this.head;
    H.add(part(G.sphere(0.15, 12, 10), col, { scale: [1, 0.85, 1.15], map }));
    H.add(part(G.box(0.17, 0.09, 0.24), col, { pos: [0, -0.02, 0.17], map }));
    for (const s of [-1, 1]) {
      H.add(part(G.cone(0.035, 0.22, 6), horn, { pos: [s * 0.08, 0.12, -0.1], rot: [-0.9, 0, s * 0.3] }));
      H.add(part(G.cone(0.02, 0.1, 5), horn, { pos: [s * 0.12, 0.0, -0.02], rot: [-1.3, 0, s * 0.9] }));
      const e = new THREE.Mesh(G.sphere(0.03, 8, 6), toon(0xffd040, { emissive: 0xffa010, emissiveIntensity: 1.5 }));
      e.position.set(s * 0.075, 0.05, 0.1);
      H.add(e);
    }
    // Нижняя челюсть
    this.jaw.position.set(0, -0.06, 0.04);
    this.jaw.add(part(G.box(0.14, 0.04, 0.24), belly, { pos: [0, -0.02, 0.12] }));
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) this.jaw.add(part(G.cone(0.012, 0.04, 4), 0xf4ecd8, { pos: [s * 0.05, 0.02, 0.18 - i * 0.05] }));
    H.add(this.jaw);
    this.mouth.position.set(0, -0.04, 0.32);
    H.add(this.mouth);
    if (spit) {
      // Огнеплюй: светящийся зоб
      this.throat = new THREE.Mesh(G.sphere(0.11, 10, 8), toon(0xff7a20, { emissive: 0xff5a10, emissiveIntensity: 1 }));
      this.throat.position.set(0, -0.09, 0.42);
      this.body.add(this.throat);
    }
    // Крылья
    for (const s of [-1, 1]) {
      const w = wing(1.25, spit ? 0x2a1a24 : 0x5a1a10, spit ? 0x1a1018 : 0x3a120a);
      w.userData.anim = true;
      w.scale.x = s;
      w.position.set(s * 0.14, 0.15, 0.18);
      this.body.add(w);
      this.wings.push(w);
    }
    // Лапы, поджатые в полёте
    for (const [x, z] of [
      [-0.14, 0.25],
      [0.14, 0.25],
      [-0.15, -0.22],
      [0.15, -0.22],
    ]) {
      this.body.add(part(limb(0.05, 0.035, 0.22, 0.1, 6), col, { pos: [x, -0.15, z], rot: [1.0, 0, 0] }));
    }
    // Хвост
    this.tail = tail(4, 0.13, 0.05, 0.24, col, 0.6, map);
    this.tail[0].position.set(0, 0, -0.42);
    this.body.add(this.tail[0]);
    this.tail[3].add(part(G.cone(0.1, 0.18, 4), 0x2a1410, { pos: [0, 0, -0.3], rot: [-Math.PI / 2, 0, 0], scale: [1, 1, 0.3] }));
  }
  update(dt: number, s: CreatureInput) {
    this.t += dt;
    const t = this.t;
    const fast = s.moving ? 1 : 0.6;
    const flap = Math.sin(t * (9 + fast * 4)) * (0.55 + fast * 0.2);
    if (!s.frozen) {
      this.wings[0].rotation.z = -flap;
      this.wings[1].rotation.z = flap;
    }
    this.body.position.y = 1.15 + Math.sin(t * (9 + fast * 4) + 1.2) * 0.07;
    this.body.rotation.x = s.moving ? 0.12 : 0.02;
    this.tail.forEach((g, i) => (g.rotation.y = Math.sin(t * 3 - i * 0.7) * 0.22));
    this.tail.forEach((g, i) => (g.rotation.x = 0.06 + Math.sin(t * 2 - i) * 0.05));
    // Шея и голова: покой, замах, укус/плевок
    let neckX = -0.45;
    let headX = 0.5;
    let jaw = 0.05 + Math.max(0, Math.sin(t * 1.3)) * 0.05;
    if (s.windup) {
      neckX = -0.85;
      headX = 0.2;
      jaw = 0.6;
    }
    const a = s.atk / 0.3;
    if (a < 1) {
      const e = Math.sin(a * Math.PI);
      neckX = -0.45 + e * 0.55;
      headX = 0.5 + e * 0.15;
      jaw = this.spit ? 0.7 * e : a < 0.5 ? 0.6 : 0.6 * (1 - (a - 0.5) * 2);
    }
    this.neck[0].rotation.x = neckX;
    this.neck[1].rotation.x = neckX * 0.4;
    this.head.rotation.x = headX;
    this.jaw.rotation.x = jaw;
    if (this.throat) {
      const k = s.windup ? 1.6 : 1;
      this.throat.scale.setScalar(k * (1 + Math.sin(t * 6) * 0.08));
    }
  }
}

// ================================================================== Красный дракон

class Dragon implements Creature {
  readonly group = new THREE.Group();
  readonly mouth = new THREE.Object3D();
  private body = new THREE.Group();
  private neck: THREE.Group[] = [];
  private head = new THREE.Group();
  private jaw = new THREE.Group();
  private wings: THREE.Group[] = [];
  private tail: THREE.Group[];
  private legs: { hip: THREE.Group; knee: THREE.Group; ph: number; front: boolean }[] = [];
  private throat: THREE.Mesh;
  private walk = 0;
  private t = 0;
  private skill = '';
  private skillT = 0;
  constructor() {
    const red = 0x9a1c12;
    const dark = 0x5a0e08;
    const belly = 0xc88a4a;
    const horn = 0xe8dcc0;
    const claw = 0x1a1210;
    const map = scaleTex();
    const g = this.group;
    const B = this.body;
    B.userData.anim = true;
    g.add(B);
    const hipY = 1.9;
    B.position.y = hipY;

    // Туловище: мощная грудь, брюхо в пластинах, хребет в шипах
    B.add(part(G.capsule(1.0, 2.3), red, { rot: [Math.PI / 2, 0, 0], scale: [1.05, 0.95, 1], map, rough: 0.5 }));
    B.add(part(G.sphere(1.15, 20, 14), red, { pos: [0, 0.15, 1.1], scale: [1, 0.95, 1.05], map, rough: 0.5 }));
    for (let i = 0; i < 7; i++) {
      const z = 1.6 - i * 0.5;
      B.add(part(G.cyl(0.55 - Math.abs(i - 2) * 0.05, 0.55 - Math.abs(i - 2) * 0.05, 0.4, 14), belly, { pos: [0, -0.82 + Math.abs(i - 2) * 0.03, z], rot: [Math.PI / 2, 0, 0], scale: [1.2, 1, 0.35], rough: 0.6 }));
    }
    for (let i = 0; i < 9; i++) B.add(part(G.cone(0.16 - i * 0.008, 0.6 - i * 0.03, 6), 0x2a0a06, { pos: [0, 1.0 - Math.abs(i - 3) * 0.04, 1.6 - i * 0.48], rot: [-0.45, 0, 0], rough: 0.4 }));

    // Шея из пяти звеньев, изгибается вверх
    let parent: THREE.Object3D = B;
    const nl = 0.62;
    for (let i = 0; i < 5; i++) {
      const n = new THREE.Group();
      n.userData.anim = true;
      const r = 0.55 - i * 0.05;
      n.position.set(0, i === 0 ? 0.55 : 0, i === 0 ? 2.0 : nl);
      n.rotation.x = i === 0 ? -0.75 : 0.12;
      n.add(part(limb(r, r * 0.92, nl + 0.15, 0.04, 12), red, { rot: [-Math.PI / 2, 0, 0], map, rough: 0.5 }));
      n.add(part(G.cyl(r * 0.62, r * 0.58, nl, 10), 0xa8683a, { pos: [0, -r * 0.42, nl * 0.5], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.5], rough: 0.6 }));
      n.add(part(G.cone(0.1, 0.42, 5), 0x2a0a06, { pos: [0, r * 0.95, nl * 0.4], rot: [-0.6, 0, 0] }));
      parent.add(n);
      this.neck.push(n);
      parent = n;
    }

    // Голова: череп, длинная морда, надбровья, рога, глаза, клыки
    const H = this.head;
    H.userData.anim = true;
    H.position.z = nl;
    H.rotation.x = 0.85;
    parent.add(H);
    H.add(part(G.sphere(0.5, 18, 14), red, { scale: [1, 0.8, 1.15], map, rough: 0.5 }));
    // Морда сужается к ноздрям
    H.add(part(G.cyl(0.2, 0.34, 1.05, 12), red, { pos: [0, -0.06, 0.72], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.62], map, rough: 0.5 }));
    H.add(part(G.sphere(0.21, 12, 8), red, { pos: [0, -0.02, 1.22], scale: [1.0, 0.62, 0.8], map }));
    H.add(part(G.cone(0.08, 0.22, 6), 0x2a0a06, { pos: [0, 0.14, 1.12], rot: [-0.6, 0, 0] }));
    for (const s of [-1, 1]) {
      // Надбровная дуга и глаз
      H.add(part(G.box(0.22, 0.1, 0.42), dark, { pos: [s * 0.24, 0.24, 0.32], rot: [0.25, s * 0.2, s * -0.15] }));
      const eye = new THREE.Mesh(G.sphere(0.08, 10, 8), toon(0xffc020, { emissive: 0xff9a00, emissiveIntensity: 1.8 }));
      eye.position.set(s * 0.27, 0.13, 0.42);
      eye.scale.set(0.7, 0.8, 1);
      H.add(eye);
      const pupil = new THREE.Mesh(G.box(0.015, 0.11, 0.02), new THREE.MeshBasicMaterial({ color: 0x100500 }));
      pupil.position.set(s * 0.318, 0.13, 0.465);
      H.add(pupil);
      // Большие рога назад, изогнутые
      let hp: THREE.Object3D = H;
      const hornG = new THREE.Group();
      hornG.position.set(s * 0.26, 0.3, -0.15);
      hornG.rotation.set(-1.0, 0, s * -0.35);
      H.add(hornG);
      hp = hornG;
      for (let k = 0; k < 3; k++) {
        const seg = new THREE.Group();
        seg.position.y = k === 0 ? 0 : 0.42;
        seg.rotation.x = k === 0 ? 0 : -0.35;
        seg.add(part(G.cyl(0.07 - k * 0.022, 0.13 - k * 0.03, 0.46, 8), horn, { pos: [0, 0.21, 0], rough: 0.45 }));
        hp.add(seg);
        hp = seg;
      }
      hp.add(part(G.cone(0.05, 0.22, 7), horn, { pos: [0, 0.52, 0], rough: 0.4 }));
      // Шипы на скулах и ноздри
      for (let k = 0; k < 3; k++) H.add(part(G.cone(0.05, 0.28, 5), horn, { pos: [s * (0.36 + k * 0.03), -0.1 - k * 0.08, -0.05 - k * 0.12], rot: [-1.6, 0, s * (0.9 + k * 0.1)] }));
      H.add(part(G.sphere(0.045, 6, 4), 0x1a0806, { pos: [s * 0.1, 0.06, 1.36] }));
      // Верхние клыки
      for (let k = 0; k < 4; k++) H.add(part(G.cone(0.03, 0.14, 5), 0xf4ecd8, { pos: [s * (0.27 - k * 0.025), -0.22, 0.5 + k * 0.19], rot: [Math.PI, 0, 0] }));
    }
    // Нижняя челюсть с клыками и раскалённой пастью
    this.jaw.userData.anim = true;
    this.jaw.position.set(0, -0.25, 0.05);
    this.jaw.add(part(G.cyl(0.15, 0.27, 1.05, 10), red, { pos: [0, -0.06, 0.6], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.42], map }));
    this.jaw.add(part(G.box(0.3, 0.04, 0.85), 0x5a1008, { pos: [0, 0.03, 0.6] }));
    for (const s of [-1, 1]) for (let k = 0; k < 4; k++) this.jaw.add(part(G.cone(0.028, 0.12, 5), 0xf4ecd8, { pos: [s * (0.22 - k * 0.025), 0.05, 0.45 + k * 0.19] }));
    H.add(this.jaw);
    this.throat = new THREE.Mesh(G.sphere(0.2, 10, 8), glow(0xff6a10, 0.0));
    this.throat.position.set(0, -0.2, 0.5);
    H.add(this.throat);
    this.mouth.position.set(0, -0.2, 1.3);
    H.add(this.mouth);

    // Лапы: передние и задние, с когтями
    for (const [x, z, front] of [
      [-0.95, 1.25, true],
      [0.95, 1.25, true],
      [-1.0, -1.15, false],
      [1.0, -1.15, false],
    ] as const) {
      const hip = new THREE.Group();
      hip.userData.anim = true;
      hip.position.set(x, -0.1, z);
      const tl = front ? 0.95 : 1.0;
      hip.add(part(limb(0.42, 0.28, tl, 0.18, 12), red, { map, rough: 0.5 }));
      const knee = new THREE.Group();
      knee.userData.anim = true;
      knee.position.y = -tl;
      hip.add(knee);
      const sl = hipY - tl - 0.12;
      knee.add(part(limb(0.28, 0.2, sl, 0.12, 10), red, { map, rough: 0.5 }));
      const foot = new THREE.Group();
      foot.position.y = -sl;
      foot.add(part(G.sphere(0.3, 10, 8), red, { scale: [1.1, 0.45, 1.3], map }));
      for (const c of [-1, 0, 1]) foot.add(part(G.cone(0.06, 0.3, 6), claw, { pos: [c * 0.17, -0.02, 0.38], rot: [Math.PI / 2 + 0.3, 0, 0], rough: 0.3 }));
      knee.add(foot);
      B.add(hip);
      this.legs.push({ hip, knee, ph: (x < 0) === front ? 0 : Math.PI, front });
    }

    // Крылья: огромные, сложены полураскрыто
    for (const s of [-1, 1]) {
      const w = wing(5.2, 0x5a120c, 0x3a0a06);
      w.userData.anim = true;
      w.scale.x = s;
      w.position.set(s * 0.75, 0.85, 1.0);
      B.add(w);
      this.wings.push(w);
    }

    // Хвост: восемь звеньев с шипами и пикой на конце
    this.tail = tail(8, 0.62, 0.14, 0.72, red, 1, map);
    this.tail[0].position.set(0, 0.05, -2.0);
    B.add(this.tail[0]);
    const end = this.tail[this.tail.length - 1];
    end.add(part(G.cone(0.35, 0.7, 4), 0x2a0a06, { pos: [0, 0, -0.85], rot: [-Math.PI / 2, 0, Math.PI / 4], scale: [1, 1, 0.35] }));
  }

  update(dt: number, s: CreatureInput) {
    this.t += dt;
    const t = this.t;
    if (s.skill !== this.skill) {
      this.skill = s.skill;
      this.skillT = 0;
    }
    this.skillT += dt;
    const k = this.skillT;
    const mv = s.moving && !s.skill ? 1 : 0;
    if (mv) this.walk += dt * 5.5;
    const B = this.body;

    // Поступь: диагональные пары лап, тело покачивается
    for (const L of this.legs) {
      const ph = this.walk + L.ph;
      const sw = Math.sin(ph) * 0.42 * mv;
      L.hip.rotation.x = sw + (L.front ? -0.05 : 0.12);
      L.knee.rotation.x = (L.front ? -0.1 : 0.25) + Math.max(0, -Math.cos(ph)) * 0.7 * mv;
    }
    let bodyY = 1.9 + Math.sin(this.walk * 2) * 0.05 * mv + Math.sin(t * 1.4) * 0.03;
    let pitch = 0;
    let neck = 0;
    let headX = 0.85;
    let jaw = 0.05 + Math.max(0, Math.sin(t * 0.9)) * 0.06;
    let wingZ = 0.95 + Math.sin(t * 1.1) * 0.04;
    let wingY = 1.15;
    let flap = 0;
    let throat = 0;
    let neckYaw = Math.sin(t * 0.6) * 0.12;

    // Укус
    const a = s.atk / 0.55;
    if (!s.skill && (s.windup || a < 1)) {
      if (s.windup) {
        neck = -0.3;
        headX = 0.6;
        jaw = 0.75;
      } else {
        const e = Math.sin(a * Math.PI);
        neck = 0.45 * e;
        headX = 0.85 + 0.3 * e;
        jaw = a < 0.4 ? 0.8 : 0.8 * (1 - (a - 0.4) / 0.6);
      }
    }
    switch (s.skill) {
      case 'B': {
        // Дыхание: голова опущена вперёд, пасть раскрыта, в горле жар
        const w = Math.min(1, k / 0.9);
        neck = 0.25 * w - 0.15 * (1 - w);
        headX = 0.85 + 0.35 * w;
        jaw = 0.9 * w;
        throat = k < 0.9 ? w * 0.6 : 0.9 + Math.sin(t * 30) * 0.1;
        wingZ = 0.8;
        wingY = 0.8;
        neckYaw = Math.sin(k * 2) * 0.1;
        break;
      }
      case 'L': {
        // Плевок шарами: голова запрокинута, затем выброс вперёд-вверх
        const w = Math.min(1, k / 0.55);
        const thr = k > 0.55 ? Math.min(1, (k - 0.55) / 0.2) : 0;
        neck = -0.5 * w + 0.9 * thr;
        headX = 0.85 - 0.6 * w + 0.4 * thr;
        jaw = 0.4 * w + 0.5 * thr;
        throat = w * 0.8 * (1 - thr * 0.6);
        break;
      }
      case 'S': {
        // Удар: встаёт на дыбы, раскрывает крылья — и обрушивается с ударом хвоста
        const up = k < 1.0 ? Math.sin(Math.min(1, k / 0.8) * Math.PI * 0.5) : Math.max(0, 1 - (k - 1.0) / 0.15);
        pitch = -0.5 * up;
        bodyY += 0.5 * up;
        wingZ = 0.95 - 0.6 * up;
        wingY = 1.15 - 0.95 * up;
        flap = k < 1.0 ? Math.sin(k * 14) * 0.25 : 0;
        neck = -0.3 * up;
        jaw = 0.5 * up;
        break;
      }
      case 'R': {
        // Рёв: голова вверх, пасть настежь, крылья распахнуты и дрожат
        const w = Math.min(1, k / 0.4);
        neck = -0.55 * w;
        headX = 0.85 - 0.7 * w;
        jaw = 1.0 * w;
        wingZ = 0.95 - 0.65 * w;
        wingY = 1.15 - 1.0 * w;
        flap = Math.sin(t * 25) * 0.08 * w;
        throat = 0.5 * w;
        break;
      }
    }
    B.position.y = bodyY;
    B.rotation.x = pitch;
    this.neck[0].rotation.set(-0.75 + neck * 0.5, neckYaw, 0);
    for (let i = 1; i < this.neck.length; i++) this.neck[i].rotation.set(0.12 + neck * 0.18, neckYaw * 0.5, 0);
    this.head.rotation.x = headX;
    this.jaw.rotation.x = jaw * 0.55;
    (this.throat.material as THREE.MeshBasicMaterial).opacity = Math.min(1, throat);
    this.throat.scale.setScalar(1 + throat * 0.8);
    for (const [i, w] of this.wings.entries()) {
      const sgn = i === 0 ? -1 : 1;
      w.rotation.set(0, sgn * wingY, sgn * (wingZ + flap));
    }
    this.tail.forEach((g, i) => {
      g.rotation.y = Math.sin(t * 1.3 - i * 0.55) * 0.12 + (s.skill === 'S' && k > 0.9 && k < 1.3 ? Math.sin((k - 0.9) * 8) * 0.35 : 0);
      g.rotation.x = 0.05 - (i < 2 ? 0.08 : 0);
    });
  }
}

export function buildCreature(kind: string): Creature | null {
  switch (kind) {
    case 'ember':
      return new Ember();
    case 'drake':
      return new Drake(false);
    case 'spitter':
      return new Drake(true);
    case 'dragon':
      return new Dragon();
    default:
      return null;
  }
}
