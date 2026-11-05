import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DETAIL, seg } from './detail';
import { Rng } from '@game/shared';

/**
 * Заготовки мелких деталей для персонажей: складки ткани, плащи, пряди и клочки шерсти, швы.
 * Всё — обычная геометрия: при склейке моделей (bake.ts) детали сливаются в меш группы, поэтому
 * число отрисовок не растёт, только треугольники. Детали включаются на «высоком» и «ультра».
 */

const cache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  key = `${DETAIL.level}|${key}`;
  let g = cache.get(key);
  if (!g) cache.set(key, (g = make()));
  return g;
}

/** Нужны ли мелкие детали (на «низком» — нет: слабые телефоны). */
export const fine = () => DETAIL.level >= 2;
/** Самые мелкие детали — только «ультра». */
export const finest = () => DETAIL.level >= 3;

/**
 * Юбка или мантия со складками: усечённый конус, по окружности — волны, к подолу глубже,
 * подол неровный. y=0 — середина по высоте (как у CylinderGeometry).
 */
export function foldedSkirt(rTop: number, rBot: number, h: number, folds = 10, amp = 0.03): THREE.BufferGeometry {
  return cached(`skirt|${rTop}|${rBot}|${h}|${folds}|${amp}`, () => {
    const radial = Math.max(folds * 4, seg(24));
    const g = new THREE.CylinderGeometry(rTop, rBot, h, radial, 6, true);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const t = 0.5 - y / h; // 0 — верх, 1 — подол
      const a = Math.atan2(x, z);
      const r = Math.hypot(x, z);
      const wave = Math.sin(a * folds) * 0.7 + Math.sin(a * folds * 2.3 + 1.3) * 0.3;
      const nr = r + wave * amp * t * t;
      p.setXYZ(i, (x / r) * nr, y - (wave * 0.5 + 0.5) * amp * 0.8 * t * t * t, (z / r) * nr);
    }
    g.computeVertexNormals();
    // Двусторонность без DoubleSide (склейка её не поддерживает): внутренняя сторона — копия с обратными гранями
    return withBackFaces(g, 0.006);
  });
}

/**
 * Плащ: лист, повторяющий спину (края загибаются вперёд), со складками, расширяется к низу.
 * Начало координат — середина верхнего края; лист висит вниз (−y), спиной к −z.
 * v0..v1 — какую часть по высоте строить (для каймы по низу).
 */
export function cape(w: number, h: number, o: { wrap?: number; folds?: number; amp?: number; flare?: number; v0?: number; v1?: number; lift?: number } = {}): THREE.BufferGeometry {
  const { wrap = 0.12, folds = 5, amp = 0.035, flare = 0.25, v0 = 0, v1 = 1, lift = 0.1 } = o;
  return cached(`cape|${w}|${h}|${wrap}|${folds}|${amp}|${flare}|${v0}|${v1}|${lift}`, () => {
    const nx = Math.max(folds * 4, seg(16));
    const ny = Math.max(2, Math.round(seg(8) * (v1 - v0)));
    const g = new THREE.PlaneGeometry(1, 1, nx, ny);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i); // −0.5..0.5
      const v = v0 + (0.5 - p.getY(i)) * (v1 - v0); // 0 — верх, 1 — низ
      const x = u * w * (1 + flare * v);
      const fold = Math.sin(u * Math.PI * 2 * folds) * amp * (0.2 + 0.8 * v);
      // Края загибаются к телу, низ слегка отходит назад (плащ не прилипает к ногам)
      const z = -(wrap * (1 - 4 * u * u)) - fold - lift * v * v;
      p.setXYZ(i, x, -v * h - Math.abs(Math.sin(u * Math.PI * 2 * folds)) * amp * 0.6 * v * v, z);
    }
    g.computeVertexNormals();
    // Лицевая сторона смотрит наружу (назад, −z) — переворачиваем, затем добавляем изнанку
    flip(g);
    return withBackFaces(g, 0.012);
  });
}

/**
 * Пучок прядей (борода, волосы, шерсть, перья): узкие конусы из одной точки, расходятся веером вниз (−y).
 * spread — разброс по ширине, fan — наклон крайних прядей.
 */
