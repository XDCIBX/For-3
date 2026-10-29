import {
  ARENA_RADIUS,
  CLEAR_TIME,
  DUEL_END_TIME,
  DUEL_TIME,
  INTRO_TIME,
  MAX_PLAYERS,
  MAX_ROUNDS,
  PLAYER_RADIUS,
  PVP_EVERY,
  RESPAWN_TIME,
  TAVERN_TIME,
} from '../constants';
import { CLASSES } from '../data/classes';
import { computeStats, emptyEquip, generateShop, sellValue } from '../data/items';
import { MOBS, mobScale, roundComposition } from '../data/mobs';
import type { GameEvent, GameMsg, MinionSnap, MobSnap, PlayerSnap, Snapshot } from '../protocol';
import { Rng } from '../rng';
import type { Equip, HeroClass, Item, MinionKind, MobKind, Phase, ProjKind, Stats, ZoneKind } from '../types';
import { HERO_CLASSES } from '../types';
import { ARENA_OBSTACLES, generateWorld, hitsSolid, resolveCollision, type Obstacle, type WorldData } from '../world';
import { updateBot } from './bot';

export interface Player {
  id: string;
  name: string;
  cls: HeroClass;
  bot: boolean;
  host: boolean;
  connected: boolean;
  token: string;
  ready: boolean;
  x: number;
  z: number;
  rot: number;
  hp: number;
  shield: number;
  alive: boolean;
  respawn: number;
  spectator: boolean;
  gold: number;
  kills: number;
  pvpWins: number;
  pvpLosses: number;
  dmgDealt: number;
  equip: Equip;
  stats: Stats;
  input: { mx: number; mz: number };
  cds: number[];
  cdMax: number[];
  stunT: number;
  frozenT: number;
  slowT: number;
  slowAmt: number;
  invulnT: number;
  warcryT: number;
  rageT: number;
  hasteT: number;
  whirlT: number;
  whirlTick: number;
  /** Демоническая форма охотника. */
  demonT: number;
  /** Звериная форма оборотня. */
  beastT: number;
  faceT: number;
  lastHurt: number;
  dash: { vx: number; vz: number; t: number; hit: Set<number | string>; kind: 'charge' | 'roll' | 'shadow' | 'pounce' } | null;
  /** Внутреннее состояние ИИ ботов. */
  ai: { think: number; tavernT: number; strafe: number; aimErr: number };
}

export interface Mob {
  id: number;
  kind: MobKind;
  x: number;
  z: number;
  rot: number;
  hp: number;
  maxHp: number;
  dmg: number;
  speed: number;
  radius: number;
  gold: number;
  target: string | null;
  retarget: number;
  atkCd: number;
  windup: number;
  spawnT: number;
  stunT: number;
  frozenT: number;
  slowT: number;
  slowAmt: number;
  tauntT: number;
  tauntBy: string | null;
  burnT: number;
  slamCd: number;
  /** Бросок молота (босс): перезарядка, замах (-1 — нет), снаряд в полёте (0 — молот в руке). */
  throwCd: number;
  throwT: number;
  throwDx: number;
  throwDz: number;
  throwDist: number;
  hammer: number;
  lastHit: string | null;
}

export interface Proj {
  id: number;
  kind: ProjKind;
  owner: string | null;
  team: 'p' | 'm';
  x: number;
  z: number;
  vx: number;
  vz: number;
  life: number;
  dmg: number;
  crit: boolean;
  r: number;
  explodeR: number;
  hit: Set<number | string>;
  /** Сколько раз снаряд ещё отскочит к новой цели (глефа). */
  bounces?: number;
  /** Выпущен помощником (тотемом). */
  fromMinion?: boolean;
  /** Молот босса: летит к цели и возвращается к хозяину. */
  boomerang?: { mob: number; back: boolean; t: number };
}

/** Множитель золота с мобов и боссов. */
const GOLD_DROP = 0.75 * 1.25 * 1.35;

/** Радиус круга тотема и урон его волны духов (каждые 0,5 с, доля урона призывателя). */
const TOTEM_R = 5.5;
const TOTEM_PULSE = 0.14;
const TOTEM_PULSE_DUEL = 0.1;
/** Выстрел турели гнома (доля урона гнома). */
const TURRET_SHOT = 0.6;

/** Призванный помощник (волк, голем, тотем). */
export interface Minion {
  id: number;
  kind: MinionKind;
  owner: string;
  x: number;
  z: number;
  rot: number;
  hp: number;
  maxHp: number;
  armor: number;
  speed: number;
  radius: number;
  life: number;
  atkCd: number;
  pulse: number;
  retarget: number;
  target: number | string | null;
}

export interface Zone {
  id: number;
  kind: ZoneKind;
  owner: string | null;
  x: number;
  z: number;
  r: number;
  t: number;
  dur: number;
  delay: number;
  tickT: number;
  fired: boolean;
  dmg: number;
}

type Target =
  | { kind: 'm'; m: Mob; x: number; z: number; rad: number }
  | { kind: 'p'; p: Player; x: number; z: number; rad: number }
  | { kind: 'n'; n: Minion; x: number; z: number; rad: number };

/** Кого атакует моб: героя или призванного помощника. */
interface Victim {
  id: string;
  x: number;
  z: number;
  p?: Player;
  n?: Minion;
}

const BOT_NAMES = ['Борис', 'Глаша', 'Тихон', 'Варя', 'Фрол', 'Злата', 'Ерёма', 'Луша'];

const r2 = (v: number) => Math.round(v * 100) / 100;

