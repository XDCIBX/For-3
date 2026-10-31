import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { addOutline, toon } from './toon';

/**
 * «Запекание» моделей: детали внутри каждой анимируемой группы (рука, нога,
 * голова…) склеиваются в один меш с цветами в вершинах. Вместо десятков
 * отрисовок на персонажа остаётся по 2–3 на группу, а анимация групп
 * сохраняется. Оригинальные детали прячутся и возвращаются при unbake().
 */

const geoCache = new Map<string, THREE.BufferGeometry>();
/**
 * Сколько мешей пользуется склеенной геометрией. Без пользователей она освобождается
 * (с задержкой до конца текущей задачи — при смене экипировки неизменные части
 * сразу же берутся снова и не пересобираются). Без этого каждая покупка в лавке
 * оставляла в видеопамяти новые склейки, и к 25-й волне их набирались тысячи.
 */
const refs = new Map<THREE.BufferGeometry, number>();
const keyOf = new Map<THREE.BufferGeometry, string>();
const pending = new Set<THREE.BufferGeometry>();
let flushQueued = false;

function acquire(g: THREE.BufferGeometry): THREE.BufferGeometry {
  refs.set(g, (refs.get(g) ?? 0) + 1);
  return g;
}

function release(g: THREE.BufferGeometry) {
  const n = (refs.get(g) ?? 0) - 1;
  refs.set(g, Math.max(0, n));
  if (n > 0) return;
  pending.add(g);
  if (!flushQueued) {
    flushQueued = true;
    setTimeout(flush, 0);
  }
}

function flush() {
  flushQueued = false;
  for (const g of pending) {
    if ((refs.get(g) ?? 0) > 0) continue;
    const k = keyOf.get(g);
    if (k !== undefined && geoCache.get(k) === g) geoCache.delete(k);
    refs.delete(g);
    keyOf.delete(g);
    g.dispose();
  }
  pending.clear();
}

/** Освободить склейки внутри объекта (модель героя снята, сцена больше не нужна). */
export function releaseBaked(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    // Контур делит геометрию со своим мешем — считаем её один раз
    if (m.isMesh && m.userData.baked && m.name !== 'outline' && refs.has(m.geometry)) release(m.geometry);
  });
}
const tmp = new THREE.Matrix4();
const tmpColor = new THREE.Color();

interface Part {
  mesh: THREE.Mesh;
  matrix: THREE.Matrix4;
  outline: number;
}

function canBake(m: THREE.Mesh): boolean {
  const mat = m.material as THREE.MeshStandardMaterial;
  if (Array.isArray(mat) || !mat || !(mat as THREE.Material & { isMeshStandardMaterial?: boolean }).isMeshStandardMaterial) return false;
  if (mat.transparent || mat.vertexColors || mat.emissive.getHex() !== 0) return false;
  if (m.userData.noBake || m.name === 'outline' || !m.visible) return false;
  return !!m.geometry.attributes.normal;
}

/** Нельзя прятать меш, если внутри него есть детали, которые не склеиваются (они бы исчезли вместе с ним). */
function safeToHide(m: THREE.Mesh): boolean {
  let ok = true;
  m.traverse((c) => {
    if (c === m || c.name === 'outline') return;
    if (!(c as THREE.Mesh).isMesh || !canBake(c as THREE.Mesh)) ok = false;
  });
  return ok;
}

function outlineOf(m: THREE.Mesh): number {
  const o = m.children.find((c) => c.name === 'outline') as THREE.Mesh | undefined;
  return o ? ((o.material as THREE.ShaderMaterial).uniforms.thickness.value as number) : 0;
}

/** Детали группы, включая неподвижные подгруппы; группы с userData.anim запекаются отдельно. */
function collect(group: THREE.Object3D, out: Part[], groups: THREE.Object3D[]) {
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const walk = (o: THREE.Object3D) => {
    for (const c of o.children) {
      if (c.userData.baked) continue;
      const m = c as THREE.Mesh;
      if (m.isMesh) {
        if (canBake(m) && safeToHide(m)) out.push({ mesh: m, matrix: tmp.multiplyMatrices(inv, m.matrixWorld).clone(), outline: outlineOf(m) });
        walk(m);
      } else if (!(c as THREE.Sprite).isSprite && !(c as THREE.Points).isPoints) {
        // Анимируемые группы запекаются отдельно, неподвижные — вклеиваются в текущую
        if (c.userData.anim) groups.push(c);
        else walk(c);
      }
    }
  };
  walk(group);
}

