import * as THREE from 'three';
import { Rng } from '@game/shared';

/**
 * Процедурные текстуры: рисуются на canvas при запуске, без файлов.
 * Поверхностные текстуры светлые (0.7–1.0), чтобы умножаться на цвет материала
 * и добавлять детали, не меняя палитру.
 */

type Draw = (g: CanvasRenderingContext2D, s: number, r: Rng) => void;

const cache = new Map<string, THREE.CanvasTexture>();

function make(key: string, size: number, draw: Draw, repeat = true): THREE.CanvasTexture {
  let t = cache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  draw(g, size, new Rng(key.length * 7919 + size));
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  cache.set(key, t);
  return t;
}

const grey = (v: number, a = 1) => {
  const c = Math.round(Math.max(0, Math.min(1, v)) * 255);
  return `rgba(${c},${c},${c},${a})`;
};

/** Мягкие пятна — основа для «живой» поверхности. */
function blotches(g: CanvasRenderingContext2D, s: number, r: Rng, n: number, lo: number, hi: number, rad: [number, number]) {
  for (let i = 0; i < n; i++) {
    const x = r.range(0, s);
    const y = r.range(0, s);
    const rr = r.range(rad[0], rad[1]) * s;
    const v = r.range(lo, hi);
    // рисуем с переносом по краям, чтобы текстура тайлилась бесшовно
    for (const dx of [-s, 0, s])
      for (const dy of [-s, 0, s]) {
        const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rr);
        gr.addColorStop(0, grey(v, 0.35));
        gr.addColorStop(1, grey(v, 0));
        g.fillStyle = gr;
        g.fillRect(x + dx - rr, y + dy - rr, rr * 2, rr * 2);
      }
  }
}

// ------------------------------------------------------------------ поверхности

export function grassTex() {
  return make('grass', 512, (g, s, r) => {
    g.fillStyle = grey(0.92);
    g.fillRect(0, 0, s, s);
    blotches(g, s, r, 40, 0.75, 1.0, [0.05, 0.18]);
    // травинки
    g.lineCap = 'round';
    for (let i = 0; i < 2600; i++) {
      const x = r.range(0, s);
      const y = r.range(0, s);
      const len = r.range(5, 14);
      const a = -Math.PI / 2 + r.range(-0.5, 0.5);
      g.strokeStyle = grey(r.range(0.68, 1.0), 0.8);
      g.lineWidth = r.range(1.2, 2.4);
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + r.range(-2, 2), y + Math.sin(a) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len);
      g.stroke();
    }
    // клеверок
    for (let i = 0; i < 40; i++) {
      const x = r.range(0, s);
      const y = r.range(0, s);
      g.fillStyle = grey(1, 0.5);
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        g.beginPath();
        g.arc(x + Math.cos(a) * 3, y + Math.sin(a) * 3, 2.6, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
}

export function sandTex() {
  return make('sand', 256, (g, s, r) => {
    g.fillStyle = grey(0.93);
    g.fillRect(0, 0, s, s);
    blotches(g, s, r, 20, 0.8, 1, [0.08, 0.25]);
    for (let i = 0; i < 2200; i++) {
      g.fillStyle = grey(r.range(0.65, 1), r.range(0.3, 0.8));
      g.fillRect(r.range(0, s), r.range(0, s), r.range(1, 2.2), r.range(1, 2.2));
    }
    // волнистые следы ветра
    g.strokeStyle = grey(0.78, 0.35);
    g.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      const y0 = r.range(0, s);
      g.beginPath();
      for (let x = -10; x <= s + 10; x += 8) g.lineTo(x, y0 + Math.sin(x * 0.05 + i) * 5);
      g.stroke();
    }
  });
}

export function stoneTex() {
  return make('stone', 512, (g, s, r) => {
    g.fillStyle = grey(0.62);
    g.fillRect(0, 0, s, s);
    const rows = 6;
    const h = s / rows;
    for (let row = 0; row < rows; row++) {
      let x = row % 2 ? -h * 0.7 : 0;
      while (x < s) {
        const w = h * r.range(1.1, 1.9);
        const v = r.range(0.82, 1.0);
        const x0 = x + 3;
        const y0 = row * h + 3;
        const ww = Math.min(w, s - x) - 6;
        g.fillStyle = grey(v);
        g.beginPath();
        g.roundRect(x0, y0, Math.max(4, ww), h - 6, 8);
        g.fill();
        // светлая фаска сверху и тень снизу
        g.fillStyle = grey(1, 0.35);
        g.fillRect(x0 + 4, y0 + 2, Math.max(0, ww - 8), 4);
        g.fillStyle = grey(0.55, 0.35);
        g.fillRect(x0 + 4, y0 + h - 12, Math.max(0, ww - 8), 4);
        // трещинка
        if (r.chance(0.35)) {
          g.strokeStyle = grey(0.55, 0.7);
          g.lineWidth = 1.5;
          g.beginPath();
          let cx = x0 + r.range(10, Math.max(12, ww - 10));
          let cy = y0 + 6;
          g.moveTo(cx, cy);
          for (let k = 0; k < 4; k++) {
            cx += r.range(-8, 8);
            cy += (h - 12) / 4;
            g.lineTo(cx, cy);
          }
          g.stroke();
        }
        x += w;
      }
    }
    blotches(g, s, r, 25, 0.7, 1, [0.05, 0.15]);
  });
}

export function rockTex() {
  return make('rock', 256, (g, s, r) => {
    g.fillStyle = grey(0.9);
    g.fillRect(0, 0, s, s);
    blotches(g, s, r, 40, 0.65, 1, [0.06, 0.2]);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = grey(r.range(0.6, 1), 0.5);
      g.fillRect(r.range(0, s), r.range(0, s), 2, 2);
    }
    g.strokeStyle = grey(0.55, 0.7);
    g.lineWidth = 1.8;
    for (let i = 0; i < 7; i++) {
      let x = r.range(0, s);
      let y = r.range(0, s);
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += r.range(-18, 18);
        y += r.range(-18, 18);
        g.lineTo(x, y);
      }
      g.stroke();
    }
  });
}

