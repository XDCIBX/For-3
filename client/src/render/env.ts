import * as THREE from 'three';
import { TIME } from './toon';
import type { Particles } from './particles';

export interface Stage {
  readonly name: string;
  readonly scene: THREE.Scene;
  readonly sun: THREE.DirectionalLight | null;
  update(dt: number, fx: Particles): void;
  /** Нужно ли перерисовать статичную карту теней при активации. */
  shadowsDirty: boolean;
}

export function skyTexture(top: string, mid: string, bottom: string): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, top);
  gr.addColorStop(0.55, mid);
  gr.addColorStop(1, bottom);
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Окружение для отражений и рассеянного света: процедурное небо
 * (верх, горизонт, низ и яркое пятно солнца), свёрнутое в PMREM один раз на сцену.
 */
export function makeEnvironment(renderer: THREE.WebGLRenderer, top: string, horizon: string, bottom: string, sun: string, sunAt: [number, number] = [0.3, 0.32]): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, top);
  gr.addColorStop(0.48, horizon);
  gr.addColorStop(0.52, horizon);
  gr.addColorStop(1, bottom);
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 128);
  const sg = g.createRadialGradient(sunAt[0] * 256, sunAt[1] * 128, 0, sunAt[0] * 256, sunAt[1] * 128, 34);
  sg.addColorStop(0, sun);
  sg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sg;
  g.fillRect(0, 0, 256, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromEquirectangular(tex).texture;
  pm.dispose();
  tex.dispose();
  return env;
}

export function makeSun(intensity: number, color: number, pos: [number, number, number], extent: number, mapSize: number): THREE.DirectionalLight {
  const sun = new THREE.DirectionalLight(color, intensity);
  sun.position.set(...pos);
  sun.castShadow = true;
  sun.shadow.mapSize.set(mapSize, mapSize);
  const cam = sun.shadow.camera;
  cam.left = -extent;
  cam.right = extent;
  cam.top = extent;
  cam.bottom = -extent;
  cam.near = 1;
  cam.far = 160;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.03;
  sun.target.position.set(0, 0, 0);
  return sun;
}

/** Стилизованная вода: глубина, блики, пена у берега. */
export function waterMaterial(deep: number, shallow: number, shoreR: number, fadeR: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    fog: true,
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      time: TIME,
      deep: { value: new THREE.Color(deep) },
      shallow: { value: new THREE.Color(shallow) },
      sky: { value: new THREE.Color(0xb8cad6) },
      shoreR: { value: shoreR },
      fadeR: { value: fadeR },
    },
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
      uniform vec3 deep;
      uniform vec3 shallow;
      uniform vec3 sky;
      uniform float shoreR;
      uniform float fadeR;
      varying vec3 vW;
      #include <fog_pars_fragment>
      void main() {
        float r = length(vW.xz);
        float k = 1.0 - smoothstep(shoreR, fadeR, r);
        vec3 col = mix(deep, shallow, k * k);
        // Рябь: возмущённая нормаль, отражение неба по Френелю и блик солнца
        float nx = cos(vW.x * 0.55 + time * 1.1) * 0.5 + cos((vW.x - vW.z) * 1.3 + time * 1.7) * 0.35 + cos(vW.x * 2.1 - time * 2.2) * 0.12;
        float nz = cos(vW.z * 0.48 - time * 0.9) * 0.5 - cos((vW.x - vW.z) * 1.3 + time * 1.7) * 0.35 + cos(vW.z * 1.9 + time * 2.0) * 0.12;
        vec3 n = normalize(vec3(nx * 0.12, 1.0, nz * 0.12));
        vec3 v = normalize(cameraPosition - vW);
        float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
        col = mix(col, sky, clamp(0.12 + fres * 0.8, 0.0, 0.85));
        vec3 h = normalize(v + normalize(vec3(-0.45, 0.8, 0.38)));
        col += vec3(1.0, 0.95, 0.85) * pow(max(dot(n, h), 0.0), 220.0) * 1.6;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}

/** Шейдер вихря портала. */
export function portalMaterial(c1: number, c2: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { time: TIME, c1: { value: new THREE.Color(c1) }, c2: { value: new THREE.Color(c2) } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform vec3 c1;
      uniform vec3 c2;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv - 0.5;
        float r = length(p) * 2.0;
        if (r > 1.0) discard;
        float a = atan(p.y, p.x);
        float s = sin(a * 3.0 + r * 9.0 - time * 4.0) * 0.5 + 0.5;
        vec3 col = mix(c1, c2, s) * (1.3 - r * 0.6);
        col += vec3(1.0) * smoothstep(0.35, 0.0, r) * 0.6;
        gl_FragColor = vec4(col, smoothstep(1.0, 0.85, r) * 0.95);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

/** Огонь из нескольких «языков» пламени. */
export class Flame {
  readonly group = new THREE.Group();
  private tongues: THREE.Mesh[] = [];
  private t = Math.random() * 10;
  constructor(scale = 1) {
    const colors = [0xff5a1a, 0xff9a1a, 0xffe14a];
    colors.forEach((c, i) => {
      for (let j = 0; j < (i === 0 ? 3 : 2); j++) {
        const m = new THREE.Mesh(
          new THREE.ConeGeometry(0.28 - i * 0.07, 0.9 - i * 0.2, 8),
          new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }),
        );
        const a = (j / 3) * Math.PI * 2 + i;
        m.position.set(Math.cos(a) * 0.08 * (2 - i), 0.4 - i * 0.05, Math.sin(a) * 0.08 * (2 - i));
        this.tongues.push(m);
        this.group.add(m);
      }
    });
    this.group.scale.setScalar(scale);
  }
  update(dt: number) {
    this.t += dt;
    this.tongues.forEach((m, i) => {
      const f = 1 + Math.sin(this.t * (9 + i * 1.7) + i) * 0.18 + Math.sin(this.t * 23 + i * 3) * 0.06;
      m.scale.set(1 - (f - 1) * 0.5, f, 1 - (f - 1) * 0.5);
      m.rotation.y = this.t * (1 + i * 0.2);
    });
  }
}

export function canvasLabel(text: string, opts: { font?: string; color?: string; bg?: string; w?: number; h?: number; stroke?: string } = {}): THREE.CanvasTexture {
  const w = opts.w ?? 512;
  const h = opts.h ?? 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  if (opts.bg) {
    g.fillStyle = opts.bg;
    g.fillRect(0, 0, w, h);
  }
  g.font = opts.font ?? `900 ${Math.round(h * 0.55)}px Rubik, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (opts.stroke) {
    g.lineWidth = h * 0.08;
    g.strokeStyle = opts.stroke;
    g.lineJoin = 'round';
    g.strokeText(text, w / 2, h / 2 + 2);
  }
  g.fillStyle = opts.color ?? '#fff';
  g.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