function randToken(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

export function isCombatPhase(ph: Phase) {
  return ph === 'battle' || ph === 'duel';
}
export function canMovePhase(ph: Phase) {
  return ph === 'intro' || ph === 'battle' || ph === 'clear' || ph === 'duel';
}
export function isArenaPhase(ph: Phase) {
  return ph === 'duel_intro' || ph === 'duel' || ph === 'duel_end';
}

export class Game {
  readonly seed: number;
  readonly world: WorldData;
  readonly rng: Rng;
  phase: Phase = 'lobby';
  round = 0;
  timer = 0;
  time = 0;
  tick = 0;
  players = new Map<string, Player>();
  mobs = new Map<number, Mob>();
  projs = new Map<number, Proj>();
  zones = new Map<number, Zone>();
  minions = new Map<number, Minion>();
  events: GameEvent[] = [];
  shop: Item[] = [];
  spawnQueue: MobKind[] = [];
  spawnT = 0;
  mobsTotal = 0;
  duels: [string, string][] = [];
  duelIdx = 0;
  result: { win: boolean; round: number } | null = null;
  /** С какого раунда начинать (для тренировки/отладки в одиночной игре). */
  startRound = 1;
  private nextId = 1;
  private pidCounter = 1;
  /** Удар наносит помощник (в ПвП их урон по героям снижен). */
  private minionStrike = false;
  private dirty = true;

  constructor(seed = (Math.random() * 2 ** 31) | 0) {
    this.seed = seed;
    this.world = generateWorld(seed);
    this.rng = new Rng(seed ^ 0x5bd1e995);
  }

  // ------------------------------------------------------------------ лобби

  addPlayer(name: string, bot = false): Player | string {
    if (this.phase !== 'lobby') return 'Игра уже началась';
    if (this.players.size >= MAX_PLAYERS) return 'Комната заполнена';
    const taken = new Set([...this.players.values()].map((p) => p.cls));
    const cls = HERO_CLASSES.find((c) => !taken.has(c)) ?? 'warrior';
    const id = `p${this.pidCounter++}`;
    const clean = (name || 'Герой').replace(/[<>]/g, '').trim().slice(0, 14) || 'Герой';
    const p: Player = {
      id,
      name: clean,
      cls,
      bot,
      host: !bot && ![...this.players.values()].some((q) => q.host && q.connected),
      connected: true,
      token: randToken(),
      ready: bot,
      x: 0,
      z: 0,
      rot: 0,
      hp: 1,
      shield: 0,
      alive: true,
      respawn: 0,
      spectator: false,
      gold: 0,
      kills: 0,
      pvpWins: 0,
      pvpLosses: 0,
      dmgDealt: 0,
      equip: emptyEquip(),
      stats: computeStats(cls, emptyEquip()),
      input: { mx: 0, mz: 0 },
      cds: [0, 0, 0, 0],
      cdMax: [1, 1, 1, 1],
      stunT: 0,
      frozenT: 0,
      slowT: 0,
      slowAmt: 0,
      invulnT: 0,
      warcryT: 0,
      rageT: 0,
      hasteT: 0,
      whirlT: 0,
      whirlTick: 0,
      demonT: 0,
      beastT: 0,
      faceT: 0,
      lastHurt: 99,
      dash: null,
      ai: { think: 0, tavernT: 2 + Math.random() * 4, strafe: Math.random() < 0.5 ? 1 : -1, aimErr: 0 },
    };
    p.hp = p.stats.maxHp;
    this.players.set(id, p);
    this.dirty = true;
    return p;
  }

  addBot(): Player | string {
    const used = new Set([...this.players.values()].map((p) => p.name));
    const name = 'Бот ' + (this.rng.shuffle([...BOT_NAMES]).find((n) => !used.has('Бот ' + n)) ?? 'Бот');
    return this.addPlayer(name, true);
  }

  removePlayer(id: string) {
    const p = this.players.get(id);
    if (!p) return;
    if (this.phase === 'lobby') {
      this.players.delete(id);
      if (p.host) {
        const next = [...this.players.values()].find((q) => !q.bot && q.connected);
        if (next) next.host = true;
      }
    } else {
      p.connected = false;
      p.input = { mx: 0, mz: 0 };
      this.msg(`${p.name} отключился`, 'bad');
      if (p.host) {
        p.host = false;
        const next = [...this.players.values()].find((q) => !q.bot && q.connected);
        if (next) next.host = true;
      }
    }
    this.dirty = true;
  }

  reconnect(id: string) {
    const p = this.players.get(id);
    if (!p) return;
    p.connected = true;
    if (![...this.players.values()].some((q) => q.host && q.connected)) p.host = true;
    this.msg(`${p.name} вернулся в игру`, 'good');
    this.dirty = true;
  }

  humansConnected(): number {
    let n = 0;
    for (const p of this.players.values()) if (!p.bot && p.connected) n++;
    return n;
  }

  /** Игроки, участвующие в игре (подключены или боты). */
  active(): Player[] {
    return [...this.players.values()].filter((p) => p.bot || p.connected);
  }

  handle(pid: string, msg: GameMsg) {
    const p = this.players.get(pid);
    if (!p || !msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'pick': {
        if (this.phase !== 'lobby' || !HERO_CLASSES.includes(msg.cls)) return;
        if ([...this.players.values()].some((q) => q.id !== pid && q.cls === msg.cls)) return;
        p.cls = msg.cls;
        p.stats = computeStats(p.cls, p.equip);
        p.hp = p.stats.maxHp;
        this.dirty = true;
        break;
      }
      case 'ready':
        if (this.phase === 'lobby' || this.phase === 'tavern') {
          p.ready = !!msg.v;
          this.dirty = true;
        }
        break;
      case 'start':
        if (this.phase === 'lobby' && p.host && [...this.players.values()].every((q) => q.ready)) this.startGame();
        break;
      case 'addBot':
        if (this.phase === 'lobby' && p.host) this.addBot();
        break;
      case 'botcls': {
        const q = this.players.get(String(msg.id));
        if (this.phase !== 'lobby' || !p.host || !q || !q.bot || !HERO_CLASSES.includes(msg.cls)) return;
        if ([...this.players.values()].some((o) => o.id !== q.id && o.cls === msg.cls)) return;
        q.cls = msg.cls;
        q.stats = computeStats(q.cls, q.equip);
        q.hp = q.stats.maxHp;
        this.dirty = true;
        break;
      }
      case 'kick': {
        const q = this.players.get(String(msg.id));
        if (this.phase === 'lobby' && p.host && q && q.bot) this.removePlayer(q.id);
        break;
      }
      case 'in': {
        let mx = Number(msg.mx) || 0;
        let mz = Number(msg.mz) || 0;
        const l = Math.hypot(mx, mz);
        if (l > 1) {
          mx /= l;
          mz /= l;
        }
        p.input = { mx, mz };
        break;
      }
      case 'cast':
        this.castSkill(p, Number(msg.s) | 0, Number(msg.dx) || 0, Number(msg.dz) || 0, Number(msg.d) || 0);
        break;
      case 'buy':
        this.buy(p, String(msg.id));
        break;
    }
  }

  // ------------------------------------------------------------------ фазы

  private setPhase(ph: Phase, timer: number) {
    this.phase = ph;
    this.timer = timer;
    this.dirty = true;
  }

  startGame() {
    if (this.players.size === 0) return;
    this.round = Math.max(1, Math.min(MAX_ROUNDS, this.startRound));
    for (const p of this.players.values()) {
      p.gold = 0;
      p.ready = false;
    }
    this.beginRound();
  }

  isPvpRound(r = this.round) {
    return r % PVP_EVERY === 0;
  }

  private resetHero(p: Player, x: number, z: number, rot: number) {
    p.x = x;
    p.z = z;
    p.rot = rot;
    p.alive = true;
    p.respawn = 0;
    p.spectator = false;
    p.stats = computeStats(p.cls, p.equip);
    p.hp = p.stats.maxHp;
    p.shield = p.cls === 'mage' ? this.shieldMax(p) : 0;
    p.cds = [0, 0, 0, 0];
    p.stunT = p.frozenT = p.slowT = p.invulnT = p.warcryT = p.rageT = p.hasteT = p.whirlT = p.demonT = p.beastT = 0;
    p.dash = null;
    p.input = { mx: 0, mz: 0 };
    p.lastHurt = 99;
  }

  private placeAtCamp() {
    const ps = this.active();
    ps.forEach((p, i) => {
      const a = (i / Math.max(1, ps.length)) * Math.PI * 2 + Math.PI / 2;
      this.resetHero(p, Math.cos(a) * 2.6, Math.sin(a) * 2.6 + 1.5, a + Math.PI / 2);
    });
  }

  beginRound() {
    this.mobs.clear();
    this.projs.clear();
    this.zones.clear();
    this.minions.clear();
    for (const p of this.players.values()) p.ready = false;
    this.placeAtCamp();
    this.setPhase('intro', INTRO_TIME);
  }

  private startBattle() {
    const players = this.active().length;
    this.spawnQueue = roundComposition(this.round, players, this.rng);
    const bossIdx = this.spawnQueue.indexOf('troll');
    if (bossIdx >= 0) {
      // Босс — в конце волны
      const bosses = this.spawnQueue.filter((k) => k === 'troll');
      this.spawnQueue = this.spawnQueue.filter((k) => k !== 'troll');
      this.rng.shuffle(this.spawnQueue);
      this.spawnQueue.splice(Math.floor(this.spawnQueue.length * 0.55), 0, ...bosses);
    } else this.rng.shuffle(this.spawnQueue);
    this.mobsTotal = this.spawnQueue.length;
    this.spawnT = 0.4;
    this.setPhase('battle', -1);
  }

  private finishRound() {
    const bonus = 15 + 5 * this.round;
    for (const p of this.active()) {
      p.gold += bonus;
      this.events.push({ e: 'gold', pid: p.id, v: bonus, x: p.x, z: p.z, why: 'Награда за раунд' });
    }
    this.msg(this.isPvpRound() ? 'ПвП раунд завершён!' : 'Раунд пройден!', 'good');
    this.setPhase('clear', CLEAR_TIME);
  }

  private enterTavern() {
    if (this.round >= MAX_ROUNDS) {
      this.endGame(true);
      return;
    }
    this.mobs.clear();
    this.projs.clear();
    this.zones.clear();
    this.minions.clear();
    const classes = this.active().map((p) => p.cls);
    this.shop = generateShop(this.rng, this.round + 1, classes);
    for (const p of this.players.values()) {
      p.ready = false;
      p.alive = true;
      p.spectator = false;
      p.stats = computeStats(p.cls, p.equip);
      p.hp = p.stats.maxHp;
      p.ai.tavernT = 2 + Math.random() * 5;
    }
    this.setPhase('tavern', TAVERN_TIME);
  }

  private endGame(win: boolean) {
    this.result = { win, round: this.round };
    this.mobs.clear();
    this.projs.clear();
    this.zones.clear();
    this.minions.clear();
    this.setPhase('gameover', -1);
    this.msg(win ? 'Победа! Вы прошли все раунды!' : 'Все герои пали…', win ? 'good' : 'bad');
  }

  private setupDuels() {
    const ps = this.active().map((p) => p.id);
    this.duels = [];
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) this.duels.push([ps[i], ps[j]]);
    if (this.duels.length === 3) this.duels = [this.duels[0], this.duels[2], this.duels[1]];
    this.duelIdx = 0;
  }

  private startDuelIntro() {
    const [a, b] = this.duels[this.duelIdx];
    this.mobs.clear();
    this.projs.clear();
    this.zones.clear();
    this.minions.clear();
    for (const p of this.players.values()) {
      if (p.id === a) this.resetHero(p, -6.5, 0, Math.PI / 2);
      else if (p.id === b) this.resetHero(p, 6.5, 0, -Math.PI / 2);
      else {
        this.resetHero(p, 0, -ARENA_RADIUS - 3, 0);
        p.spectator = true;
      }
    }
    const pa = this.players.get(a)!;
    const pb = this.players.get(b)!;
    this.msg(`Дуэль: ${pa.name} против ${pb.name}`, 'info');
    this.setPhase('duel_intro', INTRO_TIME);
  }

  pvpReward() {
    return { win: 40 + 10 * this.round, lose: 20 + 5 * this.round };
  }

  private endDuel(winnerId: string | null) {
    if (this.phase !== 'duel') return;
    const [a, b] = this.duels[this.duelIdx];
    const { win, lose } = this.pvpReward();
    let lost = 0;
    if (winnerId) {
      const w = this.players.get(winnerId)!;
      const l = this.players.get(winnerId === a ? b : a)!;
      lost = Math.min(l.gold, lose);
      w.gold += win;
      l.gold -= lost;
      w.pvpWins++;
      l.pvpLosses++;
      this.events.push({ e: 'gold', pid: w.id, v: win, x: w.x, z: w.z, why: 'Победа в дуэли' });
      if (lost > 0) this.events.push({ e: 'gold', pid: l.id, v: -lost, x: l.x, z: l.z, why: 'Поражение в дуэли' });
      this.msg(`${w.name} побеждает! +${win} золота`, 'gold');
    } else {
      this.msg('Ничья!', 'info');
    }
    this.events.push({ e: 'duel', a, b, winner: winnerId, win, lose: lost });
    this.projs.clear();
    this.zones.clear();
    this.minions.clear();
    this.setPhase('duel_end', DUEL_END_TIME);
  }

  // ------------------------------------------------------------------ таверна

  buy(p: Player, id: string) {
    if (this.phase !== 'tavern') return;
    const idx = this.shop.findIndex((i) => i.id === id);
    if (idx < 0) return;
    const it = this.shop[idx];
    if (it.cls && it.cls !== p.cls) return;
    const old = p.equip[it.slot];
    const refund = old ? sellValue(old) : 0;
    if (p.gold + refund < it.price) return;
    p.gold += refund - it.price;
    p.equip[it.slot] = it;
    this.shop.splice(idx, 1);
    p.stats = computeStats(p.cls, p.equip);
    p.hp = p.stats.maxHp;
    this.events.push({ e: 'buy', pid: p.id, name: it.name, rarity: it.rarity });
    this.dirty = true;
  }

  // ------------------------------------------------------------------ главный цикл

  get obstacles(): readonly Obstacle[] {
    return isArenaPhase(this.phase) ? ARENA_OBSTACLES : this.world.obstacles;
  }
  get bound(): number {
    return isArenaPhase(this.phase) ? ARENA_RADIUS : this.world.radius;
  }

  update(dt: number) {
    this.time += dt;
    this.tick++;
    if (this.timer > 0) this.timer = Math.max(0, this.timer - dt);

    for (const p of this.players.values()) if (p.bot) updateBot(this, p, dt);

    switch (this.phase) {
      case 'intro':
        if (this.timer <= 0) {
          if (this.isPvpRound()) {
            this.setupDuels();
            if (this.duels.length === 0) {
              this.msg('Нет соперников для ПвП — отдыхайте!', 'info');
              this.finishRound();
            } else this.startDuelIntro();
          } else this.startBattle();
        }
        break;
      case 'battle':
        this.updateSpawner(dt);
        if (this.spawnQueue.length === 0 && this.mobs.size === 0) this.finishRound();
        break;
      case 'clear':
        if (this.timer <= 0) this.enterTavern();
        break;
      case 'tavern': {
        const act = this.active();
        if (this.timer <= 0 || (act.length > 0 && act.every((p) => p.ready))) {
          this.round++;
          this.beginRound();
        }
        break;
      }
      case 'duel_intro':
        if (this.timer <= 0) this.setPhase('duel', DUEL_TIME);
        break;
      case 'duel': {
        const [a, b] = this.duels[this.duelIdx];
        const pa = this.players.get(a)!;
        const pb = this.players.get(b)!;
        if (!pa.connected && !pa.bot) this.endDuel(b);
        else if (!pb.connected && !pb.bot) this.endDuel(a);
        else if (this.timer <= 0) {
          const fa = pa.hp / pa.stats.maxHp;
          const fb = pb.hp / pb.stats.maxHp;
          this.endDuel(Math.abs(fa - fb) < 0.01 ? null : fa > fb ? a : b);
        }
        break;
      }
      case 'duel_end':
        if (this.timer <= 0) {
          this.duelIdx++;
          if (this.duelIdx < this.duels.length) this.startDuelIntro();
          else {
            this.placeAtCamp();
            this.finishRound();
          }
        }
        break;
    }

    if (canMovePhase(this.phase) || isCombatPhase(this.phase)) {
      this.updatePlayers(dt);
      this.updateMinions(dt);
      this.updateMobs(dt);
      this.updateProjectiles(dt);
      this.updateZones(dt);
    }

    if (this.phase === 'battle') {
      const act = this.active();
      if (act.length > 0 && act.every((p) => !p.alive)) this.endGame(false);
    }
  }

  // ------------------------------------------------------------------ спавн

  private updateSpawner(dt: number) {
    this.spawnT -= dt;
    if (this.spawnT > 0 || this.spawnQueue.length === 0) return;
    const maxAlive = 10 + this.round * 2 + this.active().length * 2;
    if (this.mobs.size >= maxAlive) {
      this.spawnT = 0.5;
      return;
    }
    const sp = this.rng.pick(this.world.spawns);
    const n = Math.min(this.spawnQueue.length, this.rng.int(2, 3 + Math.floor(this.round / 4)));
    for (let i = 0; i < n; i++) {
      const kind = this.spawnQueue.shift()!;
      this.spawnMob(kind, sp.x + this.rng.range(-1.6, 1.6), sp.z + this.rng.range(-1.6, 1.6));
      if (kind === 'troll') break;
    }
    this.spawnT = Math.max(0.8, 2.6 - this.round * 0.08);
  }

  spawnMob(kind: MobKind, x: number, z: number): Mob {
    const def = MOBS[kind];
    const sc = mobScale(this.round);
    const pf = 0.6 + 0.4 * (this.active().length / 3);
    const hp = Math.round(def.hp * sc.hp * (def.boss ? pf : 1));
    const m: Mob = {
      id: this.nextId++,
      kind,
      x,
      z,
      rot: Math.atan2(-x, -z),
      hp,
      maxHp: hp,
      dmg: def.dmg * sc.dmg,
      speed: def.speed * this.rng.range(0.92, 1.08),
      radius: def.radius,
      // Добыча с мобов и боссов: 75% от исходной, затем +25% и +35% (≈127%); округляем при выдаче
      gold: def.gold * sc.gold * GOLD_DROP,
      target: null,
      retarget: 0,
      atkCd: 0.5,
      windup: -1,
      spawnT: 0.9,
      stunT: 0,
      frozenT: 0,
      slowT: 0,
      slowAmt: 0,
      tauntT: 0,
      tauntBy: null,
      burnT: 0,
      slamCd: 4,
      throwCd: 3 + this.rng.next() * 4,
      throwT: -1,
      throwDx: 0,
      throwDz: 1,
      throwDist: 0,
      hammer: 0,
      lastHit: null,
    };
    this.mobs.set(m.id, m);
    this.events.push({ e: 'fx', k: def.boss ? 'bossspawn' : 'spawn', x, z });
    if (def.boss) this.msg(`Появился ${def.name}!`, 'bad');
    return m;
  }

  // ------------------------------------------------------------------ события

  msg(text: string, kind: 'info' | 'good' | 'bad' | 'gold' = 'info') {
    this.events.push({ e: 'msg', text, kind });
  }

  // ------------------------------------------------------------------ цели и урон

  targetsFor(p: Player): Target[] {
    const out: Target[] = [];
    if (this.phase === 'battle' || this.phase === 'clear' || this.phase === 'intro') {
      for (const m of this.mobs.values()) if (m.spawnT <= 0) out.push({ kind: 'm', m, x: m.x, z: m.z, rad: m.radius });
    } else if (this.phase === 'duel') {
      const [a, b] = this.duels[this.duelIdx];
      const o = this.players.get(p.id === a ? b : p.id === b ? a : '');
      if (o && o.alive) {
        out.push({ kind: 'p', p: o, x: o.x, z: o.z, rad: PLAYER_RADIUS });
        // Помощники соперника тоже враги (кроме тотема)
        for (const n of this.minions.values()) if (n.owner === o.id && n.kind !== 'totem') out.push({ kind: 'n', n, x: n.x, z: n.z, rad: n.radius });
      }
    }
    return out;
  }

  private targetId(t: Target): number | string {
    return t.kind === 'm' ? t.m.id : t.kind === 'p' ? t.p.id : `n${t.n.id}`;
  }

  nearestTarget(p: Player, maxDist: number): Target | null {
    let best: Target | null = null;
    let bd = maxDist;
    for (const t of this.targetsFor(p)) {
      // В дуэли автоприцел предпочитает героя, а не его помощников
      const d = Math.hypot(t.x - p.x, t.z - p.z) - t.rad - (t.kind === 'p' ? 2.5 : 0);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best;
  }

  rollDamage(p: Player, mult: number, canCrit = true): { v: number; crit: boolean } {
    // Сила умений от экипировки; помощники и так растут вместе со статами героя, им — половина
    let v = p.stats.damage * mult * (1 + p.stats.skillPower * (this.minionStrike ? 0.5 : 1)) * this.rng.range(0.9, 1.1);
    if (p.warcryT > 0) v *= this.phase === 'duel' ? 1.12 : 1.3;
    else if (p.rageT > 0) v *= 1.25;
    if (p.demonT > 0) v *= 1.1;
    if (p.beastT > 0) v *= this.phase === 'duel' ? 1.2 : 1.25;
    // Зов крови оборотня
    if (p.cls === 'werewolf' && p.hp < p.stats.maxHp * 0.4) v *= 1.15;
    const crit = canCrit && this.rng.next() < p.stats.crit;
    if (crit) v *= p.cls === 'archer' ? 2.2 : 2;
    return { v, crit };
  }

  private hit(p: Player, t: Target, mult: number, fx?: { stun?: number; freeze?: number; slow?: number; slowT?: number }, pre?: { v: number; crit: boolean }) {
    const { v, crit } = pre ?? this.rollDamage(p, mult);
    let dealt: number;
    if (t.kind === 'm') {
      const m = t.m;
      if (fx?.stun) m.stunT = Math.max(m.stunT, fx.stun);
      if (fx?.freeze) m.frozenT = Math.max(m.frozenT, fx.freeze);
      if (fx?.slow) {
        m.slowT = Math.max(m.slowT, fx.slowT ?? 1);
        m.slowAmt = Math.max(m.slowAmt, fx.slow);
      }
      dealt = this.damageMob(m, v, crit, p.id);
    } else if (t.kind === 'n') {
      dealt = this.damageMinion(t.n, v * 0.75, crit);
    } else {
      const o = t.p;
      // В ПвП контроль слабее
      if (fx?.stun) o.stunT = Math.max(o.stunT, fx.stun * 0.6);
      if (fx?.freeze) {
        o.frozenT = Math.max(o.frozenT, fx.freeze * 0.4);
        o.slowT = Math.max(o.slowT, 2);
        o.slowAmt = Math.max(o.slowAmt, 0.4);
      }
      if (fx?.slow) {
        o.slowT = Math.max(o.slowT, fx.slowT ?? 1);
        o.slowAmt = Math.max(o.slowAmt, fx.slow);
      }
      dealt = this.damagePlayer(o, v * 0.75, crit, p.id);
    }
    p.dmgDealt += dealt;
    const ls = (p.stats.lifesteal + (p.demonT > 0 ? 0.15 : 0)) * (this.phase === 'duel' ? 0.5 : 1);
    if (ls > 0 && dealt > 0 && p.alive) {
      const h = dealt * ls;
      p.hp = Math.min(p.stats.maxHp, p.hp + h);
    }
  }

  damageMob(m: Mob, v: number, crit: boolean, pid: string | null): number {
    if (m.spawnT > 0 || m.hp <= 0) return 0;
    const dealt = Math.max(1, Math.round(v));
    m.hp -= dealt;
    if (pid) m.lastHit = pid;
    this.events.push({ e: 'dmg', x: r2(m.x), z: r2(m.z), v: dealt, c: crit, tp: 'm', id: m.id });
    if (m.hp <= 0) this.killMob(m, pid);
    return dealt;
  }

  private killMob(m: Mob, pid: string | null) {
    this.mobs.delete(m.id);
    const killerId = pid ?? m.lastHit;
    this.events.push({ e: 'mdie', id: m.id, k: m.kind, by: killerId, x: r2(m.x), z: r2(m.z) });
    const killer = killerId ? this.players.get(killerId) : undefined;
    if (killer) {
      const g = Math.max(1, Math.round(m.gold * this.rng.range(0.9, 1.15)));
      killer.gold += g;
      killer.kills++;
      this.events.push({ e: 'gold', pid: killer.id, v: g, x: r2(m.x), z: r2(m.z) });
    }
  }

  damagePlayer(t: Player, v: number, crit: boolean, src: string | null): number {
    if (!t.alive || t.invulnT > 0 || t.spectator || !canMovePhase(this.phase)) return 0;
    if (t.warcryT > 0) v *= this.phase === 'duel' ? 0.85 : 0.6;
    if (t.demonT > 0) v *= 0.9;
    if (t.beastT > 0) v *= this.phase === 'duel' ? 0.87 : 0.85;
    // Каменная кровь гнома
    if (t.cls === 'dwarf') v *= 0.88;
    if (t.cls === 'summoner') {
      // Связь душ: треть урона забирает на себя ближайший помощник
      let link: Minion | null = null;
      let bd = 12;
      for (const n of this.minions.values()) {
        if (n.owner !== t.id || n.kind === 'totem') continue;
        const d = Math.hypot(n.x - t.x, n.z - t.z);
        if (d < bd) {
          bd = d;
          link = n;
        }
      }
      if (link) {
        this.damageMinion(link, v * 0.35, false);
        v *= 0.65;
      }
    }
    v *= 50 / (50 + t.stats.armor);
    let dmg = Math.max(1, Math.round(v));
    const total = dmg;
    if (t.shield > 0) {
      const a = Math.min(t.shield, dmg);
      t.shield -= a;
      dmg -= a;
    }
    t.hp -= dmg;
    t.lastHurt = 0;
    this.events.push({ e: 'dmg', x: r2(t.x), z: r2(t.z), v: total, c: crit, tp: 'p', id: t.id });
    if (t.hp <= 0) this.playerDie(t, src);
    return total;
  }

  /** Урон помощнику. */
  damageMinion(n: Minion, v: number, crit: boolean): number {
    if (n.hp <= 0 || !this.minions.has(n.id)) return 0;
    const dealt = Math.max(1, Math.round(v * (50 / (50 + n.armor))));
    n.hp -= dealt;
    this.events.push({ e: 'dmg', x: r2(n.x), z: r2(n.z), v: dealt, c: crit, tp: 'n', id: n.id });
    if (n.hp <= 0) this.killMinion(n, true);
    return dealt;
  }

  private killMinion(n: Minion, slain: boolean) {
    this.minions.delete(n.id);
    this.events.push({ e: 'ndie', id: n.id, x: r2(n.x), z: r2(n.z) });
    // Пассивка призывателя: гибель помощника лечит хозяина
    const o = this.players.get(n.owner);
    if (slain && o && o.alive && o.cls === 'summoner') o.hp = Math.min(o.stats.maxHp, o.hp + o.stats.maxHp * 0.1);
  }

  private playerDie(p: Player, killer: string | null) {
    p.hp = 0;
    p.alive = false;
    p.dash = null;
    p.whirlT = 0;
    p.demonT = 0;
    p.beastT = 0;
    p.input = { mx: 0, mz: 0 };
    this.events.push({ e: 'pdie', pid: p.id });
    for (const n of [...this.minions.values()]) if (n.owner === p.id) this.killMinion(n, false);
    if (this.phase === 'duel') {
      const [a, b] = this.duels[this.duelIdx];
      this.endDuel(p.id === a ? b : a);
      return;
    }
    p.respawn = RESPAWN_TIME + this.round * 0.3;
    const k = killer ? this.players.get(killer) : null;
    this.msg(k ? `${p.name} повержен игроком ${k.name}` : `${p.name} пал в бою!`, 'bad');
  }

  // ------------------------------------------------------------------ умения

  castSkill(p: Player, s: number, dx: number, dz: number, dist: number) {
    if (s < 0 || s > 3) return;
    if (!isCombatPhase(this.phase) && !(this.phase === 'clear' || this.phase === 'intro')) return;
    if (!p.alive || p.spectator || p.stunT > 0 || p.frozenT > 0 || p.dash) return;
    if (p.cds[s] > 0.05) return;
    const def = CLASSES[p.cls].skills[s];
    let dl = Math.hypot(dx, dz);
    let tx: number;
    let tz: number;
    if (dl < 0.01) {
      // Автоприцел по ближайшему врагу
      const t = this.nearestTarget(p, Math.max(def.range, 5) + 3);
      if (t && def.aim !== 'self') {
        dx = t.x - p.x;
        dz = t.z - p.z;
        dl = Math.hypot(dx, dz) || 1;
        tx = t.x;
        tz = t.z;
      } else {
        dx = Math.sin(p.rot);
        dz = Math.cos(p.rot);
        dl = 1;
        tx = p.x + dx * Math.min(6, def.range);
        tz = p.z + dz * Math.min(6, def.range);
      }
    } else {
      const d = Math.max(0, Math.min(def.range, dist));
      tx = p.x + (dx / dl) * d;
      tz = p.z + (dz / dl) * d;
    }
    dx /= dl;
    dz /= dl;
    if (def.aim !== 'self') {
      p.rot = Math.atan2(dx, dz);
      p.faceT = 0.45;
    }

    const atkSpd = p.stats.attackSpeed * (p.hasteT > 0 ? 1.6 : 1) * (p.demonT > 0 ? (this.phase === 'duel' ? 1.25 : 1.4) : 1) * (p.beastT > 0 ? 1.2 : 1);
    p.cdMax[s] = s === 0 ? def.cd / atkSpd : def.cd * (1 - p.stats.cdr);
    p.cds[s] = p.cdMax[s];
    this.events.push({ e: 'cast', pid: p.id, s, r: r2(p.rot), x: r2(tx), z: r2(tz) });

    const id = `${p.cls}:${s}`;
    switch (id) {
      // ---------------- Воин
      case 'warrior:0': {
        const reach = def.range;
        for (const t of this.targetsFor(p)) {
          const ox = t.x - p.x;
          const oz = t.z - p.z;
          const d = Math.hypot(ox, oz);
          if (d - t.rad > reach) continue;
          if (d > 0.8 && (ox * dx + oz * dz) / d < Math.cos((65 * Math.PI) / 180)) continue;
          this.hit(p, t, 1.1);
        }
        this.events.push({ e: 'fx', k: 'slash', x: r2(p.x), z: r2(p.z), rot: r2(p.rot), pid: p.id });
        break;
      }
      case 'warrior:1':
        p.dash = { vx: dx * 26, vz: dz * 26, t: 0.27, hit: new Set(), kind: 'charge' };
        this.events.push({ e: 'fx', k: 'charge', x: r2(p.x), z: r2(p.z), rot: r2(p.rot), pid: p.id });
        break;
      case 'warrior:2':
        p.whirlT = 2.0;
        p.whirlTick = 0;
        this.events.push({ e: 'fx', k: 'whirl', x: r2(p.x), z: r2(p.z), pid: p.id });
        break;
      case 'warrior:3': {
        // В дуэли клич короче: защищать некого
        p.warcryT = this.phase === 'duel' ? 4 : 6;
        for (const q of this.active()) {
          if (q.id !== p.id && q.alive && Math.hypot(q.x - p.x, q.z - p.z) < 9) {
            if (this.phase !== 'duel') q.rageT = 6;
          }
        }
        for (const m of this.mobs.values()) {
          if (Math.hypot(m.x - p.x, m.z - p.z) < 10) {
            m.tauntT = 4;
            m.tauntBy = p.id;
            m.target = p.id;
          }
        }
        for (const t of this.targetsFor(p)) if (t.kind === 'p' && Math.hypot(t.x - p.x, t.z - p.z) < 9) this.hit(p, t, 0.3, { slow: 0.35, slowT: 2 });
        this.events.push({ e: 'fx', k: 'warcry', x: r2(p.x), z: r2(p.z), r: 9, pid: p.id });
        break;
      }
      // ---------------- Маг
      case 'mage:0':
        this.fireProj(p, 'bolt', dx, dz, 18, def.range, 0.95, 0.4, 0);
        break;
      case 'mage:1':
        this.fireProj(p, 'fireball', dx, dz, 14, def.range, 0, 0.5, 2.8);
        break;
      case 'mage:2':
        for (const t of this.targetsFor(p)) {
          if (Math.hypot(t.x - p.x, t.z - p.z) - t.rad < 5) this.hit(p, t, 0.9, { freeze: 2.2 });
        }
        this.events.push({ e: 'fx', k: 'nova', x: r2(p.x), z: r2(p.z), r: 5, pid: p.id });
        break;
      case 'mage:3':
        this.addZone('meteor', p.id, tx, tz, 3.5, 0, this.phase === 'duel' ? 0.7 : 1.0, this.phase === 'duel' ? 3.2 : 2.8);
        break;
      // ---------------- Лучник
      case 'archer:0':
        this.fireProj(p, 'arrow', dx, dz, 27, def.range, 0.9, 0.32, 0);
        break;
      case 'archer:1': {
        const base = Math.atan2(dx, dz);
        for (let i = -2; i <= 2; i++) {
          const a = base + i * 0.2;
          this.fireProj(p, 'arrow', Math.sin(a), Math.cos(a), 25, def.range, 0.75, 0.32, 0);
        }
        break;
      }
      case 'archer:2':
        p.dash = { vx: dx * 22, vz: dz * 22, t: 0.22, hit: new Set(), kind: 'roll' };
        p.invulnT = Math.max(p.invulnT, 0.4);
        p.hasteT = 3;
        p.cds[0] = 0;
        this.events.push({ e: 'fx', k: 'roll', x: r2(p.x), z: r2(p.z), rot: r2(p.rot), pid: p.id });
        break;
      case 'archer:3':
        this.addZone('rain', p.id, tx, tz, 3.5, 3, 0.25, 0.4);
        break;
      // ---------------- Охотник на демонов
      case 'hunter:0': {
        for (const t of this.targetsFor(p)) {
          const ox = t.x - p.x;
          const oz = t.z - p.z;
          const d = Math.hypot(ox, oz);
          if (d - t.rad > def.range) continue;
          if (d > 0.8 && (ox * dx + oz * dz) / d < Math.cos((60 * Math.PI) / 180)) continue;
          // Два клинка — два удара, у каждого свой шанс крита
          this.hit(p, t, 0.52);
          if (t.kind !== 'm' || t.m.hp > 0) this.hit(p, t, 0.52);
        }
        this.events.push({ e: 'fx', k: 'twin', x: r2(p.x), z: r2(p.z), rot: r2(p.rot), pid: p.id });
        break;
      }
      case 'hunter:1':
        p.dash = { vx: dx * 30, vz: dz * 30, t: 0.22, hit: new Set(), kind: 'shadow' };
        p.invulnT = Math.max(p.invulnT, 0.3);
        this.events.push({ e: 'fx', k: 'shadow', x: r2(p.x), z: r2(p.z), rot: r2(p.rot), pid: p.id });
        break;
      case 'hunter:2': {
        const pr = this.fireProj(p, 'glaive', dx, dz, 20, def.range, 1.0, 0.45, 0);
        pr.bounces = 3;
        break;
      }
      case 'hunter:3':
        p.demonT = 7;
        this.events.push({ e: 'fx', k: 'demon', x: r2(p.x), z: r2(p.z), r: 3, pid: p.id });
        break;
      // ---------------- Призыватель
      case 'summoner:0':
        this.fireProj(p, 'spirit', dx, dz, 17, def.range, 0.95, 0.4, 0);
        // Помощники переключаются на цель в направлении выстрела
        {
          const t = this.nearestTarget(p, def.range);
          if (t) for (const n of this.minions.values()) if (n.owner === p.id && n.kind !== 'totem') n.target = this.targetId(t);
        }
        break;
      case 'summoner:1': {
        for (const n of [...this.minions.values()]) if (n.owner === p.id && n.kind === 'wolf') this.killMinion(n, false);
        for (const side of [-1, 1]) this.summon(p, 'wolf', p.x + Math.cos(p.rot) * side * 1.2, p.z - Math.sin(p.rot) * side * 1.2);
        break;
      }
      case 'summoner:2': {
        for (const n of [...this.minions.values()]) if (n.owner === p.id && n.kind === 'golem') this.killMinion(n, false);
        this.summon(p, 'golem', p.x + dx * 1.6, p.z + dz * 1.6);
        break;
      }
      case 'summoner:3': {
        for (const n of [...this.minions.values()]) if (n.owner === p.id && n.kind === 'totem') this.killMinion(n, false);
        this.summon(p, 'totem', tx, tz);
        break;
      }
      // ---------------- Оборотень
      case 'werewolf:0': {
        for (const t of this.targetsFor(p)) {
          const ox = t.x - p.x;
          const oz = t.z - p.z;
          const d = Math.hypot(ox, oz);
          if (d - t.rad > def.range) continue;
          if (d > 0.8 && (ox * dx + oz * dz) / d < Math.cos((70 * Math.PI) / 180)) continue;
          this.hit(p, t, 1.1);
        }
        this.events.push({ e: 'fx', k: 'rend', x: r2(p.x), z: r2(p.z), rot: r2(p.rot), pid: p.id });
        break;
      }
      case 'werewolf:1': {
        // Прыжок занимает 0,4 с, скорость — чтобы долететь до точки
        const d = Math.max(2, Math.hypot(tx - p.x, tz - p.z));
        p.dash = { vx: (dx * d) / 0.4, vz: (dz * d) / 0.4, t: 0.4, hit: new Set(), kind: 'pounce' };
        this.events.push({ e: 'fx', k: 'pounce', x: r2(p.x), z: r2(p.z), rot: r2(p.rot), pid: p.id });
        break;
      }
      case 'werewolf:2': {
        const duel = this.phase === 'duel';
        for (const t of this.targetsFor(p)) {
          // В дуэли вой только замедляет — без оцепенения
          if (Math.hypot(t.x - p.x, t.z - p.z) - t.rad < 6) this.hit(p, t, 0.8, { stun: duel ? 0 : 0.9, slow: 0.45, slowT: 2.5 });
        }
        this.events.push({ e: 'fx', k: 'howl', x: r2(p.x), z: r2(p.z), r: 6, pid: p.id });
        break;
      }
      case 'werewolf:3':
        p.beastT = 8;
        this.events.push({ e: 'fx', k: 'beast', x: r2(p.x), z: r2(p.z), r: 3, pid: p.id });
        break;
      // ---------------- Гном
      case 'dwarf:0': {
        const base = Math.atan2(dx, dz);
        for (const off of [-0.22, 0, 0.22]) this.fireProj(p, 'pellet', Math.sin(base + off), Math.cos(base + off), 24, def.range, 0.6, 0.32, 0);
        this.events.push({ e: 'fx', k: 'blast', x: r2(p.x), z: r2(p.z), rot: r2(p.rot), pid: p.id });
        break;
      }
      case 'dwarf:1':
        this.addZone('bomb', p.id, tx, tz, 3, 0, 0.8, 2.4);
        break;
      case 'dwarf:2': {
        for (const n of [...this.minions.values()]) if (n.owner === p.id && n.kind === 'turret') this.killMinion(n, false);
        this.summon(p, 'turret', tx, tz);
        break;
      }
      case 'dwarf:3': {
        const duel = this.phase === 'duel';
        for (const t of this.targetsFor(p)) if (Math.hypot(t.x - p.x, t.z - p.z) - t.rad < 5) this.hit(p, t, 2.0, { stun: duel ? 0.6 : 1.0 });
        this.events.push({ e: 'fx', k: 'quake', x: r2(p.x), z: r2(p.z), r: 5, pid: p.id });
        break;
      }
    }
  }

  /**
   * Неподвижный помощник не должен появиться внутри врага: иначе снаряды
   * врага стартуют уже за ним и пролетают мимо. Отодвигаем к хозяину.
   */
  private clearOfEnemies(owner: Player, pos: { x: number; z: number }, r: number) {
    for (let iter = 0; iter < 12; iter++) {
      let blocked = false;
      for (const t of this.targetsFor(owner)) {
        if (t.kind === 'n') continue;
        if (Math.hypot(t.x - pos.x, t.z - pos.z) < t.rad + r + 0.35) {
          blocked = true;
          break;
        }
      }
      if (!blocked) return;
      const dx = owner.x - pos.x;
      const dz = owner.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.5) {
        // Уже у самого хозяина — ставим перед ним с противоположной от врага стороны
        pos.x = owner.x - Math.sin(owner.rot) * (PLAYER_RADIUS + r + 0.2);
        pos.z = owner.z - Math.cos(owner.rot) * (PLAYER_RADIUS + r + 0.2);
        resolveCollision(pos, r, this.obstacles, this.bound);
        return;
      }
      const step = Math.min(0.6, d);
      pos.x += (dx / d) * step;
      pos.z += (dz / d) * step;
      resolveCollision(pos, r, this.obstacles, this.bound);
    }
  }

  /** Характеристики помощников растут вместе со снаряжением призывателя. */
  private summon(p: Player, kind: MinionKind, x: number, z: number): Minion {
    const st = p.stats;
    // В дуэли помощники хрупче, чтобы бой шёл между героями
    const hpm = this.phase === 'duel' ? 0.75 : 1;
    const spec = {
      wolf: { hp: st.maxHp * 0.32 * hpm, armor: st.armor, speed: 6.2, radius: 0.45, life: 14 },
      golem: { hp: st.maxHp * (this.phase === 'duel' ? 0.9 : 1.1) * hpm, armor: st.armor + 12, speed: 3.6, radius: 0.85, life: 16 },
      totem: { hp: 9999, armor: 999, speed: 0, radius: 0.5, life: 8 },
      turret: { hp: st.maxHp * 0.55 * hpm, armor: st.armor + 6, speed: 0, radius: 0.6, life: 12 },
    }[kind];
    const pos = { x, z };
    resolveCollision(pos, spec.radius, this.obstacles, this.bound);
    if (kind === 'turret' || kind === 'totem') this.clearOfEnemies(p, pos, spec.radius);
    const n: Minion = {
      id: this.nextId++,
      kind,
      owner: p.id,
      x: pos.x,
      z: pos.z,
      rot: p.rot,
      hp: spec.hp,
      maxHp: spec.hp,
      armor: spec.armor,
      speed: spec.speed,
      radius: spec.radius,
      life: spec.life,
      atkCd: 0.4,
      pulse: 0,
      retarget: 0,
      target: null,
    };
    this.minions.set(n.id, n);
    this.events.push({ e: 'summon', id: n.id, k: kind, x: r2(n.x), z: r2(n.z) });
    return n;
  }

  /** Поведение помощников: волки и голем преследуют врагов, тотем стреляет и лечит. */
  private updateMinions(dt: number) {
    const obs = this.obstacles;
    const bound = this.bound;
    for (const n of [...this.minions.values()]) {
      const owner = this.players.get(n.owner);
      n.life -= dt;
      if (!owner || n.life <= 0) {
        this.killMinion(n, false);
        continue;
      }
      n.atkCd -= dt;
      n.pulse -= dt;
      n.retarget -= dt;
      const enemies = this.targetsFor(owner);
      if (n.kind === 'turret') {
        if (n.atkCd <= 0) {
          let best: Target | null = null;
          let bd = 11;
          for (const t of enemies) {
            const d = Math.hypot(t.x - n.x, t.z - n.z) - t.rad;
            if (d < bd) {
              bd = d;
              best = t;
            }
          }
          if (best) {
            n.atkCd = 0.6;
            const ddx = best.x - n.x;
            const ddz = best.z - n.z;
            const l = Math.hypot(ddx, ddz) || 1;
            this.minionStrike = true;
            const pr = this.fireProj(owner, 'pellet', ddx / l, ddz / l, 22, 11, TURRET_SHOT, 0.3, 0);
            this.minionStrike = false;
            pr.fromMinion = true;
            pr.x = n.x + (ddx / l) * 0.6;
            pr.z = n.z + (ddz / l) * 0.6;
            n.rot = Math.atan2(ddx, ddz);
            this.events.push({ e: 'natk', id: n.id });
          }
        }
        continue;
      }
      if (n.kind === 'totem') {
        // Лечение союзников рядом
        for (const q of this.players.values()) {
          if (!q.alive || q.spectator) continue;
          if (this.phase === 'duel' && q.id !== owner.id) continue;
          if (Math.hypot(q.x - n.x, q.z - n.z) < 5.5) q.hp = Math.min(q.stats.maxHp, q.hp + q.stats.maxHp * (this.phase === 'duel' ? 0.012 : 0.025) * dt);
        }
        // Волна духов: каждые полсекунды ранит всех врагов в круге тотема
        if (n.pulse <= 0) {
          n.pulse = 0.5;
          let any = false;
          this.minionStrike = true;
          for (const t of enemies) {
            if (Math.hypot(t.x - n.x, t.z - n.z) - t.rad < TOTEM_R) {
              this.hit(owner, t, this.phase === 'duel' ? TOTEM_PULSE_DUEL : TOTEM_PULSE);
              any = true;
            }
          }
          this.minionStrike = false;
          if (any) this.events.push({ e: 'fx', k: 'tpulse', x: r2(n.x), z: r2(n.z), r: TOTEM_R, id: n.id });
        }
        if (n.atkCd <= 0) {
          let best: Target | null = null;
          let bd = 9;
          for (const t of enemies) {
            const d = Math.hypot(t.x - n.x, t.z - n.z) - t.rad;
            if (d < bd) {
              bd = d;
              best = t;
            }
          }
          if (best) {
            n.atkCd = 0.8;
            const ddx = best.x - n.x;
            const ddz = best.z - n.z;
            const l = Math.hypot(ddx, ddz) || 1;
            this.minionStrike = true;
            const pr = this.fireProj(owner, 'spirit', ddx / l, ddz / l, 16, 10, 0.45, 0.35, 0);
            this.minionStrike = false;
            pr.fromMinion = true;
            pr.x = n.x + (ddx / l) * 0.5;
            pr.z = n.z + (ddz / l) * 0.5;
            n.rot = Math.atan2(ddx, ddz);
            this.events.push({ e: 'natk', id: n.id });
          }
        }
        continue;
      }
      // Выбор цели
      let tgt: Target | undefined = n.target !== null ? enemies.find((t) => this.targetId(t) === n.target) : undefined;
      if (!tgt || n.retarget <= 0) {
        n.retarget = 0.5;
        let bd = 11;
        for (const t of enemies) {
          const d = Math.hypot(t.x - n.x, t.z - n.z) - t.rad;
          if (d < bd) {
            bd = d;
            tgt = t;
          }
        }
        if (n.target !== null && !enemies.some((t) => this.targetId(t) === n.target)) n.target = null;
        if (tgt && n.target === null) n.target = this.targetId(tgt);
      }
      // Голем провоцирует мобов вокруг
      if (n.kind === 'golem' && n.pulse <= 0) {
        n.pulse = 2;
        for (const m of this.mobs.values()) {
          if (Math.hypot(m.x - n.x, m.z - n.z) < 6.5) {
            m.tauntT = 2.2;
            m.tauntBy = `n${n.id}`;
          }
        }
      }
      const pos = { x: n.x, z: n.z };
      if (tgt) {
        const ddx = tgt.x - n.x;
        const ddz = tgt.z - n.z;
        const d = Math.hypot(ddx, ddz) || 0.01;
        n.rot = Math.atan2(ddx, ddz);
        const reach = n.radius + tgt.rad + (n.kind === 'golem' ? 0.7 : 0.45);
        if (d > reach) {
          pos.x += (ddx / d) * n.speed * dt;
          pos.z += (ddz / d) * n.speed * dt;
        } else if (n.atkCd <= 0) {
          this.events.push({ e: 'natk', id: n.id });
          this.minionStrike = true;
          if (n.kind === 'wolf') {
            n.atkCd = 0.75;
            this.hit(owner, tgt, 0.85, { slow: 0.2, slowT: 0.6 });
          } else {
            n.atkCd = 1.5;
            for (const t of enemies) if (Math.hypot(t.x - n.x, t.z - n.z) - t.rad < 2.2) this.hit(owner, t, 0.9, { slow: 0.3, slowT: 1 });
            this.events.push({ e: 'fx', k: 'gslam', x: r2(n.x), z: r2(n.z), r: 2.2 });
          }
          this.minionStrike = false;
        }
      } else {
        // Следуем за хозяином
        const ddx = owner.x - n.x;
        const ddz = owner.z - n.z;
        const d = Math.hypot(ddx, ddz);
        if (d > 2.5) {
          pos.x += (ddx / d) * n.speed * dt;
          pos.z += (ddz / d) * n.speed * dt;
          n.rot = Math.atan2(ddx, ddz);
        }
      }
      resolveCollision(pos, n.radius, obs, bound);
      n.x = pos.x;
      n.z = pos.z;
    }
  }

  private fireProj(p: Player, kind: ProjKind, dx: number, dz: number, speed: number, range: number, mult: number, r: number, explodeR: number): Proj {
    const roll = mult > 0 ? this.rollDamage(p, mult) : { v: 0, crit: false };
    const pr: Proj = {
      id: this.nextId++,
      kind,
      owner: p.id,
      team: 'p',
      x: p.x + dx * 0.6,
      z: p.z + dz * 0.6,
      vx: dx * speed,
      vz: dz * speed,
      life: range / speed,
      dmg: roll.v,
      crit: roll.crit,
      r,
      explodeR,
      hit: new Set(),
    };
    this.projs.set(pr.id, pr);
    return pr;
  }

  private addZone(kind: ZoneKind, owner: string | null, x: number, z: number, r: number, dur: number, delay: number, dmg: number): Zone {
    const zn: Zone = { id: this.nextId++, kind, owner, x, z, r, t: 0, dur, delay, tickT: 0, fired: false, dmg };
    this.zones.set(zn.id, zn);
    return zn;
  }

  // ------------------------------------------------------------------ игроки

  /** Магический щит мага; в дуэлях он прочнее. */
  shieldMax(p: Player): number {
    return p.stats.maxHp * (this.phase.startsWith('duel') ? 0.45 : 0.3);
  }

  effectiveSpeed(p: Player): number {
    if (!p.alive || p.spectator || !canMovePhase(this.phase)) return 0;
    if (p.stunT > 0 || p.frozenT > 0) return 0;
    let s = p.stats.speed;
    if (p.slowT > 0) s *= 1 - p.slowAmt;
    if (p.whirlT > 0) s *= 0.75;
    if (p.demonT > 0) s *= 1.25;
    return s;
  }

  private updatePlayers(dt: number) {
    const obs = this.obstacles;
    const bound = this.bound;
    for (const p of this.players.values()) {
      if (!p.bot && !p.connected) {
        p.input = { mx: 0, mz: 0 };
      }
      for (let i = 0; i < 4; i++) p.cds[i] = Math.max(0, p.cds[i] - dt);
      p.stunT = Math.max(0, p.stunT - dt);
      p.frozenT = Math.max(0, p.frozenT - dt);
      p.slowT = Math.max(0, p.slowT - dt);
      if (p.slowT <= 0) p.slowAmt = 0;
      p.invulnT = Math.max(0, p.invulnT - dt);
      p.warcryT = Math.max(0, p.warcryT - dt);
      p.rageT = Math.max(0, p.rageT - dt);
      p.hasteT = Math.max(0, p.hasteT - dt);
      p.demonT = Math.max(0, p.demonT - dt);
      p.beastT = Math.max(0, p.beastT - dt);
      p.faceT = Math.max(0, p.faceT - dt);
      p.lastHurt += dt;

      if (!p.alive) {
        if (this.phase === 'battle' && (p.connected || p.bot) && p.respawn > 0) {
          p.respawn -= dt;
          if (p.respawn <= 0) {
            this.resetHero(p, this.rng.range(-2, 2), this.rng.range(-1, 3), 0);
            p.hp = p.stats.maxHp * 0.6;
            p.invulnT = 2;
            this.events.push({ e: 'respawn', pid: p.id });
          }
        }
        continue;
      }
      if (p.spectator) continue;

      // Регенерация и щит мага
      // Зов крови: в дуэлях без ускоренного лечения, иначе почти каждая дуэль кончается его камбэком
      const bloodCall = p.cls === 'werewolf' && p.hp < p.stats.maxHp * 0.4 && this.phase !== 'duel' ? 3 : 1;
      p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.regen * bloodCall * dt);
      if (p.cls === 'mage') {
        const shm = this.shieldMax(p);
        if (p.lastHurt > 4) p.shield = Math.min(shm, p.shield + shm * 0.15 * dt);
      }

      // Вихрь
      if (p.whirlT > 0) {
        p.whirlT -= dt;
        p.whirlTick -= dt;
        if (p.whirlTick <= 0) {
          p.whirlTick = 0.33;
          for (const t of this.targetsFor(p)) if (Math.hypot(t.x - p.x, t.z - p.z) - t.rad < 3) this.hit(p, t, 0.55);
        }
      }

      const pos = { x: p.x, z: p.z };
      if (p.dash) {
        pos.x += p.dash.vx * dt;
        pos.z += p.dash.vz * dt;
        p.dash.t -= dt;
        if (p.dash.kind === 'charge' || p.dash.kind === 'shadow') {
          const shadow = p.dash.kind === 'shadow';
          for (const t of this.targetsFor(p)) {
            const tid = this.targetId(t);
            if (p.dash.hit.has(tid)) continue;
            if (Math.hypot(t.x - pos.x, t.z - pos.z) < t.rad + 1.3) {
              p.dash.hit.add(tid);
              if (shadow) this.hit(p, t, 1.2, { slow: 0.4, slowT: 1.5 });
              else this.hit(p, t, 1.3, { stun: 1.1 });
            }
          }
        }
        if (p.dash.t <= 0) {
          if (p.dash.kind === 'pounce') {
            // Приземление прыжка: удар по площади
            for (const t of this.targetsFor(p)) if (Math.hypot(t.x - pos.x, t.z - pos.z) - t.rad < 2.6) this.hit(p, t, this.phase === 'duel' ? 1.3 : 1.7, { slow: 0.4, slowT: 1.5 });
            this.events.push({ e: 'fx', k: 'pland', x: r2(pos.x), z: r2(pos.z), r: 2.6, pid: p.id });
          }
          p.dash = null;
        }
      } else {
        const spd = this.effectiveSpeed(p);
        pos.x += p.input.mx * spd * dt;
        pos.z += p.input.mz * spd * dt;
        if (p.faceT <= 0 && spd > 0 && Math.hypot(p.input.mx, p.input.mz) > 0.1) p.rot = Math.atan2(p.input.mx, p.input.mz);
      }
      resolveCollision(pos, PLAYER_RADIUS, obs, bound);
      // Турель — твёрдая: сквозь неё не пройти
      for (const n of this.minions.values()) {
        if (n.kind !== 'turret') continue;
        const ox = pos.x - n.x;
        const oz = pos.z - n.z;
        const d = Math.hypot(ox, oz);
        const min = PLAYER_RADIUS + n.radius;
        if (d < min && d > 0.0001) {
          pos.x = n.x + (ox / d) * min;
          pos.z = n.z + (oz / d) * min;
        }
      }
      p.x = pos.x;
      p.z = pos.z;
    }
  }

  // ------------------------------------------------------------------ мобы

  private validTarget(id: string | null): Victim | null {
    if (!id) return null;
    if (id.startsWith('n')) {
      const n = this.minions.get(Number(id.slice(1)));
      return n && n.kind !== 'totem' ? { id, x: n.x, z: n.z, n } : null;
    }
    const p = this.players.get(id);
    return p && p.alive && !p.spectator && (p.connected || p.bot) ? { id, x: p.x, z: p.z, p } : null;
  }

  private updateMobs(dt: number) {
    const obs = this.obstacles;
    const bound = this.bound;
    const mobs = [...this.mobs.values()];
    for (const m of mobs) {
      if (m.spawnT > 0) {
        m.spawnT -= dt;
        continue;
      }
      const def = MOBS[m.kind];
      m.stunT = Math.max(0, m.stunT - dt);
      m.frozenT = Math.max(0, m.frozenT - dt);
      m.slowT = Math.max(0, m.slowT - dt);
      if (m.slowT <= 0) m.slowAmt = 0;
      m.tauntT = Math.max(0, m.tauntT - dt);
      m.atkCd -= dt;
      m.slamCd -= dt;
      if (!m.hammer) m.throwCd -= dt;
      if (m.burnT > 0) m.burnT -= dt;
      if (m.frozenT > 0 || m.stunT > 0) {
        m.windup = -1;
        if (m.throwT >= 0) {
          // Замах сбит — попробует снова чуть позже
          m.throwT = -1;
          m.throwCd = 2;
        }
        continue;
      }
      // Молот в полёте: босс стоит и тянет его обратно
      if (m.hammer) {
        const h = this.projs.get(m.hammer);
        if (!h) m.hammer = 0;
        else {
          m.rot = Math.atan2(h.x - m.x, h.z - m.z);
          continue;
        }
      }
      if (m.throwT >= 0) {
        m.throwT -= dt;
        if (m.throwT < 0) this.throwHammer(m);
        continue;
      }

      m.retarget -= dt;
      let tgt = this.validTarget(m.target);
      if (m.tauntT > 0 && this.validTarget(m.tauntBy)) tgt = this.validTarget(m.tauntBy);
      else if (!tgt || m.retarget <= 0) {
        m.retarget = 0.7;
        let best: Victim | null = null;
        let bd = Infinity;
        for (const p of this.players.values()) {
          const v = this.validTarget(p.id);
          if (!v) continue;
          const d = Math.hypot(p.x - m.x, p.z - m.z) * (p.cls === 'warrior' ? 0.85 : 1);
          if (d < bd) {
            bd = d;
            best = v;
          }
        }
        for (const n of this.minions.values()) {
          if (n.kind === 'totem') continue;
          const d = Math.hypot(n.x - m.x, n.z - m.z) * (n.kind === 'golem' ? 0.6 : 1);
          if (d < bd) {
            bd = d;
            best = { id: `n${n.id}`, x: n.x, z: n.z, n };
          }
        }
        tgt = best;
      }
      m.target = tgt ? tgt.id : null;

      if (m.windup >= 0) {
        m.windup -= dt;
        if (m.windup < 0) {
          m.atkCd = def.atkCd;
          if (tgt) this.mobAttack(m, tgt);
        }
        continue;
      }

      let mx = 0;
      let mz = 0;
      if (tgt) {
        const dx = tgt.x - m.x;
        const dz = tgt.z - m.z;
        const dist = Math.hypot(dx, dz) || 0.001;
        const nx = dx / dist;
        const nz = dz / dist;
        m.rot = Math.atan2(nx, nz);
        const reach = def.range + m.radius + (tgt.n ? tgt.n.radius : PLAYER_RADIUS);

        if (def.boss && m.throwCd <= 0 && dist > 4.5 && dist < 17 && tgt.p) {
          // Бросок молота: замах с подсказкой на земле, куда он полетит
          m.throwT = 0.9;
          m.throwDx = nx;
          m.throwDz = nz;
          m.throwDist = Math.min(16, Math.max(7, dist + 2.5));
          this.events.push({ e: 'fx', k: 'hwind', x: r2(m.x), z: r2(m.z), rot: r2(m.rot), r: r2(m.throwDist), id: m.id });
          continue;
        }
        if (def.boss && m.slamCd <= 0 && dist < 6) {
          m.slamCd = 7;
          m.windup = 1.15;
          this.addZone('slam', null, m.x, m.z, 4.6, 0, 1.1, m.dmg * 1.5);
          this.events.push({ e: 'matk', id: m.id });
          continue;
        }
        if (def.ranged) {
          if (dist < (def.keepDist ?? 5) - 1) {
            mx = -nx;
            mz = -nz;
          } else if (dist > def.range) {
            mx = nx;
            mz = nz;
          }
          if (dist <= def.range + 0.5 && m.atkCd <= 0) {
            m.windup = def.windup;
            this.events.push({ e: 'matk', id: m.id });
            continue;
          }
        } else if (dist > reach * 0.92) {
          mx = nx;
          mz = nz;
        } else if (m.atkCd <= 0) {
          m.windup = def.windup;
          this.events.push({ e: 'matk', id: m.id });
          continue;
        }
      } else {
        const d = Math.hypot(m.x, m.z);
        if (d > 4) {
          mx = -m.x / d;
          mz = -m.z / d;
        }
      }

      if (mx || mz) {
        // Обход препятствий
        for (const o of obs) {
          const ox = o.x - m.x;
          const oz = o.z - m.z;
          const along = ox * mx + oz * mz;
          if (along <= 0 || along > 2.2 + o.r) continue;
          const lat = ox * mz - oz * mx;
          const clear = o.r + m.radius + 0.25;
          if (Math.abs(lat) < clear) {
            const side = lat > 0 ? -1 : 1;
            const w = (1 - Math.abs(lat) / clear) * 1.4;
            const px = mz * side;
            const pz = -mx * side;
            mx += px * w;
            mz += pz * w;
          }
        }
        const l = Math.hypot(mx, mz) || 1;
        const spd = m.speed * (m.slowT > 0 ? 1 - m.slowAmt : 1);
        m.x += (mx / l) * spd * dt;
        m.z += (mz / l) * spd * dt;
      }
    }

    // Расталкивание
    for (let i = 0; i < mobs.length; i++) {
      const a = mobs[i];
      if (!this.mobs.has(a.id)) continue;
      for (let j = i + 1; j < mobs.length; j++) {
        const b = mobs[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const min = a.radius + b.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min) {
          const d = Math.sqrt(d2) || 0.01;
          const push = (min - d) / 2;
          const wa = MOBS[a.kind].boss ? 0.1 : 1;
          const wb = MOBS[b.kind].boss ? 0.1 : 1;
          a.x -= (dx / d) * push * wa;
          a.z -= (dz / d) * push * wa;
          b.x += (dx / d) * push * wb;
          b.z += (dz / d) * push * wb;
        }
      }
      for (const p of this.players.values()) {
        if (!p.alive || p.spectator) continue;
        const dx = a.x - p.x;
        const dz = a.z - p.z;
        const min = a.radius + PLAYER_RADIUS * 0.9;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min) {
          const d = Math.sqrt(d2) || 0.01;
          a.x = p.x + (dx / d) * min;
          a.z = p.z + (dz / d) * min;
        }
      }
      const pos = { x: a.x, z: a.z };
      resolveCollision(pos, a.radius, obs, bound);
      a.x = pos.x;
      a.z = pos.z;
    }
  }

  private mobAttack(m: Mob, tgt: Victim) {
    const def = MOBS[m.kind];
    const dx = tgt.x - m.x;
    const dz = tgt.z - m.z;
    const dist = Math.hypot(dx, dz) || 0.01;
    if (def.ranged) {
      const sp = def.projSpeed ?? 12;
      const pr: Proj = {
        id: this.nextId++,
        kind: 'earrow',
        owner: null,
        team: 'm',
        x: m.x + (dx / dist) * 0.6,
        z: m.z + (dz / dist) * 0.6,
        vx: (dx / dist) * sp,
        vz: (dz / dist) * sp,
        life: (def.range + 3) / sp,
        dmg: m.dmg,
        crit: false,
        r: 0.3,
        explodeR: 0,
        hit: new Set(),
      };
      this.projs.set(pr.id, pr);
    } else {
      const reach = def.range + m.radius + (tgt.n ? tgt.n.radius : PLAYER_RADIUS) + 0.6;
      this.events.push({ e: 'hit', x: r2(m.x + (dx / dist) * m.radius), z: r2(m.z + (dz / dist) * m.radius), k: m.kind });
      if (dist > reach) return;
      const v = m.dmg * this.rng.range(0.9, 1.1);
      if (tgt.p) this.damagePlayer(tgt.p, v, false, null);
      else if (tgt.n) this.damageMinion(tgt.n, v, false);
    }
  }

  // ------------------------------------------------------------------ снаряды и зоны

  /** Босс бросает молот: тот летит по прямой и возвращается, раня каждого героя на пути. */
  private throwHammer(m: Mob) {
    const speed = 17;
    const pr: Proj = {
      id: this.nextId++,
      kind: 'hammer',
      owner: null,
      team: 'm',
      x: m.x + m.throwDx * (m.radius + 0.4),
      z: m.z + m.throwDz * (m.radius + 0.4),
      vx: m.throwDx * speed,
      vz: m.throwDz * speed,
      life: m.throwDist / speed,
      // Столько же, сколько удар по площади вокруг босса
      dmg: m.dmg * 1.5,
      crit: false,
      r: 1.1,
      explodeR: 0,
      hit: new Set(),
      boomerang: { mob: m.id, back: false, t: 0 },
    };
    this.projs.set(pr.id, pr);
    m.hammer = pr.id;
    this.events.push({ e: 'fx', k: 'hthrow', x: r2(m.x), z: r2(m.z), rot: r2(m.rot), id: m.id });
  }

  /** Полёт молота босса: туда и обратно, сквозь препятствия. */
  private updateHammer(pr: Proj, dt: number): boolean {
    const b = pr.boomerang!;
    b.t += dt;
    const boss = this.mobs.get(b.mob);
    if (!boss) {
      this.events.push({ e: 'hit', x: r2(pr.x), z: r2(pr.z), k: 'hammer' });
      return true;
    }
    if (!b.back && pr.life <= 0) {
      b.back = true;
      this.events.push({ e: 'fx', k: 'hturn', x: r2(pr.x), z: r2(pr.z) });
    }
    if (b.back) {
      // Притягивается к боссу, ускоряясь
      const dx = boss.x - pr.x;
      const dz = boss.z - pr.z;
      const d = Math.hypot(dx, dz) || 0.001;
      if (d < boss.radius + 0.5 || b.t > 6) {
        boss.hammer = 0;
        boss.throwCd = 6 + this.rng.next() * 5;
        boss.atkCd = Math.max(boss.atkCd, 0.6);
        this.events.push({ e: 'fx', k: 'hcatch', x: r2(boss.x), z: r2(boss.z), id: boss.id });
        return true;
      }
      const sp = Math.min(24, 12 + b.t * 6);
      pr.vx = (dx / d) * sp;
      pr.vz = (dz / d) * sp;
    }
    for (const p of this.players.values()) {
      if (!p.alive || p.spectator || pr.hit.has(p.id)) continue;
      if (Math.hypot(p.x - pr.x, p.z - pr.z) < PLAYER_RADIUS + pr.r) {
        pr.hit.add(p.id);
        this.damagePlayer(p, pr.dmg * this.rng.range(0.9, 1.1), false, null);
        p.stunT = Math.max(p.stunT, 0.35);
        this.events.push({ e: 'hit', x: r2(p.x), z: r2(p.z), k: 'hammer' });
      }
    }
    for (const n of [...this.minions.values()]) {
      const key = `n${n.id}`;
      if (n.kind === 'totem' || pr.hit.has(key)) continue;
      if (Math.hypot(n.x - pr.x, n.z - pr.z) < n.radius + pr.r) {
        pr.hit.add(key);
        this.damageMinion(n, pr.dmg, false);
      }
    }
    return false;
  }

  private updateProjectiles(dt: number) {
    const obs = this.obstacles;
    for (const pr of [...this.projs.values()]) {
      pr.x += pr.vx * dt;
      pr.z += pr.vz * dt;
      pr.life -= dt;
      if (pr.boomerang) {
        if (this.updateHammer(pr, dt)) this.projs.delete(pr.id);
        continue;
      }
      let done = false;
      if (pr.team === 'p') {
        const owner = pr.owner ? this.players.get(pr.owner) : undefined;
        if (!owner) {
          this.projs.delete(pr.id);
          continue;
        }
        for (const t of this.targetsFor(owner)) {
          const tid = this.targetId(t);
          if (pr.hit.has(tid)) continue;
          if (Math.hypot(t.x - pr.x, t.z - pr.z) < t.rad + pr.r) {
            pr.hit.add(tid);
            if (pr.explodeR > 0) this.explode(pr, owner);
            else {
              this.minionStrike = !!pr.fromMinion;
              this.hit(owner, t, 0, undefined, { v: pr.dmg, crit: pr.crit });
              this.minionStrike = false;
              this.events.push({ e: 'hit', x: r2(pr.x), z: r2(pr.z), k: pr.kind });
            }
            done = true;
            // Глефа отскакивает к ближайшему новому врагу
            if (pr.bounces && pr.bounces > 0) {
              let next: Target | null = null;
              let bd = 6.5;
              for (const q of this.targetsFor(owner)) {
                if (pr.hit.has(this.targetId(q))) continue;
                const d = Math.hypot(q.x - pr.x, q.z - pr.z);
                if (d < bd) {
                  bd = d;
                  next = q;
                }
              }
              if (next) {
                const sp = Math.hypot(pr.vx, pr.vz);
                pr.vx = ((next.x - pr.x) / bd) * sp;
                pr.vz = ((next.z - pr.z) / bd) * sp;
                pr.life = bd / sp + 0.2;
                pr.bounces--;
                pr.dmg *= 0.85;
                done = false;
              }
            }
            break;
          }
        }
        if (!done && (hitsSolid(pr.x, pr.z, pr.r * 0.5, obs) || pr.life <= 0)) {
          if (pr.explodeR > 0) this.explode(pr, owner);
          else if (pr.life > 0) this.events.push({ e: 'hit', x: r2(pr.x), z: r2(pr.z), k: pr.kind });
          done = true;
        }
      } else {
        for (const p of this.players.values()) {
          if (!p.alive || p.spectator) continue;
          if (Math.hypot(p.x - pr.x, p.z - pr.z) < PLAYER_RADIUS + pr.r) {
            this.damagePlayer(p, pr.dmg * this.rng.range(0.9, 1.1), false, null);
            this.events.push({ e: 'hit', x: r2(pr.x), z: r2(pr.z), k: pr.kind });
            done = true;
            break;
          }
        }
        if (!done) {
          for (const n of this.minions.values()) {
            if (n.kind === 'totem') continue;
            if (Math.hypot(n.x - pr.x, n.z - pr.z) < n.radius + pr.r) {
              this.damageMinion(n, pr.dmg, false);
              this.events.push({ e: 'hit', x: r2(pr.x), z: r2(pr.z), k: pr.kind });
              done = true;
              break;
            }
          }
        }
        if (!done && (hitsSolid(pr.x, pr.z, pr.r * 0.5, obs) || pr.life <= 0)) done = true;
      }
      if (done) this.projs.delete(pr.id);
    }
  }

  private explode(pr: Proj, owner: Player) {
    for (const t of this.targetsFor(owner)) {
      if (Math.hypot(t.x - pr.x, t.z - pr.z) - t.rad < pr.explodeR) this.hit(owner, t, 2.0);
    }
    this.events.push({ e: 'fx', k: 'explode', x: r2(pr.x), z: r2(pr.z), r: pr.explodeR });
    this.addZone('burn', owner.id, pr.x, pr.z, 2.2, 2.5, 0, 0.22);
  }

  private updateZones(dt: number) {
    for (const zn of [...this.zones.values()]) {
      zn.t += dt;
      const owner = zn.owner ? this.players.get(zn.owner) : undefined;
      if (zn.t < zn.delay) continue;
      switch (zn.kind) {
        case 'meteor':
          if (!zn.fired) {
            zn.fired = true;
            // Метеор не критует: иначе на поздних уровнях он сносит толпу с одного удара
            if (owner) for (const t of this.targetsFor(owner)) if (Math.hypot(t.x - zn.x, t.z - zn.z) - t.rad < zn.r) this.hit(owner, t, 0, { stun: 1.2 }, this.rollDamage(owner, zn.dmg, false));
            this.events.push({ e: 'fx', k: 'meteor', x: r2(zn.x), z: r2(zn.z), r: zn.r });
          }
          if (zn.t > zn.delay + 0.15) this.zones.delete(zn.id);
          break;
        case 'bomb':
          if (!zn.fired && zn.t >= zn.delay) {
            zn.fired = true;
            const duel = this.phase === 'duel';
            if (owner) for (const t of this.targetsFor(owner)) if (Math.hypot(t.x - zn.x, t.z - zn.z) - t.rad < zn.r) this.hit(owner, t, zn.dmg, { stun: duel ? 0.5 : 0.8 });
            this.events.push({ e: 'fx', k: 'explode', x: r2(zn.x), z: r2(zn.z), r: zn.r });
          }
          if (zn.t > zn.delay + 0.15) this.zones.delete(zn.id);
          break;
        case 'slam':
          if (!zn.fired) {
            zn.fired = true;
            for (const p of this.players.values()) {
              if (p.alive && !p.spectator && Math.hypot(p.x - zn.x, p.z - zn.z) < zn.r + PLAYER_RADIUS) {
                this.damagePlayer(p, zn.dmg, false, null);
                p.stunT = Math.max(p.stunT, 0.6);
              }
            }
            for (const n of [...this.minions.values()]) {
              if (n.kind !== 'totem' && Math.hypot(n.x - zn.x, n.z - zn.z) < zn.r + n.radius) this.damageMinion(n, zn.dmg, false);
            }
            this.events.push({ e: 'fx', k: 'slam', x: r2(zn.x), z: r2(zn.z), r: zn.r });
          }
          this.zones.delete(zn.id);
          break;
        case 'rain':
        case 'burn': {
          zn.tickT -= dt;
          if (zn.tickT <= 0) {
            zn.tickT = zn.kind === 'rain' ? 0.3 : 0.5;
            if (owner) {
              for (const t of this.targetsFor(owner)) {
                if (Math.hypot(t.x - zn.x, t.z - zn.z) - t.rad < zn.r) {
                  this.hit(owner, t, zn.dmg, zn.kind === 'rain' ? { slow: 0.4, slowT: 0.7 } : undefined);
                  if (zn.kind === 'burn' && t.kind === 'm') t.m.burnT = 0.6;
                }
              }
            }
          }
          if (zn.t >= zn.dur) this.zones.delete(zn.id);
          break;
        }
      }
    }
  }

  // ------------------------------------------------------------------ снимок состояния

  snapshot(): Snapshot {
    const full = this.dirty || this.tick % 10 === 0;
    this.dirty = false;
    const P: PlayerSnap[] = [];
    for (const p of this.players.values()) {
      let st = '';
      if (p.stunT > 0) st += 's';
      if (p.frozenT > 0) st += 'f';
      if (p.whirlT > 0) st += 'w';
      if (p.invulnT > 0) st += 'i';
      if (p.warcryT > 0) st += 'c';
      if (p.hasteT > 0) st += 'h';
      if (p.rageT > 0) st += 'r';
      if (p.dash) st += 'd';
      if (p.slowT > 0) st += 'l';
      if (p.spectator) st += 'x';
      if (p.demonT > 0) st += 'm';
      if (p.beastT > 0) st += 'v';
      const ps: PlayerSnap = {
        id: p.id,
        n: p.name,
        c: p.cls,
        x: r2(p.x),
        z: r2(p.z),
        r: r2(p.rot),
        hp: Math.ceil(p.hp),
        mhp: Math.round(p.stats.maxHp),
        sh: Math.round(p.shield),
        shm: p.cls === 'mage' ? Math.round(this.shieldMax(p)) : 0,
        g: p.gold,
        k: p.kills,
        al: p.alive,
        rs: r2(Math.max(0, p.respawn)),
        cd: p.cds.map(r2),
        cdm: p.cdMax.map(r2),
        st,
        sp: r2(this.effectiveSpeed(p)),
        rdy: p.ready,
        con: p.connected,
        bot: p.bot,
        host: p.host,
        pw: p.pvpWins,
        pl: p.pvpLosses,
        dmg: Math.round(p.dmgDealt),
      };
      if (full) {
        ps.eq = p.equip;
        ps.stats = p.stats;
      }
      P.push(ps);
    }
    const M: MobSnap[] = [];
    for (const m of this.mobs.values()) {
      let st = '';
      if (m.stunT > 0) st += 's';
      if (m.frozenT > 0) st += 'f';
      if (m.slowT > 0) st += 'l';
      if (m.windup >= 0) st += 'w';
      if (m.burnT > 0) st += 'b';
      if (m.spawnT > 0) st += 'p';
      if (m.throwT >= 0) st += 't';
      if (m.hammer) st += 'h';
      M.push({ id: m.id, k: m.kind, x: r2(m.x), z: r2(m.z), r: r2(m.rot), hp: Math.max(0, Math.ceil(m.hp)), mhp: m.maxHp, st });
    }
    const snap: Snapshot = {
      t: 's',
      tick: this.tick,
      ph: this.phase,
      rd: this.round,
      tmr: r2(this.timer),
      ml: this.spawnQueue.length + this.mobs.size,
      mt: this.mobsTotal,
      P,
      M,
      S: [...this.minions.values()].map(
        (n): MinionSnap => ({ id: n.id, k: n.kind, o: n.owner, x: r2(n.x), z: r2(n.z), r: r2(n.rot), hp: Math.max(0, Math.ceil(n.hp)), mhp: Math.round(n.maxHp), l: r2(n.life) }),
      ),
      R: [...this.projs.values()].map((p) => ({ id: p.id, k: p.kind, x: r2(p.x), z: r2(p.z), vx: r2(p.vx), vz: r2(p.vz) })),
      Z: [...this.zones.values()].map((z) => ({ id: z.id, k: z.kind, x: r2(z.x), z: r2(z.z), r: z.r, t: r2(z.t), dur: z.dur, delay: z.delay })),
      E: this.events,
      duel: isArenaPhase(this.phase) && this.duels[this.duelIdx] ? { a: this.duels[this.duelIdx][0], b: this.duels[this.duelIdx][1], idx: this.duelIdx, total: this.duels.length } : null,
      full,
    };
    if (full && this.phase === 'tavern') snap.shop = this.shop;
    if (this.result) snap.result = this.result;
    this.events = [];
    return snap;
  }
}
