import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng, type Obstacle, type WorldData, type Vec2 } from '@game/shared';
import { G, addOutline, faceted, glow, instancedOutline, part, swayToon, toon } from './toon';
import { barkTex, clothTex, grassTex, leafTex, normalFor, rockTex, sandTex, stoneTex, woodTex } from './textures';
import { bakeStatic } from './bake';
import { Flame, makeSun, portalMaterial, skyTexture, waterMaterial, type Stage } from './env';
import type { Particles } from './particles';

/** Форма береговой линии (одинаковая для земли, пены и воды). */
export function shoreRadius(a: number): number {
  return 35.4 + 0.9 * Math.sin(3 * a + 1.3) + 0.6 * Math.sin(5 * a + 0.4) + 0.35 * Math.sin(11 * a + 2);
}

function distToSeg(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / (abx * abx + abz * abz || 1)));
  return Math.hypot(a.x + abx * t - p.x, a.z + abz * t - p.z);
}

function noise2(x: number, z: number): number {
  return (Math.sin(x * 0.31 + z * 0.17) + Math.sin(x * 0.13 - z * 0.29 + 1.7) + Math.sin((x + z) * 0.53 + 0.3) * 0.5) / 2.5;
}

/** Слегка изогнутые «пути» от лагеря к порталам. */
function pathPoints(s: Vec2): Vec2[] {
  const pts: Vec2[] = [];
  const n = 10;
  const len = Math.hypot(s.x, s.z);
  const px = -s.z / len;
  const pz = s.x / len;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const bend = Math.sin(t * Math.PI) * 2.2 * Math.sin(s.x * 0.7 + s.z);
    pts.push({ x: s.x * t + px * bend, z: s.z * t + pz * bend });
  }
  return pts;
}


/** Детерминированный «шум» по координате вершины — швы геометрии не расходятся. */
function vhash(x: number, y: number, z: number): number {
  const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return h - Math.floor(h);
}

/**
 * Делает форму живой: смещает вершины шумом и запекает затенение в цвет вершин
 * (низ и глубина кроны темнее — дешёвая имитация ambient occlusion).
 */
function organic(geo: THREE.BufferGeometry, amp: number, ao: number, droop: boolean): THREE.BufferGeometry {
  const p = geo.attributes.position;
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const maxR = Math.max(bb.max.x, -bb.min.x, bb.max.z, -bb.min.z);
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const r = Math.hypot(x, z);
    const n1 = vhash(x, y, z) - 0.5;
    const n2 = vhash(z + 3.1, x - 1.7, y + 0.3) - 0.5;
    const k = 1 + n1 * amp * 2.2;
    let ny = y + n2 * amp;
    if (droop) ny -= (r / maxR) * (r / maxR) * 0.25 * (0.6 + n2);
    p.setXYZ(i, x * k, ny, z * k);
    const hK = (y - bb.min.y) / Math.max(0.01, bb.max.y - bb.min.y);
    const out = Math.min(1, r / (maxR * 0.85));
    const shade = ao + (1 - ao) * Math.min(1, 0.35 + hK * 0.45 + out * 0.45) + n1 * 0.08;
    col[i * 3] = shade;
    col[i * 3 + 1] = shade;
    col[i * 3 + 2] = shade * 0.96;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

/** Корневое расширение и неровная кора у основания ствола. */
function flare(geo: THREE.BufferGeometry, k: number): THREE.BufferGeometry {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const f = 1 + k * Math.max(0, 1 - y / 0.6) ** 2 * (0.7 + vhash(x, 0, z) * 0.6) + (vhash(x, y, z) - 0.5) * 0.12;
    p.setXYZ(i, x * f, y, z * f);
  }
  geo.computeVertexNormals();
  return geo;
}

export class IslandStage implements Stage {
  readonly name = 'island';
  readonly scene = new THREE.Scene();
  readonly sun: THREE.DirectionalLight;
  shadowsDirty = true;
  private flames: Flame[] = [];
  private fireLight: THREE.PointLight;
  private portals: { x: number; z: number; disc: THREE.Mesh }[] = [];
  private foam: THREE.Mesh;
  private t = 0;
  private emitT = 0;
  private paths: Vec2[][] = [];
  readonly world: WorldData;
  private butterflies: { m: THREE.Group; cx: number; cz: number; ph: number; r: number }[] = [];

  constructor(world: WorldData) {
    this.world = world;
    const scene = this.scene;
    // Воздушная перспектива: даль тонет в дымке
    scene.fog = new THREE.Fog(0xc4d4dc, 55, 170);
    scene.background = skyTexture('#4f86c0', '#a9c8de', '#dce6ea');

    scene.add(new THREE.HemisphereLight(0xd8f0ff, 0x6a7a3a, 0.35));
    this.sun = makeSun(3.0, 0xfff0d2, [-26, 48, 22], 40, 2048);
    scene.add(this.sun, this.sun.target);

    this.paths = world.spawns.map(pathPoints);
    this.buildGround();
    this.buildWater();
    this.foam = this.buildFoam();

    const rng = new Rng(world.seed + 77);
    for (const o of world.obstacles) this.buildObstacle(o, rng);
    this.buildTrees(world.obstacles.filter((o) => o.kind === 'tree'));
    this.buildDecor(rng);
    for (const s of world.spawns) this.buildPortal(s);
    this.buildCamp(rng);
    this.buildDistant(rng);

    // Неподвижные декорации склеиваем по участкам карты
    bakeStatic(this.scene, 12);

    this.fireLight = new THREE.PointLight(0xff8a3a, 6, 9, 1.6);
    this.fireLight.position.set(0, 1.2, 0);
    scene.add(this.fireLight);
  }

