import * as THREE from 'three';
import { MOBS, type GameEvent, type HeroClass, type MinionSnap, type MobSnap, type Phase } from '@game/shared';
import type { ClientState, PlayerInfo } from '../net/state';
import { ArenaStage } from './arena';
import { HpBar, nameSprite } from './bars';
import { Effects, ProjView, ZoneView } from './effects';
import type { Stage } from './env';
import { HeroModel } from './heroes';
import { IslandStage } from './island';
import { MinionModel } from './minions';
import { MobModel } from './mobs';
import { Particles } from './particles';
import { TavernStage } from './tavern';
import { FADE_R, FOCUS, TIME, glow } from './toon';
import { generateWorld } from '@game/shared';

const lerpAngle = (a: number, b: number, t: number) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

class HeroView {
  model: HeroModel;
  bar: HpBar;
  label: THREE.Sprite | null = null;
  labelKey = '';
  fx = 0;
  fz = 0;
  tx = 0;
  tz = 0;
  rot = 0;
  trot = 0;
  t0 = 0;
  speed = 0;
  info!: PlayerInfo;
  whirlT = 0;
  constructor(cls: HeroClass) {
    this.model = new HeroModel(cls);
    this.bar = new HpBar(1.3, 0x5ad04a);
    this.bar.group.position.y = 2.6;
    this.model.root.add(this.bar.group);
  }
}

class MobView {
  model: MobModel;
  bar: HpBar;
  fx = 0;
  fz = 0;
  tx = 0;
  tz = 0;
  rot = 0;
  trot = 0;
  t0 = 0;
  info: MobSnap;
  lastHp: number;
  constructor(m: MobSnap) {
    this.model = new MobModel(m.k);
    const boss = !!MOBS[m.k].boss;
    this.bar = new HpBar(boss ? 3 : 1.0, boss ? 0xff4a3a : 0xe8463a, boss ? 0.26 : 0.13);
    this.bar.group.position.y = this.model.height + 0.45;
    this.model.root.add(this.bar.group);
    this.info = m;
    this.lastHp = m.hp;
    this.fx = this.tx = m.x;
    this.fz = this.tz = m.z;
    this.rot = this.trot = m.r;
  }
  /** Повторное использование из пула вместо создания новой модели. */
  reuse(m: MobSnap) {
    this.model.reset();
    this.info = m;
    this.lastHp = m.hp;
    this.fx = this.tx = m.x;
    this.fz = this.tz = m.z;
    this.rot = this.trot = m.r;
    this.model.root.position.set(m.x, 0, m.z);
    this.bar.set(1);
  }
}

/** Помощник призывателя. */
class MinionView {
  model: MinionModel;
  bar: HpBar;
  fx = 0;
  fz = 0;
  tx = 0;
  tz = 0;
  rot = 0;
  trot = 0;
  t0 = 0;
  info: MinionSnap;
  lastHp: number;
  constructor(n: MinionSnap) {
    this.model = new MinionModel(n.k);
    this.bar = new HpBar(n.k === 'golem' ? 1.4 : 0.9, 0x6ff0ff, 0.11);
    this.bar.group.position.y = this.model.height + 0.35;
    this.model.root.add(this.bar.group);
    this.info = n;
    this.lastHp = n.hp;
    this.fx = this.tx = n.x;
    this.fz = this.tz = n.z;
    this.rot = this.trot = n.r;
    this.model.root.position.set(n.x, 0, n.z);
  }
}

export interface AimState {
  active: boolean;
  aim: 'dir' | 'point' | 'self';
  dx: number;
  dz: number;
  dist: number;
  range: number;
  radius: number;
  color: number;
}

const MENU_SEED = 20251;

