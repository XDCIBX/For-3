import * as THREE from 'three';
import { Rng, type Obstacle, type WorldData } from '@game/shared';
import { G, TIME, faceted, part, toon } from './toon';
import { normalFor, rockTex } from './textures';
import { bakeStatic } from './bake';
import { makeSun, skyTexture, type Stage } from './env';
import type { Particles } from './particles';

/**
 * Логово дракона (волны 21–25): кратер вулкана. Пол из базальта со
 * светящимися трещинами, лавовое озеро, лавовое море за стенами кратера,
 * сталагмиты, кости, груда сокровищ в гнезде и пещерные ходы, откуда
 * вылетают стражи логова.
 */

function noise(x: number, z: number): number {
  return (Math.sin(x * 0.31 + z * 0.17) + Math.sin(x * 0.13 - z * 0.29 + 1.7) + Math.sin((x + z) * 0.53 + 0.3) * 0.5) / 2.5;
}

/** «Хребтовый» шум для сети трещин: близко к нулю — на линии трещины. */
function crack(x: number, z: number): number {
  const a = Math.sin(x * 0.42 + Math.sin(z * 0.3) * 1.6) + Math.sin(z * 0.37 + Math.sin(x * 0.23) * 1.9) * 0.8;
  const b = Math.sin((x - z) * 0.21 + 2.1) * 0.6;
  return Math.abs(a + b);
}

function vhash(x: number, y: number, z: number): number {
  const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return h - Math.floor(h);
}

/** Текучая лава: корка остывшей породы плывёт по раскалённому расплаву. */
export function lavaMaterial(scale = 0.35): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    fog: true,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), time: TIME, scale: { value: scale } },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      #include <fog_pars_vertex>
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform float scale;
      varying vec3 vW;
      #include <fog_pars_fragment>
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), u.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), u.x), u.y);
      }
      float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * n(p); p *= 2.03; a *= 0.5; } return s; }
      void main() {
        vec2 p = vW.xz * scale;
        vec2 flow = vec2(time * 0.05, time * 0.03);
        float q = fbm(p + flow + fbm(p * 0.7 - flow) * 1.3);
        float heat = smoothstep(0.38, 0.72, q);
        vec3 crust = vec3(0.09, 0.035, 0.025);
        vec3 hot = mix(vec3(1.6, 0.32, 0.05), vec3(2.4, 1.3, 0.35), smoothstep(0.62, 0.9, q));
        vec3 col = mix(crust, hot, heat);
        col *= 0.85 + 0.15 * sin(time * 2.0 + q * 9.0);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}

export class LairStage implements Stage {
  readonly name = 'lair';
  readonly scene = new THREE.Scene();
  readonly sun: THREE.DirectionalLight;
  shadowsDirty = true;
  readonly world: WorldData;
  private lights: { l: THREE.PointLight; base: number; ph: number }[] = [];
  private vents: { x: number; z: number }[] = [];
  private t = 0;
  private emitT = 0;

  constructor(world: WorldData) {
    this.world = world;
    const s = this.scene;
    s.fog = new THREE.Fog(0x4a1e12, 45, 130);
    s.background = skyTexture('#1e0a06', '#4a1a0c', '#7a2a10');
    s.add(new THREE.HemisphereLight(0xffc0a0, 0x5a2a18, 1.3));
    // Свет из жерла вулкана над головой: тусклый, оранжевый
    this.sun = makeSun(3.3, 0xffd4a8, [-18, 46, 20], 40, 2048);
    s.add(this.sun, this.sun.target);

    const rng = new Rng(world.seed + 333);
    this.buildGround();
    this.buildLava();
    for (const o of world.obstacles) this.buildObstacle(o, rng);
    this.buildCaves();
    this.buildDecor(rng);
    bakeStatic(s, 12);

    // Свет от лавы и сокровищ
    const p = world.pond;
    this.addLight(p.x, 2.2, p.z, 0xff6a20, 26, 16);
    this.addLight(world.ruins.x, 3, world.ruins.z - 2, 0xffb040, 14, 12);
    this.addLight(0, 6, 0, 0xff7a3a, 8, 30);
  }

