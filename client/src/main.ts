import '@fontsource/rubik/500.css';
import '@fontsource/rubik/700.css';
import '@fontsource/rubik/800.css';
import '@fontsource/rubik/900.css';
import './styles.css';
import {
  ARENA_OBSTACLES,
  ARENA_RADIUS,
  CLASSES,
  PLAYER_RADIUS,
  generateWorld,
  isArenaPhase,
  resolveCollision,
  type GameEvent,
  type HeroClass,
  type Phase,
  type S2C,
  type Snapshot,
  type WorldData,
} from '@game/shared';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { StatusBar } from '@capacitor/status-bar';
import { App as CapApp } from '@capacitor/app';
import { Engine } from './render/engine';
import { ClientState } from './net/state';
import { LocalConnection, WsConnection, type Connection } from './net/connection';
import { Controls } from './input/controls';
import { Hud } from './ui/hud';
import { LobbyScreen, menuScreen, settingsModal } from './ui/menu';
import { TavernUi } from './ui/tavern';
import { overScreen } from './ui/over';
import { el } from './ui/dom';
import { sfx } from './audio/sfx';
import { clearSession, loadSession, loadSettings, saveSession, saveSettings, type Settings } from './settings';

type Screen = 'menu' | 'lobby' | 'game';

class App {
  private ui = document.getElementById('ui')!;
  private engine: Engine;
  private st = new ClientState();
  private conn: Connection | null = null;
  private settings: Settings = loadSettings();
  private screen: Screen = 'menu';
  private lobby: LobbyScreen | null = null;
  private hud: Hud | null = null;
  private controls: Controls | null = null;
  private tavernUi: TavernUi | null = null;
  private overEl: HTMLElement | null = null;
  private last = performance.now();
  private world: WorldData | null = null;
  // Предсказание движения своего героя
  private pred: { x: number; z: number; rot: number; moving: number } | null = null;
  private hist: { t: number; x: number; z: number }[] = [];
  private sentInput = { mx: 0, mz: 0, t: 0 };
  private castGuard = [0, 0, 0, 0];
  private cdLeft = [0, 0, 0, 0];
  private faceT = 0;
  private reconnecting = false;

  constructor() {
    this.engine = new Engine(document.getElementById('game') as HTMLCanvasElement);
    this.engine.setQuality(this.settings.quality);
    sfx.setEnabled(this.settings.sound);
    sfx.setMusic(this.settings.music);
    document.addEventListener('pointerdown', () => sfx.unlock(), { once: false, capture: true });
    this.showMenu();
    this.native();
    const rh = el(`<div class="rotate-hint enabled"><div class="phone"></div>Поверните устройство горизонтально</div>`);
    document.body.appendChild(rh);
    requestAnimationFrame((t) => this.loop(t));
    window.addEventListener('resize', () => this.updateTavernShift());
    this.startPing();
    if (import.meta.env.DEV) (window as unknown as { __app: App }).__app = this;
    setTimeout(() => document.getElementById('boot')?.classList.add('hide'), 300);
    // Попытка вернуться в игру после перезагрузки страницы
    const sess = loadSession();
    if (sess) void this.rejoin(sess.code, sess.token, true);
  }

