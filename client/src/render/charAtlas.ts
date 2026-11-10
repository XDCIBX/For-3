import * as THREE from 'three';
import { normalFor, textureAnisotropy } from './textures';

/**
 * Массив текстур персонажей. У героя или моба детали из разных материалов (кожа, металл, кольчуга, ткань,
 * шерсть…) — раньше на каждую фактуру уходила своя отрисовка (5–8 на моба). Здесь все фактуры лежат слоями
 * одного массива текстур, а номер слоя записан в вершинах — весь персонаж рисуется одним вызовом,
 * картинка та же. Слой 0 — «без текстуры» (белый цвет, ровная нормаль).
 */
const SIZE = 256;
const BYTES = SIZE * SIZE * 4;
let cap = 16;
let count = 1;
const layerOf = new Map<string, number>();

function blank(n: number): { map: THREE.DataArrayTexture; norm: THREE.DataArrayTexture } {
  const mk = (srgb: boolean) => {
    const t = new THREE.DataArrayTexture(new Uint8Array(BYTES * n), SIZE, SIZE, n);
    t.format = THREE.RGBAFormat;
    t.type = THREE.UnsignedByteType;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = textureAnisotropy();
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const map = mk(true);
  const norm = mk(false);
  const m = map.image.data as Uint8Array;
  const nn = norm.image.data as Uint8Array;
  m.fill(255, 0, BYTES);
  for (let i = 0; i < BYTES; i += 4) {
    nn[i] = nn[i + 1] = 128;
    nn[i + 2] = nn[i + 3] = 255;
  }
  return { map, norm };
}

let arrays: { map: THREE.DataArrayTexture; norm: THREE.DataArrayTexture } | null = null;
/** Общие uniform-ы материалов персонажей (значение подменяется при росте массива). */
export const CHAR_MAP = { value: null as THREE.DataArrayTexture | null };
export const CHAR_NORM = { value: null as THREE.DataArrayTexture | null };

function ensure() {
  if (!arrays) {
    arrays = blank(cap);
    CHAR_MAP.value = arrays.map;
    CHAR_NORM.value = arrays.norm;
  }
  return arrays;
}

let scratch: CanvasRenderingContext2D | null = null;
/** Пиксели картинки 256×256, строки снизу вверх (как грузит обычная текстура с flipY). */
function pixels(img: CanvasImageSource): Uint8ClampedArray {
  if (!scratch) {
    const c = document.createElement('canvas');
    c.width = c.height = SIZE;
    scratch = c.getContext('2d', { willReadFrequently: true })!;
  }
  scratch.setTransform(1, 0, 0, -1, 0, SIZE);
  scratch.clearRect(0, 0, SIZE, SIZE);
  scratch.drawImage(img, 0, 0, SIZE, SIZE);
  return scratch.getImageData(0, 0, SIZE, SIZE).data;
}

/** Номер слоя для текстуры детали (0 — без текстуры). Новая текстура дописывается в массив. */
export function charLayer(tex: THREE.Texture | null | undefined): number {
  const a0 = ensure();
  if (!tex || !(tex.image instanceof HTMLCanvasElement)) return 0;
  const key = tex.source.uuid;
  const known = layerOf.get(key);
  if (known !== undefined) return known;
  let a = a0;
  if (count >= cap) {
    // Места нет — массив вдвое больше, старые слои переносятся
    cap *= 2;
    const bigger = blank(cap);
    (bigger.map.image.data as Uint8Array).set(a.map.image.data as Uint8Array);
    (bigger.norm.image.data as Uint8Array).set(a.norm.image.data as Uint8Array);
    a.map.dispose();
    a.norm.dispose();
    a = arrays = bigger;
    CHAR_MAP.value = a.map;
    CHAR_NORM.value = a.norm;
  }
  const i = count++;
  layerOf.set(key, i);
  (a.map.image.data as Uint8Array).set(pixels(tex.image), i * BYTES);
  const n = normalFor(tex);
  if (n) (a.norm.image.data as Uint8Array).set(pixels(n.image as HTMLCanvasElement), i * BYTES);
  else (a.norm.image.data as Uint8Array).copyWithin(i * BYTES, 0, BYTES);
  a.map.needsUpdate = true;
  a.norm.needsUpdate = true;
  return i;
}

/** Смена качества графики: та же анизотропная фильтрация, что у остальных текстур. */
export function setCharAnisotropy(n: number) {
  if (!arrays || arrays.map.anisotropy === n) return;
  for (const t of [arrays.map, arrays.norm]) {
    t.anisotropy = n;
    t.needsUpdate = true;
  }
}

/** Вставки в шейдер стандартного материала: цвет и нормаль берутся из слоя массива. */
export function patchCharShader(sh: { uniforms: Record<string, unknown>; vertexShader: string; fragmentShader: string }) {
  ensure();
  sh.uniforms.charMap = CHAR_MAP;
  sh.uniforms.charNorm = CHAR_NORM;
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float layer;\nvarying float vLayer;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLayer = layer;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vLayer;\nuniform mediump sampler2DArray charMap;\nuniform mediump sampler2DArray charNorm;')
    .replace('#include <map_fragment>', 'diffuseColor *= texture(charMap, vec3(vMapUv, floor(vLayer + 0.5)));')
    .replace(
      '#include <normal_fragment_maps>',
      `vec3 mapN = texture(charNorm, vec3(vNormalMapUv, floor(vLayer + 0.5))).xyz * 2.0 - 1.0;
      mapN.xy *= normalScale;
      normal = normalize(tbn * mapN);`,
    );
}
