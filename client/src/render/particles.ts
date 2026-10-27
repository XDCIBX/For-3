import * as THREE from 'three';

export interface EmitOpts {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  life?: number;
  size?: number;
  /** Изменение размера в секунду. */
  grow?: number;
  color?: THREE.ColorRepresentation;
  alpha?: number;
  gravity?: number;
  drag?: number;
}

export interface BurstOpts {
  n: number;
  speed?: number;
  up?: number;
  spread?: number;
  life?: number;
  size?: number;
  grow?: number;
  colors?: THREE.ColorRepresentation[];
  gravity?: number;
  drag?: number;
  alpha?: number;
  /** Разброс точки появления. */
  radius?: number;
}

const tmpColor = new THREE.Color();

class ParticlePool {
  readonly points: THREE.Points;
  private cap: number;
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private grow: Float32Array;
  private grav: Float32Array;
  private drag: Float32Array;
  private alpha0: Float32Array;
  private baseSize: Float32Array;
  private next = 0;
  private geo: THREE.BufferGeometry;
  readonly mat: THREE.ShaderMaterial;

  constructor(cap: number, additive: boolean) {
    this.cap = cap;
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 4);
    this.size = new Float32Array(cap);
    this.vel = new Float32Array(cap * 3);
    this.life = new Float32Array(cap);
    this.maxLife = new Float32Array(cap).fill(1);
    this.grow = new Float32Array(cap);
    this.grav = new Float32Array(cap);
    this.drag = new Float32Array(cap);
    this.alpha0 = new Float32Array(cap);
    this.baseSize = new Float32Array(cap);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 600 } },
      vertexShader: /* glsl */ `
        attribute float size;
        attribute vec4 pcolor;
        uniform float scale;
        varying vec4 vC;
        void main() {
          vC = pcolor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec4 vC;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5 || vC.a < 0.01) discard;
          float a = smoothstep(0.5, 0.15, d) * vC.a;
          gl_FragColor = vec4(vC.rgb, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 6 : 5;
  }

  emit(o: EmitOpts) {
    const i = this.next;
    this.next = (this.next + 1) % this.cap;
    this.pos[i * 3] = o.x;
    this.pos[i * 3 + 1] = o.y;
    this.pos[i * 3 + 2] = o.z;
    this.vel[i * 3] = o.vx ?? 0;
    this.vel[i * 3 + 1] = o.vy ?? 0;
    this.vel[i * 3 + 2] = o.vz ?? 0;
    this.life[i] = this.maxLife[i] = o.life ?? 0.6;
    this.baseSize[i] = this.size[i] = o.size ?? 0.3;
    this.grow[i] = o.grow ?? 0;
    this.grav[i] = o.gravity ?? 0;
    this.drag[i] = o.drag ?? 0;
    tmpColor.set(o.color ?? 0xffffff);
    this.col[i * 4] = tmpColor.r;
    this.col[i * 4 + 1] = tmpColor.g;
    this.col[i * 4 + 2] = tmpColor.b;
    this.alpha0[i] = o.alpha ?? 1;
    this.col[i * 4 + 3] = this.alpha0[i];
  }

  update(dt: number) {
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.col[i * 4 + 3] = 0;
        this.size[i] = 0;
        continue;
      }
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt;
      this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.02 && this.grav[i] > 0) {
        this.pos[i * 3 + 1] = 0.02;
        this.vel[i * 3 + 1] *= -0.3;
        this.vel[i * 3] *= 0.6;
        this.vel[i * 3 + 2] *= 0.6;
      }
      const k = this.life[i] / this.maxLife[i];
      this.size[i] = Math.max(0, this.baseSize[i] + this.grow[i] * (this.maxLife[i] - this.life[i]));
      this.col[i * 4 + 3] = this.alpha0[i] * Math.min(1, k * 2.5);
    }
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.pcolor as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.size as THREE.BufferAttribute).needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
    this.col.fill(0);
    this.size.fill(0);
  }
}

/** Две системы частиц: аддитивная (огонь, магия) и обычная (дым, пыль). */
export class Particles {
  readonly add = new ParticlePool(2400, true);
  readonly norm = new ParticlePool(1600, false);
  readonly group = new THREE.Group();

  constructor() {
    this.group.add(this.add.points, this.norm.points);
  }

  setScale(s: number) {
    this.add.mat.uniforms.scale.value = s;
    this.norm.mat.uniforms.scale.value = s;
  }

  glow(o: EmitOpts) {
    this.add.emit(o);
  }
  puff(o: EmitOpts) {
    this.norm.emit(o);
  }

  burst(x: number, y: number, z: number, o: BurstOpts, additive = true) {
    const pool = additive ? this.add : this.norm;
    const colors = o.colors ?? [0xffffff];
    for (let i = 0; i < o.n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (o.speed ?? 3) * (0.4 + Math.random() * 0.6);
      const rr = (o.radius ?? 0) * Math.sqrt(Math.random());
      pool.emit({
        x: x + Math.cos(a) * rr,
        y,
        z: z + Math.sin(a) * rr,
        vx: Math.cos(a) * sp,
        vy: (o.up ?? 2) * (0.5 + Math.random() * 0.8),
        vz: Math.sin(a) * sp,
        life: (o.life ?? 0.6) * (0.6 + Math.random() * 0.6),
        size: (o.size ?? 0.3) * (0.7 + Math.random() * 0.6),
        grow: o.grow,
        color: colors[(Math.random() * colors.length) | 0],
        gravity: o.gravity ?? 0,
        drag: o.drag ?? 1.5,
        alpha: o.alpha,
      });
    }
  }

  update(dt: number) {
    this.add.update(dt);
    this.norm.update(dt);
  }

  clear() {
    this.add.clear();
    this.norm.clear();
  }
}