  private native() {
    if (!Capacitor.isNativePlatform()) return;
    void StatusBar.hide().catch(() => {});
    void CapApp.addListener('backButton', () => {
      if (this.screen === 'game') this.pauseMenu();
      else if (this.screen === 'lobby') this.leave();
    });
    void CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive && this.conn === null && this.screen === 'game') {
        const s = loadSession();
        if (s) void this.rejoin(s.code, s.token);
      }
    });
  }

  private haptic(style: ImpactStyle = ImpactStyle.Light) {
    if (!this.settings.haptics) return;
    if (Capacitor.isNativePlatform()) void Haptics.impact({ style }).catch(() => {});
    else navigator.vibrate?.(style === ImpactStyle.Heavy ? 40 : 15);
  }

  // ------------------------------------------------------------------ экраны

  private clearUi() {
    this.controls?.dispose();
    this.controls = null;
    this.ui.innerHTML = '';
    this.lobby = null;
    this.hud = null;
    this.tavernUi = null;
    this.overEl = null;
  }

  private showMenu(error = '') {
    this.screen = 'menu';
    this.clearUi();
    this.engine.showMenu([
      { cls: 'warrior', name: null },
      { cls: 'mage', name: null },
      { cls: 'archer', name: null },
    ]);
    sfx.music('calm');
    this.engine.menuShift = window.innerWidth > 760 ? 0.36 : 0;
    this.ui.appendChild(
      menuScreen(
        this.settings,
        {
          create: () => void this.connect({ t: 'create', name: this.settings.name }),
          join: (code) => void this.connect({ t: 'join', code, name: this.settings.name }),
          solo: () => this.startLocal(),
          saveSettings: () => this.applySettings(),
        },
        error,
      ),
    );
  }

  private applySettings() {
    saveSettings(this.settings);
    sfx.setEnabled(this.settings.sound);
    sfx.setMusic(this.settings.music);
    if (this.engine.quality !== this.settings.quality) this.engine.setQuality(this.settings.quality);
  }

  private showLobby() {
    this.screen = 'lobby';
    this.clearUi();
    this.engine.menuShift = 0;
    this.lobby = new LobbyScreen(
      {
        pick: (cls: HeroClass) => this.conn?.send({ t: 'pick', cls }),
        ready: (v) => this.conn?.send({ t: 'ready', v }),
        start: () => this.conn?.send({ t: 'start' }),
        addBot: () => this.conn?.send({ t: 'addBot' }),
        kick: (id) => this.conn?.send({ t: 'kick', id }),
        leave: () => this.leave(),
      },
      !!this.conn?.local,
    );
    this.ui.appendChild(this.lobby.el);
  }

  private showGame() {
    this.screen = 'game';
    this.clearUi();
    this.engine.startGame(this.st.seed, this.st.myId);
    this.world = generateWorld(this.st.seed);
    this.hud = new Hud(this.engine);
    this.hud.onPause = () => this.pauseMenu();
    this.ui.appendChild(this.hud.el);
    const me = this.st.me;
    this.controls = new Controls(
      {
        cast: (s, dx, dz, d) => this.cast(s, dx, dz, d),
        aim: (a) => this.engine.setAim(a),
        ready: (s) => this.cdLeft[s] <= 0.02 && this.castGuard[s] <= 0,
        myPos: () => this.engine.heroPos(this.st.myId),
        screenToGround: (x, y) => this.engine.screenToGround(x, y),
      },
      me?.c ?? 'warrior',
    );
    this.ui.appendChild(this.controls.el);
  }

  private pauseMenu() {
    if (this.ui.querySelector('.modal')) return;
    const m = settingsModal(this.settings, () => this.applySettings(), [{ label: '🚪 Выйти в меню', cls: 'red', onClick: () => this.leave() }]);
    (m.querySelector('h2') as HTMLElement).textContent = this.conn?.local ? 'Меню' : 'Меню (игра продолжается)';
    this.ui.appendChild(m);
  }

  // ------------------------------------------------------------------ сеть

  private async connect(msg: { t: 'create'; name: string } | { t: 'join'; code: string; name: string }) {
    const err = this.ui.querySelector('#err');
    if (err) err.textContent = 'Подключение…';
    try {
      const c = await WsConnection.open(this.settings.server);
      this.attach(c);
      c.send(msg);
    } catch (e) {
      if (err) err.textContent = `${(e as Error).message}. Проверьте адрес сервера в настройках.`;
    }
  }

  private async rejoin(code: string, token: string, silent = false) {
    if (this.reconnecting) return;
    this.reconnecting = true;
    for (let i = 0; i < (silent ? 3 : 8); i++) {
      try {
        const c = await WsConnection.open(this.settings.server, 6000);
        this.attach(c);
        c.send({ t: 'rejoin', code, token });
        this.reconnecting = false;
        return;
      } catch {
        this.hud?.toast('Переподключение…', 'bad');
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    this.reconnecting = false;
    if (!silent) {
      clearSession();
      this.showMenu('Не удалось переподключиться к серверу');
    }
  }

  private startLocal() {
    this.attach(new LocalConnection(this.settings.name));
  }

  private attach(c: Connection) {
    this.conn?.close();
    this.conn = c;
    c.onMessage = (m) => this.onMessage(m);
    c.onClose = (reason) => {
      if (this.conn !== c) return;
      this.conn = null;
      const s = loadSession();
      if (this.screen === 'game' && s && this.st.phase !== 'gameover') {
        this.hud?.toast(reason, 'bad');
        void this.rejoin(s.code, s.token);
      } else this.showMenu(reason);
    };
  }

  private leave() {
    this.conn?.close();
    this.conn = null;
    clearSession();
    this.st.reset();
    this.pred = null;
    this.engine.myId = '';
    this.engine.pred = null;
    this.showMenu();
  }

  private onMessage(m: S2C) {
    switch (m.t) {
      case 'welcome':
        this.st.myId = m.id;
        this.st.code = m.code;
        this.st.token = m.token;
        this.st.seed = m.seed;
        if (!this.conn?.local) saveSession(m.code, m.token);
        else {
          // Одиночная игра: сразу два бота-напарника (их можно убрать в лобби)
          this.conn.send({ t: 'addBot' });
          this.conn.send({ t: 'addBot' });
        }
        break;
      case 'err':
        if (this.screen === 'menu') {
          const err = this.ui.querySelector('#err');
          if (err) err.textContent = m.msg;
          this.conn?.close();
          this.conn = null;
        } else if (m.msg === 'Сессия не найдена') {
          clearSession();
          this.leave();
        } else this.hud?.toast(m.msg, 'bad');
        break;
      case 's':
        this.onSnapshot(m);
        break;
    }
  }

  private onSnapshot(s: Snapshot) {
    const prev: Phase = this.st.phase;
    const events = this.st.apply(s);
    const ph = s.ph;
    if (ph === 'lobby') {
      if (this.screen !== 'lobby') this.showLobby();
      this.lobby?.update(this.st);
      const list = this.st.order.map((id) => this.st.players.get(id)!).map((p) => ({ cls: p.c, name: p.n, me: p.id === this.st.myId }));
      this.engine.showMenu(list, this.st.seed);
      return;
    }
    if (this.screen !== 'game') this.showGame();
    this.engine.sync(this.st);
    this.reconcile(s);
    this.engine.onEvents(events);
    this.handleEvents(events);
    if (prev !== ph || !this.phaseShown) this.onPhase(prev, ph);
    this.syncCooldowns();
  }

  private phaseShown = false;

  private onPhase(prev: Phase, ph: Phase) {
    this.phaseShown = true;
    const hud = this.hud;
    if (!hud) return;
    const st = this.st;
    if (ph !== 'tavern' && this.tavernUi) {
      this.tavernUi.el.remove();
      this.tavernUi = null;
      this.engine.tavernLeft = this.engine.tavernRight = 0;
    }
    if (this.controls) this.controls.el.style.display = ph === 'tavern' || ph === 'gameover' ? 'none' : '';
    hud.el.style.display = ph === 'tavern' ? 'none' : '';
    if (this.st.me && this.controls) this.controls.setClass(this.st.me.c);
    switch (ph) {
      case 'intro': {
        const pvp = st.round % 5 === 0;
        hud.showBanner(pvp ? 'ПвП РАУНД!' : `РАУНД ${st.round}`, pvp ? 'Дуэли каждого с каждым' : st.round % 5 === 4 ? 'Берегитесь — босс!' : 'Защитите остров!', pvp ? '#ff7a5a' : 'var(--gold)');
        sfx.fanfare();
        sfx.music('battle');
        break;
      }
      case 'clear':
        hud.showBanner(st.round % 5 === 0 ? 'ДУЭЛИ ОКОНЧЕНЫ' : 'РАУНД ПРОЙДЕН!', `+${15 + 5 * st.round} золота каждому`, '#8aff7a');
        sfx.victory();
        break;
      case 'tavern':
        this.tavernUi = new TavernUi(
          (id) => this.conn?.send({ t: 'buy', id }),
          (v) => this.conn?.send({ t: 'ready', v }),
        );
        this.ui.appendChild(this.tavernUi.el);
        this.updateTavernShift();
        sfx.music('tavern');
        sfx.bell();
        break;
      case 'duel_intro': {
        const d = st.duel;
        const a = d ? st.players.get(d.a) : null;
        const b = d ? st.players.get(d.b) : null;
        hud.showBanner('ДУЭЛЬ!', a && b ? `${a.n} против ${b.n}` : '', '#ff7a5a');
        sfx.fanfare();
        sfx.music('battle');
        break;
      }
      case 'gameover':
        sfx.music('calm');
        if (st.result?.win) sfx.victory();
        else sfx.defeat();
        clearSession();
        if (!this.overEl) {
          this.overEl = overScreen(st, () => this.leave());
          this.ui.appendChild(this.overEl);
        }
        break;
    }
    void prev;
  }

  /** Сдвигаем 3D-сцену таверны так, чтобы герои были видны между лавкой и панелью героя. */
  private updateTavernShift() {
    const shop = this.tavernUi?.el.querySelector('.shop');
    const side = this.tavernUi?.el.querySelector('.side');
    if (!shop || !side || window.innerWidth < window.innerHeight) {
      this.engine.tavernLeft = this.engine.tavernRight = 0;
      return;
    }
    const w = window.innerWidth;
    this.engine.tavernLeft = Math.min(0.7, shop.getBoundingClientRect().right / w);
    this.engine.tavernRight = Math.min(0.4, 1 - side.getBoundingClientRect().left / w);
  }

  private handleEvents(events: GameEvent[]) {
    const hud = this.hud;
    if (!hud) return;
    const me = this.st.myId;
    for (const e of events) {
      switch (e.e) {
        case 'dmg': {
          const mine = e.tp === 'p' && e.id === me;
          hud.float(String(e.v), e.c ? 'crit' : mine ? 'hurt' : e.tp === 'p' ? 'hurt' : '', e.x, 2.2, e.z, e.c ? 1.0 : 0.8);
          if (mine) {
            sfx.hurt();
            this.haptic(ImpactStyle.Medium);
          } else if (e.c) sfx.crit();
          else sfx.hit();
          break;
        }
        case 'gold':
          if (e.pid === me) {
            const p = this.engine.heroPos(me);
            hud.float(`${e.v > 0 ? '+' : ''}${e.v} 💰`, 'gold', p ? p.x : e.x, 2.8, p ? p.z : e.z, 1.2);
            if (e.why) hud.toast(`${e.why}: ${e.v > 0 ? '+' : ''}${e.v} золота`, e.v > 0 ? 'gold' : 'bad');
            setTimeout(() => sfx.coin(), e.why ? 0 : 450);
          }
          break;
        case 'msg':
          hud.toast(e.text, e.kind);
          break;
        case 'buy': {
          const p = this.st.players.get(e.pid);
          if (e.pid === me) sfx.buy();
          else this.tavernToast(`${p?.n ?? '?'} купил «${e.name}»`);
          break;
        }
        case 'cast': {
          const p = this.st.players.get(e.pid);
          if (!p) break;
          const id = CLASSES[p.c].skills[e.s].id;
          if (id === 'slash' || id === 'whirl' || id === 'twin' || id === 'glaive') sfx.swing();
          else if (id === 'bolt' || id === 'spiritbolt') sfx.magic();
          else if (id === 'wolves' || id === 'golem' || id === 'totem') sfx.bell();
          else if (id === 'shadowdash') sfx.dash();
          else if (id === 'demon') sfx.shout();
          else if (id === 'fireball') sfx.fireball();
          else if (id === 'shot' || id === 'multishot') sfx.bow();
          else if (id === 'charge' || id === 'roll') sfx.dash();
          else if (id === 'meteor') sfx.magic();
          break;
        }
        case 'fx':
          if (e.k === 'explode') sfx.explosion();
          else if (e.k === 'meteor') {
            sfx.explosion(true);
            this.haptic(ImpactStyle.Heavy);
          } else if (e.k === 'nova') sfx.freeze();
          else if (e.k === 'warcry') sfx.shout();
          else if (e.k === 'gslam') sfx.slam();
          else if (e.k === 'hwind') sfx.shout();
          else if (e.k === 'hthrow') sfx.swing();
          else if (e.k === 'hcatch') sfx.slam();
          else if (e.k === 'slam') {
            sfx.slam();
            this.haptic(ImpactStyle.Heavy);
          } else if (e.k === 'bossspawn') {
            sfx.slam();
            hud.showBanner('БОСС!', 'Тролль-вождь вышел на охоту', '#ff5a3a');
          }
          break;
        case 'mdie':
          sfx.mobDie();
          if (e.by === me) this.haptic(ImpactStyle.Light);
          break;
        case 'pdie':
          if (e.pid === me) {
            sfx.death();
            this.haptic(ImpactStyle.Heavy);
          }
          break;
        case 'respawn':
          if (e.pid === me) sfx.respawn();
          break;
        case 'duel': {
          const w = e.winner ? this.st.players.get(e.winner) : null;
          if (!w) hud.showBanner('НИЧЬЯ!', '', '#fff');
          else if (e.winner === me) hud.showBanner('ПОБЕДА!', `+${e.win} золота`, '#8aff7a');
          else if (e.a === me || e.b === me) hud.showBanner('ПОРАЖЕНИЕ', e.lose ? `−${e.lose} золота` : '', '#ff7a6a');
          else hud.showBanner(`${w.n} побеждает!`, '', 'var(--gold)');
          break;
        }
      }
    }
  }

  private tavernToast(text: string) {
    if (!this.tavernUi) return;
    const t = el(`<div class="toast gold" style="position:absolute;left:50%;top:12px;transform:translateX(-50%);z-index:5">${text.replace(/</g, '&lt;')}</div>`);
    this.tavernUi.el.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  // ------------------------------------------------------------------ умения и предсказание

  private syncCooldowns() {
    const me = this.st.me;
    if (!me) return;
    for (let i = 0; i < 4; i++) {
      // Учитываем «полёт» сообщения: локальный откат не меньше серверного
      this.cdLeft[i] = Math.max(0, me.cd[i] - (this.conn?.rtt ?? 0) / 2);
    }
  }

  private cast(s: number, dx: number, dz: number, d: number) {
    const me = this.st.me;
    if (!me || !me.al || this.cdLeft[s] > 0.02 || this.castGuard[s] > 0) return;
    if (!['battle', 'duel', 'intro', 'clear'].includes(this.st.phase)) return;
    if (me.st.includes('s') || me.st.includes('f')) return;
    this.conn?.send({ t: 'cast', s, dx, dz, d });
    this.castGuard[s] = 0.12;
    if ((dx || dz) && this.pred && CLASSES[me.c].skills[s].aim !== 'self') {
      this.pred.rot = Math.atan2(dx, dz);
      this.faceT = 0.45;
    }
  }

  private reconcile(s: Snapshot) {
    const me = s.P.find((p) => p.id === this.st.myId);
    const movable = me && me.al && !me.st.includes('d') && !me.st.includes('x') && ['intro', 'battle', 'clear', 'duel'].includes(s.ph);
    if (!me || !movable) {
      this.pred = null;
      this.engine.pred = null;
      this.hist = [];
      return;
    }
    if (!this.pred) {
      this.pred = { x: me.x, z: me.z, rot: me.r, moving: 0 };
      this.hist = [];
      this.engine.pred = this.pred;
      return;
    }
    // Сравниваем с тем, где мы были ~RTT назад
    const lag = (this.conn?.rtt ?? 0) * 1000 + 25;
    const t = performance.now() - lag;
    let ref = this.hist.length ? this.hist[0] : { x: this.pred.x, z: this.pred.z };
    for (const h of this.hist) if (h.t <= t) ref = h;
    if (this.conn?.local) ref = { x: this.pred.x, z: this.pred.z };
    const ex = me.x - ref.x;
    const ez = me.z - ref.z;
    const err = Math.hypot(ex, ez);
    if (err > 2.5) {
      this.pred.x = me.x;
      this.pred.z = me.z;
      this.hist = [];
    } else if (err > 0.05) {
      const k = this.conn?.local ? 0.5 : 0.2;
      this.pred.x += ex * k;
      this.pred.z += ez * k;
      for (const h of this.hist) {
        h.x += ex * k;
        h.z += ez * k;
      }
    }
  }

  private predict(dt: number) {
    const me = this.st.me;
    const p = this.pred;
    if (!me || !p || !this.controls) return;
    const mv = this.controls.move;
    const sp = me.sp;
    const pos = { x: p.x + mv.x * sp * dt, z: p.z + mv.z * sp * dt };
    const arena = isArenaPhase(this.st.phase);
    resolveCollision(pos, PLAYER_RADIUS, arena ? ARENA_OBSTACLES : this.world?.obstacles ?? [], arena ? ARENA_RADIUS : this.world?.radius ?? 33);
    p.x = pos.x;
    p.z = pos.z;
    const ml = Math.hypot(mv.x, mv.z);
    p.moving = sp > 0 ? ml : 0;
    this.faceT -= dt;
    if (ml > 0.1 && sp > 0 && this.faceT <= 0) p.rot = Math.atan2(mv.x, mv.z);
    const now = performance.now();
    this.hist.push({ t: now, x: p.x, z: p.z });
    while (this.hist.length && this.hist[0].t < now - 1500) this.hist.shift();
  }

  private sendInput() {
    if (!this.conn || !this.controls) return;
    const mv = this.controls.move;
    const now = performance.now();
    const changed = Math.abs(mv.x - this.sentInput.mx) > 0.05 || Math.abs(mv.z - this.sentInput.mz) > 0.05;
    if ((changed && now - this.sentInput.t > 33) || now - this.sentInput.t > 250) {
      this.conn.send({ t: 'in', mx: Math.round(mv.x * 100) / 100, mz: Math.round(mv.z * 100) / 100 });
      this.sentInput = { mx: mv.x, mz: mv.z, t: now };
    }
  }

  // ------------------------------------------------------------------ цикл

  /** Крошечный индикатор пинга в левом верхнем углу. */
  private startPing() {
    const badge = el(`<div class="ping"></div>`);
    document.body.appendChild(badge);
    const tick = () => {
      const c = this.conn;
      badge.style.display = c ? '' : 'none';
      if (!c) return;
      if (c.local) {
        badge.textContent = 'соло';
        badge.className = 'ping solo';
        return;
      }
      const ms = Math.round(c.rtt * 1000);
      badge.textContent = `${ms} мс`;
      badge.className = `ping ${ms < 90 ? '' : ms < 180 ? 'mid' : 'bad'}`;
    };
    tick();
    setInterval(tick, 500);
  }

  private loop(t: number) {
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    if (this.screen === 'game') {
      this.controls?.update();
      this.predict(dt);
      this.sendInput();
      for (let i = 0; i < 4; i++) {
        this.cdLeft[i] = Math.max(0, this.cdLeft[i] - dt);
        this.castGuard[i] = Math.max(0, this.castGuard[i] - dt);
      }
      const me = this.st.me;
      if (me && this.controls) this.controls.setCooldowns(this.cdLeft, me.cdm);
      this.hud?.update(dt, this.st, this.cdLeft);
      this.tavernUi?.update(this.st);
    }
    this.engine.frame(dt);
    requestAnimationFrame((tt) => this.loop(tt));
  }
}

new App();
