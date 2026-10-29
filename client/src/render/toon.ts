import * as THREE from 'three';

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

/**
 * Мягкий контровой свет по краю силуэта: фигуры и предметы «отрываются» от фона.
 * Одна общая правка шейдера — число программ и отрисовок не растёт.
 */
export const RIM = { color: { value: new THREE.Color(0xfff2d8) }, strength: { value: 0.45 } };
function withRim(m: THREE.MeshToonMaterial): THREE.MeshToonMaterial {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.rimColor = RIM.color;
    sh.uniforms.rimStrength = RIM.strength;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 rimColor;\nuniform float rimStrength;')
      .replace(
        '#include <opaque_fragment>',
        `float rimF = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
        outgoingLight += rimColor * smoothstep(0.55, 0.75, rimF) * rimStrength * (0.55 + 0.45 * diffuseColor.rgb);
        #include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => 'toon-rim';
  return m;
}

export interface ToonOpts {
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
  vertexColors?: boolean;
  /** Текстура деталей (умножается на цвет). */
  map?: THREE.Texture;
}

export function toon(color: THREE.ColorRepresentation, o: ToonOpts = {}): THREE.MeshToonMaterial {
  const key = `${new THREE.Color(color).getHexString()}|${o.emissive ?? ''}|${o.emissiveIntensity ?? ''}|${o.transparent ?? ''}|${o.opacity ?? ''}|${o.side ?? ''}|${o.vertexColors ?? ''}|${o.map?.uuid ?? ''}`;
  let m = cache.get(key) as THREE.MeshToonMaterial | undefined;
  if (!m) {
    m = new THREE.MeshToonMaterial({
      color,
      gradientMap: GRADIENT,
      emissive: o.emissive ?? 0x000000,
      emissiveIntensity: o.emissiveIntensity ?? 1,
      transparent: o.transparent ?? false,
      opacity: o.opacity ?? 1,
      side: o.side ?? THREE.FrontSide,
      vertexColors: o.vertexColors ?? false,
      map: o.map ?? null,
    });
    withRim(m);
    cache.set(key, m);
  }
  return m;
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
export function swayToon(color: THREE.ColorRepresentation, amount: number, opts: THREE.MeshToonMaterialParameters = {}, fade = false): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({ color, gradientMap: GRADIENT, ...opts });
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
export function instancedOutline(mesh: THREE.InstancedMesh, thickness = 0.04, sway = 0, fade = false): THREE.InstancedMesh {
  const o = new THREE.InstancedMesh(mesh.geometry, outlineMaterial(thickness, sway, fade), mesh.count);
  o.instanceMatrix = mesh.instanceMatrix;
  o.frustumCulled = false;
  return o;
}

export function addOutline<T extends THREE.Mesh>(mesh: T, thickness = 0.035): T {
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
