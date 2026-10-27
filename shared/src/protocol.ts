import type { Equip, HeroClass, Item, MobKind, Phase, ProjKind, Stats, ZoneKind } from './types';

/** Сообщения клиент → сервер (внутри комнаты). */
export type GameMsg =
  | { t: 'pick'; cls: HeroClass }
  | { t: 'ready'; v: boolean }
  | { t: 'start' }
  | { t: 'addBot' }
  | { t: 'kick'; id: string }
  | { t: 'in'; mx: number; mz: number }
  | { t: 'cast'; s: number; dx: number; dz: number; d: number }
  | { t: 'buy'; id: string }
  | { t: 'treset' };

/** Сообщения подключения. */
export type ConnectMsg =
  | { t: 'create'; name: string }
  | { t: 'join'; code: string; name: string }
  | { t: 'rejoin'; code: string; token: string }
  | { t: 'ping'; c: number };

export type C2S = GameMsg | ConnectMsg;

export interface PlayerSnap {
  id: string;
  n: string;
  c: HeroClass;
  x: number;
  z: number;
  r: number;
  hp: number;
  mhp: number;
  sh: number;
  shm: number;
  g: number;
  k: number;
  al: boolean;
  rs: number;
  cd: number[];
  cdm: number[];
  /** Флаги состояния: s — оглушён, f — заморожен, w — вихрь, i — неуязвим, c — боевой клич, h — ускорение, r — ярость, d — рывок, l — замедлен, x — зритель. */
  st: string;
  sp: number;
  rdy: boolean;
  con: boolean;
  bot: boolean;
  host: boolean;
  pw: number;
  pl: number;
  dmg: number;
  eq?: Equip;
  stats?: Stats;
}

export interface MobSnap {
  id: number;
  k: MobKind;
  x: number;
  z: number;
  r: number;
  hp: number;
  mhp: number;
  /** Флаги: s — оглушён, f — заморожен, l — замедлен, w — замах, b — горит, p — появляется. */
  st: string;
}

export interface ProjSnap {
  id: number;
  k: ProjKind;
  x: number;
  z: number;
  vx: number;
  vz: number;
}

export interface ZoneSnap {
  id: number;
  k: ZoneKind;
  x: number;
  z: number;
  r: number;
  t: number;
  dur: number;
  delay: number;
}

export type GameEvent =
  | { e: 'dmg'; x: number; z: number; v: number; c: boolean; tp: 'm' | 'p'; id: string | number }
  | { e: 'heal'; x: number; z: number; v: number }
  | { e: 'gold'; pid: string; v: number; x: number; z: number; why?: string }
  | { e: 'cast'; pid: string; s: number; r: number; x?: number; z?: number }
  | { e: 'fx'; k: string; x: number; z: number; r?: number; rot?: number; pid?: string }
  | { e: 'matk'; id: number }
  | { e: 'mdie'; id: number; k: MobKind; by: string | null; x: number; z: number }
  | { e: 'pdie'; pid: string }
  | { e: 'respawn'; pid: string }
  | { e: 'msg'; text: string; kind?: 'info' | 'good' | 'bad' | 'gold' }
  | { e: 'buy'; pid: string; name: string; rarity: string }
  | { e: 'duel'; a: string; b: string; winner: string | null; win: number; lose: number }
  | { e: 'hit'; x: number; z: number; k: string };

export interface DuelInfo {
  a: string;
  b: string;
  idx: number;
  total: number;
}

export interface Snapshot {
  t: 's';
  tick: number;
  ph: Phase;
  rd: number;
  tmr: number;
  ml: number;
  mt: number;
  P: PlayerSnap[];
  M: MobSnap[];
  R: ProjSnap[];
  Z: ZoneSnap[];
  E: GameEvent[];
  duel: DuelInfo | null;
  shop?: Item[];
  /** Победитель/итог в конце игры. */
  result?: { win: boolean; round: number };
  full: boolean;
}

export type S2C =
  | { t: 'welcome'; id: string; code: string; token: string; seed: number }
  | { t: 'err'; msg: string }
  | { t: 'pong'; c: number }
  | Snapshot;
