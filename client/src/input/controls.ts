import { CLASSES, type HeroClass, type SkillDef } from '@game/shared';
import { skillIcon } from '../ui/icons';
import type { AimState } from '../render/engine';

export interface ControlHost {
  cast(slot: number, dx: number, dz: number, dist: number): void;
  aim(a: AimState | null): void;
  ready(slot: number): boolean;
  myPos(): { x: number; z: number } | null;
  screenToGround(x: number, y: number): { x: number; z: number } | null;
}

const AIM_COLORS = [0xffffff, 0xffd04a, 0x7ae0ff, 0xff7a5a];
const DRAG_DEAD = 14;
const DRAG_MAX = 95;

/** Сенсорное управление: плавающий джойстик + кнопки умений с прицеливанием перетаскиванием. Плюс клавиатура и мышь. */
export class Controls {
  readonly el: HTMLElement;
  move = { x: 0, z: 0 };
  private keys = new Set<string>();
  private joy: HTMLElement;
  private knob: HTMLElement;
  private joyId: number | null = null;
  private joyCenter = { x: 0, y: 0 };
  private joyVec = { x: 0, y: 0 };
  private btns: HTMLElement[] = [];
  private defs: SkillDef[] = [];
  private host: ControlHost;
  private holdMain = false;
  private aimSlot = -1;
  private aimVec = { x: 0, y: 0, len: 0 };
  private cancel: HTMLElement;
  private overCancel = false;
  private mouse: { x: number; y: number; t: number } | null = null;
  private wasReady = [true, true, true, true];
  private disposers: (() => void)[] = [];
  enabled = true;