  private addLight(x: number, y: number, z: number, color: number, intensity: number, dist: number) {
    const l = new THREE.PointLight(color, intensity, dist, 1.6);
    l.position.set(x, y, z);
    this.scene.add(l);
    this.lights.push({ l, base: intensity, ph: Math.random() * 10 });
  }

  /** Пол кратера и его стены: базальт с трещинами, у пещерных ходов стены расступаются. */
  private buildGround() {
    const R = this.world.radius;
    const rings = 86;
    const segs = 220;
    const maxR = R + 10;
    const pos: number[] = [];
    const col: number[] = [];
    const glowA: number[] = [];
    const uvs: number[] = [];
    const idx: number[] = [];
    const c = new THREE.Color();
    const basalt = new THREE.Color(0x66574e);
    const ash = new THREE.Color(0x8a7a6c);
    const scorch = new THREE.Color(0x40322c);
    const wallC = new THREE.Color(0x52423a);
    const gold = new THREE.Color(0x8a6a2a);
    const { pond, ruins, spawns } = this.world;
    const caveAngles = spawns.map((sp) => Math.atan2(sp.z, sp.x));
    const push = (x: number, y: number, z: number, glowV: number) => {
      pos.push(x, y, z);
      col.push(c.r, c.g, c.b);
      glowA.push(glowV);
      uvs.push(x / 4, z / 4);
    };
    c.copy(ash);
    push(0, 0, 0, 0);
    for (let i = 1; i <= rings; i++) {
      const rr = Math.pow(i / rings, 0.9) * maxR;
      for (let j = 0; j < segs; j++) {
        const a = (j / segs) * Math.PI * 2;
        const x = Math.cos(a) * rr;
        const z = Math.sin(a) * rr;
        // Стена кратера, расступающаяся у пещер
        let cave = 0;
        for (const ca of caveAngles) {
          let da = a - ca;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          cave = Math.max(cave, Math.exp(-((da / 0.11) ** 2)));
        }
        const wallStart = R + 0.6 + noise(x * 2, z * 2) * 0.6;
        let y = noise(x * 3, z * 3) * 0.06;
        if (rr > wallStart) {
          const k = Math.min(1, (rr - wallStart) / 6.5);
          y += (k * k * (3 - 2 * k)) * (7.5 + noise(x * 0.9, z * 0.9) * 2.5 + (vhash(Math.round(x), 0, Math.round(z)) - 0.5) * 1.2) * (1 - cave * 0.85);
        }
        // Цвет: пепел и базальт, тёмные подпалины, у сокровищ золотистая пыль
        const n = noise(x * 1.3, z * 1.3);
        c.copy(basalt).lerp(n > 0 ? ash : scorch, Math.abs(n) * 0.9);
        if (rr > wallStart) c.lerp(wallC, Math.min(1, (rr - wallStart) / 2));
        const gd = Math.hypot(x - ruins.x, z - (ruins.z - 2));
        if (gd < 5) c.lerp(gold, (1 - gd / 5) * 0.6);
        // Свечение: трещины, кромка лавового озера, жар у основания стен
        let gl = 0;
        if (rr < R - 0.5) gl = Math.max(0, 1 - crack(x, z) / 0.075) * (0.5 + 0.5 * Math.max(0, noise(x * 0.5 + 3, z * 0.5)));
        const pd = Math.hypot(x - pond.x, z - pond.z);
        if (pd < pond.r + 2.2) {
          gl = Math.max(gl, Math.max(0, 1 - (pd - pond.r) / 2.2) * 0.8);
          c.lerp(scorch, 0.6);
        }
        if (rr > wallStart - 0.8 && rr < wallStart + 0.6) gl = Math.max(gl, 0.35 * (1 - cave));
        if (cave > 0.3 && rr > R - 3) c.lerp(scorch, cave * 0.8);
        push(x, y, z, gl);
      }
    }
    for (let j = 0; j < segs; j++) idx.push(0, 1 + ((j + 1) % segs), 1 + j);
    for (let i = 1; i < rings; i++) {
      for (let j = 0; j < segs; j++) {
        const a = 1 + (i - 1) * segs + j;
        const b = 1 + (i - 1) * segs + ((j + 1) % segs);
        const c2 = 1 + i * segs + j;
        const d = 1 + i * segs + ((j + 1) % segs);
        idx.push(a, b, c2, b, d, c2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('glow', new THREE.Float32BufferAttribute(glowA, 1));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, map: rockTex(), roughness: 0.92, metalness: 0, envMapIntensity: 0.4, normalMap: normalFor(rockTex(), 3), normalScale: new THREE.Vector2(0.9, 0.9) });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.time = TIME;
      sh.vertexShader = 'attribute float glow;\nvarying float vGlow;\nvarying vec2 vXZ;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;\nvXZ = position.xz;');
      sh.fragmentShader =
        'uniform float time;\nvarying float vGlow;\nvarying vec2 vXZ;\n' +
        sh.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          float pulse = 0.75 + 0.25 * sin(time * 1.7 + vXZ.x * 0.4 + vXZ.y * 0.3);
          totalEmissiveRadiance += vec3(1.6, 0.42, 0.06) * vGlow * vGlow * pulse;`,
        );
    };
    mat.customProgramCacheKey = () => 'lair-ground';
    const ground = new THREE.Mesh(geo, mat);
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  private buildLava() {
    // Лавовое море за стенами кратера и озеро внутри
    const sea = new THREE.Mesh(new THREE.RingGeometry(this.world.radius + 14, 240, 64, 1).rotateX(-Math.PI / 2), lavaMaterial(0.12));
    sea.position.y = 3;
    this.scene.add(sea);
    const p = this.world.pond;
    const lake = new THREE.Mesh(new THREE.CircleGeometry(p.r, 48).rotateX(-Math.PI / 2), lavaMaterial(0.45));
    lake.position.set(p.x, 0.05, p.z);
    this.scene.add(lake);
    // Остывшая корка по берегу
    const rim = new THREE.Mesh(new THREE.RingGeometry(p.r - 0.25, p.r + 0.5, 48).rotateX(-Math.PI / 2), toon(0x1a1210, { rough: 0.95 }));
    rim.position.set(p.x, 0.06, p.z);
    this.scene.add(rim);
    this.vents.push({ x: p.x, z: p.z });
  }

  private buildObstacle(o: Obstacle, rng: Rng) {
    const s = this.scene;
    switch (o.kind) {
      case 'stalagmite': {
        // Сталагмит: несколько неровных конусов, темнее к основанию
        const g = new THREE.Group();
        const h = (2.2 + o.variant * 0.8) * o.scale;
        g.add(part(jagged(new THREE.ConeGeometry(o.r * 1.15, h, 8, 3), 0.12, o.x + o.z), 0x3a302a, { pos: [0, h / 2, 0], rough: 0.9 }));
        for (let i = 0; i < 2; i++) {
          const a = rng.range(0, Math.PI * 2);
          const hh = h * rng.range(0.35, 0.55);
          g.add(part(jagged(new THREE.ConeGeometry(o.r * 0.55, hh, 7, 2), 0.1, a), 0x4a3c34, { pos: [Math.cos(a) * o.r * 0.8, hh / 2, Math.sin(a) * o.r * 0.8], rough: 0.9 }));
        }
        g.position.set(o.x, 0, o.z);
        g.rotation.y = o.rot;
        s.add(g);
        break;
      }
      case 'rock': {
        const geo = jagged(new THREE.DodecahedronGeometry(o.r * 1.05, 1), 0.14, o.x * 3 + o.z);
        const m = new THREE.Mesh(geo, toon(0x2a2220, { map: rockTex(), rough: 0.88 }));
        m.scale.set(1, 0.75, 1);
        m.position.set(o.x, o.r * 0.45, o.z);
        m.rotation.y = o.rot;
        m.castShadow = m.receiveShadow = true;
        s.add(m);
        // Тлеющая трещина на глыбе
        const vein = new THREE.Mesh(G.box(o.r * 1.4, 0.04, 0.06), toon(0xff6a1a, { emissive: 0xff5a10, emissiveIntensity: 1.4 }));
        vein.position.set(o.x, o.r * 0.55, o.z);
        vein.rotation.set(0.4, o.rot + 0.7, 0.2);
        s.add(vein);
        break;
      }
      case 'hoard':
        this.buildHoard(o, rng);
        break;
      default:
        break;
    }
  }

  /** Груда сокровищ в гнезде дракона: золото, сундуки, кубки, самоцветы. */
  private buildHoard(o: Obstacle, rng: Rng) {
    const s = this.scene;
    const g = new THREE.Group();
    const gold = 0xd8a830;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const d = i === 0 ? 0 : o.r * 0.7;
      g.add(part(G.sphere(o.r * (i === 0 ? 0.85 : 0.55), 16, 10), gold, { pos: [Math.cos(a) * d, -o.r * 0.25, Math.sin(a) * d], scale: [1, 0.45, 1], metal: 0.9, rough: 0.35 }));
    }
    // Монеты россыпью
    const coin = new THREE.CylinderGeometry(0.11, 0.11, 0.025, 10);
    const coins = new THREE.InstancedMesh(coin, toon(0xf0c040, { metal: 0.95, rough: 0.3 }), 160);
    const dm = new THREE.Object3D();
    for (let i = 0; i < 160; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = Math.sqrt(rng.next()) * (o.r + 2.4);
      const top = Math.max(0, o.r * 0.42 * (1 - d / (o.r + 0.6)));
      dm.position.set(o.x + Math.cos(a) * d, 0.02 + top + rng.range(0, 0.05), o.z + Math.sin(a) * d);
      dm.rotation.set(rng.range(-0.5, 0.5), rng.range(0, 6), rng.range(-0.5, 0.5));
      dm.updateMatrix();
      coins.setMatrixAt(i, dm.matrix);
    }
    s.add(coins);
    // Сундуки и кубки
    for (const [a, d] of [
      [0.6, o.r + 0.9],
      [2.6, o.r + 1.1],
    ] as const) {
      const ch = new THREE.Group();
      ch.add(part(G.box(0.9, 0.55, 0.6), 0x5a3418, { pos: [0, 0.28, 0], rough: 0.8 }));
      ch.add(part(G.cyl(0.3, 0.3, 0.9, 12, ), 0x5a3418, { pos: [0, 0.55, 0], rot: [0, 0, Math.PI / 2], scale: [1, 1, 1] }));
      for (const x of [-0.35, 0.35]) ch.add(part(G.box(0.06, 0.62, 0.64), 0xc8a040, { pos: [x, 0.33, 0], metal: 0.9, rough: 0.35 }));
      ch.add(part(G.box(0.14, 0.16, 0.05), 0xd8b040, { pos: [0, 0.42, 0.31], metal: 0.9, rough: 0.3 }));
      ch.position.set(o.x + Math.cos(a) * d, 0, o.z + Math.sin(a) * d);
      ch.rotation.y = -a + Math.PI / 2;
      s.add(ch);
    }
    for (let i = 0; i < 5; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(o.r * 0.4, o.r + 1.4);
      const cup = new THREE.Group();
      cup.add(part(G.cyl(0.12, 0.05, 0.22, 10), gold, { pos: [0, 0.3, 0], metal: 0.95, rough: 0.25 }));
      cup.add(part(G.cyl(0.03, 0.03, 0.16, 6), gold, { pos: [0, 0.12, 0], metal: 0.95, rough: 0.25 }));
      cup.add(part(G.cyl(0.09, 0.09, 0.03, 10), gold, { pos: [0, 0.03, 0], metal: 0.95, rough: 0.25 }));
      cup.position.set(o.x + Math.cos(a) * d, Math.max(0, o.r * 0.35 * (1 - d / (o.r + 0.6))), o.z + Math.sin(a) * d);
      cup.rotation.z = rng.range(-0.6, 0.6);
      s.add(cup);
    }
    // Самоцветы
    for (let i = 0; i < 9; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(0, o.r);
      const col = [0xff2a3a, 0x3a8aff, 0x3aff8a, 0xb04aff][i % 4];
      const gem = new THREE.Mesh(faceted(new THREE.OctahedronGeometry(0.16, 0)), toon(col, { emissive: col, emissiveIntensity: 0.6, rough: 0.1 }));
      gem.position.set(o.x + Math.cos(a) * d, o.r * 0.45 * (1 - d / (o.r + 0.6)) + 0.1, o.z + Math.sin(a) * d);
      s.add(gem);
    }
    g.position.set(o.x, 0, o.z);
    s.add(g);
  }

  /** Пещерные ходы в стене кратера — оттуда вылетают стражи логова. */
  private buildCaves() {
    for (const sp of this.world.spawns) {
      const a = Math.atan2(sp.z, sp.x);
      const r = this.world.radius + 2.6;
      const g = new THREE.Group();
      // Тёмный зев и каменная арка
      const mouth = new THREE.Mesh(new THREE.CircleGeometry(2.6, 20, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0x050202 }));
      mouth.position.y = 0.02;
      g.add(mouth);
      for (let i = 0; i <= 6; i++) {
        const t = (i / 6) * Math.PI;
        g.add(part(jagged(new THREE.DodecahedronGeometry(0.75, 0), 0.15, i + a), 0x3a2e28, { pos: [Math.cos(t) * 2.8, Math.sin(t) * 2.8, 0], rough: 0.9 }));
      }
      // Тлеющие глаза во тьме
      for (const x of [-0.5, 0.5]) {
        const e = new THREE.Mesh(G.sphere(0.07, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff7a20 }));
        e.position.set(x + Math.cos(a * 3) * 0.6, 1.1, -0.3);
        g.add(e);
      }
      g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      g.lookAt(0, 0, 0);
      this.scene.add(g);
      this.vents.push({ x: sp.x * 1.05, z: sp.z * 1.05 });
    }
  }

  private buildDecor(rng: Rng) {
    const s = this.scene;
    const R = this.world.radius;
    const free = (x: number, z: number, pad: number) => this.world.obstacles.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + pad);
    const bone = 0xcfc2a2;
    // Огромный череп дракона-предка у гнезда
    {
      const g = new THREE.Group();
      g.add(part(jagged(new THREE.SphereGeometry(1.1, 14, 10), 0.06, 1), bone, { scale: [1, 0.8, 1.3], rough: 0.8 }));
      g.add(part(G.box(1.2, 0.55, 1.8), bone, { pos: [0, -0.25, 1.4], rough: 0.8 }));
      for (const x of [-0.45, 0.45]) {
        g.add(part(G.sphere(0.32, 8, 6), 0x0a0605, { pos: [x, 0.25, 0.95] }));
        g.add(part(G.cone(0.22, 1.6, 7), 0xa89a80, { pos: [x * 1.8, 0.6, -0.8], rot: [-1.1, 0, x * 0.8] }));
      }
      for (let i = 0; i < 6; i++) g.add(part(G.cone(0.07, 0.3, 5), 0xe8dcc0, { pos: [-0.45 + i * 0.18, -0.55, 2.1], rot: [Math.PI, 0, 0] }));
      g.position.set(this.world.ruins.x + 5.5, 0.6, this.world.ruins.z + 1.5);
      g.rotation.set(0.15, -0.7, 0.1);
      s.add(g);
    }
    // Рёбра и черепа поменьше
    for (let n = 0, tries = 0; n < 10 && tries < 200; tries++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(7, R - 3);
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      if (!free(x, z, 1.4)) continue;
      const g = new THREE.Group();
      if (n % 2 === 0) {
        // Грудная клетка
        g.add(part(G.cyl(0.07, 0.07, 2.2, 6), bone, { rot: [0, 0, Math.PI / 2], pos: [0, 0.08, 0] }));
        for (let i = 0; i < 5; i++) g.add(part(G.torus(0.55 - Math.abs(i - 2) * 0.06, 0.045, Math.PI * 0.9, 4, 10), bone, { pos: [-0.8 + i * 0.4, 0.05, 0], rot: [0, Math.PI / 2, Math.PI * 0.05] }));
      } else {
        g.add(part(G.sphere(0.32, 10, 8), bone, { pos: [0, 0.25, 0], scale: [1, 0.85, 1.2] }));
        for (const x of [-0.12, 0.12]) g.add(part(G.sphere(0.08, 6, 4), 0x0a0605, { pos: [x, 0.3, 0.3] }));
      }
      g.position.set(x, 0, z);
      g.rotation.y = rng.range(0, 6);
      s.add(g);
      n++;
    }
    // Кристаллы обсидиана с алым свечением
    for (let n = 0, tries = 0; n < 14 && tries < 300; tries++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(6, R - 1);
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      if (!free(x, z, 1)) continue;
      const g = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const h = rng.range(0.5, 1.2);
        const c = new THREE.Mesh(faceted(new THREE.ConeGeometry(0.16, h, 5)), toon(0x1a0a10, { emissive: 0xc0201a, emissiveIntensity: 0.55, rough: 0.15, metal: 0.3 }));
        c.position.set(rng.range(-0.25, 0.25), h / 2, rng.range(-0.25, 0.25));
        c.rotation.set(rng.range(-0.4, 0.4), 0, rng.range(-0.4, 0.4));
        g.add(c);
      }
      g.position.set(x, 0, z);
      s.add(g);
      n++;
    }
    // Мелкие обломки базальта
    const pebGeo = faceted(new THREE.DodecahedronGeometry(0.16, 0));
    const pebbles = new THREE.InstancedMesh(pebGeo, toon(0x2a2220, { rough: 0.9 }), 260);
    const dm = new THREE.Object3D();
    let k = 0;
    for (let tries = 0; tries < 900 && k < 260; tries++) {
      const a = rng.range(0, Math.PI * 2);
      const d = Math.sqrt(rng.next()) * (R - 0.5);
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      if (!free(x, z, 0.3)) continue;
      dm.position.set(x, 0.04, z);
      dm.rotation.set(rng.range(0, 3), rng.range(0, 3), 0);
      dm.scale.setScalar(rng.range(0.5, 1.6));
      dm.updateMatrix();
      pebbles.setMatrixAt(k++, dm.matrix);
    }
    pebbles.count = k;
    pebbles.receiveShadow = true;
    s.add(pebbles);
    // Дымящие трещины
    for (let i = 0; i < 4; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(8, R - 4);
      this.vents.push({ x: Math.cos(a) * d, z: Math.sin(a) * d });
    }
  }

  update(dt: number, fx: Particles) {
    this.t += dt;
    for (const L of this.lights) L.l.intensity = L.base * (0.85 + Math.sin(this.t * 3.1 + L.ph) * 0.08 + Math.sin(this.t * 7.3 + L.ph * 2) * 0.05);
    this.emitT -= dt;
    if (this.emitT > 0) return;
    this.emitT = 0.05;
    // Искры и пепел в воздухе
    const a = Math.random() * Math.PI * 2;
    const d = Math.sqrt(Math.random()) * this.world.radius;
    fx.glow({ x: Math.cos(a) * d, y: 0.2, z: Math.sin(a) * d, vx: (Math.random() - 0.5) * 0.6, vy: 1.4 + Math.random() * 1.6, vz: (Math.random() - 0.5) * 0.6, life: 2.2, size: 0.09, color: Math.random() < 0.6 ? 0xff8a2a : 0xffd060 });
    const v = this.vents[(Math.random() * this.vents.length) | 0];
    if (v) {
      fx.puff({ x: v.x + (Math.random() - 0.5) * 1.5, y: 0.4, z: v.z + (Math.random() - 0.5) * 1.5, vy: 1.2, life: 2.6, size: 0.9, grow: 1.4, color: 0x3a2a26, alpha: 0.35 });
      if (Math.random() < 0.5) fx.glow({ x: v.x + (Math.random() - 0.5), y: 0.3, z: v.z + (Math.random() - 0.5), vy: 2.5, life: 1.2, size: 0.14, color: 0xffa040 });
    }
  }
}

/** Неровная, «каменная» поверхность: смещение вершин шумом по позиции. */
function jagged(geo: THREE.BufferGeometry, amp: number, seed: number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 1 + (vhash(x + seed, y, z) - 0.5) * amp * 2;
    p.setXYZ(i, x * k, y * (1 + (vhash(z, x + seed, y) - 0.5) * amp), z * k);
  }
  g.computeVertexNormals();
  return g;
}
