import { DT } from '../constants';
import type { C2S, GameMsg, S2C, Snapshot } from '../protocol';
import { Game, type Player } from './game';
import { DeltaEncoder } from './delta';

export interface RoomClient {
  send(msg: S2C): void;
  /**
   * Снимок мира: `wire` — разностный (если комната его делает), `raw` — полный. Клиент без этого метода
   * получает полный снимок через send.
   */
  snapshot?(wire: Snapshot, raw: Snapshot): void;
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
  /** Разностные снимки (для сети): сервер включает, одиночная игра в браузере обходится без них. */
  private delta: DeltaEncoder | null;

  constructor(code: string, seed?: number, opts: { delta?: boolean } = {}) {
    this.code = code;
    this.game = new Game(seed);
    this.delta = opts.delta ? new DeltaEncoder() : null;
  }

  join(name: string, client: RoomClient): Player | string {
    const p = this.game.addPlayer(name);
    if (typeof p === 'string') return p;
    this.attach(p, client);
    return p;
  }

  rejoin(token: string, client: RoomClient): Player | string {
    const p = [...this.game.players.values()].find((q) => q.token === token && !q.bot);
    if (!p) return 'err.session';
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
    const raw = this.game.snapshot();
    // Кодировщик видит каждый снимок — он база для следующего, даже если сейчас слушать некому
    const wire = this.delta ? this.delta.encode(raw) : raw;
    for (const c of this.clients.values()) {
      if (c.snapshot) c.snapshot(wire, raw);
      else c.send(raw);
    }
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
