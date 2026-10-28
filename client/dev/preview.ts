// Просмотрщик моделей для разработки: /dev/preview.html
import * as THREE from 'three';
import { HeroModel } from '../src/render/heroes';
import { buildWeapon } from '../src/render/equipment';
import { MobModel } from '../src/render/mobs';
import { MinionModel } from '../src/render/minions';
import { makeItem, TEMPLATE_BY_ID, emptyEquip } from '@game/shared';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(innerWidth, innerHeight);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8cc4ea);
const cam = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 100);
cam.position.set(0, 4, 9);
cam.lookAt(0, 1, 0);
scene.add(new THREE.HemisphereLight(0xdff2ff, 0x6a8a4a, 1.6));
const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
sun.position.set(4, 8, 6);
scene.add(sun);
const ground = new THREE.Mesh(new THREE.CircleGeometry(8, 32).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ color: 0x7cc35a }));
scene.add(ground);

const q = new URLSearchParams(location.search);
const rarity = (q.get('r') ?? 'common') as 'common';
const heroes: HeroModel[] = [];
const list = (q.get('cls') ?? 'warrior,mage,archer').split(',') as ('warrior' | 'mage' | 'archer' | 'hunter' | 'summoner')[];
list.forEach((c, i) => {
  const h = new HeroModel(c);
  h.root.position.x = (i - (list.length - 1) / 2) * 2.4;
  h.root.rotation.y = Number(q.get('rot') ?? 0.4);
  if (q.get('eq')) {
    const eq = emptyEquip();
    // ?eq=1&r=epic&armor=plate&helm=helm&boots=greaves&amulet=talisman&w=axe,orb,crossbow
    const weapons = (q.get('w') ?? '').split(',');
    const tpls = [weapons[i] || null, q.get('helm'), q.get('armor'), q.get('boots'), q.get('amulet'), q.get('ring') ?? 'ring'];
    for (const t of tpls) {
      if (!t || t === 'none') continue;
      const it = makeItem(TEMPLATE_BY_ID[t], rarity, 1);
      eq[it.slot] = it;
    }
    h.setEquip(eq);
  }
  scene.add(h.root);
  heroes.push(h);
});
const mobs: MobModel[] = [];
if (q.get('mobs')) {
  heroes.forEach((h) => h.root.removeFromParent());
  heroes.length = 0;
  (['slime', 'goblin', 'skeleton', 'orc', 'troll'] as const).forEach((k, i) => {
    const m = new MobModel(k);
    m.root.position.set((i - 2) * 2.2 + (k === 'troll' ? 0.8 : 0), 0, k === 'troll' ? -2 : 0);
    m.root.rotation.y = Number(q.get('rot') ?? 0.4);
    scene.add(m.root);
    mobs.push(m);
  });
  cam.position.set(0, 5, 12);
  cam.lookAt(0, 1.3, 0);
}
if (q.get('weapons')) {
  // Сетка: 9 видов оружия × 4 редкости
  heroes.forEach((h) => h.root.removeFromParent());
  heroes.length = 0;
  const tpls = (q.get('wl') ?? 'sword,axe,hammer,staff,wand,orb,bow,recurve,crossbow').split(',');
  const rars = ['common', 'rare', 'epic', 'legendary', 'relic'] as const;
  tpls.forEach((t, i) =>
    rars.forEach((r, j) => {
      const w = buildWeapon(t, r, { parts: [], glow: [], spin: [] });
      w.position.set((i - (tpls.length - 1) / 2) * 1.15, 4.2 - j * 1.15 - (t === 'staff' || t === 'totemstaff' ? 0.5 : 0), 0);
      if (t === 'crossbow') w.rotation.set(-Math.PI / 2 + 0.4, 0, 0);
      else if (t === 'bow' || t === 'recurve') w.rotation.set(0, 0, 0);
      w.scale.setScalar(t === 'staff' || t === 'totemstaff' ? 0.7 : 0.95);
      scene.add(w);
    }),
  );
  ground.visible = false;
  cam.position.set(0, 1.6, 11.5);
  cam.lookAt(0, 1.6, 0);
}
const minions: MinionModel[] = [];
if (q.get('minions')) {
  heroes.forEach((h) => h.root.removeFromParent());
  heroes.length = 0;
  (['wolf', 'golem', 'totem'] as const).forEach((k, i) => {
    const m = new MinionModel(k);
    m.root.position.set((i - 1) * 2.6, 0, 0);
    m.root.rotation.y = Number(q.get('rot') ?? 0.4);
    scene.add(m.root);
    minions.push(m);
  });
  cam.position.set(0, 4, 9);
  cam.lookAt(0, 1.1, 0);
}
let last = performance.now();
const cast = q.get('cast');
function loop(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  heroes.forEach((h) => {
    if (cast !== null && Math.random() < 0.01) h.playCast(Number(cast));
    h.update(dt, { speed: Number(q.get('speed') ?? 0), dead: false, stun: false, frozen: false, whirl: false, dash: false, invuln: false, buff: false, demon: q.has('demon') });
  });
  minions.forEach((m) => {
    if (cast !== null && Math.random() < 0.01) m.playAttack();
    m.update(dt, Number(q.get('speed') ?? 0) > 0);
  });
  // ?mobs=1&throw=1 — цикл броска молота: замах 0.9 с, полёт 1.4 с, пауза
  const cyc = (now / 1000) % 3.3;
  const thr = q.has('throw');
  mobs.forEach((m) => {
    if (cast !== null && Math.random() < 0.01) m.playAttack();
    m.update(dt, { moving: Number(q.get('speed') ?? 0) > 0, windup: false, stun: false, frozen: false, burn: false, slow: false, spawning: false, throwWind: thr && cyc < 0.9, hammerOut: thr && cyc >= 0.9 && cyc < 2.3 });
  });
  renderer.render(scene, cam);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
(window as unknown as { ready: boolean }).ready = true;