function buildGeometry(parts: Part[], withUv: boolean): THREE.BufferGeometry {
  const key = parts
    .map((p) => {
      const mt = p.mesh.material as THREE.MeshStandardMaterial;
      return `${p.mesh.geometry.uuid}:${mt.color.getHexString()}:${mt.roughness}:${mt.metalness}:${p.matrix.elements.map((e) => e.toFixed(3)).join(',')}`;
    })
    .join('|') + (withUv ? 'uv' : '');
  let g = geoCache.get(key);
  if (g) return acquire(g);
  const geos = parts.map((p) => {
    const src = p.mesh.geometry;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', src.attributes.position.clone());
    geo.setAttribute('normal', src.attributes.normal.clone());
    if (withUv && src.attributes.uv) geo.setAttribute('uv', src.attributes.uv.clone());
    else if (withUv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(src.attributes.position.count * 2), 2));
    if (src.index) geo.setIndex(src.index.clone());
    geo.applyMatrix4(p.matrix);
    tmpColor.copy((p.mesh.material as THREE.MeshStandardMaterial).color);
    const n = geo.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([tmpColor.r, tmpColor.g, tmpColor.b], i * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    // Шероховатость и металличность детали — в вершины (см. pbrAttr в toon.ts)
    const mt = p.mesh.material as THREE.MeshStandardMaterial;
    const pbr = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) pbr.set([mt.roughness, mt.metalness], i * 2);
    geo.setAttribute('pbr', new THREE.BufferAttribute(pbr, 2));
    return geo;
  });
  // Индексированные и неиндексированные геометрии не смешиваются — приводим к одному виду
  const anyIndexed = geos.some((x) => x.index);
  const anyPlain = geos.some((x) => !x.index);
  const uniform = anyIndexed && anyPlain ? geos.map((x) => (x.index ? x.toNonIndexed() : x)) : geos;
  g = mergeGeometries(uniform) ?? new THREE.BufferGeometry();
  g.computeBoundingSphere();
  geoCache.set(key, g);
  keyOf.set(g, key);
  return acquire(g);
}

function bakeGroup(group: THREE.Object3D) {
  const parts: Part[] = [];
  const nested: THREE.Object3D[] = [];
  collect(group, parts, nested);
  if (parts.length >= 2) {
    // Корзины: (текстура) × (с контуром / без)
    const buckets = new Map<string, Part[]>();
    for (const p of parts) {
      const map = (p.mesh.material as THREE.MeshStandardMaterial).map;
      const key = `${map?.uuid ?? '-'}|${p.outline > 0}`;
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = []));
      b.push(p);
    }
    for (const b of buckets.values()) {
      const map = (b[0].mesh.material as THREE.MeshStandardMaterial).map ?? undefined;
      const merged = new THREE.Mesh(buildGeometry(b, !!map), toon(0xffffff, { vertexColors: true, map, pbrAttr: true }));
      merged.userData.baked = true;
      merged.raycast = () => {};
      const ol = b.reduce((s, p) => s + p.outline, 0) / b.length;
      if (ol > 0) {
        addOutline(merged, Math.round(ol * 1000) / 1000);
        merged.children[0].userData.baked = true;
      }
      group.add(merged);
      for (const p of b) {
        p.mesh.visible = false;
        p.mesh.userData.hiddenByBake = true;
      }
    }
  }
  for (const n of nested) bakeGroup(n);
}

/** Склеить детали модели. Вызывать после того, как модель полностью собрана. */
export function bake(root: THREE.Object3D) {
  root.updateWorldMatrix(true, true);
  bakeGroup(root);
}

/** Вернуть исходные детали (перед изменением экипировки). */
export function unbake(root: THREE.Object3D) {
  const remove: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (o.userData.baked && !o.parent?.userData.baked) remove.push(o);
    if (o.userData.hiddenByBake) {
      o.visible = true;
      o.userData.hiddenByBake = false;
    }
  });
  for (const o of remove) {
    releaseBaked(o);
    o.removeFromParent();
  }
}

/**
 * Склейка неподвижных декораций сцены по участкам (chunk × chunk):
 * сотни мелких деталей превращаются в несколько мешей на участок,
 * а участки вне экрана по-прежнему отсекаются камерой.
 */
export function bakeStatic(root: THREE.Object3D, chunk = 12) {
  root.updateWorldMatrix(true, true);
  const groups = new Map<string, Part[]>();
  const pos = new THREE.Vector3();
  const victims: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || m.userData.baked) return;
    if (!canBake(m) || !safeToHide(m)) return;
    // Пропускаем скрытое и всё, что анимируется (помечено userData.dynamic)
    for (let q: THREE.Object3D | null = m; q; q = q.parent) if (!q.visible || q.userData.dynamic) return;
    m.getWorldPosition(pos);
    const cx = Math.floor(pos.x / chunk);
    const cz = Math.floor(pos.z / chunk);
    const map = (m.material as THREE.MeshStandardMaterial).map;
    const ol = outlineOf(m);
    const key = `${cx},${cz}|${map?.uuid ?? '-'}|${ol > 0}|${m.castShadow}|${m.receiveShadow}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = []));
    g.push({ mesh: m, matrix: m.matrixWorld.clone(), outline: ol });
    victims.push(m);
  });
  for (const parts of groups.values()) {
    if (parts.length < 2) continue;
    const map = (parts[0].mesh.material as THREE.MeshStandardMaterial).map ?? undefined;
    const merged = new THREE.Mesh(buildGeometry(parts, !!map), toon(0xffffff, { vertexColors: true, map, pbrAttr: true }));
    merged.userData.baked = true;
    merged.raycast = () => {};
    const ol = parts.reduce((s, p) => s + p.outline, 0) / parts.length;
    if (ol > 0) addOutline(merged, Math.round(ol * 1000) / 1000);
    merged.castShadow = parts[0].mesh.castShadow;
    merged.receiveShadow = parts[0].mesh.receiveShadow;
    root.add(merged);
    for (const p of parts) p.mesh.userData.staticBaked = true;
  }
  // Убираем склеенные оригиналы из сцены — меньше обхода графа каждый кадр
  for (const m of victims) {
    if (!m.userData.staticBaked) continue;
    const parent = m.parent;
    m.removeFromParent();
    // пустые группы-контейнеры тоже убираем
    let p = parent;
    while (p && p !== root && p.children.length === 0) {
      const up: THREE.Object3D | null = p.parent;
      p.removeFromParent();
      p = up;
    }
  }
}
