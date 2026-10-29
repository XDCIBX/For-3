export const TICK_RATE = 20;
export const DT = 1 / TICK_RATE;
export const MAX_PLAYERS = 3;
export const DEFAULT_PORT = 2567;

/** Радиус игровой зоны острова. */
export const WORLD_RADIUS = 33;
/** Радиус арены для ПвП. */
export const ARENA_RADIUS = 12.5;

export const PVP_EVERY = 5;
export const MAX_ROUNDS = 25;
/** С этой волны бой идёт в логове дракона. */
export const LAIR_ROUND = 21;
/** Финальная волна: дракон. */
export const DRAGON_ROUND = 25;

/** ПвП: каждая пятая волна до 20-й и предпоследняя (24-я) перед драконом. */
export function isPvpRound(r: number): boolean {
  return r === DRAGON_ROUND - 1 || (r % PVP_EVERY === 0 && r < LAIR_ROUND);
}
/** Волна с боссом-троллем (на острове). */
export function isTrollRound(r: number): boolean {
  return r < LAIR_ROUND && r % PVP_EVERY === PVP_EVERY - 1;
}
/** Раунды до следующего ПвП (0 — уже ПвП). */
export function roundsToPvp(r: number): number {
  for (let k = 0; k <= 10; k++) if (isPvpRound(r + k)) return k;
  return 99;
}
export const TAVERN_TIME = 45;
export const SHOP_SIZE = 8;
export const RESPAWN_TIME = 8;
export const DUEL_TIME = 45;
export const INTRO_TIME = 3;
export const CLEAR_TIME = 3;
export const DUEL_END_TIME = 3.5;

export const PLAYER_RADIUS = 0.55;

/** Возврат золота при замене предмета (доля цены). */
export const SELL_BACK = 0.4;
