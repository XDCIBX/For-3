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
  worldFor,
  isPvpRound,
  isTrollRound,
  DRAGON_ROUND,
  LAIR_ROUND,
  isArenaPhase,
  resolveCollision,
  type GameEvent,
  type HeroClass,
  type Phase,
  type Rarity,
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
import { el, esc, onTap } from './ui/dom';
import { sfx } from './audio/sfx';
import { reportOnce } from './report';
import * as Shared from '@game/shared';
import { getLang, itemName, playerName, setLang, t, tServer } from './i18n';
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
  private pauseEl: HTMLElement | null = null;
  /** Последняя команда паузы: пока снимок её не догнал, показываем то, что нажали. */
  private pauseWant = { v: false, t: -1e9 };
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
    setLang(this.settings.lang);
    this.engine = new Engine(document.getElementById('game') as HTMLCanvasElement);
    this.engine.setQuality(this.settings.quality);
    sfx.setEnabled(this.settings.sound);
    sfx.setMusic(this.settings.music);
    document.addEventListener('pointerdown', () => sfx.unlock(), { once: false, capture: true });
    this.showMenu();
    this.native();
    const rh = el(`<div class="rotate-hint enabled"><div class="phone"></div>${t('app.rotate')}</div>`);
    document.body.appendChild(rh);
    requestAnimationFrame((t) => this.loop(t));
    window.addEventListener('resize', () => {
      this.updateTavernShift();
      this.updateMenuShift();
    });
    this.startPing();
    // Esc или P — пауза (хост) / меню (остальные)
    window.addEventListener('keydown', (e) => {
      if (this.screen !== 'game' || e.repeat || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.code !== 'Escape' && e.code !== 'KeyP') return;
      if (e.code === 'Escape' && this.ui.querySelector('.modal')) this.ui.querySelector('.modal')?.remove();
      else this.togglePause();
    });
    // Одиночная игра сама встаёт на паузу, когда приложение свернули
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.conn?.local && this.screen === 'game' && !this.isPaused() && this.canPause()) this.requestPause(true);
    });
    if (import.meta.env.DEV) {
      (window as unknown as { __app: App; __shared: typeof Shared }).__app = this;
      (window as unknown as { __shared: typeof Shared }).__shared = Shared;
      // ?shots=1 — съёмка: постоянное разрешение, без служебных значков
      if (new URLSearchParams(location.search).has('shots')) {
        this.engine.lockRes = true;
        document.body.classList.add('shots');
      }
    }
    setTimeout(() => document.getElementById('boot')?.classList.add('hide'), 300);
    // Попытка вернуться в игру после перезагрузки страницы
    const sess = loadSession();
    if (sess) void this.rejoin(sess.code, sess.token, true);
  }

  private native() {
    if (!Capacitor.isNativePlatform()) return;
    void StatusBar.hide().catch(() => {});
    void CapApp.addListener('backButton', () => {
      if (this.screen === 'game') this.pauseButton();
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
    // Все классы у костра: передний ряд — бойцы, задний — маги и охотник
    this.engine.showMenu((['warrior', 'werewolf', 'dwarf', 'archer', 'mage', 'summoner', 'hunter'] as const).map((cls) => ({ cls, name: null })));
    sfx.music('calm');
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
    this.updateMenuShift();
    window.requestAnimationFrame(() => this.updateMenuShift());
  }

  /** Сдвиг сцены меню вправо от панели с кнопками, чтобы герои были видны. */
  private updateMenuShift() {
    const box = this.screen === 'menu' ? this.ui.querySelector('.menu-box') : null;
    if (!box || window.innerWidth < window.innerHeight) {
      this.engine.menuShift = 0;
      return;
    }
    this.engine.menuShift = Math.min(0.62, box.getBoundingClientRect().right / window.innerWidth);
  }


  private applySettings() {
    saveSettings(this.settings);
    sfx.setEnabled(this.settings.sound);
    sfx.setMusic(this.settings.music);
    if (this.engine.quality !== this.settings.quality) this.engine.setQuality(this.settings.quality);
    if (this.settings.lang !== getLang()) this.relocalize();
  }

  /** Сменить язык на лету: текущий экран перерисовывается, игра не прерывается. */
  private relocalize() {
    setLang(this.settings.lang);
    this.engine.relocalize();
    document.querySelector('.rotate-hint')?.replaceChildren(el(`<div class="phone"></div>`), document.createTextNode(t('app.rotate')));
    if (this.screen === 'menu') this.showMenu();
    else if (this.screen === 'lobby') {
      this.showLobby();
      this.lobby?.update(this.st);
    } else if (this.screen === 'game' && this.hud) {
      const old = this.hud.el;
      this.hud = new Hud(this.engine);
      this.hud.onPause = () => this.pauseButton();
      old.replaceWith(this.hud.el);
      this.hud.el.style.display = this.st.phase === 'tavern' ? 'none' : '';
      this.controls?.relocalize();
      if (this.tavernUi) {
        const oldTav = this.tavernUi.el;
        this.tavernUi = new TavernUi(
          (id) => this.conn?.send({ t: 'buy', id }),
          (v) => this.conn?.send({ t: 'ready', v }),
        );
        oldTav.replaceWith(this.tavernUi.el);
        this.updateTavernShift();
      }
      this.pauseEl?.remove();
      this.pauseEl = null;
      if (this.overEl) {
        const fresh = overScreen(this.st, () => this.leave());
        this.overEl.replaceWith(fresh);
        this.overEl = fresh;
      }
    }
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
        botCls: (id, cls) => this.conn?.send({ t: 'botcls', id, cls }),
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
    this.world = worldFor(this.st.seed, this.st.round);
    this.hud = new Hud(this.engine);
    this.hud.onPause = () => this.pauseButton();
    this.ui.appendChild(this.hud.el);
    const me = this.st.me;
    this.controls = new Controls(
      {
        cast: (s, dx, dz, d) => this.cast(s, dx, dz, d),
        aim: (a) => this.engine.setAim(a),
        ready: (s) => this.cdLeft[s] <= 0.02 && this.castGuard[s] <= 0,
        myPos: () => this.engine.heroPos(this.st.myId),
        screenToGround: (x, y) => this.engine.screenToGround(x, y),
        pause: () => this.togglePause(),
      },
      me?.c ?? 'warrior',
    );
    this.ui.appendChild(this.controls.el);
  }

  private pauseMenu() {
    if (this.ui.querySelector('.modal')) return;
    const m = settingsModal(this.settings, () => this.applySettings(), [{ label: t('pause.exit'), cls: 'red', onClick: () => this.leave(), confirm: t('pause.exitConfirm') }]);
    const paused = this.isPaused();
    const h2 = m.querySelector('h2') as HTMLElement;
    h2.textContent = paused ? t('pause.menuTitlePaused') : this.conn?.local ? t('pause.menuTitle') : t('pause.menuTitleRunning');
    if (!paused && !this.st.me?.host && !this.conn?.local) h2.after(el(`<div class="pause-note">${t('pause.onlyHost')}</div>`));
    this.ui.appendChild(m);
  }

  // ------------------------------------------------------------------ пауза

  /** Можно ли сейчас поставить паузу (хост, идёт игра). */
  private canPause(): boolean {
    return !!this.st.me?.host && this.st.phase !== 'lobby' && this.st.phase !== 'gameover';
  }

  private isPaused(): boolean {
    if (this.screen !== 'game') return false;
    return performance.now() - this.pauseWant.t < 600 ? this.pauseWant.v : this.st.paused;
  }

  private requestPause(v: boolean) {
    this.conn?.send({ t: 'pause', v });
    this.pauseWant = { v, t: performance.now() };
    if (v) this.controls?.release();
    this.updatePauseOverlay();
  }

  /** Esc/P/Start: хост ставит и снимает паузу, остальные открывают меню. */
  private togglePause() {
    if (this.isPaused() && this.st.me?.host && !this.ui.querySelector('.modal')) this.requestPause(false);
    else this.pauseButton();
  }

  /** Кнопка ❚❚: хост замораживает игру для всех, остальные открывают меню. */
  private pauseButton() {
    if (this.canPause() && !this.isPaused()) this.requestPause(true);
    else this.pauseMenu();
  }

  /** Затемнение «Пауза» поверх игры у всех игроков; у хоста — кнопка «Продолжить». */
  private updatePauseOverlay() {
    const show = this.isPaused() && this.st.phase !== 'gameover';
    if (!show) {
      this.pauseEl?.remove();
      this.pauseEl = null;
      return;
    }
    const host = !!this.st.me?.host;
    const key = host ? 'host' : 'guest';
    if (this.pauseEl?.dataset.k === key && this.pauseEl.isConnected) return;
    this.pauseEl?.remove();
    const hostName = playerName([...this.st.players.values()].find((p) => p.host)?.n ?? t('pause.host'));
    const text = host ? (this.conn?.local ? t('pause.stopped') : t('pause.stoppedAll')) : t('pause.byHost', { name: esc(hostName) });
    this.pauseEl = el(`
      <div class="screen pause-ov" data-k="${key}">
        <div class="panel">
          <h2>${t('pause.title')}</h2>
          <div class="pause-note">${text}</div>
          ${host ? `<button class="btn green" id="resume">${t('pause.resume')}</button>` : `<div class="pause-note dim">${t('pause.wait')}</div>`}
          <button class="btn ghost" id="pmenu">${t('pause.menu')}</button>
        </div>
      </div>`);
    const resume = this.pauseEl.querySelector<HTMLElement>('#resume');
    if (resume) onTap(resume, () => this.requestPause(false));
    onTap(this.pauseEl.querySelector<HTMLElement>('#pmenu')!, () => this.pauseMenu());
    // Меню настроек — поверх затемнения
    const modal = this.ui.querySelector('.modal');
    if (modal) modal.before(this.pauseEl);
    else this.ui.appendChild(this.pauseEl);
    this.controls?.release();
  }

  // ------------------------------------------------------------------ сеть

  private async connect(msg: { t: 'create'; name: string } | { t: 'join'; code: string; name: string }) {
    const err = this.ui.querySelector('#err');
    if (err) err.textContent = t('net.connecting');
    try {
      const c = await WsConnection.open(this.settings.server);
      this.attach(c);
      c.send(msg);
    } catch (e) {
      if (err) err.textContent = t('net.checkServer', { err: (e as Error).message });
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
        this.hud?.toast(t('net.reconnecting'), 'bad');
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    this.reconnecting = false;
    if (!silent) {
      clearSession();
      this.showMenu(t('net.reconnectFail'));
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
          if (err) err.textContent = tServer(m.msg);
          this.conn?.close();
          this.conn = null;
        } else if (m.msg === 'err.session') {
          clearSession();
          this.leave();
        } else this.hud?.toast(tServer(m.msg), 'bad');
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
    if (this.controls) {
      // Джойстик отпускаем, только когда управление прячется; при старте волны или дуэли
      // палец, уже лежащий на джойстике, должен продолжать вести героя
      const hide = ph === 'tavern' || ph === 'gameover';
      if (hide) this.controls.release();
      else this.controls.releaseSkills();
      // Сервер обнуляет ввод при расстановке героев — сразу переотправляем текущий
      this.sentInput.t = 0;
      this.controls.el.style.display = hide ? 'none' : '';
    }
    hud.el.style.display = ph === 'tavern' ? 'none' : '';
    if (this.st.me && this.controls) this.controls.setClass(this.st.me.c);
    switch (ph) {
      case 'intro': {
        const pvp = isPvpRound(st.round);
        const dragon = st.round === DRAGON_ROUND;
        const lair = st.round >= LAIR_ROUND;
        if (dragon) hud.showBanner(t('banner.dragon'), t('banner.dragonSub'), '#ff4a2a');
        else
          hud.showBanner(
            pvp ? t('banner.pvp') : t('banner.wave', { n: st.round }),
            pvp ? t('banner.pvpSub') : lair ? t('banner.lairSub') : isTrollRound(st.round) ? t('banner.bossSub') : t('banner.islandSub'),
            pvp ? '#ff7a5a' : lair ? '#ff8a4a' : 'var(--gold)',
          );
        sfx.fanfare();
        sfx.music('battle');
        break;
      }
      case 'clear':
        hud.showBanner(isPvpRound(st.round) ? t('banner.duelsOver') : t('banner.waveClear'), t('banner.goldEach', { n: 15 + 5 * st.round }), '#8aff7a');
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
        hud.showBanner(t('banner.duel'), a && b ? t('banner.vs', { a: playerName(a.n), b: playerName(b.n) }) : '', '#ff7a5a');
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
            if (e.why) hud.toast(t('toast.gold', { why: tServer(e.why), v: `${e.v > 0 ? '+' : ''}${e.v}` }), e.v > 0 ? 'gold' : 'bad');
            setTimeout(() => sfx.coin(), e.why ? 0 : 450);
          }
          break;
        case 'msg':
          hud.toast(tServer(e.k, e.p), e.kind);
          break;
        case 'buy': {
          const p = this.st.players.get(e.pid);
          if (e.pid === me) sfx.buy();
          else this.tavernToast(t('toast.bought', { name: playerName(p?.n ?? '?'), item: e.tpl ? itemName(e.tpl, e.rarity as Rarity) : e.name }));
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
          else if (id === 'demon' || id === 'howl' || id === 'beast') sfx.shout();
          else if (id === 'rend') sfx.swing();
          else if (id === 'pounce') sfx.dash();
          else if (id === 'blast' || id === 'bomb') sfx.bow();
          else if (id === 'turret') sfx.buy();
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
          else if (e.k === 'gslam' || e.k === 'quake' || e.k === 'pland') sfx.slam();
          else if (e.k === 'hwind') sfx.shout();
          else if (e.k === 'hthrow') sfx.swing();
          else if (e.k === 'hcatch') sfx.slam();
          else if (e.k === 'slam') {
            sfx.slam();
            this.haptic(ImpactStyle.Heavy);
          } else if (e.k === 'bossspawn') {
            sfx.slam();
            // Дракона встречает свой баннер на заставке волны
            if (this.st.round < LAIR_ROUND) hud.showBanner(t('banner.boss'), t('banner.bossTroll'), '#ff5a3a');
          }
          break;
        case 'mdie':
          sfx.mobDie();
          if (e.by === me) this.haptic(ImpactStyle.Light);
          break;
        case 'pdie':
          if (e.pid === me) {
            this.controls?.releaseSkills();
            sfx.death();
            this.haptic(ImpactStyle.Heavy);
          }
          break;
        case 'respawn':
          if (e.pid === me) sfx.respawn();
          break;
        case 'duel': {
          const w = e.winner ? this.st.players.get(e.winner) : null;
          if (!w) hud.showBanner(t('banner.draw'), '', '#fff');
          else if (e.winner === me) hud.showBanner(t('banner.win'), t('banner.goldPlus', { n: e.win }), '#8aff7a');
          else if (e.a === me || e.b === me) hud.showBanner(t('banner.lose'), e.lose ? t('banner.goldMinus', { n: e.lose }) : '', '#ff7a6a');
          else hud.showBanner(t('banner.winner', { name: playerName(w.n) }), '', 'var(--gold)');
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
    if (this.isPaused()) return;
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
    const wk = this.st.round >= LAIR_ROUND ? 'lair' : 'island';
    if (this.world && (this.world.kind ?? 'island') !== wk) this.world = worldFor(this.st.seed, this.st.round);
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
    // Трогаем DOM только при изменениях: лишние мутации мешают касаниям на iOS
    const set = (text: string, cls: string, show: boolean) => {
      const d = show ? '' : 'none';
      if (badge.style.display !== d) badge.style.display = d;
      if (badge.textContent !== text) badge.textContent = text;
      if (badge.className !== cls) badge.className = cls;
    };
    const tick = () => {
      const c = this.conn;
      if (!c) return set('', 'ping', false);
      if (c.local) return set(t('ping.solo'), 'ping solo', true);
      const ms = Math.round(c.rtt * 1000);
      set(t('ping.ms', { n: ms }), `ping ${ms < 90 ? '' : ms < 180 ? 'mid' : 'bad'}`, true);
    };
    tick();
    setInterval(tick, 500);
  }

  private loop(t: number) {
    // Следующий кадр планируем сразу: случайная ошибка в кадре не должна заморозить игру
    requestAnimationFrame((tt) => this.loop(tt));
    try {
      this.frame(t);
    } catch (e) {
      reportOnce('кадр', e);
    }
  }

  private frame(t: number) {
    // При съёмке на медленном рендере кадр длинный — эффекты должны успевать за симуляцией
    const realDt = Math.min(this.engine.lockRes ? 0.5 : 0.05, (t - this.last) / 1000);
    this.last = t;
    // На паузе замирает всё: анимации, эффекты, предсказание движения, перезарядки
    const paused = this.isPaused();
    const dt = paused ? 0 : realDt;
    if (this.screen === 'game') {
      this.updatePauseOverlay();
      this.controls?.update();
      this.predict(dt);
      this.sendInput();
      for (let i = 0; i < 4; i++) {
        this.cdLeft[i] = Math.max(0, this.cdLeft[i] - dt);
        this.castGuard[i] = Math.max(0, this.castGuard[i] - dt);
      }
      const me = this.st.me;
      if (me && this.controls) this.controls.setCooldowns(this.cdLeft, me.cdm);
      this.hud?.update(realDt, this.st, this.cdLeft);
      this.tavernUi?.update(this.st);
    }
    this.engine.frame(dt);
  }
}

new App();
