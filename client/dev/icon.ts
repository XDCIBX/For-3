// Генератор иконки и заставки приложения (dev/icon.html) — рендерит героев из игры.
import '@fontsource/rubik/900.css';
import * as THREE from 'three';
import { HeroModel } from '../src/render/heroes';

const q = new URLSearchParams(location.search);
const fg = q.has('fg');
const bgOnly = q.has('bg');
const splash = q.has('splash');
const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: fg, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight);
const scene = new THREE.Scene();
if (splash) scene.background = new THREE.Color(0x1b1330);
else if (!fg) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(256, 200, 20, 256, 256, 380);
  gr.addColorStop(0, '#7a52d8');
  gr.addColorStop(0.55, '#3a2470');
  gr.addColorStop(1, '#1b1330');
  g.fillStyle = gr;
  g.fillRect(0, 0, 512, 512);
  // Лучи
  g.globalAlpha = 0.08;
  g.fillStyle = '#fff';
  for (let i = 0; i < 12; i++) {
    g.beginPath();
    g.moveTo(256, 200);
    const a = (i / 12) * Math.PI * 2;
    g.lineTo(256 + Math.cos(a) * 600, 200 + Math.sin(a) * 600);
    g.lineTo(256 + Math.cos(a + 0.18) * 600, 200 + Math.sin(a + 0.18) * 600);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  scene.background = t;
}
const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 100);
cam.position.set(0, 2.2, splash ? 13 : 8.2);
cam.lookAt(0, splash ? 1.6 : 1.25, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x6a5a8a, 1.8));
const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
sun.position.set(3, 6, 8);
scene.add(sun);
if (!bgOnly) {
  const list = [
    ['warrior', -1.55, 0.2, 0.35],
    ['mage', 0, -0.5, 0],
    ['archer', 1.55, 0.2, -0.35],
  ] as const;
  const heroes = list.map(([c, x, z, r]) => {
    const h = new HeroModel(c);
    h.root.position.set(x, 0, z);
    h.root.rotation.y = r;
    scene.add(h.root);
    return h;
  });
  heroes[0].playCast(3);
  heroes[1].playCast(3);
  for (let i = 0; i < 12; i++) heroes.forEach((h) => h.update(0.03, { speed: 0, dead: false, stun: false, frozen: false, whirl: false, dash: false, invuln: false, buff: false }));
  heroes.forEach((h) => h.root.children[0].visible = false);
}
renderer.render(scene, cam);
if (splash) {
  const t = document.createElement('div');
  t.className = 't';
  t.textContent = 'ТРИ ГЕРОЯ';
  document.body.appendChild(t);
}