export function woodTex() {
  return make('wood', 512, (g, s, r) => {
    const planks = 4;
    const w = s / planks;
    for (let p = 0; p < planks; p++) {
      const v = r.range(0.84, 1);
      g.fillStyle = grey(v);
      g.fillRect(p * w, 0, w, s);
      // волокна
      for (let k = 0; k < 18; k++) {
        const x0 = p * w + r.range(4, w - 4);
        g.strokeStyle = grey(v - r.range(0.08, 0.2), 0.6);
        g.lineWidth = r.range(1, 2.5);
        g.beginPath();
        for (let y = 0; y <= s; y += 16) g.lineTo(x0 + Math.sin(y * 0.02 + k) * 3, y);
        g.stroke();
      }
      // сучок
      if (r.chance(0.7)) {
        const kx = p * w + r.range(15, w - 15);
        const ky = r.range(20, s - 20);
        for (let ring = 3; ring >= 1; ring--) {
          g.strokeStyle = grey(0.6 + ring * 0.08, 0.8);
          g.lineWidth = 2;
          g.beginPath();
          g.ellipse(kx, ky, ring * 4, ring * 7, 0, 0, Math.PI * 2);
          g.stroke();
        }
      }
      // стык досок и гвозди
      g.fillStyle = grey(0.45);
      g.fillRect(p * w, 0, 3, s);
      g.fillStyle = grey(0.5);
      for (const y of [s * 0.1, s * 0.6]) {
        g.beginPath();
        g.arc(p * w + w / 2, y, 3, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
}

export function barkTex() {
  return make('bark', 256, (g, s, r) => {
    g.fillStyle = grey(0.88);
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 70; i++) {
      const x = r.range(0, s);
      g.strokeStyle = grey(r.range(0.55, 0.8), 0.8);
      g.lineWidth = r.range(2, 5);
      g.beginPath();
      let y = r.range(-40, s);
      let cx = x;
      g.moveTo(cx, y);
      const len = r.range(40, 140);
      for (let k = 0; k < len; k += 10) {
        cx += r.range(-2, 2);
        y += 10;
        g.lineTo(cx, y);
      }
      g.stroke();
    }
    blotches(g, s, r, 12, 0.75, 1, [0.1, 0.2]);
  });
}

export function leafTex() {
  return make('leaf', 256, (g, s, r) => {
    g.fillStyle = grey(0.9);
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 260; i++) {
      const x = r.range(0, s);
      const y = r.range(0, s);
      const a = r.range(0, Math.PI * 2);
      const l = r.range(7, 13);
      g.fillStyle = grey(r.range(0.72, 1), 0.75);
      g.save();
      g.translate(x, y);
      g.rotate(a);
      g.beginPath();
      g.ellipse(0, 0, l, l * 0.45, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = grey(0.7, 0.5);
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(-l, 0);
      g.lineTo(l, 0);
      g.stroke();
      g.restore();
    }
  });
}

export function clothTex() {
  return make('cloth', 128, (g, s) => {
    g.fillStyle = grey(0.95);
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < s; i += 4) {
      g.fillStyle = grey(0.86, 0.6);
      g.fillRect(i, 0, 1.5, s);
      g.fillRect(0, i, s, 1.5);
    }
  });
}

// ------------------------------------------------------------------ эффекты (белые маски, тонируются цветом материала)

export function softTex() {
  return make(
    'soft',
    128,
    (g, s) => {
      const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.25, 'rgba(255,255,255,0.75)');
      gr.addColorStop(0.6, 'rgba(255,255,255,0.18)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, s, s);
    },
    false,
  );
}

export function ringTex() {
  return make(
    'ring',
    256,
    (g, s) => {
      const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(0.62, 'rgba(255,255,255,0.05)');
      gr.addColorStop(0.86, 'rgba(255,255,255,0.95)');
      gr.addColorStop(0.92, 'rgba(255,255,255,1)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, s, s);
    },
    false,
  );
}

/** Серп удара: яркий передний край, мягкий хвост. */
export function slashTex() {
  return make(
    'slash',
    256,
    (g, s) => {
      const cx = s / 2;
      const cy = s / 2;
      for (let i = 0; i < 60; i++) {
        const k = i / 60;
        const a0 = -Math.PI * 0.45 + k * Math.PI * 0.9;
        g.strokeStyle = `rgba(255,255,255,${Math.pow(k, 1.6) * 0.95})`;
        g.lineWidth = 4 + k * 38;
        g.beginPath();
        g.arc(cx, cy, s * 0.36, a0, a0 + Math.PI * 0.03);
        g.stroke();
      }
      // тонкая яркая кромка
      g.strokeStyle = 'rgba(255,255,255,1)';
      g.lineWidth = 4;
      g.beginPath();
      g.arc(cx, cy, s * 0.44, -Math.PI * 0.05, Math.PI * 0.45);
      g.stroke();
    },
    false,
  );
}

/** Магический круг с рунами. */
export function runeTex() {
  return make(
    'rune',
    512,
    (g, s, r) => {
      const c = s / 2;
      g.strokeStyle = 'white';
      g.fillStyle = 'white';
      g.lineWidth = 6;
      g.beginPath();
      g.arc(c, c, s * 0.47, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = 3;
      g.beginPath();
      g.arc(c, c, s * 0.4, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.arc(c, c, s * 0.2, 0, Math.PI * 2);
      g.stroke();
      // гексаграмма
      g.lineWidth = 3;
      for (const off of [0, Math.PI / 3]) {
        g.beginPath();
        for (let i = 0; i <= 3; i++) {
          const a = off + (i / 3) * Math.PI * 2 - Math.PI / 2;
          g.lineTo(c + Math.cos(a) * s * 0.4, c + Math.sin(a) * s * 0.4);
        }
        g.stroke();
      }
      // руны по кругу
      const glyphs = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
      g.font = `bold ${Math.round(s * 0.05)}px serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        g.save();
        g.translate(c + Math.cos(a) * s * 0.435, c + Math.sin(a) * s * 0.435);
        g.rotate(a + Math.PI / 2);
        g.fillText(glyphs[(i + r.int(0, 5)) % glyphs.length], 0, 0);
        g.restore();
      }
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        g.beginPath();
        g.arc(c + Math.cos(a) * s * 0.4, c + Math.sin(a) * s * 0.4, s * 0.025, 0, Math.PI * 2);
        g.fill();
      }
    },
    false,
  );
}

/** Иней: кристаллы-снежинки. */
export function frostTex() {
  return make(
    'frost',
    512,
    (g, s, r) => {
      const c = s / 2;
      const gr = g.createRadialGradient(c, c, 0, c, c, c);
      gr.addColorStop(0, 'rgba(255,255,255,0.22)');
      gr.addColorStop(0.7, 'rgba(255,255,255,0.12)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, s, s);
      g.strokeStyle = 'white';
      g.lineCap = 'round';
      for (let i = 0; i < 40; i++) {
        const a = r.range(0, Math.PI * 2);
        const d = r.range(0.05, 0.9) * c;
        const x = c + Math.cos(a) * d;
        const y = c + Math.sin(a) * d;
        const len = r.range(10, 34);
        g.lineWidth = r.range(1.5, 3.5);
        g.globalAlpha = r.range(0.5, 1);
        for (let k = 0; k < 6; k++) {
          const b = (k / 6) * Math.PI * 2;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + Math.cos(b) * len, y + Math.sin(b) * len);
          g.stroke();
          g.beginPath();
          g.moveTo(x + Math.cos(b) * len * 0.55, y + Math.sin(b) * len * 0.55);
          g.lineTo(x + Math.cos(b + 0.5) * len * 0.8, y + Math.sin(b + 0.5) * len * 0.8);
          g.stroke();
        }
      }
      g.globalAlpha = 1;
    },
    false,
  );
}

/** Выжженная земля с трещинами (обычное смешивание, тёмная). */
export function scorchTex() {
  return make(
    'scorch',
    256,
    (g, s, r) => {
      const c = s / 2;
      const gr = g.createRadialGradient(c, c, 0, c, c, c);
      gr.addColorStop(0, 'rgba(45,24,12,0.75)');
      gr.addColorStop(0.45, 'rgba(60,34,18,0.45)');
      gr.addColorStop(0.8, 'rgba(60,34,18,0.12)');
      gr.addColorStop(1, 'rgba(60,34,18,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, s, s);
      g.lineCap = 'round';
      for (let i = 0; i < 7; i++) {
        let a = (i / 7) * Math.PI * 2 + r.range(-0.3, 0.3);
        let x = c + Math.cos(a) * s * 0.05;
        let y = c + Math.sin(a) * s * 0.05;
        for (let k = 0; k < 4; k++) {
          // трещины тоньше и бледнее к краю
          g.strokeStyle = `rgba(25,10,5,${0.7 - k * 0.15})`;
          g.lineWidth = 3 - k * 0.6;
          g.beginPath();
          g.moveTo(x, y);
          a += r.range(-0.45, 0.45);
          x += Math.cos(a) * s * 0.06;
          y += Math.sin(a) * s * 0.06;
          g.lineTo(x, y);
          g.stroke();
        }
      }
      // тлеющие угольки
      for (let i = 0; i < 25; i++) {
        g.fillStyle = `rgba(255,${r.int(90, 160)},40,${r.range(0.4, 0.9)})`;
        const a = r.range(0, Math.PI * 2);
        const d = r.range(0, 0.4) * s;
        g.beginPath();
        g.arc(c + Math.cos(a) * d, c + Math.sin(a) * d, r.range(1.5, 3.5), 0, Math.PI * 2);
        g.fill();
      }
    },
    false,
  );
}

/** Предупреждение об ударе: штриховка по кругу. */
export function dangerTex() {
  return make(
    'danger',
    256,
    (g, s) => {
      const c = s / 2;
      g.save();
      g.beginPath();
      g.arc(c, c, c - 2, 0, Math.PI * 2);
      g.clip();
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(0, 0, s, s);
      g.strokeStyle = 'rgba(255,255,255,0.55)';
      g.lineWidth = 10;
      for (let i = -s; i < s * 2; i += 28) {
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i - s, s);
        g.stroke();
      }
      g.restore();
      g.strokeStyle = 'white';
      g.lineWidth = 8;
      g.beginPath();
      g.arc(c, c, c - 6, 0, Math.PI * 2);
      g.stroke();
    },
    false,
  );
}

/** Вытянутый след (шлейф) для стрел и рывков: прозрачный хвост → яркий нос. */
export function trailTex() {
  return make(
    'trail',
    128,
    (g, s) => {
      const gr = g.createLinearGradient(0, 0, 0, s);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(1, 'rgba(255,255,255,1)');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(s / 2, 0);
      g.lineTo(s * 0.85, s * 0.9);
      g.quadraticCurveTo(s / 2, s * 1.05, s * 0.15, s * 0.9);
      g.closePath();
      g.fill();
    },
    false,
  );
}

/** Копия текстуры с повтором (для больших поверхностей). */
const repCache = new Map<string, THREE.Texture>();
export function repeated(tex: THREE.Texture, rx: number, ry: number): THREE.Texture {
  const key = `${tex.uuid}|${rx}|${ry}`;
  let t = repCache.get(key);
  if (!t) {
    t = tex.clone();
    t.repeat.set(rx, ry);
    t.needsUpdate = true;
    repCache.set(key, t);
  }
  return t;
}

/**
 * Назначает текстуры деталям сцены по их цвету (дерево, камень…),
 * не трогая прозрачные, светящиеся и уже текстурированные материалы.
 */
export function texturize(root: THREE.Object3D, table: Record<number, THREE.Texture>, make: (hex: number, map: THREE.Texture) => THREE.Material) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    const mat = m.material as THREE.MeshToonMaterial | undefined;
    if (!m.isMesh || !mat || !(mat as THREE.Material & { isMeshToonMaterial?: boolean }).isMeshToonMaterial) return;
    if (mat.map || mat.transparent || mat.vertexColors || mat.emissive.getHex() !== 0) return;
    const tex = table[mat.color.getHex()];
    if (tex) m.material = make(mat.color.getHex(), tex);
  });
}
