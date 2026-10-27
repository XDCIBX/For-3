import * as THREE from 'three';
import { G, glow, part, toon } from './toon';
import { repeated, rockTex, sandTex, stoneTex, texturize, woodTex } from './textures';
import { Flame, canvasLabel, makeSun, type Stage } from './env';
import type { Particles } from './particles';

/** Таверна «Пьяный Дракон» — диорама в разрезе. */
export class TavernStage implements Stage {
  readonly name = 'tavern';
  readonly scene = new THREE.Scene();
  readonly sun: THREE.DirectionalLight;
  shadowsDirty = true;
  private flames: Flame[] = [];
  private lights: THREE.PointLight[] = [];
  private keeper = new THREE.Group();
  private keeperArm = new THREE.Group();
  private cat = new THREE.Group();
  private t = 0;
  private emitT = 0;
  /** Позиции героев перед стойкой. */
  readonly slots = [new THREE.Vector3(-2.3, 0, 1.6), new THREE.Vector3(0, 0, 2.2), new THREE.Vector3(2.3, 0, 1.6)];

  constructor() {
    const s = this.scene;
    s.background = new THREE.Color(0x1e1420);
    s.add(new THREE.HemisphereLight(0xffd8a8, 0x3a2418, 1.0));
    this.sun = makeSun(0.9, 0xffc890, [6, 14, 10], 14, 1024);
    s.add(this.sun, this.sun.target);

    // Пол из досок
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 12).rotateX(-Math.PI / 2), toon(0xa8743f, { map: repeated(woodTex(), 4, 3) }));
    floor.receiveShadow = true;
    s.add(floor);
    // Ковёр
    const rug = new THREE.Mesh(new THREE.CircleGeometry(2.6, 32).rotateX(-Math.PI / 2), toon(0xa8323a));
    rug.scale.set(1.5, 1, 0.8);
    rug.position.set(0, 0.02, 1.8);
    rug.receiveShadow = true;
    s.add(rug);
    const rugIn = new THREE.Mesh(new THREE.RingGeometry(1.9, 2.15, 32).rotateX(-Math.PI / 2), toon(0xffc93c));
    rugIn.scale.set(1.5, 1, 0.8);
    rugIn.position.set(0, 0.03, 1.8);
    s.add(rugIn);

    // Стены
    const wallCol = 0xd8c0a0;
    const back = new THREE.Mesh(G.box(16, 7, 0.4), toon(wallCol));
    back.position.set(0, 3.5, -6);
    back.receiveShadow = true;
    s.add(back);
    const left = new THREE.Mesh(G.box(0.4, 7, 12), toon(0xc8b090));
    left.position.set(-8, 3.5, 0);
    left.receiveShadow = true;
    s.add(left);
    // Каменный цоколь
    for (let i = 0; i < 16; i++) {
      const st = part(G.box(0.95, 0.9, 0.2), i % 2 ? 0x8a8078 : 0x9a9088, { pos: [-7.5 + i, 0.45, -5.75], outline: 0.02 });
      s.add(st);
    }
    // Балки
    for (const x of [-7.6, -3, 3, 7.6]) s.add(part(G.box(0.4, 7, 0.4), 0x5a3a22, { pos: [x, 3.5, -5.7], outline: 0.03 }));
    s.add(part(G.box(16.4, 0.4, 0.45), 0x5a3a22, { pos: [0, 5.4, -5.7], outline: 0.03 }));
    for (const z of [-3, 1, 5]) s.add(part(G.box(0.45, 0.4, 0.45), 0x5a3a22, { pos: [-7.7, 5.4, z], outline: 0.03 }));
    for (const z of [-4, 0, 4]) {
      const beam = part(G.box(16, 0.35, 0.35), 0x4a2e1a, { pos: [0, 6.6, z], outline: 0.03 });
      s.add(beam);
    }

    // Окно с луной
    const win = new THREE.Group();
    const glass = new THREE.Mesh(G.box(2.2, 1.8, 0.1), toon(0x2a4a8a, { emissive: 0x3a5aa8, emissiveIntensity: 0.6 }));
    win.add(glass);
    const moon = new THREE.Mesh(G.sphere(0.3, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff6d0 }));
    moon.position.set(0.5, 0.4, 0.06);
    moon.scale.z = 0.2;
    win.add(moon);
    for (let i = 0; i < 6; i++) {
      const st = new THREE.Mesh(G.sphere(0.03, 4, 3), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      st.position.set(-0.9 + Math.random() * 1.4, -0.6 + Math.random() * 1.3, 0.06);
      win.add(st);
    }
    win.add(part(G.box(2.4, 0.15, 0.2), 0x5a3a22, { pos: [0, 0.95, 0.05], outline: 0.02 }));
    win.add(part(G.box(2.4, 0.15, 0.2), 0x5a3a22, { pos: [0, -0.95, 0.05], outline: 0.02 }));
    win.add(part(G.box(0.12, 1.8, 0.15), 0x5a3a22, { pos: [0, 0, 0.06], outline: false }));
    win.add(part(G.box(2.2, 0.1, 0.15), 0x5a3a22, { pos: [0, 0, 0.06], outline: false }));
    win.position.set(-5, 3.6, -5.75);
    s.add(win);

    // Вывеска
    const signTex = canvasLabel('Пьяный Дракон', { color: '#ffd54a', stroke: '#3a1a0a', w: 1024, h: 160 });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.75), new THREE.MeshBasicMaterial({ map: signTex, transparent: true }));
    const board = part(G.box(5, 1.0, 0.12), 0x6a4024, { outline: 0.03 });
    board.position.z = -0.08;
    const signG = new THREE.Group();
    signG.add(board, sign);
    sign.position.z = 0.01;
    signG.position.set(1.5, 4.9, -5.6);
    s.add(signG);
    // Голова дракона-трофей
    const dragon = new THREE.Group();
    dragon.add(part(G.sphere(0.45, 14, 10), 0x4aa84a, { scale: [1, 0.85, 1.3], outline: 0.03 }));
    dragon.add(part(G.box(0.5, 0.3, 0.7), 0x4aa84a, { pos: [0, -0.15, 0.55], outline: 0.025 }));
    for (const x of [-0.25, 0.25]) {
      dragon.add(part(G.cone(0.08, 0.4, 6), 0xfff2d6, { pos: [x, 0.4, -0.1], rot: [-0.6, 0, 0], outline: 0.015 }));
      const e = new THREE.Mesh(G.sphere(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd54a }));
      e.position.set(x * 0.9, 0.12, 0.42);
      dragon.add(e);
    }
    dragon.add(part(G.cyl(0.6, 0.6, 0.12, 16), 0x6a4024, { pos: [0, 0, -0.5], rot: [Math.PI / 2, 0, 0], outline: 0.03 }));
    dragon.position.set(5.6, 4.2, -5.3);
    s.add(dragon);

    // Камин слева
    const fp = new THREE.Group();
    fp.add(part(G.box(0.8, 3.0, 3.0), 0x8a8078, { pos: [0, 1.5, 0], outline: 0.04 }));
    fp.add(part(G.box(0.6, 3.5, 1.8), 0x7a7068, { pos: [0, 4.5, 0], outline: 0.035 }));
    fp.add(part(G.box(1.1, 0.25, 3.3), 0x5a3a22, { pos: [0.1, 3.05, 0], outline: 0.03 }));
    const hole = new THREE.Mesh(G.box(0.1, 1.4, 1.6), toon(0x1a0e08));
    hole.position.set(0.41, 0.8, 0);
    fp.add(hole);
    fp.position.set(-7.6, 0, -1.5);
    s.add(fp);
    const fire = new Flame(1.1);
    fire.group.position.set(-6.9, 0.05, -1.5);
    s.add(fire.group);
    this.flames.push(fire);
    for (let i = 0; i < 3; i++) s.add(part(G.cyl(0.08, 0.08, 1.0, 6), 0x5a3a22, { pos: [-6.95, 0.1, -1.5 + (i - 1) * 0.15], rot: [0, i, Math.PI / 2], outline: false }));
    // Кружки на каминной полке
    for (let i = 0; i < 3; i++) this.mug(-7.4, 3.3, -2.5 + i * 0.9);

    // Стойка
    const counter = new THREE.Group();
    counter.add(part(G.box(7, 1.2, 1.0), 0x7a4a26, { pos: [0, 0.6, 0], outline: 0.04 }));
    counter.add(part(G.box(7.3, 0.18, 1.25), 0x5a3a22, { pos: [0, 1.28, 0], outline: 0.035 }));
    for (let i = 0; i < 7; i++) counter.add(part(G.box(0.08, 1.0, 0.04), 0x5a3a22, { pos: [-3.3 + i * 1.1, 0.6, 0.52], outline: false }));
    counter.position.set(1.4, 0, -2.6);
    counter.traverse((o) => (o.castShadow = true));
    s.add(counter);
    // Кружки и бутылки на стойке
    this.mug(-1, 1.37, -2.4);
    this.mug(2.6, 1.37, -2.3);
    this.bottle(0.4, 1.37, -2.6, 0x3a9a5a);
    this.bottle(3.6, 1.37, -2.7, 0x9a3a5a);

    // Полки с бутылками
    for (const y of [2.6, 3.5]) {
      s.add(part(G.box(5.4, 0.12, 0.6), 0x6a4024, { pos: [1.4, y, -5.5], outline: 0.025 }));
      for (let i = 0; i < 9; i++) this.bottle(-1.0 + i * 0.6, y + 0.06, -5.45, [0x3a9a5a, 0x9a3a5a, 0x3a5a9a, 0xd8a03a, 0x8a3ad0][(i + (y > 3 ? 2 : 0)) % 5]);
    }
    // Бочки
    for (const [x, z, sy] of [
      [5.8, -4.6, 1],
      [6.8, -3.4, 1],
      [6.4, -4.6, 1],
    ] as const) {
      this.barrel(x, z, sy);
    }
    const bt = part(G.cyl(0.55, 0.55, 1.4, 14), 0x8a5a2b, { pos: [6.3, 0.85, -4.0], rot: [0, 0, Math.PI / 2], outline: 0.035 });
    s.add(bt);
    this.barrel(-6.3, 3.8, 1);

    // Столы со свечами
    for (const [x, z] of [
      [-5, 1.5],
      [5.4, 1.2],
    ]) {
      const t = new THREE.Group();
      t.add(part(G.cyl(1.1, 1.1, 0.14, 16), 0x8a5a2b, { pos: [0, 1.0, 0], outline: 0.035 }));
      t.add(part(G.cyl(0.12, 0.2, 1.0, 8), 0x5a3a22, { pos: [0, 0.5, 0], outline: 0.025 }));
      t.add(part(G.cyl(0.5, 0.5, 0.08, 12), 0x5a3a22, { pos: [0, 0.04, 0], outline: 0.02 }));
      t.position.set(x, 0, z);
      t.traverse((o) => (o.castShadow = true));
      s.add(t);
      for (const a of [0.5, 2.6, 4.4]) {
        const st = part(G.cyl(0.35, 0.3, 0.12, 10), 0x7a4a26, { pos: [x + Math.cos(a) * 1.6, 0.6, z + Math.sin(a) * 1.6], outline: 0.025 });
        s.add(st, part(G.cyl(0.06, 0.06, 0.6, 5), 0x5a3a22, { pos: [x + Math.cos(a) * 1.6, 0.3, z + Math.sin(a) * 1.6], outline: false }));
      }
      this.candle(x + 0.2, 1.07, z);
      this.mug(x - 0.4, 1.07, z + 0.3);
      // Тарелка с курицей
      s.add(part(G.cyl(0.3, 0.25, 0.04, 14), 0xf2efe6, { pos: [x - 0.1, 1.09, z - 0.4], outline: 0.015 }));
      s.add(part(G.sphere(0.18, 10, 8), 0xc8782a, { pos: [x - 0.1, 1.2, z - 0.4], scale: [1.2, 0.8, 1], outline: 0.02 }));
    }

    // Люстра
    const ch = new THREE.Group();
    ch.add(part(G.torus(1.1, 0.07, Math.PI * 2, 6, 24), 0x5a3a22, { rot: [Math.PI / 2, 0, 0], outline: 0.025 }));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const c = this.candle(Math.cos(a) * 1.1, 0.04, Math.sin(a) * 1.1, ch);
      c.scale.setScalar(0.9);
    }
    for (const a of [0, 2.1, 4.2]) ch.add(part(G.cyl(0.015, 0.015, 1.9, 4), 0x3a3a3a, { pos: [Math.cos(a) * 0.5, 0.9, Math.sin(a) * 0.5], rot: [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5], outline: false }));
    ch.position.set(0, 4.8, 0.5);
    s.add(ch);

    // Хозяин таверны — бородатый дварф
    const k = this.keeper;
    const apron = part(G.capsule(0.45, 0.4), 0xe8e0d0, { pos: [0, 0.95, 0.05], outline: 0.035 });
    const shirt = part(G.capsule(0.48, 0.35), 0x3a6ab0, { pos: [0, 1.0, -0.05], outline: 0.035 });
    const head = part(G.sphere(0.42, 16, 12), 0xffc8a0, { pos: [0, 1.85, 0], outline: 0.035 });
    const beard = part(G.cone(0.42, 0.9, 14), 0xd8682a, { pos: [0, 1.38, 0.22], rot: [Math.PI + 0.2, 0, 0], outline: 0.03 });
    const nose = part(G.sphere(0.12, 10, 8), 0xff9a7a, { pos: [0, 1.82, 0.42], outline: 0.02 });
    const hat = part(G.cyl(0.3, 0.42, 0.25, 14), 0x5a3a22, { pos: [0, 2.2, 0], outline: 0.025 });
    k.add(shirt, apron, head, beard, nose, hat);
    for (const x of [-0.15, 0.15]) {
      const e = new THREE.Mesh(G.sphere(0.06, 8, 6), toon(0x1a1210));
      e.position.set(x, 1.95, 0.37);
      k.add(e);
      k.add(part(G.box(0.16, 0.05, 0.05), 0xd8682a, { pos: [x, 2.05, 0.38], rot: [0, 0, -x * 2], outline: false }));
    }
    const armL = part(G.capsule(0.13, 0.4), 0x3a6ab0, { pos: [-0.55, 1.1, 0.1], rot: [0.3, 0, 0.3], outline: 0.025 });
    k.add(armL);
    this.keeperArm.position.set(0.55, 1.4, 0);
    this.keeperArm.add(part(G.capsule(0.13, 0.4), 0x3a6ab0, { pos: [0, -0.3, 0], outline: 0.025 }));
    const rag = part(G.box(0.3, 0.06, 0.25), 0xf2efe6, { pos: [0, -0.62, 0.1], outline: 0.015 });
    this.keeperArm.add(rag);
    k.add(this.keeperArm);
    k.position.set(1.2, 0, -3.8);
    s.add(k);

    // Кот на бочке
    const c = this.cat;
    c.add(part(G.sphere(0.3, 12, 8), 0xff9a3a, { scale: [1.3, 0.7, 1], outline: 0.025 }));
    c.add(part(G.sphere(0.2, 12, 8), 0xff9a3a, { pos: [0.32, 0.12, 0], outline: 0.02 }));
    for (const z of [-0.09, 0.09]) c.add(part(G.cone(0.07, 0.14, 4), 0xff9a3a, { pos: [0.36, 0.32, z], outline: 0.015 }));
    c.add(part(G.capsule(0.05, 0.4), 0xff9a3a, { pos: [-0.38, 0.0, 0.15], rot: [0, 0.5, Math.PI / 2], outline: 0.015 }));
    c.position.set(-6.3, 1.13, 3.8);
    s.add(c);

    // Свет
    const fireL = new THREE.PointLight(0xff7a2a, 14, 10, 1.5);
    fireL.position.set(-6.4, 1.2, -1.5);
    const chL = new THREE.PointLight(0xffc070, 12, 14, 1.4);
    chL.position.set(0, 4.2, 0.5);
    this.lights.push(fireL, chL);
    s.add(fireL, chL);

    // Детализация: дерево, камень и штукатурка
    const wood = woodTex();
    const stone = stoneTex();
    texturize(
      s,
      {
        0x5a3a22: wood, 0x4a2e1a: wood, 0x7a4a26: wood, 0x8a5a2b: wood, 0x6a4024: wood, 0x9a6a3a: wood,
        0x8a8078: stone, 0x9a9088: stone, 0x7a7068: stone,
        0xd8c0a0: repeated(sandTex(), 4, 2), 0xc8b090: repeated(sandTex(), 3, 2), 0x8a5c30: rockTex(),
      },
      (hex, map) => toon(hex, { map }),
    );
  }

  private mug(x: number, y: number, z: number) {
    const g = new THREE.Group();
    g.add(part(G.cyl(0.13, 0.12, 0.28, 10), 0x9a6a3a, { pos: [0, 0.14, 0], outline: 0.02 }));
    g.add(part(G.cyl(0.12, 0.12, 0.05, 10), 0xfff6e0, { pos: [0, 0.29, 0], outline: false }));
    g.add(part(G.torus(0.08, 0.025, Math.PI, 4, 8), 0x9a6a3a, { pos: [0.14, 0.14, 0], rot: [0, 0, -Math.PI / 2], outline: false }));
    g.position.set(x, y, z);
    this.scene.add(g);
  }

  private bottle(x: number, y: number, z: number, col: number) {
    const g = new THREE.Group();
    g.add(part(G.cyl(0.11, 0.12, 0.35, 10), col, { pos: [0, 0.17, 0], outline: 0.02 }));
    g.add(part(G.cyl(0.04, 0.06, 0.18, 8), col, { pos: [0, 0.42, 0], outline: 0.015 }));
    g.add(part(G.cyl(0.045, 0.045, 0.06, 6), 0xc8a06a, { pos: [0, 0.53, 0], outline: false }));
    g.position.set(x, y, z);
    this.scene.add(g);
  }

  private barrel(x: number, z: number, s: number) {
    const b = part(G.cyl(0.55, 0.48, 1.2, 14), 0x8a5a2b, { pos: [x, 0.6 * s, z], outline: 0.035 });
    b.castShadow = true;
    this.scene.add(b);
    for (const y of [0.25, 0.95]) this.scene.add(part(G.torus(0.535, 0.03, Math.PI * 2, 4, 20), 0x5a5a5a, { pos: [x, y * s, z], rot: [Math.PI / 2, 0, 0], outline: false }));
  }

  private candle(x: number, y: number, z: number, parent: THREE.Object3D = this.scene): THREE.Group {
    const g = new THREE.Group();
    g.add(part(G.cyl(0.06, 0.06, 0.22, 8), 0xfff2d6, { pos: [0, 0.11, 0], outline: 0.012 }));
    const f = new THREE.Mesh(G.cone(0.05, 0.14, 6), new THREE.MeshBasicMaterial({ color: 0xffd04a }));
    f.position.y = 0.3;
    f.name = 'flame';
    g.add(f);
    const halo = new THREE.Mesh(G.sphere(0.16, 8, 6), glow(0xffa040, 0.3));
    halo.position.y = 0.3;
    halo.name = 'flame';
    g.add(halo);
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  }

  update(dt: number, fx: Particles) {
    this.t += dt;
    for (const f of this.flames) f.update(dt);
    this.lights[0].intensity = 14 + Math.sin(this.t * 11) * 2 + Math.sin(this.t * 27) * 1;
    this.lights[1].intensity = 12 + Math.sin(this.t * 7) * 0.6;
    this.keeperArm.rotation.x = -1.1 + Math.sin(this.t * 3) * 0.25;
    this.keeperArm.rotation.z = Math.sin(this.t * 6) * 0.4;
    this.keeper.rotation.y = Math.sin(this.t * 0.4) * 0.2;
    this.cat.scale.y = 1 + Math.sin(this.t * 1.8) * 0.04;
    this.emitT -= dt;
    if (this.emitT <= 0) {
      this.emitT = 0.08;
      fx.glow({ x: -6.9 + (Math.random() - 0.5) * 0.6, y: 0.6, z: -1.5 + (Math.random() - 0.5) * 0.8, vx: 0.2, vy: 1.2, vz: 0, life: 0.9, size: 0.1, color: 0xffa040 });
      // Пылинки в свете
      fx.glow({ x: (Math.random() - 0.5) * 12, y: Math.random() * 4, z: (Math.random() - 0.5) * 6, vx: (Math.random() - 0.5) * 0.1, vy: 0.05, vz: 0, life: 4, size: 0.06, color: 0xffe0a0, alpha: 0.6 });
    }
  }
}

