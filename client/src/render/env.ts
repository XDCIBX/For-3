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
    uniforms: {
      time: TIME,
      deep: { value: new THREE.Color(deep) },
      shallow: { value: new THREE.Color(shallow) },
      shoreR: { value: shoreR },
      fadeR: { value: fadeR },
    },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform vec3 deep;
      uniform vec3 shallow;
      uniform float shoreR;
      uniform float fadeR;
      varying vec3 vW;
      void main() {
        float r = length(vW.xz);
        float k = 1.0 - smoothstep(shoreR, fadeR, r);
        vec3 col = mix(deep, shallow, k * k);
        float w1 = sin(vW.x * 0.55 + time * 1.1) * sin(vW.z * 0.48 - time * 0.9);
        float w2 = sin((vW.x - vW.z) * 1.1 + time * 1.7) * 0.5 + 0.5;
        float band = smoothstep(0.55, 0.62, w1 * 0.55 + w2 * 0.45);
        col = mix(col, col * 1.25 + vec3(0.06), band * 0.55);
        float sparkle = smoothstep(0.985, 1.0, sin(vW.x * 2.3 + time * 2.5) * sin(vW.z * 2.1 - time * 2.0));
        col += sparkle * 0.6;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
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
