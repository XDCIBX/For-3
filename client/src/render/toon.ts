import * as THREE from 'three';
import { normalFor } from './textures';

/** Ступенчатая карта освещения — мультяшный «cel-shading». */
function makeGradient(): THREE.DataTexture {
  const steps = [90, 160, 215, 255];
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => data.set([v, v, v, 255], i * 4));
  const tex = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export const GRADIENT = makeGradient();
export const OUTLINE_COLOR = new THREE.Color(0x24160f);

const cache = new Map<string, THREE.Material>();

export interface ToonOpts {
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
  vertexColors?: boolean;
  /** Текстура деталей (умножается на цвет). */
  map?: THREE.Texture;
  /** Явно задать металличность и шероховатость (иначе — по палитре). */
  metal?: number;
  rough?: number;
  /** Для склеенных моделей: шероховатость/металл берутся из вершин. */
  pbrAttr?: boolean;
}

/**
 * Реалистичная поверхность: металл блестит и отражает небо, кожа и ткань матовые.
 * Тип поверхности определяется по палитре (металлы, кожа) и текстуре (ткань, дерево, камень).
 */
const METAL_HEX = new Set([
  0xd6dde3, 0x9fd4ff, 0xd4a6ff, 0xffe07a, 0xff7a6a, 0xffc93c, 0xffd54a, 0xffcf4a, 0xc7ced6, 0x8a96a0, 0x6d7680, 0x4a4a52, 0x6a6e76,
  0x8a8e96, 0xc8a24a, 0xa8822a, 0xb8c2cc, 0xcfd8dc, 0xa9b4bf, 0x7aa6d8, 0x8e62c9, 0xe7b84a, 0x6a1c22, 0x9aa6b2, 0x5b8fd0, 0x8a5ac7,
  0xf0c04a, 0x7d8894, 0x8e9aa6, 0xe0e8f0, 0x6a6a6a, 0xd8dee4, 0xfff0a0, 0x6f7b85, 0x3a3a42,
]);
const SKIN_HEX = new Set([0xffd3ac, 0xf5b98f, 0xe8b890, 0xffd0a8]);
const ROUGH_BY_TEX: Record<string, number> = { cloth: 0.95, wood: 0.85, bark: 0.92, rock: 0.9, stone: 0.88, leaf: 0.8, grass: 0.95 };

/** Приглушаем «конфетные» цвета: чуть меньше насыщенности и яркости — ближе к натуральным. */
export function natural(c: THREE.Color): THREE.Color {
  const l = c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
  return c.setRGB(l + (c.r - l) * 0.8, l + (c.g - l) * 0.8, l + (c.b - l) * 0.8).multiplyScalar(0.94);
}

export interface Surface {
  rough: number;
  metal: number;
}
export function surfaceOf(hex: number, o: ToonOpts = {}): Surface {
  if (o.metal !== undefined) return { metal: o.metal, rough: o.rough ?? 0.35 };
  if (METAL_HEX.has(hex)) return { metal: 0.85, rough: o.rough ?? (hex === 0xffc93c || hex === 0xffd54a ? 0.3 : 0.38) };
  if (SKIN_HEX.has(hex)) return { metal: 0, rough: 0.55 };
  const texRough = o.map ? ROUGH_BY_TEX[(o.map.name || '').replace(/[^a-z]/g, '')] : undefined;
  return { metal: 0, rough: o.rough ?? texRough ?? 0.72 };
}

export function toon(color: THREE.ColorRepresentation, o: ToonOpts = {}): THREE.MeshStandardMaterial {
  const key = `${new THREE.Color(color).getHexString()}|${o.emissive ?? ''}|${o.emissiveIntensity ?? ''}|${o.transparent ?? ''}|${o.opacity ?? ''}|${o.side ?? ''}|${o.vertexColors ?? ''}|${o.map?.uuid ?? ''}|${o.metal ?? ''}|${o.rough ?? ''}|${o.pbrAttr ?? ''}`;
  let m = cache.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    const hex = new THREE.Color(color).getHex();
    const sf = surfaceOf(hex, o);
    m = new THREE.MeshStandardMaterial({
      color: o.vertexColors ? new THREE.Color(color) : natural(new THREE.Color(color)),
      roughness: sf.rough,
      metalness: sf.metal,
      emissive: o.emissive ?? 0x000000,
      emissiveIntensity: o.emissiveIntensity ?? 1,
      transparent: o.transparent ?? false,
      opacity: o.opacity ?? 1,
      side: o.side ?? THREE.FrontSide,
      vertexColors: o.vertexColors ?? false,
      map: o.map ?? null,
      normalMap: o.map ? normalFor(o.map) : null,
      envMapIntensity: 0.55,
    });
    m.userData.surface = sf;
    // Исходный цвет из палитры (до приглушения) — по нему ищут материалы, например для текстур
    m.userData.hex = hex;
    if (m.normalMap) m.normalScale.set(0.6, 0.6);
    if (o.pbrAttr) withPbrAttr(m);
    cache.set(key, m);
  }
  return m;
}

