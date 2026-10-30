import * as THREE from 'three';

/**
 * «Кузница»: заготовки для детализированного оружия и доспехов — клинки и
 * лезвия из выдавленных профилей с фаской (заточенная кромка ловит свет),
 * сужающиеся трубки по кривой (луки, когти, рога, обмотки), токарные профили.
 * Геометрии кэшируются: одинаковые детали у разных героев не дублируются.
 */

const cache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = cache.get(key);
  if (!g) cache.set(key, (g = make()));
  return g;
}

export type Pt = [number, number];

/**
 * Плоская деталь по контуру (в плоскости XY) толщиной thick с фаской bevel по краю —
 * лезвия, гарды, накладки. Центр по толщине — z = 0.
 */
export function plate(key: string, pts: Pt[], thick: number, bevel: number, holes: Pt[][] = []): THREE.BufferGeometry {
  return cached(`plate|${key}|${thick}|${bevel}`, () => {
    const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
    const depth = Math.max(0.002, thick - bevel * 2);
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10 });
    g.translate(0, 0, -depth / 2);
    g.computeVertexNormals();
    return g;
  });
}

/**
 * Клинок: от основания (y = 0) до острия (y = len). width — ширина у основания,
 * taper — доля ширины у острия перед сходом, leaf — «листовидное» расширение,
 * curve — изгиб обуха (сабля), tip — длина острия.
 * Фаска шире толщины — получается ромбическое сечение с острыми кромками.
 */
export function blade(len: number, width: number, thick: number, o: { taper?: number; leaf?: number; curve?: number; tip?: number } = {}): THREE.BufferGeometry {
  const taper = o.taper ?? 0.75;
  const leaf = o.leaf ?? 0;
  const curve = o.curve ?? 0;
  const tip = o.tip ?? width * 1.4;
  const n = 10;
  const right: Pt[] = [];
  const left: Pt[] = [];
  const body = len - tip;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const y = t * body;
    const hw = (width / 2) * (1 - (1 - taper) * t) * (1 + leaf * Math.sin(t * Math.PI));
    const cx = curve * Math.pow(y / len, 2);
    right.push([cx + hw, y]);
    left.push([cx - hw, y]);
  }
  const tipX = curve;
  const pts: Pt[] = [...right, [tipX + (right[n][0] - tipX) * 0.4, body + tip * 0.55], [tipX, len], [tipX + (left[n][0] - tipX) * 0.4, body + tip * 0.55], ...left.reverse()];
  // Чуть сдвигаем острие к обуху у изогнутых клинков
  return plate(`blade|${len}|${width}|${taper}|${leaf}|${curve}|${tip}`, pts, thick, Math.min(thick * 0.45, width * 0.18));
}

/** Сужающаяся трубка по гладкой кривой: луки, когти, рога, ветви, шнуры. */
export function tube(key: string, points: [number, number, number][], r0: number, r1: number, radial = 8, segs = 24, flat = 1): THREE.BufferGeometry {
  return cached(`tube|${key}|${r0}|${r1}|${radial}|${segs}|${flat}`, () => {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    const frames = curve.computeFrenetFrames(segs, false);
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const c = curve.getPointAt(t);
      const r = r0 + (r1 - r0) * t;
      const N = frames.normals[i];
      const B = frames.binormals[i];
      for (let j = 0; j <= radial; j++) {
        const a = (j / radial) * Math.PI * 2;
        const cx = Math.cos(a) * r;
        const cy = Math.sin(a) * r * flat;
        pos.push(c.x + N.x * cx + B.x * cy, c.y + N.y * cx + B.y * cy, c.z + N.z * cx + B.z * cy);
      }
    }
    for (let i = 0; i < segs; i++) {
      for (let j = 0; j < radial; j++) {
        const a = i * (radial + 1) + j;
        const b = a + radial + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  });
}

/** Спиральная обмотка вокруг оси y: рукояти, древки. */
export function wrap(r: number, y0: number, y1: number, turns: number, thick = 0.011): THREE.BufferGeometry {
  return cached(`wrap|${r}|${y0}|${y1}|${turns}|${thick}`, () => {
    const pts: [number, number, number][] = [];
    const n = Math.max(8, Math.round(turns * 10));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const a = t * turns * Math.PI * 2;
      pts.push([Math.cos(a) * r, y0 + (y1 - y0) * t, Math.sin(a) * r]);
    }
    return tube(`wrapc|${r}|${y0}|${y1}|${turns}`, pts, thick, thick, 5, n * 2);
  });
}

/** Тело вращения по профилю [радиус, высота]. */
export function lathe(key: string, prof: Pt[], seg = 16): THREE.BufferGeometry {
  return cached(`lathe|${key}|${seg}`, () => {
    const g = new THREE.LatheGeometry(
      prof.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y)),
      seg,
    );
    g.computeVertexNormals();
    return g;
  });
}

/** Скруглённый брусок (блок молота, накладки) с фаской. */
export function block(w: number, h: number, d: number, bevel: number): THREE.BufferGeometry {
  const hw = w / 2 - bevel;
  const hh = h / 2 - bevel;
  return plate(`block|${w}|${h}`, [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]], d, bevel);
}
