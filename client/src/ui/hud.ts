import { CLASSES, MAX_ROUNDS, PVP_EVERY, generateWorld, type WorldData } from '@game/shared';
import type { ClientState } from '../net/state';
import type { Engine } from '../render/engine';
import { CLASS_BG, el, esc } from './dom';
import { COIN, SWORDS, classIcon } from './icons';

interface Floater {
  el: HTMLElement;
  x: number;
  y: number;
  z: number;
  t: number;
  dur: number;
  vx: number;
}

/** Игровой интерфейс поверх 3D: здоровье, золото, раунд, команда, мини-карта, сообщения. */
export class Hud {
  readonly el: HTMLElement;
  private engine: Engine;
  private floaters: Floater[] = [];
  private pool: HTMLElement[] = [];
  private flBox: HTMLElement;
  private toastBox: HTMLElement;
  private banner: HTMLElement;
  private mini: HTMLCanvasElement;
  private miniCtx: CanvasRenderingContext2D;
  private world: WorldData | null = null;
  private worldSeed = -1;
  private lastGold = -1;
  private teamKey = '';
  private scr = { x: 0, y: 0, vis: false };
  onPause: () => void = () => {};

  constructor(engine: Engine) {
    this.engine = engine;
    this.el = el(`
      <div class="hud">
        <div class="floaters"></div>
        <div class="me-box">
          <div class="portrait"></div>
          <div class="bars">
            <div class="bar"><i class="lag"></i><i class="hp"></i><i class="sh"></i><span></span></div>
            <div class="gold-box"><span class="coin">${COIN}</span><b>0</b></div>
          </div>
        </div>
        <div class="panel round-box">
          <div class="rt"></div>
          <div class="rs"></div>
          <div class="mobbar"><i></i></div>
        </div>
        <div class="team">
          <div class="row" style="gap:6px">
            <canvas class="minimap" width="160" height="160"></canvas>
            <div class="icon-btn tap" id="pause">❚❚</div>
          </div>
          <div class="mates" style="display:flex;flex-direction:column;gap:5px;align-items:flex-end"></div>
        </div>
        <div class="toasts"></div>
        <div class="banner"></div>
        <div class="respawn" style="display:none"></div>
        <div class="duel-vs" style="display:none"></div>
        <div class="panel spectate" style="display:none">👀 Вы зритель — смотрите дуэль</div>
      </div>`);
    this.flBox = this.el.querySelector('.floaters')!;
    this.toastBox = this.el.querySelector('.toasts')!;
    this.banner = this.el.querySelector('.banner')!;
    this.mini = this.el.querySelector('.minimap')!;
    this.miniCtx = this.mini.getContext('2d')!;
    this.el.querySelector('#pause')!.addEventListener('click', () => this.onPause());
  }

