import * as THREE from 'three';
import { TEMPLATE_BY_ID, emptyEquip, makeItem, type HeroClass, type Rarity } from '@game/shared';
import { buildWeapon } from './weapons';
import { buildAmulet, buildHelmet, buildRing, type Built } from './equipment';
import { HeroModel } from './heroes';
import { headShape } from './anatomy';
import { makeEnvironment } from './env';
import { part } from './toon';

/**
 * Иконки предметов для лавки: рендер настоящих 3D-моделей оружия и доспехов
 * в маленьком отдельном рендерере, один раз на предмет — дальше из кэша.
 * Рендер идёт по одному предмету за кадр, чтобы открытие таверны не подвисало.
 */

const SIZE = 192;
let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let failed = false;
const cache = new Map<string, string>();
const queue: { key: string; tpl: string; rarity: Rarity; cls: HeroClass }[] = [];
let pumping = false;

function setup(): boolean {
  if (renderer) return true;
  if (failed) return false;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(SIZE, SIZE, false);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    scene = new THREE.Scene();
    scene.environment = makeEnvironment(renderer, '#5a6a8a', '#e8e0d0', '#5a4a3a', 'rgba(255,250,235,1)');
    scene.add(new THREE.HemisphereLight(0xfff4e8, 0x5a4a3a, 0.9));
    const key = new THREE.DirectionalLight(0xfff0dc, 3.2);
    key.position.set(2, 3, 4);
    const rim = new THREE.DirectionalLight(0xa8c8ff, 2.2);
    rim.position.set(-3, 2, -2);
    scene.add(key, rim);
    return true;
  } catch {
    failed = true;
    return false;
  }
}

/** Модель предмета для иконки и как на неё смотреть. */
function build(tpl: string, rarity: Rarity, cls: HeroClass): { obj: THREE.Object3D; focus?: (o: THREE.Object3D) => THREE.Box3 } {
  const slot = TEMPLATE_BY_ID[tpl]?.slot ?? 'weapon';
  const built: Built = { parts: [], glow: [], spin: [] };
  if (slot === 'weapon') {
    const w = buildWeapon(tpl, rarity, built);
    const g = new THREE.Group();
    g.add(w);
    // Наискосок, остриём вверх-вправо, слегка в три четверти — видно фаски и объём
    if (tpl === 'crossbow') {
      // В профиль болтом вверх-вправо, сверху чуть видна дуга с тетивой
      w.rotation.y = Math.PI / 2 - 0.45;
      g.rotation.set(0.55, 0, 0.55);
    }
    else if (tpl === 'bow' || tpl === 'recurve') {
      // Лук плоскостью к зрителю, чуть наклонён
      w.rotation.set(0, -Math.PI / 2 + 0.35, 0);
      g.rotation.z = -0.55;
    }
    else if (tpl === 'tome' || tpl === 'claws' || tpl === 'knuckles') w.rotation.set(0.2, 0.5, 0);
    else w.rotation.set(0, 0.55, -Math.PI / 4);
    return { obj: g };
  }
  if (slot === 'helmet') {
    const g = new THREE.Group();
    g.add(part(headShape('human'), 0x6a5a50, { outline: false, rough: 0.7 }));
    buildHelmet(g, tpl, rarity, built);
    g.rotation.set(0.15, 0.55, 0);
    return { obj: g };
  }
  if (slot === 'amulet') {
    const g = new THREE.Group();
    buildAmulet(g, tpl, rarity, built);
    g.rotation.y = 0.35;
    return { obj: g };
  }
  if (slot === 'ring') {
    const g = new THREE.Group();
    buildRing(g, rarity, built);
    g.rotation.set(0.9, 0.5, 0);
    return { obj: g };
  }
  // Доспех и обувь — на самом герое: кадрируем торс или ноги
  const h = new HeroModel(cls);
  const eq = emptyEquip();
  eq[slot] = makeItem(TEMPLATE_BY_ID[tpl], rarity, 1);
  h.setEquip(eq);
  for (let i = 0; i < 3; i++) h.update(0.05, { speed: 0, dead: false, stun: false, frozen: false, whirl: false, dash: false, invuln: false, buff: false });
  h.root.rotation.y = 0.45;
  h.root.children[0].visible = false;
  // Оружие и щит не загораживают доспех
  const hands = h as unknown as { handL: THREE.Object3D; handR: THREE.Object3D };
  if (slot === 'armor') hands.handL.visible = hands.handR.visible = false;
  h.root.updateMatrixWorld(true);
  const focus = () => {
    const b = visibleBox(h.root);
    const hgt = b.max.y - b.min.y;
    if (slot === 'boots') b.max.y = b.min.y + hgt * 0.34;
    else {
      b.min.y = b.min.y + hgt * 0.4;
      b.max.y = b.min.y + hgt * 0.38;
    }
    // По ширине — только корпус, без оружия и щита
    const half = slot === 'boots' ? 0.32 : 0.42;
    for (const k of ['x', 'z'] as const) {
      const c = h.root.position[k];
      b.min[k] = c - half;
      b.max[k] = c + half;
    }
    return b;
  };
  return { obj: h.root, focus };
}

