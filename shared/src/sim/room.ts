import { DT } from '../constants';
import type { C2S, GameMsg, S2C } from '../protocol';
import { Game, type Player } from './game';

export interface RoomClient {
  send(msg: S2C): void;
}

/**
 * Комната: игра + подключённые клиенты. Используется и сервером,
 * и клиентом (одиночная игра с ботами без сети).
 */
export class Room {
  readonly code: string;
  readonly game: Game;
  readonly clients = new Map<string, RoomClient>();
  emptySince = 0;

  constructor(code: string, seed?: number) {
    this.code = code;
    this.game = new Game(seed);
  }

  join(name: string, client: RoomClient): Player | string {
    const p = this.game.addPlayer(name);
    if (typeof p === 'string') return p;
    this.attach(p, client);
    return p;
  }

  rejoin(token: string, client: RoomClient): Player | string {
    const p = [...this.game.players.values()].find((q) => q.token === token && !q.bot);
    if (!p) return 'Сессия не найдена';
    this.game.reconnect(p.id);
    this.attach(p, client);
    return p;
  }

  private attach(p: Player, client: RoomClient) {
    this.clients.set(p.id, client);
    client.send({ t: 'welcome', id: p.id, code: this.code, token: p.token, seed: this.game.seed });
  }

  leave(pid: string, client?: RoomClient) {
    if (client && this.clients.get(pid) !== client) return;
    this.clients.delete(pid);
    this.game.removePlayer(pid);
    if (this.clients.size === 0) this.emptySince = Date.now();
  }

  handle(pid: string, msg: C2S) {
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;
    this.game.handle(pid, msg as GameMsg);
  }

  step() {
    this.game.update(DT);
    const snap = this.game.snapshot();
    for (const c of this.clients.values()) c.send(snap);
  }
}

export function makeRoomCode(exists: (c: string) => boolean): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += alphabet[Math.floor(Math.random() * alphabet.length)];
    if (!exists(c)) return c;
  }
}