/**
 * Склеенные модели хранят шероховатость и металличность каждой детали в вершинах
 * (атрибут pbr) — один меш, но меч блестит, а плащ остаётся матовым.
 */
function withPbrAttr(m: THREE.MeshStandardMaterial) {
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 pbr;\nvarying vec2 vPbr;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPbr = pbr;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vPbr;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vPbr.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vPbr.y;');
  };
  m.customProgramCacheKey = () => 'pbr-attr';
}

const basicCache = new Map<string, THREE.MeshBasicMaterial>();
export function glow(color: THREE.ColorRepresentation, opacity = 1, additive = true): THREE.MeshBasicMaterial {
  const key = `${new THREE.Color(color).getHexString()}|${opacity}|${additive}`;
  let m = basicCache.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: false,
      toneMapped: false,
    });
    basicCache.set(key, m);
  }
  return m;
}

/** Общее время для шейдеров (ветер, вода, порталы). */
export const TIME = { value: 0 };
/** Точка фокуса (герой игрока): кроны между камерой и героем становятся полупрозрачными. */
export const FOCUS = { value: new THREE.Vector3(0, 1, 0) };
export const FADE_R = { value: 0 };

const FADE_GLSL = /* glsl */ `
  if (fadeR > 0.0) {
    vec3 toP = focus - cameraPosition;
    vec3 toF = vWPos - cameraPosition;
    float t = clamp(dot(toF, toP) / dot(toP, toP), 0.0, 1.0);
    float d = length(vWPos - (cameraPosition + toP * t));
    if (t < 0.96 && d < fadeR && mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0) < 1.0) discard;
  }`;

/** Контур по нормалям в пространстве камеры — одинаковая толщина при любом масштабе. Поддерживает инстансинг и ветер. */
function makeOutlineMaterial(thickness: number, sway = 0, fade = false) {
  return new THREE.ShaderMaterial({
    defines: fade ? { FADE: 1 } : {},
    uniforms: { thickness: { value: thickness }, color: { value: OUTLINE_COLOR }, time: TIME, sway: { value: sway }, focus: FOCUS, fadeR: FADE_R },
    vertexShader: /* glsl */ `
      uniform float thickness;
      uniform float time;
      uniform float sway;
      varying vec3 vWPos;
      void main() {
        vec4 local = vec4(position, 1.0);
        vec3 nrm = normal;
        float s = sway * max(0.0, position.y);
        #ifdef USE_INSTANCING
          float ph = time * 1.6 + instanceMatrix[3][0] * 0.3 + instanceMatrix[3][2] * 0.2;
          local.x += sin(ph) * s;
          local.z += sin(ph * 0.8) * s * 0.6;
          local = instanceMatrix * local;
          nrm = mat3(instanceMatrix) * nrm;
        #endif
        vWPos = (modelMatrix * local).xyz;
        vec4 mv = modelViewMatrix * local;
        vec3 n = normalize(normalMatrix * nrm);
        mv.xyz += n * thickness;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      uniform vec3 focus;
      uniform float fadeR;
      varying vec3 vWPos;
      void main() {
        #ifdef FADE
        ${FADE_GLSL}
        #endif
        gl_FragColor = vec4(color, 1.0);
      }`,
    side: THREE.BackSide,
  });
}

const outlineMats = new Map<string, THREE.ShaderMaterial>();
export function outlineMaterial(thickness: number, sway = 0, fade = false) {
  const key = `${thickness}|${sway}|${fade}`;
  let m = outlineMats.get(key);
  if (!m) {
    m = makeOutlineMaterial(thickness, sway, fade);
    outlineMats.set(key, m);
  }
  return m;
}

