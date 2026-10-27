import type { DuelInfo, Equip, GameEvent, Item, Phase, PlayerSnap, Snapshot, Stats } from '@game/shared';

export type PlayerInfo = Omit<PlayerSnap, 'eq' | 'stats'> & { eq: Equip | null; stats: Stats | null };

/** Состояние игры на клиенте: последний снимок + накопленные данные. */
export class ClientState {
  myId = '';
  code = '';
  token = '';
  seed = 0;
  phase: Phase = 'lobby';
  prevPhase: Phase = 'lobby';
  round = 0;
  timer = 0;
  mobsLeft = 0;
  mobsTotal = 0;
  duel: DuelInfo | null = null;
  shop: Item[] = [];
  players = new Map<string, PlayerInfo>();
  order: string[] = [];
  result: { win: boolean; round: number } | null = null;
  snap: Snapshot | null = null;
  snapTime = 0;

  get me(): PlayerInfo | undefined {
    return this.players.get(this.myId);
  }

  apply(s: Snapshot): GameEvent[] {
    this.prevPhase = this.phase;
    this.phase = s.ph;
    this.round = s.rd;
    this.timer = s.tmr;
    this.mobsLeft = s.ml;
    this.mobsTotal = s.mt;
    this.duel = s.duel;
    if (s.result) this.result = s.result;
    if (s.shop) this.shop = s.shop;
    if (s.ph !== 'tavern') this.shop = [];
    const seen = new Set<string>();
    for (const p of s.P) {
      seen.add(p.id);
      const old = this.players.get(p.id);
      this.players.set(p.id, { ...p, eq: p.eq ?? old?.eq ?? null, stats: p.stats ?? old?.stats ?? null });
    }
    for (const id of [...this.players.keys()]) if (!seen.has(id)) this.players.delete(id);
    this.order = s.P.map((p) => p.id);
    this.snap = s;
    this.snapTime = performance.now();
    return s.E;
  }

  reset() {
    this.players.clear();
    this.phase = 'lobby';
    this.result = null;
    this.shop = [];
    this.snap = null;
  }
}