  constructor(host: ControlHost, cls: HeroClass) {
    this.host = host;
    this.el = document.createElement('div');
    this.el.className = 'controls';
    this.el.innerHTML = `
      <div class="joy-zone"></div>
      <div class="joy"><div class="knob"></div></div>
      <div class="cancel-zone">✕</div>
      <div class="skills">
        <div class="sk main" data-s="0"><div class="si"></div><div class="cd"></div><div class="cdt"></div><div class="key">ПРОБЕЛ</div></div>
        <div class="sk s1" data-s="1"><div class="si"></div><div class="cd"></div><div class="cdt"></div><div class="key">1</div></div>
        <div class="sk s2" data-s="2"><div class="si"></div><div class="cd"></div><div class="cdt"></div><div class="key">2</div></div>
        <div class="sk s3" data-s="3"><div class="si"></div><div class="cd"></div><div class="cdt"></div><div class="key">3</div></div>
      </div>`;
    this.joy = this.el.querySelector('.joy')!;
    this.knob = this.el.querySelector('.knob')!;
    this.cancel = this.el.querySelector('.cancel-zone')!;
    this.btns = [...this.el.querySelectorAll<HTMLElement>('.sk')];
    this.setClass(cls);
    this.resetJoy();

    const zone = this.el.querySelector<HTMLElement>('.joy-zone')!;
    zone.addEventListener('pointerdown', (e) => this.joyStart(e));
    zone.addEventListener('pointermove', (e) => this.joyMove(e));
    zone.addEventListener('pointerup', (e) => this.joyEnd(e));
    zone.addEventListener('pointercancel', (e) => this.joyEnd(e));

    this.btns.forEach((b, i) => {
      b.addEventListener('pointerdown', (e) => this.skillDown(e, i));
      b.addEventListener('pointermove', (e) => this.skillMove(e, i));
      b.addEventListener('pointerup', (e) => this.skillUp(e, i));
      b.addEventListener('pointercancel', () => this.skillCancel(i));
    });

    const kd = (e: KeyboardEvent) => this.keyDown(e);
    const ku = (e: KeyboardEvent) => this.keys.delete(e.code);
    const mm = (e: MouseEvent) => (this.mouse = { x: e.clientX, y: e.clientY, t: performance.now() });
    const md = (e: MouseEvent) => {
      if (e.button !== 0 || (e.target as HTMLElement).id !== 'game') return;
      this.mouse = { x: e.clientX, y: e.clientY, t: performance.now() };
      this.castToMouse(0);
    };
    const blur = () => this.keys.clear();
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('mousemove', mm);
    window.addEventListener('mousedown', md);
    window.addEventListener('blur', blur);
    this.disposers.push(() => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('mousemove', mm);
      window.removeEventListener('mousedown', md);
      window.removeEventListener('blur', blur);
    });
  }

  setClass(cls: HeroClass) {
    this.defs = CLASSES[cls].skills;
    this.btns.forEach((b, i) => (b.querySelector('.si')!.innerHTML = skillIcon(this.defs[i].id)));
  }

  dispose() {
    this.disposers.forEach((d) => d());
    this.el.remove();
    this.host.aim(null);
  }

  private resetJoy() {
    this.joy.classList.remove('on');
    this.joy.style.left = `calc(110px + var(--sal))`;
    this.joy.style.top = `calc(100% - 120px - var(--sab))`;
    this.knob.style.transform = '';
    this.joyVec = { x: 0, y: 0 };
  }

  private joyStart(e: PointerEvent) {
    if (this.joyId !== null) return;
    this.joyId = e.pointerId;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    this.joyCenter = { x: e.clientX, y: e.clientY };
    this.joy.style.left = `${e.clientX}px`;
    this.joy.style.top = `${e.clientY}px`;
    this.joy.classList.add('on');
  }
  private joyMove(e: PointerEvent) {
    if (e.pointerId !== this.joyId) return;
    const dx = e.clientX - this.joyCenter.x;
    const dy = e.clientY - this.joyCenter.y;
    const max = 52;
    const l = Math.hypot(dx, dy);
    const k = l > max ? max / l : 1;
    this.knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    const m = Math.min(1, l / max);
    this.joyVec = l > 6 ? { x: (dx / l) * m, y: (dy / l) * m } : { x: 0, y: 0 };
  }
  private joyEnd(e: PointerEvent) {
    if (e.pointerId !== this.joyId) return;
    this.joyId = null;
    this.resetJoy();
  }

  private skillDown(e: PointerEvent, i: number) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    this.btns[i].classList.add('pressed');
    this.aimSlot = i;
    this.aimVec = { x: 0, y: 0, len: 0 };
    if (i === 0) {
      this.holdMain = true;
      this.host.cast(0, 0, 0, 0);
    }
  }
  private skillMove(e: PointerEvent, i: number) {
    if (this.aimSlot !== i) return;
    const r = this.btns[i].getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    this.aimVec = { x: dx, y: dy, len };
    if (len > DRAG_DEAD) {
      this.holdMain = false;
      this.cancel.classList.add('show');
      const cr = this.cancel.getBoundingClientRect();
      this.overCancel = e.clientX > cr.left - 10 && e.clientX < cr.right + 10 && e.clientY > cr.top - 10 && e.clientY < cr.bottom + 10;
      this.cancel.classList.toggle('hot', this.overCancel);
      this.showAim(i);
    } else if (this.defs[i].aim === 'self') this.showAim(i);
  }
  private skillUp(_e: PointerEvent, i: number) {
    if (this.aimSlot !== i) return;
    this.btns[i].classList.remove('pressed');
    const v = this.aimVec;
    if (!this.overCancel) {
      if (v.len > DRAG_DEAD) {
        const def = this.defs[i];
        const dist = def.aim === 'point' ? def.range * Math.min(1, v.len / DRAG_MAX) : def.range;
        this.host.cast(i, v.x / v.len, v.y / v.len, dist);
      } else if (i !== 0) this.host.cast(i, 0, 0, 0);
    }
    this.skillCancel(i);
  }
  private skillCancel(i: number) {
    this.btns[i].classList.remove('pressed');
    if (i === 0) this.holdMain = false;
    this.aimSlot = -1;
    this.overCancel = false;
    this.cancel.classList.remove('show', 'hot');
    this.host.aim(null);
  }

  private showAim(i: number) {
    const def = this.defs[i];
    const v = this.aimVec;
    const l = v.len || 1;
    this.host.aim({
      active: true,
      aim: def.aim,
      dx: v.len > DRAG_DEAD ? v.x / l : 0,
      dz: v.len > DRAG_DEAD ? v.y / l : 1,
      dist: def.aim === 'point' ? def.range * Math.min(1, v.len / DRAG_MAX) : def.range,
      range: def.range,
      radius: def.radius ?? 1,
      color: this.overCancel ? 0xff4a3a : AIM_COLORS[i],
    });
  }

  private keyDown(e: KeyboardEvent) {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    this.keys.add(e.code);
    if (e.repeat) return;
    const map: Record<string, number> = { Space: 0, KeyJ: 0, Digit1: 1, KeyQ: 1, KeyK: 1, Digit2: 2, KeyE: 2, KeyL: 2, Digit3: 3, KeyR: 3, Semicolon: 3 };
    if (e.code in map) {
      e.preventDefault();
      this.castToMouse(map[e.code]);
    }
  }

  /** Каст в сторону курсора (если мышь недавно двигалась), иначе — автоприцел. */
  private castToMouse(i: number) {
    const def = this.defs[i];
    const me = this.host.myPos();
    if (this.mouse && me && performance.now() - this.mouse.t < 4000 && def.aim !== 'self') {
      const g = this.host.screenToGround(this.mouse.x, this.mouse.y);
      if (g) {
        const dx = g.x - me.x;
        const dz = g.z - me.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.3) {
          this.host.cast(i, dx / d, dz / d, Math.min(def.range, d));
          return;
        }
      }
    }
    this.host.cast(i, 0, 0, 0);
  }

  /** Вызывается каждый кадр: движение и автоатака при удержании. */
  update() {
    let x = this.joyVec.x;
    let z = this.joyVec.y;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) z -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) z += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    const l = Math.hypot(x, z);
    if (l > 1) {
      x /= l;
      z /= l;
    }
    this.move = this.enabled ? { x, z } : { x: 0, z: 0 };
    if (this.enabled && this.holdMain && this.host.ready(0)) this.host.cast(0, 0, 0, 0);
    if (this.enabled && (k.has('Space') || k.has('KeyJ')) && this.host.ready(0)) this.castToMouse(0);
  }

  setCooldowns(cd: number[], cdm: number[]) {
    for (let i = 0; i < 4; i++) {
      const b = this.btns[i];
      const frac = cdm[i] > 0 ? Math.max(0, Math.min(1, cd[i] / cdm[i])) : 0;
      (b.querySelector('.cd') as HTMLElement).style.setProperty('--p', `${(frac * 100).toFixed(1)}%`);
      const t = b.querySelector('.cdt') as HTMLElement;
      const txt = i > 0 && cd[i] > 0.05 ? (cd[i] < 1 ? cd[i].toFixed(1) : Math.ceil(cd[i]).toString()) : '';
      if (t.textContent !== txt) t.textContent = txt;
      const ready = cd[i] <= 0.05;
      if (ready && !this.wasReady[i] && i > 0) {
        b.classList.remove('ready');
        void b.offsetWidth;
        b.classList.add('ready');
      }
      this.wasReady[i] = ready;
    }
  }
}
