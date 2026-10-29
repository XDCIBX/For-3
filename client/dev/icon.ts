// Генератор иконки и заставки приложения (dev/icon.html) — рендерит красного дракона из игры.
import '@fontsource/rubik/900.css';
import * as THREE from 'three';
import { MobModel } from '../src/render/mobs';

const q = new URLSearchParams(location.search);
const fg = q.has('fg');
const bgOnly = q.has('bg');
const splash = q.has('splash');
const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: fg, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight);
const scene = new THREE.Scene();
if (splash) scene.background = new THREE.Color(0x140606);
else if (!fg) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(256, 200, 20, 256, 256, 380);
  gr.addColorStop(0, '#ff8a2a');
  gr.addColorStop(0.35, '#c0300e');
  gr.addColorStop(0.75, '#4a0e06');
  gr.addColorStop(1, '#1a0604');
  g.fillStyle = gr;
  g.fillRect(0, 0, 512, 512);
  // Лучи
  g.globalAlpha = 0.1;
  g.fillStyle = '#ffd080';
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
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
scene.add(new THREE.HemisphereLight(0xffd0a0, 0x4a1008, 1.1));
const sun = new THREE.DirectionalLight(0xffe0b0, 3.2);
sun.position.set(4, 8, 9);
scene.add(sun);
const rim = new THREE.DirectionalLight(0xff7a30, 2.4);
rim.position.set(-6, 3, -6);
scene.add(rim);
const dragon = new MobModel('dragon');
dragon.root.visible = !bgOnly;
// Только сам дракон: без пятна тени, звёзд оглушения и льда
dragon.root.children.forEach((c, i) => (c.visible = i === 0));
scene.add(dragon.root);
// Рёв: голова вверх, пасть раскрыта, крылья распахнуты
const pose = { moving: false, windup: false, stun: false, frozen: false, burn: false, slow: false, spawning: false, skill: 'R' };
for (let i = 0; i < 40; i++) dragon.update(0.03, pose);
dragon.root.updateMatrixWorld(true);
const mouth = dragon.mouthWorld(new THREE.Vector3())!;
let cam: THREE.PerspectiveCamera;
if (splash) {
  dragon.root.rotation.y = 0.12;
  cam = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.1, 200);
  cam.position.set(0.5, 4.2, 15);
  cam.lookAt(0.5, 3.6, 0);
} else {
  // Голова крупным планом в три четверти: камера спереди-сбоку от морды
  dragon.root.rotation.y = -0.4;
  dragon.root.updateMatrixWorld(true);
  const head = (dragon as unknown as { creature: { head: THREE.Object3D } }).creature.head;
  const hp = head.getWorldPosition(new THREE.Vector3());
  const fwd = head.getWorldDirection(new THREE.Vector3());
  const side = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
  const look = hp.clone().addScaledVector(fwd, 0.55);
  cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 100);
  cam.position.copy(look).addScaledVector(fwd, 5.2).addScaledVector(side, 3.0).add(new THREE.Vector3(0, -0.6, 0));
  cam.lookAt(look.x, look.y - (fg ? 0.05 : 0.15), look.z);
}
void mouth;
renderer.render(scene, cam);
if (splash) {
  const t = document.createElement('div');
  t.className = 't';
  t.textContent = '25 WAVES';
  document.body.appendChild(t);
}