export function strands(key: string, n: number, len: number, r: number, spread: number, o: { fan?: number; depth?: number; curl?: number; jitter?: number } = {}): THREE.BufferGeometry {
  const { fan = 0.35, depth = 0.4, curl = 0.25, jitter = 0.25 } = o;
  return cached(`str|${key}|${n}|${len}|${r}|${spread}|${fan}|${depth}|${curl}`, () => {
    const rng = new Rng(key.length * 131 + n * 7);
    const parts: THREE.BufferGeometry[] = [];
    const count = Math.max(3, Math.round(n * (DETAIL.level >= 3 ? 1 : 0.65)));
    for (let i = 0; i < count; i++) {
      const u = count === 1 ? 0 : i / (count - 1) - 0.5;
      const l = len * (1 - Math.abs(u) * 0.5) * rng.range(1 - jitter, 1 + jitter * 0.4);
      const c = lock(r * rng.range(0.8, 1.15), l);
      // Лёгкий изгиб: кончики уходят вперёд
      const pp = c.attributes.position;
      for (let k = 0; k < pp.count; k++) {
        const y = pp.getY(k);
        const t = Math.min(1, Math.max(0, -y / l));
        pp.setZ(k, pp.getZ(k) + curl * l * t * t);
      }
      c.rotateZ(u * fan * 2 + rng.range(-0.08, 0.08));
      c.rotateX(rng.range(-0.15, 0.15));
      c.translate(u * spread, rng.range(-0.02, 0.02), (1 - Math.abs(u) * 2) * depth * r * 2 + rng.range(-r, r));
      parts.push(c.index ? c.toNonIndexed() : c);
    }
    return mergeGeometries(parts) ?? new THREE.BufferGeometry();
  });
}

/**
 * Клочки шерсти по поверхности сферы-основы: короткие конусы, торчащие наружу и чуть вниз.
 * Используется для меха (плечи оборотня, накидки, тролль). Возвращает одну геометрию.
 */
export function furPatch(key: string, n: number, radius: number, len: number, r: number, o: { arc?: number; down?: number; yMin?: number; yMax?: number } = {}): THREE.BufferGeometry {
  const { arc = Math.PI * 2, down = 0.6, yMin = -0.3, yMax = 0.8 } = o;
  return cached(`fur|${key}|${n}|${radius}|${len}|${r}|${arc}|${down}|${yMin}|${yMax}`, () => {
    const rng = new Rng(key.length * 977 + n);
    const parts: THREE.BufferGeometry[] = [];
    const count = Math.max(4, Math.round(n * (DETAIL.level >= 3 ? 1 : 0.6)));
    for (let i = 0; i < count; i++) {
      const a = -arc / 2 + rng.next() * arc;
      const yy = rng.range(yMin, yMax);
      const rr = Math.sqrt(Math.max(0, 1 - yy * yy));
      const dir = new THREE.Vector3(Math.sin(a) * rr, yy, Math.cos(a) * rr).normalize();
      const l = len * rng.range(0.6, 1.2);
      const c = lock(r * rng.range(0.8, 1.2), l);
      c.rotateX(Math.PI);
      c.translate(0, -l * 0.15, 0);
      // Направление: наружу и вниз (шерсть лежит)
      const out = dir.clone().add(new THREE.Vector3(0, -down, 0)).normalize();
      c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), out));
      c.translate(dir.x * radius, dir.y * radius, dir.z * radius);
      parts.push(c.index ? c.toNonIndexed() : c);
    }
    return mergeGeometries(parts) ?? new THREE.BufferGeometry();
  });
}

/**
 * Локон: гладкая вытянутая капля от y=0 вниз до y=−len, толстая у корня, заострённая к кончику,
 * сплющенная спереди назад. Стилизованные пряди без «осколков».
 */
function lock(r: number, len: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, seg(7), seg(7));
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = (1 - y) / 2; // 0 — корень, 1 — кончик
    const k = t < 0.25 ? 0.55 + t * 1.8 : 1 - (t - 0.25) * 1.15;
    p.setXYZ(i, x * r * 1.3 * Math.max(0.08, k), -t * len, z * r * 0.8 * Math.max(0.08, k));
  }
  g.computeVertexNormals();
  return g.toNonIndexed();
}

/** Коса: цепочка сплюснутых сфер, сужается к концу. */
export function braid(len: number, r: number, links = 7): THREE.BufferGeometry {
  return cached(`braid|${len}|${r}|${links}`, () => {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < links; i++) {
      const k = 1 - (i / links) * 0.45;
      const s = new THREE.SphereGeometry(r * k, seg(6), seg(5));
      s.scale(1, 1.35, 0.85);
      s.rotateZ((i % 2 ? 1 : -1) * 0.35);
      s.translate((i % 2 ? 1 : -1) * r * 0.18, -i * (len / links), 0);
      parts.push(s.toNonIndexed());
    }
    return mergeGeometries(parts) ?? new THREE.BufferGeometry();
  });
}

