import * as THREE from 'three';
import { canvasLabel } from './env';

let whiteTex: THREE.Texture | null = null;
function roundedTex(): THREE.Texture {
  if (!whiteTex) {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 16;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff';
    g.beginPath();
    g.roundRect(0, 0, 64, 16, 6);
    g.fill();
    whiteTex = new THREE.CanvasTexture(c);
  }
  return whiteTex;
}

function sprite(color: number, opacity = 1): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: roundedTex(), color, transparent: true, opacity, depthTest: false, depthWrite: false }));
  s.renderOrder = 20;
  return s;
}

/** Полоска здоровья над головой (спрайты всегда смотрят в камеру). */
export class HpBar {
  readonly group = new THREE.Group();
  private bg: THREE.Sprite;
  private fill: THREE.Sprite;
  private lag: THREE.Sprite;
  private shield: THREE.Sprite;
  private w: number;
  private h: number;
  private lagFrac = 1;
  private shown = 1;
  constructor(width: number, color: number, height = 0.16) {
    this.w = width;
    this.h = height;
    this.bg = sprite(0x1a1210, 0.85);
    this.bg.scale.set(width + 0.08, height + 0.08, 1);
    this.lag = sprite(0xffffff, 0.9);
    this.fill = sprite(color);
    this.shield = sprite(0xb8a0ff, 0.9);
    for (const s of [this.lag, this.fill, this.shield]) {
      s.center.set(0, 0.5);
      s.position.x = -width / 2;
    }
    this.lag.renderOrder = 21;
    this.fill.renderOrder = 22;
    this.shield.renderOrder = 23;
    this.shield.scale.set(0.001, height * 0.45, 1);
    this.shield.position.y = height * 0.25;
    this.group.add(this.bg, this.lag, this.fill, this.shield);
  }
  setColor(c: number) {
    this.fill.material.color.setHex(c);
  }
  set(frac: number, shieldFrac = 0) {
    frac = Math.max(0, Math.min(1, frac));
    this.shown = frac;
    this.fill.scale.set(Math.max(0.001, this.w * frac), this.h, 1);
    this.shield.scale.set(Math.max(0.001, this.w * Math.min(1, shieldFrac)), this.h * 0.45, 1);
    this.shield.visible = shieldFrac > 0.01;
    if (frac > this.lagFrac) this.lagFrac = frac;
  }
  update(dt: number) {
    this.lagFrac += (this.shown - this.lagFrac) * Math.min(1, dt * 3);
    this.lag.scale.set(Math.max(0.001, this.w * this.lagFrac), this.h, 1);
  }
}

export function nameSprite(text: string, color: string): THREE.Sprite {
  const tex = canvasLabel(text, { color, stroke: '#1a1210', w: 512, h: 96 });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  s.scale.set(2.6, 0.49, 1);
  s.renderOrder = 24;
  return s;
}