/** Тун-материал с покачиванием на ветру (для крон деревьев, травы). fade — просвечивание перед героем. */
export function swayToon(color: THREE.ColorRepresentation, amount: number, opts: THREE.MeshStandardMaterialParameters = {}, fade = false): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: natural(new THREE.Color(color)), roughness: 0.82, metalness: 0, envMapIntensity: 0.7, ...opts });
  if (opts.map && !opts.normalMap) {
    m.normalMap = normalFor(opts.map);
    m.normalScale.set(0.5, 0.5);
  }
  m.onBeforeCompile = (sh) => {
    sh.uniforms.time = TIME;
    sh.uniforms.focus = FOCUS;
    sh.uniforms.fadeR = FADE_R;
    sh.vertexShader =
      'uniform float time;\nvarying vec3 vWPos;\n' +
      sh.vertexShader
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
        {
          float s = ${amount.toFixed(3)} * max(0.0, position.y);
          #ifdef USE_INSTANCING
            float ph = time * 1.6 + instanceMatrix[3][0] * 0.3 + instanceMatrix[3][2] * 0.2;
          #else
            float ph = time * 1.6;
          #endif
          transformed.x += sin(ph) * s;
          transformed.z += sin(ph * 0.8) * s * 0.6;
        }`,
        )
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>
        {
          vec4 wp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            wp = instanceMatrix * wp;
          #endif
          vWPos = (modelMatrix * wp).xyz;
        }`,
        );
    if (fade) {
      sh.fragmentShader =
        'uniform vec3 focus;\nuniform float fadeR;\nvarying vec3 vWPos;\n' +
        sh.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${FADE_GLSL}`);
    }
  };
  m.customProgramCacheKey = () => `sway${amount}|${fade}`;
  return m;
}

/** Инстансированная копия-контур для InstancedMesh. */
/**
 * Мультяшный контур выключен: реалистичный рендер обходится без чёрной обводки
 * (и экономит отрисовку на каждый склеенный меш). Функции оставлены, чтобы
 * не трогать сотни мест сборки моделей.
 */
export const OUTLINES = false;
export function instancedOutline(mesh: THREE.InstancedMesh, thickness = 0.04, sway = 0, fade = false): THREE.Object3D {
  if (!OUTLINES) return new THREE.Group();
  const o = new THREE.InstancedMesh(mesh.geometry, outlineMaterial(thickness, sway, fade), mesh.count);
  o.instanceMatrix = mesh.instanceMatrix;
  o.frustumCulled = false;
  return o;
}

export function addOutline<T extends THREE.Mesh>(mesh: T, thickness = 0.035): T {
  if (!OUTLINES) return mesh;
  const o = new THREE.Mesh(mesh.geometry, outlineMaterial(thickness));
  o.name = 'outline';
  o.raycast = () => {};
  mesh.add(o);
  return mesh;
}

/** Хелпер: меш с тун-материалом и (опционально) контуром. */
export function part(
  geo: THREE.BufferGeometry,
  color: THREE.ColorRepresentation,
  opts: ToonOpts & { outline?: number | false; pos?: [number, number, number]; rot?: [number, number, number]; scale?: [number, number, number] | number } = {},
): THREE.Mesh {
  const m = new THREE.Mesh(geo, toon(color, opts));
  if (opts.pos) m.position.set(...opts.pos);
  if (opts.rot) m.rotation.set(...opts.rot);
  if (opts.scale !== undefined) {
    if (typeof opts.scale === 'number') m.scale.setScalar(opts.scale);
    else m.scale.set(...opts.scale);
  }
  if (opts.outline !== false) addOutline(m, opts.outline ?? 0.03);
  return m;
}

// Общие геометрии
const geoCache = new Map<string, THREE.BufferGeometry>();
function cached<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g as T;
}
export const G = {
  sphere: (r = 1, w = 16, h = 12) => cached(`s${r}|${w}|${h}`, () => new THREE.SphereGeometry(r, w, h)),
  box: (x: number, y: number, z: number) => cached(`b${x}|${y}|${z}`, () => new THREE.BoxGeometry(x, y, z)),
  cyl: (rt: number, rb: number, h: number, seg = 12) => cached(`c${rt}|${rb}|${h}|${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)),
  cone: (r: number, h: number, seg = 12) => cached(`k${r}|${h}|${seg}`, () => new THREE.ConeGeometry(r, h, seg)),
  capsule: (r: number, l: number) => cached(`p${r}|${l}`, () => new THREE.CapsuleGeometry(r, l, 6, 12)),
  torus: (r: number, t: number, arc = Math.PI * 2, rs = 8, ts = 20) => cached(`t${r}|${t}|${arc}|${rs}|${ts}`, () => new THREE.TorusGeometry(r, t, rs, ts, arc)),
  ico: (r: number, d = 0) => cached(`i${r}|${d}`, () => new THREE.IcosahedronGeometry(r, d)),
  dodeca: (r: number) => cached(`d${r}`, () => faceted(new THREE.DodecahedronGeometry(r, 0))),
  halfSphere: (r: number) => cached(`h${r}`, () => new THREE.SphereGeometry(r, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2)),
};

/** Гранёная геометрия (плоские нормали) — для камней и кристаллов. */
export function faceted<T extends THREE.BufferGeometry>(geo: T): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  return g;
}

export const RARITY_HEX: Record<string, number> = {
  common: 0xc9d3da,
  rare: 0x47a8ff,
  epic: 0xbe6bff,
  legendary: 0xffb321,
  relic: 0xff3b3b,
};

/** Мягкая круглая тень под персонажами. */
let blobTex: THREE.CanvasTexture | null = null;
export function blobShadow(size = 1.2): THREE.Mesh {
  if (!blobTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)');
    gr.addColorStop(0.6, 'rgba(0,0,0,0.3)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    blobTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(
    cached('blobplane', () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }),
  );
  m.scale.setScalar(size);
  m.position.y = 0.03;
  m.renderOrder = 1;
  return m;
}
