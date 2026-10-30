import * as THREE from 'three';
import type { Rarity } from '@game/shared';
import { G, RARITY_HEX, faceted, glow, part, toon } from './toon';
import { metalTex, woodTex } from './textures';
import { headShape } from './anatomy';
import { GOLD, LUX, METAL, RANK, WOOD, gem, halo, type Built } from './equipment';
import { blade, block, lathe, plate, tube, wrap, type Pt } from './forge';

type V3 = [number, number, number];

/**
 * Детализированное оружие. Локальная ось +y — вдоль клинка/древка, хват в начале
 * координат. С редкостью растёт отделка: обычное — простая сталь и дерево,
 * редкое — латунь и самоцвет, эпическое — гравировка с сиянием, легендарное —
 * золото и ореол, реликвия — алое пламя.
 */
export function buildWeapon(tpl: string, r: Rarity, out: Built): THREE.Group {
  const rank = RANK[r];
  const w = new THREE.Group();
  const glowCol = RARITY_HEX[r];
  // Сталь слегка окрашена редкостью; полированная, но не зеркальная
  const steelCol = [0xb8bec6, 0xc6d2de, 0xc4bcd8, 0xe6d6a4, 0x9a3a34][rank];
  const darkSteel = rank >= 4 ? 0x3a1414 : 0x4a4e56;
  const trim = rank >= 3 ? LUX[r] : rank >= 1 ? 0xd8b048 : 0x8a6a4a;
  const leather = rank >= 4 ? 0x2a0a0e : rank >= 3 ? 0x6a1c1c : 0x4a2e1a;

  const S = (geo: THREE.BufferGeometry, pos: V3, rot?: V3, scale?: V3) => add(part(geo, steelCol, { pos, rot, scale, outline: false, metal: 0.45, rough: 0.38, map: metalTex() }));
  const D = (geo: THREE.BufferGeometry, pos: V3, rot?: V3, scale?: V3) => add(part(geo, darkSteel, { pos, rot, scale, outline: false, metal: 0.85, rough: 0.4 }));
  const T = (geo: THREE.BufferGeometry, pos: V3, rot?: V3, scale?: V3) => add(part(geo, trim, { pos, rot, scale, outline: false, metal: rank >= 1 ? 0.75 : 0.3, rough: rank >= 1 ? 0.32 : 0.7 }));
  const L = (geo: THREE.BufferGeometry, pos: V3, rot?: V3, scale?: V3, col = leather) => add(part(geo, col, { pos, rot, scale, outline: false, rough: 0.82 }));
  const Wd = (geo: THREE.BufferGeometry, pos: V3, rot?: V3, scale?: V3, col = WOOD) => add(part(geo, col, { pos, rot, scale, outline: false, map: woodTex(), rough: 0.8 }));
  const C = (geo: THREE.BufferGeometry, color: number, pos: V3, rot?: V3, scale?: V3, o: { metal?: number; rough?: number } = {}) => add(part(geo, color, { pos, rot, scale, outline: false, ...o }));
  /** Светящаяся деталь (руны, кромки): не склеивается, поэтому их немного. */
  const E = (geo: THREE.BufferGeometry, color: number, pos: V3, rot?: V3, scale?: V3, k = 1) => {
    const m = new THREE.Mesh(geo, toon(color, { emissive: color, emissiveIntensity: k }));
    m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    if (scale) m.scale.set(...scale);
    return add(m);
  };
  function add<T extends THREE.Object3D>(o: T): T {
    w.add(o);
    return o;
  }

  /** Рукоять: обтянута кожей, поверх — спиральная обмотка шнуром, по краям — металлические кольца. */
  const grip = (y0: number, y1: number, rad: number) => {
    L(lathe(`grip|${rad}|${y1 - y0}`, [[rad * 0.9, 0], [rad, (y1 - y0) * 0.15], [rad * 1.06, (y1 - y0) * 0.5], [rad, (y1 - y0) * 0.85], [rad * 0.9, y1 - y0]], 10), [0, y0, 0]);
    L(wrap(rad * 1.05, y0 + 0.01, y1 - 0.01, Math.max(3, Math.round((y1 - y0) / 0.045)), rad * 0.22), [0, 0, 0], undefined, undefined, rank >= 2 ? 0x2a1a10 : 0x3a2414);
    for (const y of [y0, y1]) T(G.cyl(rad * 1.18, rad * 1.18, 0.02, 12), [0, y, 0]);
  };
  /** Навершие: точёный «бублик» с самоцветом в оправе у редких. */
  const pommel = (y: number, rad: number) => {
    T(lathe(`pommel|${rad}`, [[0, -rad * 0.9], [rad * 0.55, -rad * 0.8], [rad, -rad * 0.2], [rad * 0.85, rad * 0.4], [rad * 0.4, rad * 0.75], [0, rad * 0.8]], 14), [0, y, 0]);
    if (rank >= 1) {
      T(G.torus(rad * 0.42, rad * 0.1, Math.PI * 2, 6, 14), [0, y, rad * 0.62], [0, 0, 0]);
      add(gem(glowCol, rad * 0.36, [0, y, rad * 0.72], out));
    }
  };
  /** Руны вдоль клинка: эпические и выше светятся цветом редкости. */
  const runes = (y0: number, y1: number, n: number, z: number, size = 0.025) => {
    if (rank < 2) return;
    for (let i = 0; i < n; i++) {
      const y = y0 + ((y1 - y0) * (i + 0.5)) / n;
      E(G.box(size, size * 1.6, 0.006), glowCol, [0, y, z], [0, 0, i % 2 ? 0.5 : -0.5], undefined, 1.2);
      E(G.box(size, size * 1.6, 0.006), glowCol, [0, y, -z], [0, 0, i % 2 ? 0.5 : -0.5], undefined, 1.2);
    }
  };
  /** Дол: тёмная канавка вдоль клинка с обеих сторон. */
  const fuller = (y0: number, len: number, wd: number, thick: number) => {
    for (const z of [-1, 1]) C(G.box(wd, len, 0.004), rank >= 4 ? 0x2a0a0a : 0x5a6068, [0, y0 + len / 2, z * thick * 0.42], undefined, undefined, { metal: 0.8, rough: 0.5 });
  };

  switch (tpl) {
    case 'sword': {
      const len = 0.88 + rank * 0.07;
      const wd = 0.12 + rank * 0.008;
      grip(-0.11, 0.1, 0.038);
      pommel(-0.16, 0.06);
      // Гарда: изогнутые квиллоны с утолщёнными концами
      const gq: Pt[] = [[-0.2, 0.0], [-0.12, 0.02], [-0.05, 0.03], [0.05, 0.03], [0.12, 0.02], [0.2, 0.0], [0.22, 0.04], [0.19, 0.06], [0.1, 0.06], [0.05, 0.075], [-0.05, 0.075], [-0.1, 0.06], [-0.19, 0.06], [-0.22, 0.04]];
      T(plate('swordguard', gq, 0.06, 0.012), [0, 0.1, 0]);
      if (rank >= 1) for (const s of [-1, 1]) T(G.sphere(0.028, 10, 8), [s * 0.215, 0.135, 0]);
      // Рикассо и клинок с долом
      S(block(wd * 0.9, 0.07, 0.04, 0.006), [0, 0.21, 0]);
      S(blade(len, wd, 0.034, { taper: 0.82, tip: 0.17 }), [0, 0.24, 0]);
      fuller(0.27, len * 0.66, 0.026, 0.034);
      runes(0.32, 0.24 + len * 0.6, 3 + rank, 0.0175);
      if (rank >= 1) add(gem(glowCol, 0.034, [0, 0.135, 0.04], out));
      if (rank >= 3) {
        // Пламенеющие «крылья» у основания клинка
        for (const s of [-1, 1]) T(plate('swordwing', [[0, 0], [0.09, 0.02], [0.13, 0.09], [0.06, 0.06], [0.02, 0.1]], 0.02, 0.006), [s * 0.04, 0.17, 0], [0, s < 0 ? Math.PI : 0, 0]);
        add(halo(glowCol, 0.128, [0, 0.24 + len * 0.45, 0], out, 0.14));
      }
      break;
    }
    case 'axe': {
      Wd(lathe('axehaft', [[0.036, -0.2], [0.044, -0.15], [0.042, 0.4], [0.038, 0.9], [0.034, 0.96]], 10), [0, 0, 0]);
      grip(-0.14, 0.12, 0.046);
      D(lathe('axecap', [[0, -0.27], [0.03, -0.27], [0.05, -0.22], [0.048, -0.18], [0.04, -0.17]], 10), [0, 0, 0]);
      // Лангеты — стальные полосы, держащие топорище
      for (const s of [-1, 1]) D(G.box(0.012, 0.32, 0.03), [s * 0.045, 0.6, 0]);
      // Бородовидное лезвие: выдавленный профиль с фаской
      const head: Pt[] = [[0.03, 0.64], [0.12, 0.62], [0.24, 0.52], [0.33, 0.48], [0.36, 0.62], [0.37, 0.78], [0.35, 0.92], [0.3, 0.95], [0.22, 0.86], [0.1, 0.8], [0.03, 0.8]];
      S(plate(`axehead`, head, 0.05, 0.016), [0, 0, 0]);
      if (rank >= 2) {
        // Двойная секира
        S(plate('axehead', head, 0.05, 0.016), [0, 0, 0], [0, Math.PI, 0]);
        for (const z of [-0.027, 0.027]) E(tube('axerune', [[0.12, 0.7, 0], [0.2, 0.66, 0], [0.27, 0.68, 0], [0.3, 0.76, 0]], 0.008, 0.008, 4, 12), glowCol, [0, 0, z], undefined, undefined, 1.2);
      } else if (rank >= 1) {
        // Клевец на обухе
        S(plate('axespike', [[-0.03, 0.66], [-0.2, 0.71], [-0.03, 0.78]], 0.04, 0.012), [0, 0, 0]);
      }
      // Обух-втулка с заклёпками
      D(block(0.11, 0.2, 0.08, 0.012), [0, 0.72, 0]);
      for (const y of [0.66, 0.78]) for (const z of [-1, 1]) T(G.sphere(0.014, 6, 4), [0.04, y, z * 0.042]);
      T(G.cone(0.035, 0.12, 6), [0, 0.88, 0]);
      if (rank >= 3) add(halo(glowCol, 0.176, [0.25, 0.72, 0], out, 0.14));
      break;
    }
    case 'hammer': {
      Wd(lathe('hamhaft', [[0.04, -0.2], [0.046, -0.1], [0.044, 0.5], [0.04, 0.72]], 10), [0, 0, 0]);
      grip(-0.12, 0.14, 0.048);
      T(lathe('hamcap', [[0, -0.27], [0.045, -0.26], [0.06, -0.22], [0.05, -0.19], [0.04, -0.19]], 10), [0, 0, 0]);
      // Боёк: брус с фаской, ударные площадки, бандажи и заклёпки
      D(block(0.4, 0.24, 0.24, 0.03), [0, 0.82, 0]);
      for (const s of [-1, 1]) {
        S(lathe('hamface', [[0, 0], [0.14, 0], [0.15, 0.02], [0.13, 0.07], [0, 0.075]], 16), [s * 0.2, 0.82, 0], [0, 0, -s * Math.PI / 2]);
        T(G.box(0.03, 0.26, 0.26), [s * 0.12, 0.82, 0]);
        for (const y of [-1, 1]) for (const z of [-1, 1]) T(G.sphere(0.013, 6, 4), [s * 0.12, 0.82 + y * 0.09, z * 0.132]);
      }
      if (rank >= 1) S(G.cone(0.055, 0.2, 8), [0, 1.03, 0]);
      if (rank >= 2) for (const z of [-1, 1]) E(G.torus(0.06, 0.008, Math.PI * 2, 4, 16), glowCol, [0, 0.82, z * 0.123], undefined, undefined, 1.3);
      if (rank >= 3) {
        for (const s of [-1, 1]) add(gem(0x7ae0ff, 0.05, [s * 0.29, 0.82, 0], out));
        add(halo(0x7ae0ff, 0.24, [0, 0.82, 0], out, 0.14));
      }
      break;
    }
    case 'staff': {
      // Узловатое древко из живого дерева
      const shaft: [number, number, number][] = [[0, -0.2, 0], [0.01, 0.2, 0.005], [-0.008, 0.6, -0.006], [0.012, 1.0, 0.004], [0, 1.28, 0]];
      Wd(tube('staffshaft', shaft, 0.05, 0.034, 9, 30), [0, 0, 0]);
      for (const y of [0.35, 0.8]) Wd(G.sphere(0.045, 8, 6), [0.01, y, 0], undefined, [1, 0.7, 1]);
      D(lathe('stafffoot', [[0, -0.32], [0.03, -0.3], [0.05, -0.22], [0.048, -0.18]], 10), [0, 0, 0]);
      for (let i = 0; i < 3; i++) T(G.torus(0.046, 0.012, Math.PI * 2, 5, 14), [0, 0.15 + i * 0.36, 0], [Math.PI / 2, 0, 0]);
      // Три ветви сплетаются в корону, держащую кристалл
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const c = Math.cos(a);
        const s = Math.sin(a);
        Wd(tube(`staffbranch${i}`, [[c * 0.02, 1.22, s * 0.02], [c * 0.11, 1.34, s * 0.11], [c * 0.13, 1.48, s * 0.13], [c * 0.05, 1.6, s * 0.05]], 0.026, 0.01, 6, 16), [0, 0, 0]);
      }
      const cc = rank === 0 ? 0x7fd8ff : glowCol;
      const crystal = new THREE.Mesh(faceted(new THREE.OctahedronGeometry(0.1, 0)), toon(cc, { emissive: cc, emissiveIntensity: 1.1, rough: 0.1 }));
      crystal.position.y = 1.43;
      crystal.scale.set(0.75, 1.5, 0.75);
      out.glow.push(crystal);
      add(crystal);
      add(halo(cc, 0.192, [0, 1.43, 0], out, 0.14));
      // Подвески на шнурках
      for (const sx of [-1, 1]) {
        C(G.cyl(0.005, 0.005, 0.2, 3), 0x3a2414, [sx * 0.08, 1.17, 0]);
        T(G.cone(0.025, 0.06, 6), [sx * 0.08, 1.05, 0], [Math.PI, 0, 0]);
      }
      const runeRing = new THREE.Mesh(G.torus(0.21, 0.012, Math.PI * 2, 4, 24), glow(rank === 0 ? 0x9ae0ff : glowCol, 0.7, false));
      runeRing.rotation.x = Math.PI / 2 - 0.3;
      runeRing.position.y = 1.43;
      runeRing.userData.anim = true;
      out.spin.push(runeRing);
      add(runeRing);
      if (rank >= 2) {
        const orbit = new THREE.Group();
        orbit.userData.anim = true;
        const n = rank >= 3 ? 4 : 2;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          orbit.add(gem(glowCol, 0.035, [Math.cos(a) * 0.26, 0, Math.sin(a) * 0.26]));
        }
        orbit.position.y = 1.43;
        out.spin.push(orbit);
        add(orbit);
      }
      break;
    }
    case 'wand': {
      grip(-0.14, 0.12, 0.034);
      T(lathe('wandcap', [[0, -0.2], [0.03, -0.19], [0.04, -0.16], [0.036, -0.14]], 10), [0, 0, 0]);
      // Резная кость с кольцами и золотой филигранью
      C(lathe('wandbone', [[0.03, 0.12], [0.026, 0.25], [0.03, 0.3], [0.022, 0.42], [0.026, 0.48], [0.018, 0.6], [0.022, 0.64]], 10), 0xe8dcc0, [0, 0, 0], undefined, undefined, { rough: 0.5 });
      T(wrap(0.03, 0.14, 0.6, 3, 0.006), [0, 0, 0]);
      for (const y of [0.3, 0.48]) T(G.torus(0.031, 0.007, Math.PI * 2, 4, 12), [0, y, 0], [Math.PI / 2, 0, 0]);
      const sc = rank === 0 ? 0xffe14a : glowCol;
      const star = new THREE.Group();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const c = new THREE.Mesh(G.cone(0.032, 0.1, 4), toon(sc, { emissive: sc, emissiveIntensity: 0.9 }));
        c.position.set(Math.sin(a) * 0.05, Math.cos(a) * 0.05, 0);
        c.rotation.z = -a;
        star.add(c);
      }
      star.add(new THREE.Mesh(G.ico(0.035, 1), toon(0xffffff, { emissive: sc, emissiveIntensity: 1 })));
      star.position.y = 0.7;
      star.rotation.x = Math.PI / 2;
      star.userData.anim = true;
      star.userData.spinAxis = 'z';
      out.spin.push(star);
      add(star);
      add(halo(sc, 0.104, [0, 0.7, 0], out, 0.14));
      break;
    }
    case 'orb': {
      grip(-0.12, 0.14, 0.04);
      T(lathe('orbbase', [[0.04, 0.14], [0.06, 0.18], [0.05, 0.22], [0.035, 0.26]], 12), [0, 0, 0]);
      // Когти-держатели, обхватывающие сферу
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const c = Math.cos(a);
        const s = Math.sin(a);
        T(tube(`orbclaw${i}`, [[c * 0.03, 0.25, s * 0.03], [c * 0.14, 0.32, s * 0.14], [c * 0.16, 0.43, s * 0.16], [c * 0.09, 0.53, s * 0.09]], 0.018, 0.006, 6, 14), [0, 0, 0]);
      }
      const oc = rank === 0 ? 0x9ad8ff : glowCol;
      const orb = new THREE.Mesh(G.sphere(0.14, 20, 14), toon(oc, { emissive: oc, emissiveIntensity: 0.6, transparent: true, opacity: 0.8, rough: 0.05 }));
      orb.position.y = 0.42;
      out.glow.push(orb);
      add(orb);
      add(E(G.ico(0.06, 1), 0xffffff, [0, 0.42, 0], undefined, undefined, 1.4));
      add(halo(oc, 0.208, [0, 0.42, 0], out, 0.14));
      const rings = new THREE.Group();
      rings.userData.anim = true;
      for (let i = 0; i <= Math.min(2, rank); i++) {
        const ring = new THREE.Mesh(G.torus(0.21 + i * 0.04, 0.008, Math.PI * 2, 4, 32), toon(GOLD, { metal: 0.95, rough: 0.3 }));
        ring.rotation.set(Math.PI / 2 + i * 0.7, i * 0.9, 0);
        rings.add(ring);
      }
      rings.position.y = 0.42;
      out.spin.push(rings);
      add(rings);
      break;
    }
    case 'bow':
    case 'recurve': {
      const rec = tpl === 'recurve';
      const H = rec ? 0.5 : 0.6;
      const limbCol = rank === 0 ? WOOD : rank === 1 ? 0x6a4428 : rank >= 4 ? 0x5a1418 : 0x3a2a24;
      const lg = new THREE.Group();
      // Плечо лука: толстое у рукояти, тонкое к концам; у рогатого — загнутые концы
      const pts: [number, number, number][] = [];
      for (let i = 0; i <= 10; i++) {
        const y = -H + (i / 10) * 2 * H;
        const k = Math.abs(y) / H;
        let x = 0.12 * (1 - k * k);
        if (rec && k > 0.75) x -= (k - 0.75) * 0.5;
        pts.push([x, y, 0]);
      }
      const half = (s: number): [number, number, number][] => pts.filter((p) => p[1] * s >= -0.001).sort((a, b) => Math.abs(a[1]) - Math.abs(b[1]));
      for (const s of [-1, 1]) {
        const m = part(tube(`bowlimb|${rec}|${s}`, half(s), 0.034, 0.013, 8, 20, 0.6), limbCol, { outline: false, map: rank <= 1 ? woodTex() : undefined, rough: rank <= 1 ? 0.75 : 0.4, metal: rank >= 2 ? 0.5 : 0 });
        lg.add(m);
        // Накладки-наконечники и тетивные выемки
        const tip = half(s)[half(s).length - 1];
        lg.add(part(G.cone(0.018, 0.07, 6), rank >= 1 ? trim : 0xe8dcc0, { pos: [tip[0], tip[1] + s * 0.02, 0], rot: [s > 0 ? 0 : Math.PI, 0, 0], outline: false, metal: rank >= 1 ? 0.9 : 0 }));
        if (rank >= 2) lg.add(part(plate('bowfin', [[0, 0], [0.09, 0.04], [0.02, 0.16]], 0.016, 0.005), steelCol, { pos: [0.08, s * H * 0.55, 0], rot: [s < 0 ? Math.PI : 0, 0, 0], outline: false, metal: 0.9, rough: 0.25 }));
      }
      const tipX = pts[0][0];
      const str = new THREE.Mesh(G.cyl(0.005, 0.005, H * 2 + 0.02, 4), rank >= 3 ? glow(rank >= 4 ? 0xff6a5a : 0xfff0a0, 1, false) : toon(0xf5f0e0));
      str.position.x = tipX;
      lg.add(str);
      // Рукоять: кожа с обмоткой, полочка для стрелы, латунные кольца
      lg.add(part(G.cyl(0.042, 0.042, 0.22, 10), leather, { pos: [0.12, 0, 0], outline: false, rough: 0.85 }));
      const wr = part(wrap(0.044, -0.1, 0.1, 6, 0.008), 0x2a1a10, { pos: [0.12, 0, 0], outline: false });
      lg.add(wr);
      for (const y of [-0.11, 0.11]) lg.add(part(G.torus(0.044, 0.01, Math.PI * 2, 4, 12), trim, { pos: [0.12, y, 0], rot: [Math.PI / 2, 0, 0], outline: false, metal: 0.9 }));
      lg.add(part(G.box(0.04, 0.025, 0.03), 0xe8dcc0, { pos: [0.165, 0.12, 0], outline: false }));
      if (rank >= 1) lg.add(gem(glowCol, 0.03, [0.165, 0, 0], out));
      if (rank >= 3) lg.add(halo(glowCol, 0.144, [0.12, 0, 0], out, 0.14));
      lg.rotation.set(Math.PI / 2, Math.PI / 2, 0);
      add(lg);
      break;
    }
    case 'crossbow': {
      // Ложа в профиль [вперёд, вверх]: рука обхватывает узкую шейку в начале координат,
      // приклад уходит назад вдоль предплечья, цевьё — вперёд к дуге
      const stock: Pt[] = [[-0.44, 0.03], [-0.1, 0.035], [0.08, 0.04], [0.6, 0.04], [0.6, -0.03], [0.1, -0.045], [0.04, -0.035], [-0.1, -0.035], [-0.2, -0.07], [-0.41, -0.14], [-0.45, -0.12]];
      Wd(plate('xbowstock2', stock, 0.07, 0.014), [0, 0, 0], [0, -Math.PI / 2, 0]);
      // Затыльник приклада и направляющая с замком
      D(G.box(0.074, 0.15, 0.02), [0, -0.05, -0.44], [0.25, 0, 0]);
      D(G.box(0.03, 0.03, 0.56), [0, 0.05, 0.31]);
      T(G.box(0.05, 0.02, 0.06), [0, 0.06, 0.07]);
      // Дуга: сужающиеся плечи из стали у переднего конца ложи
      const prod: [number, number, number][] = [];
      for (let i = 0; i <= 8; i++) {
        const x = -0.36 + (i / 8) * 0.72;
        prod.push([x, 0, 0.6 - 0.12 * (x / 0.36) ** 2]);
      }
      S(tube('xbowprod', prod, 0.022, 0.022, 7, 20, 0.6), [0, 0.02, 0]);
      T(G.box(0.09, 0.07, 0.05), [0, 0.02, 0.59]);
      for (const s of [-1, 1]) T(G.sphere(0.02, 6, 4), [s * 0.36, 0.02, 0.48]);
      // Тетива взведена: от концов дуги к замку
      for (const s of [-1, 1]) C(tube(`xbowstr${s}`, [[s * 0.355, 0.05, 0.48], [0, 0.065, 0.08]], 0.004, 0.004, 3, 1), 0xf5f0e0, [0, 0, 0]);
      // Заряженный болт с оперением
      C(G.cyl(0.011, 0.011, 0.5, 5), 0xc9a36a, [0, 0.085, 0.34], [Math.PI / 2, 0, 0]);
      S(G.cone(0.025, 0.07, 4), [0, 0.085, 0.62], [Math.PI / 2, 0, 0]);
      for (const a of [0, Math.PI / 2]) C(G.box(0.002, 0.05, 0.08), rank >= 2 ? glowCol : 0xe94b3c, [0, 0.085, 0.14], [0, 0, a]);
      // Стремя впереди, длинный спусковой рычаг под шейкой — под пальцами
      D(G.torus(0.065, 0.012, Math.PI * 2, 4, 14), [0, 0.02, 0.68], [Math.PI / 2, 0, 0]);
      D(G.box(0.014, 0.012, 0.2), [0, -0.055, -0.04], [-0.2, 0, 0]);
      // У редких — ворот на прикладе, прицельная трубка и камень в ложе
      if (rank >= 1) for (const s of [-1, 1]) T(G.cyl(0.025, 0.025, 0.04, 10), [s * 0.06, -0.02, -0.3], [0, 0, Math.PI / 2]);
      if (rank >= 2) {
        D(G.cyl(0.018, 0.018, 0.14, 10), [0, 0.12, 0.3], [Math.PI / 2, 0, 0]);
        for (const z of [0.25, 0.35]) D(G.box(0.012, 0.03, 0.012), [0, 0.1, z]);
        add(gem(glowCol, 0.028, [0.036, -0.06, -0.3], out));
      }
      if (rank >= 3) add(halo(glowCol, 0.16, [0, 0, 0.3], out, 0.14));
      break;
    }
    case 'glaives': {
      // Боевая глефа охотника: рукоять посередине, длинный клинок вверх и серп-крюк вниз
      grip(-0.12, 0.12, 0.034);
      const ec = rank >= 1 ? glowCol : 0x5dff8a;
      const gl: Pt[] = [[-0.03, 0.12], [0.05, 0.13], [0.1, 0.3], [0.12, 0.55], [0.1, 0.78], [0.04, 0.98], [0.02, 0.78], [0.02, 0.5], [-0.02, 0.32], [-0.12, 0.26], [-0.26, 0.12], [-0.3, -0.06], [-0.22, -0.2], [-0.2, -0.04], [-0.12, 0.08]];
      S(plate('glaive', gl, 0.03, 0.01), [0, 0.02, 0]);
      // Кромки скверны светятся по обеим сторонам
      for (const z of [-0.016, 0.016]) {
        E(tube('glaiveedge', [[0.085, 0.32, 0], [0.105, 0.57, 0], [0.085, 0.8, 0], [0.035, 0.97, 0]], 0.009, 0.004, 4, 16), ec, [0, 0.02, z], undefined, undefined, 1.1);
        E(tube('glaivehook', [[-0.12, 0.25, 0], [-0.24, 0.13, 0], [-0.28, -0.04, 0], [-0.21, -0.16, 0]], 0.009, 0.004, 4, 16), ec, [0, 0.02, z], undefined, undefined, 1.1);
      }
      D(lathe('glaivebot', [[0, -0.32], [0.03, -0.24], [0.034, -0.14]], 8), [0, 0, 0]);
      T(G.box(0.16, 0.04, 0.06), [0, 0.13, 0]);
      if (rank >= 2) add(gem(glowCol, 0.04, [0, 0.13, 0.04], out));
      if (rank >= 3) add(halo(glowCol, 0.16, [0, 0.5, 0], out, 0.14));
      break;
    }
    case 'daggers': {
      const len = 0.42 + rank * 0.04;
      grip(-0.1, 0.08, 0.032);
      pommel(-0.14, 0.045);
      // Гарда, загнутая к клинку
      T(tube('dagguard', [[-0.11, 0.16, 0], [-0.07, 0.11, 0], [0, 0.1, 0], [0.07, 0.11, 0], [0.11, 0.16, 0]], 0.016, 0.016, 6, 14), [0, 0, 0]);
      S(blade(len, 0.085, 0.026, { taper: 0.65, tip: 0.12, leaf: 0.08 }), [0, 0.12, 0]);
      fuller(0.15, len * 0.55, 0.016, 0.026);
      runes(0.18, 0.12 + len * 0.6, 2 + rank, 0.0135, 0.018);
      if (rank >= 3) add(halo(glowCol, 0.104, [0, 0.12 + len * 0.6, 0], out, 0.14));
      break;
    }
    case 'warblades': {
      grip(-0.11, 0.1, 0.036);
      pommel(-0.15, 0.05);
      T(plate('wbguard', [[-0.14, 0], [0.14, 0], [0.16, 0.04], [0.06, 0.06], [-0.06, 0.06], [-0.16, 0.04]], 0.06, 0.01), [0, 0.1, 0]);
      // Тесак-сабля: изогнутый клинок с зубцами на обухе
      S(blade(0.85 + rank * 0.05, 0.13, 0.03, { taper: 0.95, curve: 0.18, tip: 0.2, leaf: 0.12 }), [0, 0.16, 0]);
      for (let i = 0; i < 3; i++) {
        const y = 0.36 + i * 0.16;
        const x = -0.06 + 0.18 * ((y - 0.16) / 0.9) ** 2;
        S(plate('wbtooth', [[0, 0], [-0.06, 0.04], [0, 0.06]], 0.022, 0.006), [x - 0.005, y, 0]);
      }
      runes(0.3, 0.75, 2 + rank, 0.016);
      if (rank >= 2) add(gem(glowCol, 0.04, [0, 0.13, 0.04], out));
      if (rank >= 3) add(halo(glowCol, 0.16, [0.08, 0.6, 0], out, 0.14));
      break;
    }
    case 'tome': {
      const cover = [0x2a5a60, 0x2a3f7a, 0x4a2a7a, 0x8a6020, 0x5a0c14][rank];
      const rc = rank === 0 ? 0x7af0ff : glowCol;
      const book = new THREE.Group();
      const bp = (geo: THREE.BufferGeometry, col: number, pos: V3, o: { metal?: number; rough?: number; rot?: V3 } = {}) => book.add(part(geo, col, { pos, rot: o.rot, outline: false, metal: o.metal, rough: o.rough }));
      // Обложки с фаской, корешок с бинтами, блок страниц
      for (const z of [-0.06, 0.06]) bp(block(0.36, 0.46, 0.03, 0.008), cover, [0, 0, z], { rough: 0.7 });
      bp(G.box(0.33, 0.43, 0.09), 0xf0e6cc, [0.012, 0, 0], { rough: 0.9 });
      for (let i = 0; i < 6; i++) bp(G.box(0.004, 0.42, 0.088), 0xd8ccb0, [0.18, 0, 0], { rot: [0, 0, 0] });
      bp(G.cyl(0.065, 0.065, 0.46, 12), cover, [-0.18, 0, 0], { rough: 0.7 });
      for (const y of [-0.15, 0, 0.15]) bp(G.torus(0.066, 0.01, Math.PI * 2, 4, 14), trim, [-0.18, y, 0], { rot: [Math.PI / 2, 0, 0], metal: 0.9 });
      // Уголки, застёжка, тиснёный медальон
      for (const x of [-1, 1]) for (const y of [-1, 1]) bp(plate('tomecorner', [[0, 0], [0.07, 0], [0, 0.07]], 0.012, 0.003), trim, [x * 0.17 - (x > 0 ? 0 : 0), y * 0.22, 0.078], { rot: [0, 0, x > 0 ? (y > 0 ? Math.PI : Math.PI / 2) : y > 0 ? -Math.PI / 2 : 0], metal: 0.9, rough: 0.3 });
      bp(G.box(0.1, 0.06, 0.15), 0x3a2414, [0.17, 0, 0], { rough: 0.8 });
      bp(G.box(0.03, 0.07, 0.16), trim, [0.2, 0, 0], { metal: 0.9 });
      bp(G.torus(0.09, 0.012, Math.PI * 2, 6, 20), trim, [0, 0, 0.08], { metal: 0.9 });
      const rune = new THREE.Mesh(G.torus(0.06, 0.01, Math.PI * 2, 4, 16), toon(rc, { emissive: rc, emissiveIntensity: 1 }));
      rune.position.z = 0.082;
      book.add(rune);
      const eye = new THREE.Mesh(G.ico(0.035, 1), toon(rc, { emissive: rc, emissiveIntensity: 1.2 }));
      eye.position.z = 0.085;
      book.add(eye);
      out.glow.push(eye);
      book.add(halo(rc, 0.22, [0, 0, 0.1], out, rank >= 2 ? 0.3 : 0.18));
      book.position.set(0, 0.12, 0.08);
      book.rotation.set(-0.3, 0.3, 0);
      add(book);
      if (rank >= 1) {
        const orbit = new THREE.Group();
        orbit.userData.anim = true;
        for (let i = 0; i < 1 + rank; i++) {
          const a = (i / (1 + rank)) * Math.PI * 2;
          const pg = new THREE.Mesh(G.box(0.08, 0.1, 0.004), glow(rc, 0.7, false));
          pg.position.set(Math.cos(a) * 0.32, Math.sin(a * 2) * 0.05, Math.sin(a) * 0.32);
          pg.rotation.y = -a;
          orbit.add(pg);
        }
        orbit.position.set(0, 0.12, 0.08);
        out.spin.push(orbit);
        add(orbit);
      }
      break;
    }
    case 'totemstaff': {
      Wd(tube('totshaft', [[0, -0.25, 0], [0.012, 0.3, 0], [-0.01, 0.75, 0.006], [0, 1.05, 0]], 0.048, 0.04, 8, 20), [0, 0, 0]);
      grip(-0.05, 0.15, 0.05);
      const faces = [0xd9a441, 0x2ab8c8, 0xc9343a];
      // Резные лики тотема: глаза, клювы, раскраска
      for (let i = 0; i < 2; i++) {
        const y = 1.12 + i * 0.21;
        Wd(lathe(`totface${i}`, [[0.09, -0.1], [0.115, -0.07], [0.11, 0.07], [0.095, 0.1]], 10), [0, y, 0], undefined, undefined, i === 0 ? 0x8a5a2b : 0x6a4428);
        for (const x of [-0.04, 0.04]) {
          C(G.sphere(0.022, 8, 6), 0xf0e6cc, [x, y + 0.03, 0.1], undefined, [1, 0.8, 0.5]);
          C(G.sphere(0.011, 6, 4), 0x1a1210, [x, y + 0.03, 0.112]);
        }
        C(G.cone(0.025, 0.07, 4), faces[i], [0, y - 0.01, 0.12], [Math.PI / 2, 0, 0]);
        C(G.box(0.17, 0.018, 0.02), faces[(i + 1) % 3], [0, y - 0.065, 0.085], undefined, undefined, { rough: 0.6 });
      }
      // Рогатый череп на вершине
      C(headShape('skull'), 0xefe4cc, [0, 1.58, 0.02], undefined, [0.3, 0.3, 0.3], { rough: 0.6 });
      const ec = rank === 0 ? 0x7af0ff : glowCol;
      for (const x of [-0.042, 0.042]) {
        const e = E(G.sphere(0.022, 6, 4), ec, [x, 1.595, 0.12], undefined, undefined, 1.3);
        out.glow.push(e);
      }
      for (const s of [-1, 1]) C(tube(`tothorn${s}`, [[s * 0.1, 1.64, 0], [s * 0.2, 1.7, -0.02], [s * 0.25, 1.82, -0.05], [s * 0.22, 1.92, -0.04]], 0.03, 0.006, 6, 14), 0xe8dcc0, [0, 0, 0], undefined, undefined, { rough: 0.5 });
      // Перья с очином и опахалом на шнурках
      const fc = [0xe94b3c, 0xf4f0e8, 0x2ab8c8];
      for (let i = 0; i < 2 + rank; i++) {
        const a = (i / (2 + rank)) * Math.PI * 2;
        const x = Math.cos(a) * 0.13;
        const z = Math.sin(a) * 0.13;
        C(G.cyl(0.004, 0.004, 0.16, 3), 0x3a2414, [x, 0.99, z]);
        C(plate('feather', [[0, 0], [0.025, 0.04], [0.03, 0.12], [0.012, 0.2], [0, 0.22], [-0.012, 0.2], [-0.03, 0.12], [-0.025, 0.04]], 0.006, 0.002), fc[i % 3], [x, 0.7, z], [0, -a, 0.1]);
      }
      add(halo(ec, 0.192, [0, 1.58, 0], out, 0.14));
      if (rank >= 2) add(gem(glowCol, 0.045, [0, 1.12, 0.13], out));
      break;
    }
    case 'bell': {
      grip(-0.12, 0.2, 0.036);
      T(lathe('bellknob', [[0, -0.2], [0.04, -0.18], [0.05, -0.14], [0.038, -0.12]], 10), [0, 0, 0]);
      T(lathe('bellneck', [[0.036, 0.2], [0.05, 0.26], [0.03, 0.33], [0.05, 0.36]], 10), [0, 0, 0]);
      // Колокол настоящей формы: плечо, юбка, раструб с губой
      const bc = rank === 0 ? 0xc9a24a : rank >= 4 ? 0x8a2a1a : METAL[r];
      const bell = part(lathe('bellbody', [[0.0, 0.0], [0.07, 0.0], [0.09, -0.04], [0.1, -0.12], [0.13, -0.2], [0.2, -0.26], [0.21, -0.28], [0.19, -0.285], [0.17, -0.25]], 24), bc, { pos: [0, 0.66, 0], outline: false, metal: 0.9, rough: 0.3, side: THREE.DoubleSide });
      add(bell);
      for (const y of [0.56, 0.47]) T(G.torus(y > 0.5 ? 0.105 : 0.15, 0.008, Math.PI * 2, 4, 20), [0, y, 0], [Math.PI / 2, 0, 0]);
      const tc = rank === 0 ? 0x7af0ff : glowCol;
      const tongue = E(G.sphere(0.045, 10, 8), tc, [0, 0.42, 0], undefined, undefined, 1.2);
      out.glow.push(tongue);
      C(G.cyl(0.006, 0.006, 0.2, 3), 0x3a2a1a, [0, 0.53, 0]);
      for (const s of [-1, 1]) C(plate('ribbon', [[0, 0], [0.035, 0], [0.04, -0.3], [0.02, -0.26], [0, -0.32]], 0.004, 0.001), s < 0 ? 0xe94b3c : 0x2ab8c8, [s * 0.05, 0.36, 0.04], [0, 0, s * 0.2]);
      add(halo(tc, 0.192, [0, 0.5, 0], out, 0.14));
      if (rank >= 2) add(gem(glowCol, 0.035, [0, 0.58, 0.11], out));
      break;
    }
    case 'claws': {
      // Наруч на ремнях с заклёпками и три изогнутых когтя вдоль пальцев
      L(lathe('clawbrace', [[0.1, -0.16], [0.11, -0.12], [0.115, -0.02], [0.105, 0.02]], 14), [0, 0, 0]);
      for (const y of [-0.12, -0.05]) T(G.torus(0.113, 0.01, Math.PI * 2, 4, 16), [0, y, 0], [Math.PI / 2, 0, 0]);
      D(plate('clawknuck', [[-0.1, 0], [0.1, 0], [0.11, 0.05], [0.06, 0.08], [-0.06, 0.08], [-0.11, 0.05]], 0.06, 0.012), [0, 0.02, 0.05]);
      for (let i = -1; i <= 1; i++) {
        const len = 0.34 + rank * 0.04 - Math.abs(i) * 0.05;
        const cc = rank >= 2 ? steelCol : 0xe8e0d0;
        add(part(tube(`claw|${len}`, [[0, 0, 0], [0, len * 0.5, len * 0.08], [0, len * 0.85, len * 0.28], [0, len, len * 0.45]], 0.03, 0.004, 6, 16, 0.55), cc, { pos: [i * 0.065, 0.08, 0.06], rot: [0.1, 0, -i * 0.15], outline: false, metal: rank >= 2 ? 0.9 : 0, rough: rank >= 2 ? 0.25 : 0.45 }));
      }
      if (rank >= 2) add(gem(glowCol, 0.035, [0, 0.05, 0.1], out));
      if (rank >= 3) add(halo(glowCol, 0.144, [0, 0.25, 0.08], out, 0.14));
      break;
    }
    case 'knuckles': {
      // Кастет с отверстиями под пальцы и вбитыми клыками
      const holes: Pt[][] = [];
      for (let i = 0; i < 4; i++) {
        const cx = (i - 1.5) * 0.052;
        const h: Pt[] = [];
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2;
          h.push([cx + Math.cos(a) * 0.019, 0.035 + Math.sin(a) * 0.019]);
        }
        holes.push(h);
      }
      T(plate('knuck', [[-0.12, 0.0], [0.12, 0.0], [0.125, 0.07], [0.09, 0.085], [-0.09, 0.085], [-0.125, 0.07]], 0.05, 0.01, holes), [0, 0, 0.03]);
      T(plate('knuckgrip', [[-0.08, -0.08], [0.08, -0.08], [0.1, 0], [-0.1, 0]], 0.04, 0.01), [0, 0, 0.0]);
      for (let i = 0; i < 4; i++) C(tube(`fang${i % 2}`, [[0, 0, 0], [0, 0.07 + (i % 2) * 0.03, 0.01], [0, 0.13 + (i % 2) * 0.04, 0.04]], 0.022, 0.003, 6, 10), 0xf4ecd8, [(i - 1.5) * 0.052, 0.08, 0.04], undefined, undefined, { rough: 0.4 });
      L(G.cyl(0.1, 0.1, 0.12, 12), [0, -0.12, 0]);
      if (rank >= 2) add(gem(glowCol, 0.035, [0, 0.04, 0.065], out));
      if (rank >= 3) add(halo(glowCol, 0.128, [0, 0.16, 0.04], out, 0.14));
      break;
    }
    case 'sickles': {
      grip(-0.11, 0.1, 0.03);
      D(lathe('sickfer', [[0.032, 0.1], [0.04, 0.13], [0.034, 0.17]], 10), [0, 0, 0]);
      // Серп-полумесяц: профиль с внутренней заточкой
      const sk: Pt[] = [];
      for (let i = 0; i <= 12; i++) {
        const a = -0.2 + (i / 12) * Math.PI * 1.05;
        sk.push([0.13 + Math.cos(a) * 0.22, 0.16 + Math.sin(a) * 0.26]);
      }
      for (let i = 12; i >= 0; i--) {
        const a = -0.2 + (i / 12) * Math.PI * 1.05;
        const rr = 0.17 - 0.05 * Math.sin((i / 12) * Math.PI);
        sk.push([0.13 + Math.cos(a) * rr, 0.16 + Math.sin(a) * (rr + 0.04)]);
      }
      S(plate('sickle', sk, 0.024, 0.008), [0, 0, 0]);
      if (rank >= 1) for (const z of [-0.012, 0.012]) E(tube('sickedge', sk.slice(14, 25).map(([x, y]) => [x, y, 0] as [number, number, number]), 0.006, 0.006, 4, 20), rank >= 2 ? glowCol : 0xffffff, [0, 0, z], undefined, undefined, rank >= 2 ? 1.1 : 0.3);
      if (rank >= 3) add(halo(glowCol, 0.16, [0.12, 0.32, 0], out, 0.14));
      break;
    }
    case 'blunderbuss':
    case 'handcannon':
    case 'runerifle': {
      // Огнестрел гнома: приклад назад (-y), ствол вперёд (+y)
      const cannon = tpl === 'handcannon';
      const rifle = tpl === 'runerifle';
      const len = rifle ? 0.95 : cannon ? 0.55 : 0.75;
      const brass = rank >= 2 ? GOLD : 0xc8a24a;
      const B = (geo: THREE.BufferGeometry, pos: V3, rot?: V3) => C(geo, brass, pos, rot, undefined, { metal: 0.95, rough: 0.3 });
      // Ложа и приклад: профиль с фаской
      const stock: Pt[] = [[-0.05, -0.42], [0.06, -0.4], [0.05, -0.05], [0.035, len * 0.7], [-0.03, len * 0.7], [-0.04, 0.0], [-0.09, -0.2], [-0.1, -0.38]];
      Wd(plate(`gunstock|${len}`, stock, 0.085, 0.014), [0, 0, -0.03], [0, -Math.PI / 2, 0]);
      B(block(0.09, 0.03, 0.12, 0.006), [0, -0.41, -0.04]);
      // Ствол: токарный профиль с утолщениями и дулом
      const br = cannon ? 0.085 : 0.048;
      const prof: Pt[] = rifle
        ? [[br * 1.25, 0], [br * 1.1, 0.06], [br, len * 0.5], [br * 0.95, len - 0.04], [br * 1.15, len - 0.02], [br * 1.1, len], [br * 0.55, len]]
        : cannon
          ? [[br * 1.3, 0], [br * 1.35, 0.08], [br * 1.1, 0.12], [br, len * 0.6], [br * 1.05, len - 0.08], [br * 1.35, len - 0.04], [br * 1.3, len], [br * 0.7, len]]
          : [[br * 1.2, 0], [br, 0.08], [br * 0.95, len * 0.6], [br * 1.3, len * 0.85], [br * 2.2, len], [br * 1.8, len], [br * 1.1, len * 0.9]];
      const barrel = part(lathe(`barrel|${tpl}`, prof, rifle ? 8 : 18), rank >= 1 ? steelCol : 0x6a6e76, { pos: [0, 0.02, 0.05], outline: false, metal: 0.9, rough: 0.35, side: THREE.DoubleSide });
      add(barrel);
      for (const f of rifle ? [0.25, 0.5, 0.75] : [0.3, 0.6]) B(G.torus(br * 1.08, 0.012, Math.PI * 2, 4, 16), [0, 0.02 + len * f, 0.05], [Math.PI / 2, 0, 0]);
      // Замок: курок, полка, спусковая скоба, шомпол
      D(block(0.03, 0.12, 0.07, 0.005), [0.045, 0.02, 0.01]);
      D(plate('hammer', [[0, 0], [0.02, 0], [0.03, 0.06], [0.05, 0.08], [0.03, 0.09], [0.005, 0.05]], 0.015, 0.004), [0.05, -0.02, 0.05], [0, Math.PI / 2, 0]);
      D(G.torus(0.035, 0.008, Math.PI * 1.3, 4, 12), [0, -0.06, -0.075], [0, Math.PI / 2, Math.PI * 0.85]);
      D(G.box(0.01, 0.05, 0.012), [0, -0.05, -0.06], [0.3, 0, 0]);
      C(G.cyl(0.008, 0.008, len * 0.8, 5), 0x8a6a4a, [0, len * 0.4, -0.01]);
      if (rifle) {
        for (let i = 0; i < 3; i++) {
          const rc = rank === 0 ? 0x7ae0ff : glowCol;
          const rr = E(G.box(0.05, 0.025, 0.012), rc, [0, len * (0.3 + i * 0.2), 0.05 + br + 0.005], undefined, undefined, 1);
          out.glow.push(rr);
        }
        D(G.cyl(0.022, 0.022, 0.2, 10), [0, len * 0.35, 0.05 + br + 0.03]);
        B(G.cyl(0.024, 0.024, 0.02, 10), [0, len * 0.35 + 0.1, 0.05 + br + 0.03]);
      }
      if (cannon) B(G.sphere(0.06, 10, 8), [0, -0.02, 0.05]);
      if (rank >= 2) add(gem(glowCol, 0.035, [0.05, -0.15, -0.03], out));
      if (rank >= 3) add(halo(glowCol, 0.16, [0, len * 0.9, 0.05], out, 0.14));
      break;
    }
  }
  // Метка кончика оружия — откуда сыплются искры
  const box = new THREE.Box3().setFromObject(w);
  const tip = new THREE.Object3D();
  tip.position.set((box.min.x + box.max.x) / 2, box.max.y * 0.92, (box.min.z + box.max.z) / 2);
  w.add(tip);
  w.userData.tip = tip;
  return w;
}
