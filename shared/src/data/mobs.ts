import type { MobKind } from '../types';
import type { Rng } from '../rng';

export interface MobDef {
  kind: MobKind;
  name: string;
  hp: number;
  dmg: number;
  speed: number;
  radius: number;
  gold: number;
  /** Дистанция атаки (от края до края). */
  range: number;
  atkCd: number;
  windup: number;
  ranged?: boolean;
  projSpeed?: number;
  /** Держится на расстоянии (для стрелков). */
  keepDist?: number;
  boss?: boolean;
  minRound: number;
}

export const MOBS: Record<MobKind, MobDef> = {
  slime: { kind: 'slime', name: 'Слизень', hp: 42, dmg: 11, speed: 2.7, radius: 0.6, gold: 6, range: 0.5, atkCd: 1.3, windup: 0.35, minRound: 1 },
  goblin: { kind: 'goblin', name: 'Гоблин', hp: 55, dmg: 13, speed: 4.1, radius: 0.5, gold: 8, range: 0.6, atkCd: 1.0, windup: 0.3, minRound: 1 },
  skeleton: { kind: 'skeleton', name: 'Скелет-лучник', hp: 48, dmg: 13, speed: 3.0, radius: 0.5, gold: 9, range: 9, atkCd: 2.0, windup: 0.55, ranged: true, projSpeed: 13, keepDist: 6.5, minRound: 2 },
  orc: { kind: 'orc', name: 'Орк-громила', hp: 170, dmg: 30, speed: 2.9, radius: 0.85, gold: 18, range: 0.9, atkCd: 1.7, windup: 0.6, minRound: 3 },
  troll: { kind: 'troll', name: 'Тролль-вождь', hp: 1500, dmg: 42, speed: 3.0, radius: 1.5, gold: 120, range: 1.2, atkCd: 1.8, windup: 0.7, boss: true, minRound: 4 },
};

export function mobScale(round: number) {
  return {
    hp: 1 + 0.32 * (round - 1) + 0.015 * (round - 1) ** 2,
    dmg: 1 + 0.22 * (round - 1) + 0.009 * (round - 1) ** 2,
    gold: 1 + 0.1 * (round - 1),
  };
}

/** Состав волны: с каждым раундом мобов больше. */
export function roundComposition(round: number, players: number, rng: Rng): MobKind[] {
  const pf = 0.55 + 0.15 * Math.max(1, players);
  const total = Math.round((5 + 3.5 * round) * pf);
  const list: MobKind[] = [];
  for (let i = 0; i < total; i++) {
    const roll = rng.next();
    let k: MobKind = 'slime';
    if (round >= 3 && roll < 0.08 + round * 0.012) k = 'orc';
    else if (round >= 2 && roll < 0.3) k = 'skeleton';
    else if (roll < 0.62) k = 'goblin';
    list.push(k);
  }
  if (round % 5 === 4) list.push('troll');
  if (round >= 12 && round % 5 === 4) list.push('troll');
  return list;
}