  private isFree(x: number, z: number, pad: number, pathW = 1.6): boolean {
    for (const o of this.world.obstacles) if (Math.hypot(o.x - x, o.z - z) < o.r + pad) return false;
    for (const p of this.paths) for (let i = 0; i < p.length - 1; i++) if (distToSeg({ x, z }, p[i], p[i + 1]) < pathW) return false;
    return true;
  }

  private pathDist(x: number, z: number): number {
    let d = 99;
    for (const p of this.paths) for (let i = 0; i < p.length - 1; i++) d = Math.min(d, distToSeg({ x, z }, p[i], p[i + 1]));
    return d;
  }

  private buildGround() {
    const rings = 70;
    const segs = 160;
    const maxR = 40;
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const uvs: number[] = [];
    // 1 — трава (текстура травинок), 0 — песок/тропа/камень (текстура песка)
    const detail: number[] = [];
    const c = new THREE.Color();
    const grassA = new THREE.Color(0x6a9a48);
    const grassB = new THREE.Color(0x557f3a);
    const grassC = new THREE.Color(0x7fa456);
    const dirt = new THREE.Color(0xa0835a);
    const dirtEdge = new THREE.Color(0x86683f);
    const sand = new THREE.Color(0xd8c79a);
    const wet = new THREE.Color(0xb09a70);
    const corrupt = new THREE.Color(0x6a4f86);
    const stone = new THREE.Color(0xa29c8e);
    const { pond, ruins, spawns } = this.world;
    pos.push(0, 0, 0);
    col.push(dirt.r, dirt.g, dirt.b);
    uvs.push(0, 0);
    detail.push(0);
    for (let i = 1; i <= rings; i++) {
      const rr = Math.pow(i / rings, 0.85) * maxR;
      for (let j = 0; j < segs; j++) {
        const a = (j / segs) * Math.PI * 2;
        const jitter = (Math.sin(i * 12.9898 + j * 78.233) * 43758.5453) % 1;
        const r = rr + (i < rings ? jitter * 0.12 : 0);
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        const sr = shoreRadius(a);
        let y = 0;
        if (r > sr - 0.3) y = -Math.min(1.6, Math.pow((r - sr + 0.3) / 2.2, 1.4) * 1.6);
        y += noise2(x * 2, z * 2) * 0.05;
        pos.push(x, y, z);
        uvs.push(x / 3.2, z / 3.2);
        let grassy = 1;
        // Цвет
        const n = noise2(x, z);
        c.copy(grassA).lerp(n > 0 ? grassC : grassB, Math.abs(n) * 0.8);
        const pd = this.pathDist(x, z);
        if (pd < 1.5) c.lerp(pd < 1.1 ? dirt : dirtEdge, pd < 1.1 ? 1 : 0.6);
        if (pd < 1.5) grassy = Math.min(grassy, Math.max(0, (pd - 0.9) / 0.6));
        const cd = Math.hypot(x, z);
        if (cd < 3.6) c.lerp(dirt, Math.min(1, (3.6 - cd) / 0.8));
        if (cd < 3.6) grassy = Math.min(grassy, Math.max(0, (cd - 2.8) / 0.8));
        for (const s of spawns) {
          const d = Math.hypot(x - s.x, z - s.z);
          if (d < 3.6) c.lerp(corrupt, Math.min(1, (3.6 - d) / 1.4) * 0.85);
        }
        const rd = Math.hypot(x - ruins.x, z - ruins.z);
        if (rd < 4.6) {
          c.lerp(stone, (Math.floor(x * 1.2) + Math.floor(z * 1.2)) % 2 === 0 ? 0.85 : 0.7);
          grassy = 0;
        }
        const pdd = Math.hypot(x - pond.x, z - pond.z);
        if (pdd < pond.r + 0.9) c.lerp(new THREE.Color(0x456f34), 0.5);
        if (r > sr - 2.4) c.lerp(sand, Math.min(1, (r - sr + 2.4) / 1.2));
        if (r > sr + 0.2) c.lerp(wet, Math.min(1, (r - sr - 0.2) / 1.5));
        if (r > sr - 2.4) grassy = Math.min(grassy, Math.max(0, 1 - (r - sr + 2.4) / 1.2));
        col.push(c.r, c.g, c.b);
        detail.push(grassy);
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
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('detail', new THREE.Float32BufferAttribute(detail, 1));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    // Трава и песок смешиваются по атрибуту detail
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, map: grassTex(), roughness: 0.95, metalness: 0, envMapIntensity: 0.6, normalMap: normalFor(grassTex(), 3), normalScale: new THREE.Vector2(0.7, 0.7) });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.sandMap = { value: sandTex() };
      sh.vertexShader = 'attribute float detail;\nvarying float vDetail;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvDetail = detail;');
      sh.fragmentShader =
        'uniform sampler2D sandMap;\nvarying float vDetail;\n' +
        sh.fragmentShader.replace(
          '#include <map_fragment>',
          `#ifdef USE_MAP
            float gTex = texture2D(map, vMapUv).r;
            float sTex = texture2D(sandMap, vMapUv * 1.6).r;
            diffuseColor.rgb *= mix(sTex, gTex, vDetail);
          #endif`,
        );
    };
    mat.customProgramCacheKey = () => 'ground';
    const ground = new THREE.Mesh(geo, mat);
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  private buildWater() {
    const water = new THREE.Mesh(new THREE.CircleGeometry(220, 64).rotateX(-Math.PI / 2), waterMaterial(0x1a4560, 0x3a7f86, 34, 52));
    water.position.y = -0.45;
    this.scene.add(water);
    // Пруд
    const p = this.world.pond;
    const pondM = new THREE.Mesh(new THREE.CircleGeometry(p.r, 40).rotateX(-Math.PI / 2), waterMaterial(0x24526a, 0x4a8a88, 0, p.r * 1.5));
    pondM.position.set(p.x, 0.04, p.z);
    this.scene.add(pondM);
    const rim = new THREE.Mesh(new THREE.RingGeometry(p.r - 0.1, p.r + 0.35, 40).rotateX(-Math.PI / 2), toon(0x8a6a3a));
    rim.position.set(p.x, 0.03, p.z);
    this.scene.add(rim);
    const rng = new Rng(this.world.seed + 5);
    // Кувшинки
    for (let i = 0; i < 6; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(0.5, p.r - 0.6);
      const pad = new THREE.Mesh(new THREE.CircleGeometry(0.35, 12, 0.3, Math.PI * 2 - 0.6).rotateX(-Math.PI / 2), toon(0x3a6a30, { side: THREE.DoubleSide }));
      pad.position.set(p.x + Math.cos(a) * d, 0.07, p.z + Math.sin(a) * d);
      pad.rotation.y = rng.range(0, 6);
      this.scene.add(pad);
      if (i % 2 === 0) {
        const fl = part(G.sphere(0.1, 8, 6), 0xff9ad0, { pos: [pad.position.x, 0.14, pad.position.z], scale: [1, 0.6, 1], outline: 0.015 });
        this.scene.add(fl);
      }
    }
    // Камыши
    for (let i = 0; i < 14; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = p.r + rng.range(-0.2, 0.3);
      const g = new THREE.Group();
      g.add(part(G.cyl(0.025, 0.035, 1.1, 5), 0x5a9a3a, { pos: [0, 0.55, 0], outline: false }));
      g.add(part(G.capsule(0.06, 0.18), 0x7a4a26, { pos: [0, 1.05, 0], outline: 0.015 }));
      g.position.set(p.x + Math.cos(a) * d, 0, p.z + Math.sin(a) * d);
      g.rotation.set(rng.range(-0.15, 0.15), 0, rng.range(-0.15, 0.15));
      this.scene.add(g);
    }
  }

  private buildFoam(): THREE.Mesh {
    const segs = 200;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let j = 0; j <= segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      const r = shoreRadius(a) + 1.9;
      for (const [k, dr] of [
        [0, -0.5],
        [1, 0.7],
      ] as const) {
        pos.push(Math.cos(a) * (r + dr), 0, Math.sin(a) * (r + dr));
        uv.push(j / segs, k);
      }
    }
    for (let j = 0; j < segs; j++) {
      const a = j * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float time; varying vec2 vUv;
        void main(){
          float w = sin(vUv.x * 600.0 + time * 2.0) * 0.5 + 0.5;
          float edge = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.45, vUv.y);
          float pulse = 0.55 + 0.45 * sin(time * 1.4 + vUv.x * 40.0);
          gl_FragColor = vec4(1.0, 1.0, 1.0, edge * (0.45 + 0.35 * w) * pulse);
        }`,
      transparent: true,
      depthWrite: false,
    });
    const foam = new THREE.Mesh(geo, mat);
    foam.position.y = -0.4;
    this.scene.add(foam);
    return foam;
  }

  private buildObstacle(o: Obstacle, rng: Rng) {
    const s = this.scene;
    switch (o.kind) {
      case 'rock': {
        const g = new THREE.Group();
        const geo = faceted(new THREE.DodecahedronGeometry(1, 0));
        const m = new THREE.Mesh(geo, toon(rng.pick([0x9ea3a8, 0x8f959b, 0xa9a59a]), { map: rockTex() }));
        m.scale.set(o.r * 1.1, o.r * rng.range(0.7, 1.05), o.r * 1.0);
        m.position.y = o.r * 0.35;
        m.rotation.set(rng.range(0, 1), o.rot, rng.range(0, 0.5));
        m.castShadow = m.receiveShadow = true;
        addOutline(m, 0.04);
        g.add(m);
        const moss = new THREE.Mesh(geo, toon(0x5a8a3e, { map: leafTex() }));
        moss.scale.set(o.r * 0.85, o.r * 0.3, o.r * 0.8);
        moss.position.y = o.r * 0.75;
        moss.rotation.copy(m.rotation);
        if (rng.chance(0.6)) g.add(moss);
        if (rng.chance(0.5)) {
          const small = new THREE.Mesh(geo, toon(0x9ea3a8, { map: rockTex() }));
          small.scale.setScalar(o.r * 0.35);
          small.position.set(o.r * 0.9, o.r * 0.12, o.r * 0.4);
          addOutline(small, 0.03);
          g.add(small);
        }
        g.position.set(o.x, 0, o.z);
        s.add(g);
        break;
      }
      case 'stump': {
        const g = new THREE.Group();
        const st = part(G.cyl(0.42, 0.5, 0.5, 12), 0x7a4a26, { pos: [0, 0.25, 0], outline: 0.035, map: barkTex() });
        st.castShadow = true;
        g.add(st);
        g.add(part(G.cyl(0.38, 0.38, 0.02, 12), 0xe0b77a, { pos: [0, 0.51, 0], outline: false }));
        g.add(part(G.torus(0.22, 0.02, Math.PI * 2, 4, 16), 0xb3884f, { pos: [0, 0.52, 0], rot: [Math.PI / 2, 0, 0], outline: false }));
        if (rng.chance(0.6)) {
          g.add(part(G.cyl(0.03, 0.03, 0.12, 6), 0xfff2d6, { pos: [0.35, 0.06, 0.2], outline: false }));
          g.add(part(G.halfSphere(0.09), 0xe0453a, { pos: [0.35, 0.12, 0.2], outline: 0.015 }));
        }
        g.position.set(o.x, 0, o.z);
        g.rotation.y = o.rot;
        s.add(g);
        break;
      }
      case 'pillar': {
        const g = new THREE.Group();
        const h = 2.6 * o.scale;
        const broken = o.variant === 1;
        const col = 0xd9d0bd;
        g.add(part(G.box(1.1, 0.3, 1.1), 0xc4baa6, { pos: [0, 0.15, 0], outline: 0.03, map: stoneTex() }));
        const shaft = part(new THREE.CylinderGeometry(0.42, 0.48, broken ? h * 0.55 : h, 12), col, { pos: [0, (broken ? h * 0.55 : h) / 2 + 0.3, 0], outline: 0.035, map: stoneTex() });
        shaft.castShadow = true;
        g.add(shaft);
        if (!broken) {
          g.add(part(G.box(1.05, 0.28, 1.05), 0xc4baa6, { pos: [0, h + 0.44, 0], outline: 0.03, map: stoneTex() }));
          if (o.variant === 2) g.add(part(G.box(1.2, 0.16, 0.5), 0x7bb04a, { pos: [0, h + 0.62, 0.1], outline: 0.02 }));
        } else {
          g.add(part(G.cone(0.42, 0.5, 12), col, { pos: [0, h * 0.55 + 0.55, 0], rot: [0.2, 0, 0.3], outline: 0.03 }));
          // Упавший обломок
          const piece = part(new THREE.CylinderGeometry(0.4, 0.4, 1.2, 12), col, { map: stoneTex(), pos: [1.2, 0.4, 0.3], rot: [0, 0.6, Math.PI / 2], outline: 0.035 });
          piece.castShadow = true;
          g.add(piece);
        }
        // Плющ
        const ivy = part(G.capsule(0.08, 0.9), 0x4f9a3a, { pos: [0.42, 0.9, 0], rot: [0, 0, 0.1], outline: false });
        g.add(ivy);
        g.position.set(o.x, 0, o.z);
        g.rotation.y = o.rot;
        s.add(g);
        break;
      }
      case 'tent': {
        const g = new THREE.Group();
        const col = o.variant === 0 ? 0xa84a3a : 0x3a5a8a;
        const tent = new THREE.Mesh(new THREE.ConeGeometry(1.5, 2.0, 4, 1), toon(col, { map: clothTex() }));
        tent.position.y = 1.0;
        tent.rotation.y = Math.PI / 4;
        tent.castShadow = true;
        addOutline(tent, 0.04);
        g.add(tent);
        const stripe = new THREE.Mesh(new THREE.ConeGeometry(1.52, 0.5, 4, 1, true), toon(0xfff2d6));
        stripe.position.y = 0.55;
        stripe.rotation.y = Math.PI / 4;
        g.add(stripe);
        const door = new THREE.Mesh(new THREE.CircleGeometry(0.55, 3), toon(0x3a2418));
        door.position.set(0, 0.5, 1.07);
        door.rotation.set(-0.47, 0, Math.PI / 2 + Math.PI);
        door.rotation.z = Math.PI / 2;
        g.add(door);
        g.add(part(G.cyl(0.04, 0.04, 0.6, 5), 0x7a4a26, { pos: [0, 2.2, 0], outline: false }));
        const flag = part(G.box(0.4, 0.25, 0.02), 0xffd54a, { pos: [0.2, 2.35, 0], outline: 0.015 });
        g.add(flag);
        g.position.set(o.x, 0, o.z);
        g.rotation.y = Math.atan2(-o.x, -o.z);
        s.add(g);
        break;
      }
      default:
        break;
    }
  }

  private buildTrees(trees: Obstacle[]) {
    const byVar = [0, 1, 2].map((v) => trees.filter((t) => t.variant === v));
    const dummy = new THREE.Object3D();
    // Хвоя ярусами с рваными, чуть провисшими краями
    const pineFoliage = organic(
      mergeGeometries(
        [0, 1, 2, 3, 4, 5].map((i) => new THREE.ConeGeometry(1.65 - i * 0.24, 1.25 - i * 0.05, 14, 2).translate(0, 1.55 + i * 0.5, 0).rotateY(i * 0.7)),
      )!,
      0.16,
      0.5,
      true,
    );
    // Лиственные кроны — много неровных комков разного размера
    const lumps = (n: number, r: number, h: number, cy: number, seed: number) => {
      const rr = new Rng(seed);
      const parts: THREE.BufferGeometry[] = [new THREE.IcosahedronGeometry(r * 0.75, 1).translate(0, cy, 0)];
      for (let i = 0; i < n; i++) {
        const a = rr.range(0, Math.PI * 2);
        const d = rr.range(0.35, 0.85) * r;
        parts.push(new THREE.IcosahedronGeometry(r * rr.range(0.38, 0.6), 1).translate(Math.cos(a) * d, cy + rr.range(-0.45, 0.6) * h, Math.sin(a) * d));
      }
      return mergeGeometries(parts)!;
    };
    const oakFoliage = organic(lumps(11, 1.6, 1.2, 2.75, 7), 0.12, 0.42, false);
    const birchFoliage = organic(lumps(8, 1.15, 1.3, 3.05, 11), 0.1, 0.48, false);
    // Нормали — наполовину «облаком»: крона читается объёмом, но комки видны
    for (const g of [oakFoliage, birchFoliage]) {
      const p = g.attributes.position;
      const n = g.attributes.normal;
      const v = new THREE.Vector3();
      const m = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.set(p.getX(i), p.getY(i) - 2.8, p.getZ(i)).normalize();
        m.set(n.getX(i), n.getY(i), n.getZ(i)).lerp(v, 0.55).normalize();
        n.setXYZ(i, m.x, m.y, m.z);
      }
    }
    // Ствол с корневым расширением и парой сучьев в крону
    const trunkGeo = mergeGeometries([
      flare(new THREE.CylinderGeometry(0.17, 0.3, 2.2, 10, 4).translate(0, 1.1, 0), 0.45),
      new THREE.CylinderGeometry(0.05, 0.1, 1.1, 6).rotateZ(-0.8).translate(0.4, 2.0, 0),
      new THREE.CylinderGeometry(0.04, 0.09, 1.0, 6).rotateZ(0.9).rotateY(1.2).translate(-0.12, 2.15, -0.35),
    ])!;
    const birchTrunk = mergeGeometries([
      flare(new THREE.CylinderGeometry(0.13, 0.2, 2.8, 10, 4).translate(0, 1.4, 0), 0.3),
      new THREE.CylinderGeometry(0.035, 0.07, 0.9, 6).rotateZ(-0.7).translate(0.3, 2.3, 0),
    ])!;
    const defs = [
      { trees: byVar[0], foliage: pineFoliage, trunk: trunkGeo, fcol: [0x2a5a3a, 0x30663f, 0x264f34], tcol: 0x7a4a26 },
      { trees: byVar[1], foliage: oakFoliage, trunk: trunkGeo, fcol: [0x4a7a35, 0x568a3c, 0x3f6c30, 0x6a8a3c], tcol: 0x80522a },
      { trees: byVar[2], foliage: birchFoliage, trunk: birchTrunk, fcol: [0x7a9038, 0x8f923a, 0x6a8636], tcol: 0xf2efe6 },
    ];
    const c = new THREE.Color();
    for (const d of defs) {
      if (d.trees.length === 0) continue;
      const fMat = swayToon(0xffffff, 0.035, { map: leafTex(), vertexColors: true }, true);
      const foliage = new THREE.InstancedMesh(d.foliage, fMat, d.trees.length);
      const trunk = new THREE.InstancedMesh(d.trunk, toon(d.tcol, { map: barkTex() }), d.trees.length);
      d.trees.forEach((t, i) => {
        dummy.position.set(t.x, 0, t.z);
        dummy.rotation.set(0, t.rot, 0);
        dummy.scale.setScalar(t.scale);
        dummy.updateMatrix();
        foliage.setMatrixAt(i, dummy.matrix);
        trunk.setMatrixAt(i, dummy.matrix);
        foliage.setColorAt(i, c.set(d.fcol[i % d.fcol.length]));
      });
      foliage.castShadow = trunk.castShadow = true;
      foliage.receiveShadow = trunk.receiveShadow = true;
      this.scene.add(foliage, trunk, instancedOutline(foliage, 0.05, 0.035, true), instancedOutline(trunk, 0.04));
      if (d.tcol === 0xf2efe6) {
        // Тёмные полоски берёзы
        const stripes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.06, 0.42), toon(0x2a2420), d.trees.length * 3);
        let k = 0;
        d.trees.forEach((t) => {
          for (let j = 0; j < 3; j++) {
            dummy.position.set(t.x, (0.5 + j * 0.65) * t.scale, t.z);
            dummy.rotation.set(0, t.rot + j, 0);
            dummy.scale.set(t.scale * 0.95, t.scale, t.scale * 0.2);
            dummy.updateMatrix();
            stripes.setMatrixAt(k++, dummy.matrix);
          }
        });
        this.scene.add(stripes);
      }
    }
  }

  private buildDecor(rng: Rng) {
    const dummy = new THREE.Object3D();
    const R = this.world.radius;
    // Трава
    // Пучок тонких изогнутых травинок: тёмные у земли, светлые на концах
    const blades: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4;
      const h = 0.32 + ((i * 37) % 10) * 0.025;
      const tilt = 0.15 + ((i * 53) % 7) * 0.05;
      blades.push(new THREE.ConeGeometry(0.028, h, 3, 1, true).translate(0, h / 2, 0).rotateZ(tilt).rotateY(a).translate(Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05));
    }
    const tuft = mergeGeometries(blades)!;
    {
      const p = tuft.attributes.position;
      const col = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const k = 0.45 + 0.6 * Math.min(1, p.getY(i) / 0.45);
        col[i * 3] = col[i * 3 + 1] = k;
        col[i * 3 + 2] = k * 0.9;
      }
      tuft.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    const grassN = 2200;
    const grass = new THREE.InstancedMesh(tuft, swayToon(0xffffff, 0.25, { vertexColors: true, side: THREE.DoubleSide }), grassN);
    const gc = new THREE.Color();
    let n = 0;
    for (let tries = 0; tries < grassN * 3 && n < grassN; tries++) {
      const a = rng.range(0, Math.PI * 2);
      const d = Math.sqrt(rng.next()) * (R + 0.5);
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      if (d > shoreRadius(a) - 2.6) continue;
      if (!this.isFree(x, z, 0.3, 1.2)) continue;
      dummy.position.set(x, 0, z);
      dummy.rotation.set(0, rng.range(0, 6.28), 0);
      dummy.scale.setScalar(rng.range(0.7, 1.4));
      dummy.updateMatrix();
      grass.setMatrixAt(n, dummy.matrix);
      grass.setColorAt(n, gc.set(rng.pick([0x557f3a, 0x648c44, 0x76994e, 0x4a7535])));
      n++;
    }
    grass.count = n;
    grass.receiveShadow = true;
    this.scene.add(grass);

    // Цветы
    const flowerN = 420;
    const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.015, 0.02, 0.35, 4).translate(0, 0.17, 0), toon(0x4f9a3a), flowerN);
    const heads = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.065, 1).translate(0, 0.37, 0), toon(0xffffff), flowerN);
    const centers = new THREE.InstancedMesh(new THREE.SphereGeometry(0.028, 6, 4).translate(0, 0.4, 0.03), toon(0xffd54a), flowerN);
    const fcolors = [0xc85a6a, 0xe0c040, 0xeeeee6, 0x9a6ad0, 0x5a90d0, 0xd08a3a];
    n = 0;
    for (let tries = 0; tries < flowerN * 4 && n < flowerN; tries++) {
      // Цветы растут полянками
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(5, R - 2);
      const cx = Math.cos(a) * d;
      const cz = Math.sin(a) * d;
      const col = rng.pick(fcolors);
      for (let k = 0; k < 7 && n < flowerN; k++) {
        const x = cx + rng.range(-1.4, 1.4);
        const z = cz + rng.range(-1.4, 1.4);
        if (!this.isFree(x, z, 0.4, 1.3)) continue;
        dummy.position.set(x, 0, z);
        dummy.rotation.set(rng.range(-0.15, 0.15), rng.range(0, 6.28), rng.range(-0.15, 0.15));
        dummy.scale.setScalar(rng.range(0.8, 1.3));
        dummy.updateMatrix();
        stems.setMatrixAt(n, dummy.matrix);
        heads.setMatrixAt(n, dummy.matrix);
        centers.setMatrixAt(n, dummy.matrix);
        heads.setColorAt(n, gc.set(col));
        n++;
      }
    }
    stems.count = heads.count = centers.count = n;
    this.scene.add(stems, heads, centers);

    // Кусты
    const bushGeo = mergeGeometries([
      new THREE.IcosahedronGeometry(0.6, 1).translate(0, 0.45, 0),
      new THREE.IcosahedronGeometry(0.45, 1).translate(0.5, 0.35, 0.1),
      new THREE.IcosahedronGeometry(0.42, 1).translate(-0.45, 0.32, -0.1),
    ])!;
    const bushN = 70;
    const bushes = new THREE.InstancedMesh(bushGeo, swayToon(0xffffff, 0.04, { map: leafTex() }), bushN);
    const berries = new THREE.InstancedMesh(
      mergeGeometries([
        new THREE.SphereGeometry(0.07, 6, 4).translate(0.3, 0.7, 0.4),
        new THREE.SphereGeometry(0.07, 6, 4).translate(-0.2, 0.8, 0.45),
        new THREE.SphereGeometry(0.07, 6, 4).translate(0.55, 0.45, 0.35),
      ])!,
      toon(0xe0303a),
      bushN,
    );
    n = 0;
    let nb = 0;
    for (let tries = 0; tries < 600 && n < bushN; tries++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(7, R - 1);
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      if (d > shoreRadius(a) - 2.5 || !this.isFree(x, z, 1.0, 1.8)) continue;
      dummy.position.set(x, 0, z);
      dummy.rotation.set(0, rng.range(0, 6.28), 0);
      dummy.scale.setScalar(rng.range(0.7, 1.2));
      dummy.updateMatrix();
      bushes.setMatrixAt(n, dummy.matrix);
      bushes.setColorAt(n, gc.set(rng.pick([0x3a6a30, 0x447a36, 0x335f2c])));
      if (rng.chance(0.35)) berries.setMatrixAt(nb++, dummy.matrix);
      n++;
    }
    bushes.count = n;
    berries.count = nb;
    bushes.castShadow = true;
    this.scene.add(bushes, berries, instancedOutline(bushes, 0.035, 0));

    // Грибы и камешки
    const mushN = 50;
    const caps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.17, 0), toon(0xffffff), mushN);
    const mstems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.07, 0.18, 6).translate(0, 0.09, 0), toon(0xfff2d6), mushN);
    n = 0;
    for (let tries = 0; tries < 400 && n < mushN; tries++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(6, R - 2);
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      if (!this.isFree(x, z, 0.3, 1.3)) continue;
      dummy.position.set(x, 0, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(rng.range(0.7, 1.5));
      dummy.updateMatrix();
      caps.setMatrixAt(n, dummy.matrix);
      mstems.setMatrixAt(n, dummy.matrix);
      caps.setColorAt(n, gc.set(rng.pick([0xb8453a, 0xb8453a, 0xb07a40, 0x8a6a5a])));
      n++;
    }
    caps.count = mstems.count = n;
    this.scene.add(caps, mstems);

    const pebN = 160;
    const pebbles = new THREE.InstancedMesh(faceted(new THREE.DodecahedronGeometry(0.14, 0)), toon(0xb0aca4), pebN);
    n = 0;
    for (let tries = 0; tries < 800 && n < pebN; tries++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(2, R + 1);
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      if (!this.isFree(x, z, 0.2, 0.3)) continue;
      dummy.position.set(x, 0.03, z);
      dummy.rotation.set(rng.range(0, 3), rng.range(0, 3), 0);
      dummy.scale.set(rng.range(0.6, 1.6), rng.range(0.4, 0.8), rng.range(0.6, 1.4));
      dummy.updateMatrix();
      pebbles.setMatrixAt(n++, dummy.matrix);
    }
    pebbles.count = n;
    this.scene.add(pebbles);

    // Фонари вдоль тропинок
    for (const p of this.paths) {
      for (const i of [4, 7]) {
        const a = p[i];
        const b = p[i + 1];
        const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
        const x = a.x + (-(b.z - a.z) / len) * 1.7;
        const z = a.z + ((b.x - a.x) / len) * 1.7;
        if (!this.isFree(x, z, 0.5, 1.4)) continue;
        const g = new THREE.Group();
        g.add(part(G.cyl(0.06, 0.08, 1.6, 6), 0x5a3a22, { pos: [0, 0.8, 0], outline: 0.02 }));
        g.add(part(G.box(0.5, 0.06, 0.06), 0x5a3a22, { pos: [0.2, 1.55, 0], outline: 0.015 }));
        const lamp = new THREE.Mesh(G.box(0.22, 0.28, 0.22), toon(0xffe08a, { emissive: 0xffb84a, emissiveIntensity: 0.9 }));
        lamp.position.set(0.4, 1.35, 0);
        addOutline(lamp, 0.02);
        g.add(lamp);
        const halo = new THREE.Mesh(G.sphere(0.35, 10, 8), glow(0xffc35a, 0.25));
        halo.position.copy(lamp.position);
        g.add(halo);
        g.position.set(x, 0, z);
        g.rotation.y = rng.range(0, 6);
        this.scene.add(g);
      }
    }

    // Бабочки
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Group();
      const col = rng.pick([0xffe14a, 0xff7ab0, 0x7ad0ff, 0xffffff]);
      for (const s of [-1, 1]) {
        const w = new THREE.Mesh(new THREE.CircleGeometry(0.12, 6), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide }));
        w.position.x = s * 0.1;
        w.name = s < 0 ? 'wl' : 'wr';
        m.add(w);
      }
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(6, 28);
      this.butterflies.push({ m, cx: Math.cos(a) * d, cz: Math.sin(a) * d, ph: rng.range(0, 10), r: rng.range(1.5, 3.5) });
      this.scene.add(m);
    }
  }

  private buildPortal(s: Vec2) {
    const g = new THREE.Group();
    const a = Math.atan2(-s.x, -s.z);
    const ringGeo = faceted(new THREE.TorusGeometry(1.5, 0.28, 6, 14));
    const ring = new THREE.Mesh(ringGeo, toon(0x6f6a7a, { map: stoneTex() }));
    ring.position.y = 1.75;
    addOutline(ring, 0.04);
    ring.castShadow = true;
    g.add(ring);
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      const rune = new THREE.Mesh(G.box(0.18, 0.24, 0.08), toon(0xc07aff, { emissive: 0x9a4aff, emissiveIntensity: 1 }));
      rune.position.set(Math.cos(ang) * 1.5, 1.75 + Math.sin(ang) * 1.5, 0.25);
      g.add(rune);
    }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.35, 40), portalMaterial(0x6a2ad0, 0xd05aff));
    disc.position.y = 1.75;
    g.add(disc);
    g.add(part(G.box(1.2, 0.4, 0.8), 0x5f5a6a, { pos: [-1.3, 0.2, 0], outline: 0.03 }));
    g.add(part(G.box(1.2, 0.4, 0.8), 0x5f5a6a, { pos: [1.3, 0.2, 0], outline: 0.03 }));
    // Кристаллы вокруг
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2 + 0.4;
      const cr = new THREE.Mesh(faceted(new THREE.OctahedronGeometry(0.3, 0)), toon(0xb06aff, { emissive: 0x7a2ad0, emissiveIntensity: 0.7 }));
      cr.position.set(Math.cos(ang) * 2.4, 0.35, Math.sin(ang) * 1.6);
      cr.scale.set(0.7, 1.6, 0.7);
      cr.rotation.z = Math.cos(ang) * 0.4;
      addOutline(cr, 0.025);
      g.add(cr);
    }
    g.position.set(s.x, 0, s.z);
    g.rotation.y = a;
    this.scene.add(g);
    this.portals.push({ x: s.x, z: s.z, disc });
  }

  private buildCamp(rng: Rng) {
    const s = this.scene;
    // Костёр
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const st = new THREE.Mesh(G.dodeca(0.2), toon(0x8f8a84));
      st.position.set(Math.cos(a) * 0.65, 0.1, Math.sin(a) * 0.65);
      st.scale.set(1, 0.7, 1);
      addOutline(st, 0.025);
      s.add(st);
    }
    for (let i = 0; i < 3; i++) {
      const log = part(G.cyl(0.08, 0.08, 0.9, 6), 0x6a4024, { pos: [0, 0.12, 0], rot: [Math.PI / 2, (i / 3) * Math.PI, 0.25], outline: 0.02 });
      s.add(log);
    }
    const flame = new Flame(1);
    flame.group.position.y = 0.1;
    s.add(flame.group);
    this.flames.push(flame);
    // Брёвна-скамейки
    for (const a of [0.3, 2.3, 4.3]) {
      const log = part(G.cyl(0.22, 0.22, 1.6, 10), 0x7a4a26, { map: barkTex(), pos: [Math.cos(a) * 2.1, 0.22, Math.sin(a) * 2.1], rot: [Math.PI / 2, 0, 0], outline: 0.03 });
      log.rotation.set(Math.PI / 2, 0, a + Math.PI / 2);
      log.rotation.order = 'YXZ';
      log.rotation.set(Math.PI / 2, a, 0);
      log.castShadow = true;
      s.add(log);
    }
    // Указатель
    const sign = new THREE.Group();
    sign.add(part(G.cyl(0.07, 0.08, 1.8, 6), 0x6a4024, { pos: [0, 0.9, 0], outline: 0.02 }));
    sign.add(part(G.box(0.9, 0.25, 0.06), 0xc79a5a, { pos: [0.3, 1.5, 0], rot: [0, 0, 0.08], outline: 0.02, map: woodTex() }));
    sign.add(part(G.box(0.8, 0.22, 0.06), 0xc79a5a, { pos: [-0.25, 1.15, 0.02], rot: [0, 0.3, -0.06], outline: 0.02, map: woodTex() }));
    sign.position.set(2.0, 0, -2.3);
    s.add(sign);
    // Бочки и ящики у палаток
    for (const [x, z] of [
      [-5.6, -1.8],
      [6.1, -1.6],
    ]) {
      const b = part(G.cyl(0.35, 0.3, 0.8, 12), 0x8a5a2b, { pos: [x, 0.4, z], outline: 0.03, map: woodTex() });
      b.castShadow = true;
      s.add(b, part(G.torus(0.34, 0.025, Math.PI * 2, 4, 16), 0x5a5a5a, { pos: [x, 0.62, z], rot: [Math.PI / 2, 0, 0], outline: false }));
      const crate = part(G.box(0.6, 0.6, 0.6), 0xb07a3a, { map: woodTex(), pos: [x + 0.8 * Math.sign(x), 0.3, z + 0.4], rot: [0, rng.range(0, 1), 0], outline: 0.03 });
      crate.castShadow = true;
      s.add(crate);
    }
  }

  private buildDistant(rng: Rng) {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + rng.range(-0.3, 0.3);
      const d = rng.range(55, 75);
      const g = new THREE.Group();
      const r = rng.range(3, 7);
      const isle = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.3, 1.6, 12), toon(0x5a8a40));
      isle.position.y = -0.3;
      g.add(isle);
      const sand = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.3, r * 1.45, 0.4, 12), toon(0xd8c79a));
      sand.position.y = -0.95;
      g.add(sand);
      for (let k = 0; k < Math.round(r); k++) {
        const t = new THREE.Mesh(G.cone(0.9, 2.4, 7), toon(0x2a5a3a));
        t.position.set(rng.range(-r * 0.6, r * 0.6), 1.5, rng.range(-r * 0.6, r * 0.6));
        g.add(t);
      }
      g.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
      this.scene.add(g);
    }
  }

  update(dt: number, fx: Particles) {
    this.t += dt;
    for (const f of this.flames) f.update(dt);
    this.fireLight.intensity = 6 + Math.sin(this.t * 13) * 0.8 + Math.sin(this.t * 31) * 0.5;
    (this.foam.material as THREE.ShaderMaterial).uniforms.time.value = this.t;
    this.emitT -= dt;
    if (this.emitT <= 0) {
      this.emitT = 0.06;
      // Искры костра
      fx.glow({ x: (Math.random() - 0.5) * 0.4, y: 0.6, z: (Math.random() - 0.5) * 0.4, vx: (Math.random() - 0.5) * 0.4, vy: 1.5 + Math.random(), vz: (Math.random() - 0.5) * 0.4, life: 1.2, size: 0.12, color: 0xffa040 });
      if (Math.random() < 0.3) fx.puff({ x: 0, y: 1.2, z: 0, vx: 0.2, vy: 0.8, vz: 0.1, life: 2.2, size: 0.4, grow: 0.5, color: 0x7a7a7a, alpha: 0.3 });
      // Частицы порталов
      for (const p of this.portals) {
        if (Math.random() < 0.5) {
          const a = Math.random() * Math.PI * 2;
          fx.glow({ x: p.x + Math.cos(a) * 1.4, y: 0.2, z: p.z + Math.sin(a) * 1.4, vy: 1.2 + Math.random(), life: 1.4, size: 0.18, color: Math.random() < 0.5 ? 0xb06aff : 0xff7aff });
        }
      }
      // Пыльца
      if (Math.random() < 0.5) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * 30;
        fx.glow({ x: Math.cos(a) * d, y: 0.5 + Math.random() * 2, z: Math.sin(a) * d, vx: 0.3, vy: 0.1, vz: 0.1, life: 3, size: 0.08, color: 0xfff6b0, alpha: 0.7 });
      }
    }
    for (const p of this.portals) p.disc.rotation.z += dt * 0.5;
    for (const b of this.butterflies) {
      const tt = this.t * 0.6 + b.ph;
      b.m.position.set(b.cx + Math.cos(tt) * b.r, 1.0 + Math.sin(tt * 3) * 0.4, b.cz + Math.sin(tt * 1.3) * b.r);
      b.m.rotation.y = -tt;
      const flap = Math.sin(this.t * 18 + b.ph) * 1.1;
      b.m.children[0].rotation.y = flap;
      b.m.children[1].rotation.y = -flap;
    }
  }
}