  showBanner(text: string, sub = '', color = 'var(--gold)') {
    this.banner.innerHTML = `${esc(text)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
    this.banner.style.color = color;
    this.banner.classList.remove('show');
    void this.banner.offsetWidth;
    this.banner.classList.add('show');
  }

  toast(text: string, kind = 'info') {
    const t = el(`<div class="toast ${kind}">${esc(text)}</div>`);
    this.toastBox.appendChild(t);
    while (this.toastBox.children.length > 4) this.toastBox.firstElementChild!.remove();
    setTimeout(() => t.remove(), 3300);
  }

  /** Всплывающее число/текст над точкой мира. */
  float(text: string, cls: string, x: number, y: number, z: number, dur = 0.9) {
    if (this.floaters.length > 60) return;
    const e = this.pool.pop() ?? document.createElement('div');
    e.className = `fl ${cls}`;
    e.textContent = text;
    e.style.opacity = '1';
    this.flBox.appendChild(e);
    this.floaters.push({ el: e, x, y, z, t: 0, dur, vx: (Math.random() - 0.5) * 30 });
  }

  bumpGold() {
    const g = this.el.querySelector('.gold-box')!;
    g.classList.remove('bump');
    void (g as HTMLElement).offsetWidth;
    g.classList.add('bump');
  }

  update(dt: number, st: ClientState, cdLeft: number[]) {
    void cdLeft;
    const me = st.me;
    // Плавающие числа
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.t += dt;
      const k = f.t / f.dur;
      if (k >= 1) {
        f.el.remove();
        this.pool.push(f.el);
        this.floaters.splice(i, 1);
        continue;
      }
      this.engine.worldToScreen(f.x, f.y, f.z, this.scr);
      const rise = k * 50;
      const s = k < 0.15 ? 0.6 + (k / 0.15) * 0.6 : 1.2 - Math.min(0.2, (k - 0.15) * 0.5);
      f.el.style.transform = `translate(${this.scr.x + f.vx * k}px, ${this.scr.y - rise}px) translate(-50%,-50%) scale(${s})`;
      f.el.style.opacity = k > 0.7 ? String(1 - (k - 0.7) / 0.3) : '1';
    }
    if (!me) return;

    // Портрет и здоровье
    const portrait = this.el.querySelector<HTMLElement>('.portrait')!;
    if (portrait.dataset.c !== me.c) {
      portrait.dataset.c = me.c;
      portrait.style.background = CLASS_BG[me.c];
      portrait.innerHTML = classIcon(me.c);
    }
    const hpFrac = Math.max(0, me.hp / Math.max(1, me.mhp));
    (this.el.querySelector('.bar .hp') as HTMLElement).style.width = `${hpFrac * 100}%`;
    (this.el.querySelector('.bar .lag') as HTMLElement).style.width = `${hpFrac * 100}%`;
    (this.el.querySelector('.bar .sh') as HTMLElement).style.width = `${me.shm ? Math.min(1, me.sh / me.mhp) * 100 : 0}%`;
    (this.el.querySelector('.bar span') as HTMLElement).textContent = `${Math.max(0, Math.ceil(me.hp))} / ${me.mhp}`;
    if (me.g !== this.lastGold) {
      (this.el.querySelector('.gold-box b') as HTMLElement).textContent = String(me.g);
      if (this.lastGold >= 0 && me.g > this.lastGold) this.bumpGold();
      this.lastGold = me.g;
    }

    // Раунд
    const rt = this.el.querySelector<HTMLElement>('.rt')!;
    const rs = this.el.querySelector<HTMLElement>('.rs')!;
    const mobbar = this.el.querySelector<HTMLElement>('.mobbar')!;
    const pvp = st.round % PVP_EVERY === 0;
    rt.textContent = `Раунд ${st.round}/${MAX_ROUNDS}${pvp ? ' · ПвП' : ''}`;
    if (st.phase === 'battle') {
      rs.textContent = `Врагов осталось: ${st.mobsLeft}`;
      mobbar.style.display = '';
      (mobbar.firstElementChild as HTMLElement).style.width = `${st.mobsTotal ? (st.mobsLeft / st.mobsTotal) * 100 : 0}%`;
    } else {
      mobbar.style.display = 'none';
      const nextPvp = PVP_EVERY - (st.round % PVP_EVERY);
      rs.textContent =
        st.phase === 'intro' ? 'Приготовьтесь!' : st.phase.startsWith('duel') ? `Дуэль ${(st.duel?.idx ?? 0) + 1} из ${st.duel?.total ?? 0}${st.phase === 'duel' ? ` · ${Math.ceil(st.timer)} с` : ''}` : st.phase === 'clear' ? 'Победа!' : pvp ? '' : `До ПвП: ${nextPvp} р.`;
    }

    // Команда
    const mates = [...st.players.values()].filter((p) => p.id !== me.id);
    const tk = mates.map((p) => `${p.id}${p.c}${p.n}`).join();
    const matesBox = this.el.querySelector('.mates')!;
    if (tk !== this.teamKey) {
      this.teamKey = tk;
      matesBox.innerHTML = mates
        .map(
          (p) => `<div class="mate" data-id="${p.id}"><div class="mi" style="background:${CLASS_BG[p.c]}">${classIcon(p.c)}</div>
          <div style="flex:1"><div class="mn"><span>${esc(p.n)}</span><span class="g"></span></div><div class="mb"><i></i></div></div></div>`,
        )
        .join('');
    }
    for (const p of mates) {
      const m = matesBox.querySelector<HTMLElement>(`[data-id="${p.id}"]`);
      if (!m) continue;
      (m.querySelector('.mb i') as HTMLElement).style.width = `${Math.max(0, (p.hp / p.mhp) * 100)}%`;
      (m.querySelector('.g') as HTMLElement).textContent = `${p.g}💰`;
      m.classList.toggle('dead', !p.al || (!p.con && !p.bot));
    }

    // Возрождение
    const resp = this.el.querySelector<HTMLElement>('.respawn')!;
    if (!me.al && st.phase === 'battle') {
      resp.style.display = '';
      resp.innerHTML = `💀 Вы пали!<br><span style="font-size:20px">Возрождение через ${Math.ceil(me.rs)}…</span>`;
    } else resp.style.display = 'none';

    // Дуэль
    const spect = this.el.querySelector<HTMLElement>('.spectate')!;
    spect.style.display = st.phase.startsWith('duel') && me.st.includes('x') ? '' : 'none';
    const vs = this.el.querySelector<HTMLElement>('.duel-vs')!;
    if (st.duel && st.phase.startsWith('duel')) {
      const a = st.players.get(st.duel.a);
      const b = st.players.get(st.duel.b);
      if (a && b) {
        const key = `${a.id}${b.id}`;
        if (vs.dataset.k !== key) {
          vs.dataset.k = key;
          vs.innerHTML = `<span class="stroke" style="color:${CLASSES[a.c].color}">${esc(a.n)}</span><span class="vs">${SWORDS}</span><span class="stroke" style="color:${CLASSES[b.c].color}">${esc(b.n)}</span>`;
        }
        vs.style.display = 'flex';
      }
    } else vs.style.display = 'none';

    this.drawMinimap(st);
  }

  private drawMinimap(st: ClientState) {
    const c = this.miniCtx;
    const W = this.mini.width;
    const arena = st.phase.startsWith('duel');
    const R = arena ? 14 : 36;
    const sc = W / 2 / R;
    if (!arena && st.seed !== this.worldSeed) {
      this.world = generateWorld(st.seed);
      this.worldSeed = st.seed;
    }
    c.clearRect(0, 0, W, W);
    c.save();
    c.beginPath();
    c.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = arena ? '#c8a060' : '#3a8ac0';
    c.fillRect(0, 0, W, W);
    c.translate(W / 2, W / 2);
    if (!arena && this.world) {
      c.fillStyle = '#f0dca0';
      c.beginPath();
      c.arc(0, 0, 35.5 * sc, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#6fbf4a';
      c.beginPath();
      c.arc(0, 0, 33.5 * sc, 0, Math.PI * 2);
      c.fill();
      for (const o of this.world.obstacles) {
        c.fillStyle = o.kind === 'tree' ? '#2f7a3a' : o.kind === 'pond' ? '#3a9ad0' : o.kind === 'tent' ? '#d05a3a' : '#9a9a9a';
        c.beginPath();
        c.arc(o.x * sc, o.z * sc, Math.max(1.5, o.r * sc), 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = '#b06aff';
      for (const s of this.world.spawns) {
        c.beginPath();
        c.arc(s.x * sc, s.z * sc, 4, 0, Math.PI * 2);
        c.fill();
      }
    } else if (arena) {
      c.strokeStyle = '#8a7a6a';
      c.lineWidth = 6;
      c.beginPath();
      c.arc(0, 0, 12.6 * sc, 0, Math.PI * 2);
      c.stroke();
    }
    const snap = st.snap;
    if (snap) {
      for (const m of snap.M) {
        c.fillStyle = m.k === 'troll' ? '#ff2a1a' : '#e8463a';
        const r = m.k === 'troll' ? 5 : 2.5;
        c.beginPath();
        c.arc(m.x * sc, m.z * sc, r, 0, Math.PI * 2);
        c.fill();
      }
    }
    for (const p of st.players.values()) {
      if (!p.al || p.st.includes('x') || (!p.con && !p.bot)) continue;
      const pos = p.id === st.myId ? this.engine.heroPos(p.id) : null;
      const x = (pos ? pos.x : p.x) * sc;
      const z = (pos ? pos.z : p.z) * sc;
      c.fillStyle = CLASSES[p.c].color;
      c.strokeStyle = p.id === st.myId ? '#ffe14a' : '#1a1210';
      c.lineWidth = 2.5;
      c.beginPath();
      c.arc(x, z, p.id === st.myId ? 6 : 5, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
    c.restore();
  }
}