/** Рендер-движок: сцены, сущности, камера, интерполяция. */
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly fx = new Particles();
  readonly effects: Effects;
  stage!: Stage;
  private islands = new Map<number, IslandStage>();
  private tavernStage: TavernStage | null = null;
  private arenaStage: ArenaStage | null = null;
  heroes = new Map<string, HeroView>();
  mobs = new Map<number, MobView>();
  private dying: MobView[] = [];
  /** Пул моделей мобов по видам — без рывков при появлении новой волны. */
  private mobPool = new Map<string, MobView[]>();
  minions = new Map<number, MinionView>();
  private fading: MinionView[] = [];
  projs = new Map<number, ProjView>();
  zones = new Map<number, ZoneView>();
  myId = '';
  /** Предсказанная позиция своего героя (задаётся контроллером). */
  pred: { x: number; z: number; rot: number; moving: number } | null = null;
  private camPos = new THREE.Vector3(0, 20, 20);
  private camLook = new THREE.Vector3();
  mode: 'menu' | 'game' = 'menu';
  private menuHeroes: { model: HeroModel; label: THREE.Sprite | null; key: string }[] = [];
  private menuT = 0;
  private interval = 50;
  private lastSnap = 0;
  private aim: AimState | null = null;
  private aimGroup = new THREE.Group();
  private aimArrow: THREE.Mesh;
  private aimCircle: THREE.Mesh;
  private aimRange: THREE.Mesh;
  private selfRing: THREE.Mesh;
  /** Доли экрана слева (лавка) и справа (панель героя), закрытые интерфейсом таверны. */
  tavernLeft = 0;
  tavernRight = 0;
  /** Сдвиг картинки вправо, чтобы освободить место под панель меню. */
  menuShift = 0;
  private phase: Phase = 'lobby';
  private seed = 0;
  quality: 'high' | 'low' = 'high';

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.5, 400);
    this.effects = new Effects(this.fx);

    // Индикаторы прицеливания
    this.aimArrow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5), glow(0xffffff, 0.35));
    this.aimCircle = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2), glow(0xffffff, 0.6));
    this.aimRange = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 64).rotateX(-Math.PI / 2), glow(0xffffff, 0.35));
    this.aimGroup.add(this.aimArrow, this.aimCircle, this.aimRange);
    this.aimGroup.position.y = 0.1;
    this.aimGroup.visible = false;
    this.selfRing = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.78, 32).rotateX(-Math.PI / 2), glow(0x5aff7a, 0.6));
    this.selfRing.position.y = 0.06;

    this.setStage(this.island(MENU_SEED));
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setQuality(q: 'high' | 'low') {
    this.quality = q;
    this.renderer.shadowMap.enabled = q === 'high';
    this.resize();
    this.stage.shadowsDirty = true;
    // Материалам нужно перекомпилироваться после смены теней
    this.stage.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m && 'needsUpdate' in m) m.needsUpdate = true;
    });
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const base = this.quality === 'high' ? Math.min(window.devicePixelRatio, 2) : Math.min(window.devicePixelRatio, 1.25);
    const dpr = Math.max(0.6, base * this.resScale);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fx.setScale((h * dpr) / (2 * Math.tan((this.camera.fov * Math.PI) / 360)));
  }

  private island(seed: number): IslandStage {
    let s = this.islands.get(seed);
    if (!s) {
      s = new IslandStage(generateWorld(seed));
      this.islands.set(seed, s);
      if (this.islands.size > 2) {
        const first = [...this.islands.keys()].find((k) => k !== seed && k !== MENU_SEED && k !== this.seed);
        if (first !== undefined) this.islands.delete(first);
      }
    }
    return s;
  }

  private setStage(s: Stage) {
    if (this.stage === s) return;
    this.stage = s;
    s.scene.add(this.fx.group, this.aimGroup);
    this.fx.clear();
    this.effects.clear();
    this.effects.scene = s.scene;
    s.shadowsDirty = true;
    for (const h of this.heroes.values()) s.scene.add(h.model.root);
    for (const m of this.mobs.values()) {
      m.model.root.removeFromParent();
      this.releaseMob(m);
    }
    this.mobs.clear();
    for (const p of this.projs.values()) p.obj.removeFromParent();
    this.projs.clear();
    for (const z of this.zones.values()) z.obj.removeFromParent();
    this.zones.clear();
    for (const n of [...this.minions.values(), ...this.fading]) n.model.root.removeFromParent();
    this.minions.clear();
    this.fading = [];
    for (const d of this.dying) {
      d.model.root.removeFromParent();
      this.releaseMob(d);
    }
    this.dying = [];
  }

  // ----------------------------------------------------------------- меню

  /** Герои у костра в меню/лобби. */
  showMenu(list: { cls: HeroClass; name: string | null; me?: boolean }[], seed = MENU_SEED) {
    this.mode = 'menu';
    this.setStage(this.island(seed));
    for (const h of this.heroes.values()) h.model.root.removeFromParent();
    this.heroes.clear();
    const key = list.map((l) => `${l.cls}|${l.name}|${l.me}`).join(';');
    if (this.menuHeroes.map((m) => m.key).join(';') === key && this.menuHeroes[0]?.model.root.parent === this.stage.scene) return;
    for (const m of this.menuHeroes) m.model.root.removeFromParent();
    this.menuHeroes = list.map((l, i) => {
      const model = new HeroModel(l.cls);
      const off = i - (list.length - 1) / 2;
      const meIdx = list.findIndex((x) => x.me);
      if (meIdx >= 0) {
        // В лобби свой герой — в центре, союзники чуть позади
        const others = list.map((_, j) => j).filter((j) => j !== meIdx);
        if (i === meIdx) model.root.position.set(0, 0, 3.4);
        else model.root.position.set(others.indexOf(i) === 0 ? -1.7 : 1.7, 0, 1.5);
      } else model.root.position.set(off * 2.3, 0, 2.6 - Math.abs(off) * 0.6);
      model.root.rotation.y = Math.atan2(-model.root.position.x * 0.5, 10 - model.root.position.z);
      let label: THREE.Sprite | null = null;
      if (l.name) {
        label = nameSprite(l.name, l.me ? '#ffe14a' : '#ffffff');
        label.position.y = 2.6;
        model.root.add(label);
      }
      this.stage.scene.add(model.root);
      return { model, label, key: `${l.cls}|${l.name}|${l.me}` };
    });
  }

  private clearMenu() {
    for (const m of this.menuHeroes) m.model.root.removeFromParent();
    this.menuHeroes = [];
  }

  // ----------------------------------------------------------------- синхронизация

  startGame(seed: number, myId: string) {
    this.seed = seed;
    this.myId = myId;
    this.mode = 'game';
    this.clearMenu();
  }

  stageForPhase(ph: Phase): Stage {
    if (ph === 'tavern') return (this.tavernStage ??= new TavernStage());
    if (ph === 'duel_intro' || ph === 'duel' || ph === 'duel_end') return (this.arenaStage ??= new ArenaStage());
    return this.island(this.seed);
  }

  sync(st: ClientState) {
    const now = performance.now();
    if (this.lastSnap) this.interval = this.interval * 0.9 + Math.min(150, now - this.lastSnap) * 0.1;
    this.lastSnap = now;
    this.phase = st.phase;
    if (this.mode !== 'game') return;
    this.setStage(this.stageForPhase(st.phase));
    const inTavern = st.phase === 'tavern';

    // Герои
    for (const [id, p] of st.players) {
      let v = this.heroes.get(id);
      if (!v || v.model.cls !== p.c) {
        v?.model.root.removeFromParent();
        v = new HeroView(p.c);
        v.fx = v.tx = p.x;
        v.fz = v.tz = p.z;
        v.rot = v.trot = p.r;
        this.heroes.set(id, v);
        this.stage.scene.add(v.model.root);
      }
      v.info = p;
      if (p.eq) v.model.setEquip(p.eq);
      const d = Math.hypot(p.x - v.tx, p.z - v.tz);
      if (d > 6) {
        // Телепорт (новый раунд/арена)
        v.fx = p.x;
        v.fz = p.z;
      } else {
        v.fx = v.model.root.position.x;
        v.fz = v.model.root.position.z;
      }
      v.speed = d / (this.interval / 1000) / Math.max(1, p.stats?.speed ?? 5.5);
      v.tx = p.x;
      v.tz = p.z;
      v.trot = p.r;
      v.t0 = now;
      const isMe = id === this.myId;
      const labelKey = `${p.n}|${isMe}|${inTavern}`;
      if (labelKey !== v.labelKey) {
        v.label?.removeFromParent();
        v.label = nameSprite(p.n, isMe ? '#ffe14a' : '#ffffff');
        v.label.position.y = 3.3;
        v.model.root.add(v.label);
        v.labelKey = labelKey;
      }
      const enemy = st.phase.startsWith('duel') && !isMe;
      v.bar.setColor(isMe ? 0x5ad04a : enemy ? 0xe8463a : 0x4aa8ff);
      v.bar.set(p.hp / Math.max(1, p.mhp), p.shm ? p.sh / p.mhp : 0);
      const hidden = (!p.con && !p.bot) || p.st.includes('x');
      v.model.root.visible = !hidden;
      v.bar.group.visible = !inTavern && p.al;
      if (isMe) {
        if (this.selfRing.parent !== v.model.root) v.model.root.add(this.selfRing);
        this.selfRing.visible = !inTavern;
      }
    }
    for (const [id, v] of this.heroes) {
      if (!st.players.has(id)) {
        v.model.root.removeFromParent();
        this.heroes.delete(id);
      }
    }

    const s = st.snap!;
    // Мобы
    const seen = new Set<number>();
    for (const m of s.M) {
      seen.add(m.id);
      let v = this.mobs.get(m.id);
      if (!v) {
        const pooled = this.mobPool.get(m.k)?.pop();
        if (pooled) pooled.reuse(m);
        v = pooled ?? new MobView(m);
        this.mobs.set(m.id, v);
        this.stage.scene.add(v.model.root);
      }
      v.fx = v.model.root.position.x;
      v.fz = v.model.root.position.z;
      v.tx = m.x;
      v.tz = m.z;
      v.trot = m.r;
      v.t0 = now;
      if (m.hp < v.lastHp) v.model.pop();
      v.lastHp = m.hp;
      v.info = m;
      v.bar.set(m.hp / m.mhp);
      v.bar.group.visible = m.hp < m.mhp || !!MOBS[m.k].boss;
    }
    for (const [id, v] of this.mobs) {
      if (!seen.has(id)) {
        this.mobs.delete(id);
        v.model.dying = 0.001;
        v.bar.group.visible = false;
        this.dying.push(v);
      }
    }
    // Помощники
    const nseen = new Set<number>();
    for (const n of s.S ?? []) {
      nseen.add(n.id);
      let v = this.minions.get(n.id);
      if (!v) {
        v = new MinionView(n);
        this.minions.set(n.id, v);
        this.stage.scene.add(v.model.root);
      }
      v.fx = v.model.root.position.x;
      v.fz = v.model.root.position.z;
      v.tx = n.x;
      v.tz = n.z;
      v.trot = n.r;
      v.t0 = now;
      if (n.hp < v.lastHp) v.model.pop();
      v.lastHp = n.hp;
      v.info = n;
      const mine = n.o === this.myId;
      const enemy = st.phase.startsWith('duel') && !mine;
      v.bar.setColor(enemy ? 0xe8463a : mine ? 0x6ff0ff : 0x4aa8ff);
      v.bar.set(n.hp / Math.max(1, n.mhp));
      v.bar.group.visible = n.k !== 'totem' && n.hp < n.mhp;
    }
    for (const [id, v] of this.minions) {
      if (!nseen.has(id)) {
        this.minions.delete(id);
        v.model.dying = 0.001;
        v.bar.group.visible = false;
        this.fading.push(v);
      }
    }
    // Снаряды
    const pseen = new Set<number>();
    for (const p of s.R) {
      pseen.add(p.id);
      let v = this.projs.get(p.id);
      if (!v) {
        v = new ProjView(p.k);
        this.projs.set(p.id, v);
        this.stage.scene.add(v.obj);
      }
      v.x = p.x;
      v.z = p.z;
      v.vx = p.vx;
      v.vz = p.vz;
      v.t0 = now;
    }
    for (const [id, v] of this.projs) {
      if (!pseen.has(id)) {
        v.obj.removeFromParent();
        this.projs.delete(id);
      }
    }
    // Зоны
    const zseen = new Set<number>();
    for (const z of s.Z) {
      zseen.add(z.id);
      let v = this.zones.get(z.id);
      if (!v) {
        v = new ZoneView(z);
        this.zones.set(z.id, v);
        this.stage.scene.add(v.obj);
      }
      v.data = z;
      if (Math.abs(v.localT - z.t) > 0.25) v.localT = z.t;
    }
    for (const [id, v] of this.zones) {
      if (!zseen.has(id)) {
        v.obj.removeFromParent();
        this.zones.delete(id);
      }
    }
  }

  /** Магическая цепь, по которой молот возвращается к боссу. */
  private tethers: THREE.Mesh[] = [];
  private updateTethers() {
    let n = 0;
    const hand = new THREE.Vector3();
    for (const p of this.projs.values()) {
      if (p.kind !== 'hammer') continue;
      let boss: MobView | null = null;
      let bd = Infinity;
      for (const m of this.mobs.values()) {
        if (!m.info.st.includes('h')) continue;
        const d = Math.hypot(m.model.root.position.x - p.x, m.model.root.position.z - p.z);
        if (d < bd) {
          bd = d;
          boss = m;
        }
      }
      if (!boss) continue;
      // Цепь видна, только когда молот летит обратно
      const bp = boss.model.root.position;
      if (p.vx * (bp.x - p.x) + p.vz * (bp.z - p.z) <= 0) continue;
      let t = this.tethers[n];
      if (!t) {
        t = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2), glow(0xffc040, 0.55));
        this.tethers.push(t);
      }
      if (t.parent !== this.stage.scene) this.stage.scene.add(t);
      t.visible = true;
      boss.model.handWorld(hand);
      const to = p.obj.position;
      t.position.copy(hand);
      const len = hand.distanceTo(to);
      t.scale.set(0.06 + Math.sin(performance.now() / 40) * 0.02, 0.06, Math.max(0.01, len));
      t.lookAt(to);
      if (Math.random() < 0.5) {
        const k = Math.random();
        this.fx.glow({ x: hand.x + (to.x - hand.x) * k, y: hand.y + (to.y - hand.y) * k, z: hand.z + (to.z - hand.z) * k, vy: 0.3, life: 0.3, size: 0.18, color: 0xffd060 });
      }
      n++;
    }
    for (let i = n; i < this.tethers.length; i++) this.tethers[i].visible = false;
  }

  private releaseMob(v: MobView) {
    let pool = this.mobPool.get(v.info.k);
    if (!pool) this.mobPool.set(v.info.k, (pool = []));
    if (pool.length < 40) pool.push(v);
  }

  heroPos(id: string): THREE.Vector3 | null {
    const v = this.heroes.get(id);
    return v ? v.model.root.position : null;
  }

  /** Визуальные реакции на игровые события. */
  onEvents(events: GameEvent[]) {
    for (const e of events) {
      switch (e.e) {
        case 'cast': {
          const h = this.heroes.get(e.pid);
          if (!h) break;
          h.model.playCast(e.s);
          if (e.pid !== this.myId || !this.pred) h.rot = e.r;
          const hp = h.model.root.position;
          this.effects.cast(h.model.cls, e.s, hp.x, hp.z);
          break;
        }
        case 'fx': {
          const hv = e.pid ? this.heroes.get(e.pid) : null;
          switch (e.k) {
            case 'slash':
              this.effects.slash(e.x, e.z, e.rot ?? 0, hv?.model.weaponTpl === 'axe' ? 0xffd0a0 : 0xffffff);
              break;
            case 'charge':
              this.effects.charge(e.x, e.z, e.rot ?? 0);
              break;
            case 'whirl':
              if (hv) hv.whirlT = 2;
              break;
            case 'warcry':
              this.effects.warcry(e.x, e.z, e.r ?? 9);
              if (this.arenaStage) this.arenaStage.excitement = 1;
              break;
            case 'nova':
              this.effects.nova(e.x, e.z, e.r ?? 5);
              break;
            case 'explode':
              this.effects.explosion(e.x, e.z, e.r ?? 2.8);
              break;
            case 'meteor':
              this.effects.meteor(e.x, e.z, e.r ?? 3.5);
              break;
            case 'slam':
              this.effects.slam(e.x, e.z, e.r ?? 4.5);
              break;
            case 'roll':
              this.effects.dust(e.x, e.z, 8);
              break;
            case 'twin':
              this.effects.twin(e.x, e.z, e.rot ?? 0);
              break;
            case 'shadow':
              this.effects.shadowDash(e.x, e.z, e.rot ?? 0);
              break;
            case 'demon':
              this.effects.demon(e.x, e.z, e.r ?? 3);
              if (this.arenaStage) this.arenaStage.excitement = 1;
              break;
            case 'hwind':
              this.effects.hammerLane(e.x, e.z, e.rot ?? 0, e.r ?? 10, 0.9);
              break;
            case 'hthrow':
              this.effects.hammerThrow(e.x, e.z, e.rot ?? 0);
              break;
            case 'hturn':
              this.effects.hammerTurn(e.x, e.z);
              break;
            case 'hcatch': {
              const mv = e.id !== undefined ? this.mobs.get(e.id) : undefined;
              const hp = mv ? mv.model.handWorld(new THREE.Vector3()) : new THREE.Vector3(e.x, 3, e.z);
              this.effects.hammerCatch(hp.x, hp.y, hp.z);
              break;
            }
            case 'tpulse':
              this.effects.totemPulse(e.x, e.z, e.r ?? 5.5);
              if (e.id !== undefined) this.minions.get(e.id)?.model.playAttack();
              break;
            case 'gslam':
              this.effects.golemSlam(e.x, e.z, e.r ?? 2.2);
              break;
            case 'spawn':
              this.effects.spawn(e.x, e.z);
              break;
            case 'bossspawn':
              this.effects.spawn(e.x, e.z, true);
              break;
          }
          break;
        }
        case 'matk':
          this.mobs.get(e.id)?.model.playAttack();
          break;
        case 'natk':
          this.minions.get(e.id)?.model.playAttack();
          break;
        case 'summon':
          this.effects.summon(e.x, e.z, e.k !== 'wolf');
          break;
        case 'ndie':
          this.effects.unsummon(e.x, e.z);
          break;
        case 'hit':
          this.effects.hit(e.x, e.z, e.k);
          break;
        case 'dmg':
          if (e.tp === 'p') {
            this.heroes.get(String(e.id))?.model.pop();
            this.effects.blood(e.x, e.z, 'hero');
          } else if (e.tp === 'n') {
            this.minions.get(Number(e.id))?.model.pop();
          } else {
            const m = this.mobs.get(Number(e.id));
            if (m) this.effects.blood(e.x, e.z, m.info.k);
          }
          break;
        case 'mdie': {
          this.effects.death(e.x, e.z, e.k);
          const killer = e.by;
          const n = e.k === 'troll' ? 14 : e.k === 'orc' ? 5 : 3;
          if (killer) this.effects.coins(e.x, e.z, n, () => this.heroPos(killer));
          break;
        }
        case 'respawn': {
          const p = this.heroPos(e.pid);
          if (p) this.effects.respawn(p.x, p.z);
          break;
        }
        case 'pdie': {
          const p = this.heroPos(e.pid);
          if (p) this.fx.burst(p.x, 1, p.z, { n: 20, speed: 2, up: 3, life: 1, size: 0.3, colors: [0xffffff, 0xd8d0c8], alpha: 0.7 }, false);
          if (this.arenaStage && this.phase.startsWith('duel')) this.arenaStage.excitement = 1.5;
          break;
        }
        case 'buy': {
          const h = this.heroes.get(e.pid);
          if (h) {
            h.model.cheer();
            const p = h.model.root.position;
            const col = { common: 0xc9d3da, rare: 0x47a8ff, epic: 0xbe6bff, legendary: 0xffb321, relic: 0xff3b3b }[e.rarity] ?? 0xffffff;
            this.effects.sparkle(p.x, 1.2, p.z, col);
          }
          break;
        }
        case 'duel':
          if (this.arenaStage) this.arenaStage.excitement = 2;
          break;
      }
    }
  }

  setAim(a: AimState | null) {
    this.aim = a;
  }

  shake(v: number) {
    this.effects.shake = Math.max(this.effects.shake, v);
  }

  worldToScreen(x: number, y: number, z: number, out: { x: number; y: number; vis: boolean }) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    out.x = (v.x * 0.5 + 0.5) * window.innerWidth;
    out.y = (-v.y * 0.5 + 0.5) * window.innerHeight;
    out.vis = v.z < 1 && v.z > -1;
    return out;
  }

  /** Перевод точки экрана в точку на земле (для мыши). */
  screenToGround(sx: number, sy: number): THREE.Vector3 | null {
    const ndc = new THREE.Vector2((sx / window.innerWidth) * 2 - 1, -(sy / window.innerHeight) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const p = new THREE.Vector3();
    return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p);
  }

  // ----------------------------------------------------------------- кадр

  /** Динамическое разрешение: при просадке FPS рендерим в меньшем разрешении. */
  resScale = 1;
  private perf = { last: 0, ema: 16, t: 0 };

  private adaptResolution(now: number) {
    const p = this.perf;
    const real = p.last ? now - p.last : 16;
    p.last = now;
    if (real > 250) return; // вкладка была в фоне
    p.ema = p.ema * 0.93 + real * 0.07;
    p.t += real;
    if (p.t < 1200) return;
    p.t = 0;
    const prev = this.resScale;
    if (p.ema > 22 && this.resScale > 0.5) this.resScale = Math.max(0.5, this.resScale - 0.15);
    else if (p.ema < 17.5 && this.resScale < 1) this.resScale = Math.min(1, this.resScale + 0.1);
    if (prev !== this.resScale) this.resize();
  }

  frame(dt: number) {
    const now = performance.now();
    this.adaptResolution(now);
    TIME.value += dt;
    const k = Math.min(1, (now - this.lastSnap) / Math.max(30, this.interval));
    const inTavern = this.mode === 'game' && this.phase === 'tavern';

    if (this.mode === 'menu') {
      this.menuT += dt;
      for (const m of this.menuHeroes) m.model.update(dt, { speed: 0, dead: false, stun: false, frozen: false, whirl: false, dash: false, invuln: false, buff: false });
    }

    // Герои (в таверне свой герой — в центре)
    const order = [...this.heroes.keys()].sort((a, b) => (a === this.myId ? -1 : b === this.myId ? 1 : 0));
    const tavernSlot = (id: string) => [1, 0, 2][order.indexOf(id)] ?? 0;
    for (const [id, v] of this.heroes) {
      const p = v.info;
      const root = v.model.root;
      const isMe = id === this.myId;
      let speed = v.speed;
      if (inTavern) {
        const ts = (this.tavernStage as TavernStage).slots[tavernSlot(id)];
        root.position.copy(ts);
        v.rot = lerpAngle(v.rot, 0, Math.min(1, dt * 6));
        speed = 0;
      } else if (isMe && this.pred && p.al) {
        root.position.set(this.pred.x, 0, this.pred.z);
        v.rot = lerpAngle(v.rot, this.pred.rot, Math.min(1, dt * 18));
        speed = this.pred.moving;
      } else {
        root.position.set(v.fx + (v.tx - v.fx) * k, 0, v.fz + (v.tz - v.fz) * k);
        v.rot = lerpAngle(v.rot, v.trot, Math.min(1, dt * 14));
        if (now - v.t0 > 200) speed = 0;
      }
      root.rotation.y = v.rot;
      v.bar.group.rotation.y = -v.rot;
      v.whirlT = p.st.includes('w') ? Math.max(v.whirlT, 0.1) : 0;
      if (v.whirlT > 0 && Math.random() < dt * 14) this.effects.whirlTrail(root.position.x, root.position.z);
      v.model.update(dt, {
        speed,
        dead: !p.al,
        stun: p.st.includes('s'),
        frozen: p.st.includes('f'),
        whirl: p.st.includes('w'),
        dash: p.st.includes('d'),
        invuln: p.st.includes('i'),
        buff: p.st.includes('c') || p.st.includes('r'),
        demon: p.st.includes('m'),
      });
      if (p.st.includes('m') && Math.random() < dt * 18) this.fx.glow({ x: root.position.x + (Math.random() - 0.5) * 0.8, y: 0.3 + Math.random() * 1.4, z: root.position.z + (Math.random() - 0.5) * 0.8, vy: 2, life: 0.5, size: 0.2, grow: -0.3, color: Math.random() < 0.7 ? 0x5dff8a : 0xb070ff });
      v.bar.update(dt);
      if (p.st.includes('h') && Math.random() < dt * 20) this.fx.glow({ x: root.position.x, y: 0.3 + Math.random(), z: root.position.z, vy: 1.5, life: 0.4, size: 0.15, color: 0x7aff9a });
      if (p.st.includes('l') && Math.random() < dt * 12) this.fx.glow({ x: root.position.x + (Math.random() - 0.5), y: 0.2, z: root.position.z + (Math.random() - 0.5), vy: 0.5, life: 0.5, size: 0.15, color: 0x7ac8ff });
      if (p.st.includes('d') && Math.random() < dt * 40) this.effects.dust(root.position.x, root.position.z, 2);
    }
    // Мобы
    for (const v of this.mobs.values()) {
      const root = v.model.root;
      root.position.set(v.fx + (v.tx - v.fx) * k, 0, v.fz + (v.tz - v.fz) * k);
      v.rot = lerpAngle(v.rot, v.trot, Math.min(1, dt * 10));
      root.rotation.y = v.rot;
      v.bar.group.rotation.y = -v.rot;
      const st = v.info.st;
      const moving = Math.hypot(v.tx - v.fx, v.tz - v.fz) > 0.02 && now - v.t0 < 200;
      v.model.update(dt, {
        moving,
        windup: st.includes('w'),
        throwWind: st.includes('t'),
        hammerOut: st.includes('h'),
        stun: st.includes('s'),
        frozen: st.includes('f'),
        burn: st.includes('b'),
        slow: st.includes('l'),
        spawning: st.includes('p'),
      });
      v.bar.update(dt);
      if (st.includes('b') && Math.random() < dt * 25) this.fx.glow({ x: root.position.x + (Math.random() - 0.5) * 0.6, y: 0.4 + Math.random() * v.model.height * 0.6, z: root.position.z + (Math.random() - 0.5) * 0.6, vy: 1.5, life: 0.5, size: 0.3, grow: -0.4, color: 0xff7020 });
      if (st.includes('l') && Math.random() < dt * 8) this.fx.glow({ x: root.position.x, y: 0.2, z: root.position.z, vy: 0.4, life: 0.5, size: 0.15, color: 0x7ac8ff });
      if (MOBS[v.info.k].boss && moving && Math.random() < dt * 6) this.effects.dust(root.position.x, root.position.z, 2);
    }
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const v = this.dying[i];
      v.model.update(dt, { moving: false, windup: false, stun: false, frozen: false, burn: false, slow: false, spawning: false });
      if (v.model.dying > 0.75) {
        v.model.root.removeFromParent();
        this.dying.splice(i, 1);
        this.releaseMob(v);
      }
    }
    // Помощники
    for (const v of this.minions.values()) {
      const root = v.model.root;
      root.position.set(v.fx + (v.tx - v.fx) * k, 0, v.fz + (v.tz - v.fz) * k);
      v.rot = lerpAngle(v.rot, v.trot, Math.min(1, dt * 12));
      root.rotation.y = v.rot;
      v.bar.group.rotation.y = -v.rot;
      const moving = Math.hypot(v.tx - v.fx, v.tz - v.fz) > 0.02 && now - v.t0 < 200;
      v.model.update(dt, moving);
      v.bar.update(dt);
      if (v.info.k === 'wolf' && Math.random() < dt * 6) this.fx.glow({ x: root.position.x + (Math.random() - 0.5) * 0.5, y: 0.4 + Math.random() * 0.5, z: root.position.z + (Math.random() - 0.5) * 0.5, vy: 0.8, life: 0.6, size: 0.14, color: 0x6ff0ff });
      if (v.info.k === 'totem' && Math.random() < dt * 5) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * 5;
        this.fx.glow({ x: root.position.x + Math.cos(a) * d, y: 0.15, z: root.position.z + Math.sin(a) * d, vy: 1.4, life: 0.8, size: 0.16, color: 0x7aff9a });
      }
    }
    for (let i = this.fading.length - 1; i >= 0; i--) {
      const v = this.fading[i];
      v.model.update(dt, false);
      if (v.model.dying > 0.45) {
        v.model.root.removeFromParent();
        this.fading.splice(i, 1);
      }
    }
    for (const p of this.projs.values()) p.update(dt, now, this.fx);
    this.updateTethers();
    for (const z of this.zones.values()) z.update(dt, this.fx);

    this.stage.update(dt, this.fx);
    this.fx.update(dt);
    this.effects.update(dt);
    this.updateAim();
    this.updateCamera(dt);

    if (this.stage.shadowsDirty && this.renderer.shadowMap.enabled) {
      this.renderer.shadowMap.needsUpdate = true;
      this.stage.shadowsDirty = false;
    }
    this.renderer.render(this.stage.scene, this.camera);
  }

  private updateAim() {
    const a = this.aim;
    const me = this.heroes.get(this.myId);
    if (!a || !a.active || !me) {
      this.aimGroup.visible = false;
      return;
    }
    this.aimGroup.visible = true;
    const p = me.model.root.position;
    this.aimGroup.position.set(p.x, 0.1, p.z);
    for (const m of [this.aimArrow, this.aimCircle, this.aimRange]) (m.material as THREE.MeshBasicMaterial).color.setHex(a.color);
    this.aimRange.visible = a.range > 0;
    this.aimRange.scale.setScalar(Math.max(0.01, a.range));
    if (a.aim === 'dir') {
      this.aimArrow.visible = true;
      this.aimCircle.visible = false;
      this.aimArrow.scale.set(0.7, 1, Math.max(1, a.range));
      this.aimArrow.rotation.y = Math.atan2(a.dx, a.dz);
    } else if (a.aim === 'point') {
      this.aimArrow.visible = false;
      this.aimCircle.visible = true;
      this.aimCircle.position.set(a.dx * a.dist, 0, a.dz * a.dist);
      this.aimCircle.scale.setScalar(a.radius);
    } else {
      this.aimArrow.visible = false;
      this.aimCircle.visible = true;
      this.aimCircle.position.set(0, 0, 0);
      this.aimCircle.scale.setScalar(a.radius);
      this.aimRange.visible = false;
    }
  }

  private updateCamera(dt: number) {
    const cam = this.camera;
    const aspect = cam.aspect;
    const zoom = Math.min(1.9, Math.max(1, Math.pow(1.75 / aspect, 0.7)));
    const target = new THREE.Vector3();
    let offset: THREE.Vector3;
    cam.clearViewOffset();
    FADE_R.value = 0;
    if (this.mode === 'menu') {
      const sway = Math.sin(this.menuT * 0.15) * 1.6;
      cam.position.set(sway, 3.4 * zoom, 2.6 + 7.6 * zoom);
      cam.lookAt(sway * 0.3, 1.25, 1.6);
      if (this.menuShift > 0) {
        const w = window.innerWidth;
        const h = window.innerHeight;
        cam.setViewOffset(w, h, -w * this.menuShift * 0.5, 0, w, h);
      }
      return;
    }
    if (this.phase === 'tavern') {
      // Отдаляем камеру, чтобы трое героев поместились в видимую часть экрана
      const visible = Math.max(0.2, 1 - this.tavernLeft - this.tavernRight);
      const far = Math.max(10.5, 7.6 / (visible * 2 * Math.tan((cam.fov * Math.PI) / 360) * aspect));
      cam.position.set(0, 3.2 + far * 0.12, far);
      cam.lookAt(0, 1.4, 0);
      if (this.tavernLeft > 0 || this.tavernRight > 0) {
        // Центрируем сцену в свободном промежутке между панелями
        const w = window.innerWidth;
        const h = window.innerHeight;
        const cx = (this.tavernLeft + 1 - this.tavernRight) / 2;
        cam.setViewOffset(w, h, -w * (cx - 0.5), h * 0.04, w, h);
      }
      return;
    }
    const me = this.heroes.get(this.myId);
    const duelists = this.phase.startsWith('duel') ? [...this.heroes.values()].filter((h) => !h.info.st.includes('x')) : [];
    if (me && !me.info.st.includes('x')) target.copy(me.model.root.position);
    else if (duelists.length) {
      for (const d of duelists) target.add(d.model.root.position);
      target.multiplyScalar(1 / duelists.length);
    }
    if (this.phase.startsWith('duel')) {
      offset = new THREE.Vector3(0, 18, 13).multiplyScalar(zoom);
      target.lerp(new THREE.Vector3(0, 0, 0), 0.35);
    } else offset = new THREE.Vector3(0, 14.5, 12).multiplyScalar(zoom);
    const want = target.clone().add(offset);
    const kk = 1 - Math.exp(-dt * 6);
    if (this.camPos.distanceTo(want) > 30) this.camPos.copy(want);
    else this.camPos.lerp(want, kk);
    this.camLook.lerp(target.clone().setY(0.8), this.camLook.distanceTo(target) > 30 ? 1 : kk);
    cam.position.copy(this.camPos);
    const sh = this.effects.shake;
    if (sh > 0) {
      cam.position.x += (Math.random() - 0.5) * sh * 0.6;
      cam.position.y += (Math.random() - 0.5) * sh * 0.6;
    }
    cam.lookAt(this.camLook);
    FOCUS.value.set(target.x, 1.2, target.z);
    FADE_R.value = 2.6;
  }
}