/** Габариты только видимых мешей (без скрытых эффектов: льда, щита, ореолов). */
function visibleBox(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  const walk = (o: THREE.Object3D) => {
    if (!o.visible) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry && !(m.material as THREE.Material).transparent) {
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      tmp.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld);
      box.union(tmp);
    }
    for (const c of o.children) walk(c);
  };
  walk(root);
  return box;
}

function render(tpl: string, rarity: Rarity, cls: HeroClass): string | null {
  if (!setup() || !renderer || !scene) return null;
  const { obj, focus } = build(tpl, rarity, cls);
  scene.add(obj);
  obj.updateMatrixWorld(true);
  const box = focus ? focus(obj) : visibleBox(obj);
  const c = box.getCenter(new THREE.Vector3());
  const sz = box.getSize(new THREE.Vector3());
  const r = Math.max(sz.x, sz.y, sz.z * 0.6) * 0.6;
  const cam = new THREE.PerspectiveCamera(28, 1, 0.01, 100);
  const d = r / Math.tan((28 * Math.PI) / 360);
  cam.position.copy(c).add(new THREE.Vector3(0, r * 0.15, d));
  cam.lookAt(c);
  renderer.render(scene, cam);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(obj);
  return url;
}

function pump() {
  pumping = true;
  const job = queue.shift();
  if (!job) {
    pumping = false;
    return;
  }
  if (!cache.has(job.key)) {
    let url: string | null = null;
    try {
      url = render(job.tpl, job.rarity, job.cls);
    } catch (e) {
      console.warn('icon', job.key, e);
    }
    if (url) {
      cache.set(job.key, url);
      document.querySelectorAll<HTMLElement>(`[data-icon="${job.key}"]`).forEach((el) => {
        el.outerHTML = `<img class="i3d" src="${url}" alt="">`;
      });
    }
  }
  requestAnimationFrame(pump);
}

/**
 * HTML иконки предмета: готовый 3D-рендер из кэша или, пока он не готов,
 * векторная иконка-заглушка, которую подменит рендер.
 */
export function itemIcon3d(tpl: string, rarity: Rarity, cls: HeroClass, fallback: string): string {
  const slot = TEMPLATE_BY_ID[tpl]?.slot;
  const key = `${tpl}|${rarity}|${slot === 'armor' || slot === 'boots' ? cls : ''}`;
  const url = cache.get(key);
  if (url) return `<img class="i3d" src="${url}" alt="">`;
  if (failed) return fallback;
  if (!queue.some((q) => q.key === key)) queue.push({ key, tpl, rarity, cls });
  if (!pumping) {
    pumping = true;
    requestAnimationFrame(pump);
  }
  return `<span class="i3d-wait" data-icon="${key}">${fallback}</span>`;
}