/** Ряд стежков по окружности (шов на ремне, манжете, подоле): маленькие вытянутые коробочки. */
export function stitchRing(r: number, n: number, len = 0.018, w = 0.005): THREE.BufferGeometry {
  return cached(`stitch|${r}|${n}|${len}|${w}`, () => {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const b = new THREE.BoxGeometry(len, w, w);
      b.rotateY(-a + Math.PI / 2);
      b.translate(Math.sin(a) * r, 0, Math.cos(a) * r);
      parts.push(b);
    }
    return mergeGeometries(parts) ?? new THREE.BufferGeometry();
  });
}

/** Кольцо заклёпок (полусферы) по окружности, смотрят наружу. */
export function rivetRing(r: number, n: number, size = 0.016, arc = Math.PI * 2, a0 = 0): THREE.BufferGeometry {
  return cached(`rivets|${r}|${n}|${size}|${arc}|${a0}`, () => {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < n; i++) {
      const a = a0 + (arc >= Math.PI * 2 - 0.01 ? (i / n) * arc : (i / Math.max(1, n - 1) - 0.5) * arc);
      const s = new THREE.SphereGeometry(size, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2);
      s.rotateX(Math.PI / 2);
      s.rotateY(a);
      s.translate(Math.sin(a) * r, 0, Math.cos(a) * r);
      parts.push(s.toNonIndexed());
    }
    return mergeGeometries(parts) ?? new THREE.BufferGeometry();
  });
}

/** Грудная клетка скелета: изогнутые рёбра (торы), грудина и позвоночник. */
export function ribcage(w: number, h: number, ribs = 5): THREE.BufferGeometry {
  return cached(`ribs|${w}|${h}|${ribs}`, () => {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < ribs; i++) {
      const k = 1 - Math.abs(i - ribs * 0.35) / ribs;
      const t = new THREE.TorusGeometry(w * (0.75 + 0.3 * k), w * 0.07, 4, seg(14), Math.PI * 1.55);
      t.rotateX(Math.PI / 2);
      t.rotateY(Math.PI / 2 - Math.PI * 0.775 + Math.PI);
      t.scale(1, 1, 0.8);
      t.rotateX(0.25);
      t.translate(0, h * 0.5 - (i / (ribs - 1)) * h, 0);
      parts.push(t.toNonIndexed());
    }
    const st = new THREE.BoxGeometry(w * 0.16, h * 0.9, w * 0.1);
    st.translate(0, 0, w * 0.82);
    parts.push(st.toNonIndexed());
    for (let i = 0; i < ribs + 2; i++) {
      const v = new THREE.CylinderGeometry(w * 0.1, w * 0.12, h / (ribs + 2) * 0.7, 6);
      v.translate(0, h * 0.6 - i * (h * 1.2) / (ribs + 2), -w * 0.75);
      parts.push(v.toNonIndexed());
    }
    return mergeGeometries(parts) ?? new THREE.BufferGeometry();
  });
}

/** Добавить изнанку (копия с обратным порядком вершин, чуть сдвинутая против нормалей). */
function withBackFaces(g: THREE.BufferGeometry, off: number): THREE.BufferGeometry {
  const a = g.index ? g.toNonIndexed() : g;
  const b = a.clone();
  const p = b.attributes.position, n = b.attributes.normal;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) - n.getX(i) * off, p.getY(i) - n.getY(i) * off, p.getZ(i) - n.getZ(i) * off);
  flip(b);
  const m = mergeGeometries([a, b]) ?? a;
  return m;
}

/** Перевернуть грани (и нормали) неиндексированной или индексированной геометрии. */
function flip(g: THREE.BufferGeometry) {
  if (g.index) {
    const idx = g.index.array as Uint16Array | Uint32Array;
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
    g.index.needsUpdate = true;
  } else {
    for (const name of Object.keys(g.attributes)) {
      const at = g.attributes[name] as THREE.BufferAttribute;
      const sz = at.itemSize;
      const arr = at.array as Float32Array;
      for (let i = 0; i < at.count; i += 3) {
        for (let c = 0; c < sz; c++) {
          const t = arr[(i + 1) * sz + c];
          arr[(i + 1) * sz + c] = arr[(i + 2) * sz + c];
          arr[(i + 2) * sz + c] = t;
        }
      }
      at.needsUpdate = true;
    }
  }
  const n = g.attributes.normal;
  if (n) for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
}
