import type { MobKind } from '../types';
import type { Rng } from '../rng';
import { DRAGON_ROUND, LAIR_ROUND, isTrollRound } from '../constants';

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
  /** Взрывается при атаке (огненный сгусток): урон по площади и горящий след. */
  explode?: number;
  /** Летает: не застревает на препятствиях (визуально — парит). */
  flying?: boolean;
  minRound: number;
}

export const MOBS: Record<MobKind, MobDef> = {
  slime: { kind: 'slime', name: 'Слизень', hp: 42, dmg: 11, speed: 2.7, radius: 0.6, gold: 6, range: 0.5, atkCd: 1.3, windup: 0.35, minRound: 1 },
  goblin: { kind: 'goblin', name: 'Гоблин', hp: 55, dmg: 13, speed: 4.1, radius: 0.5, gold: 8, range: 0.6, atkCd: 1.0, windup: 0.3, minRound: 1 },
  skeleton: { kind: 'skeleton', name: 'Скелет-лучник', hp: 48, dmg: 13, speed: 3.0, radius: 0.5, gold: 9, range: 9, atkCd: 2.0, windup: 0.55, ranged: true, projSpeed: 13, keepDist: 6.5, minRound: 2 },
  orc: { kind: 'orc', name: 'Орк-громила', hp: 170, dmg: 30, speed: 2.9, radius: 0.85, gold: 18, range: 0.9, atkCd: 1.7, windup: 0.6, minRound: 3 },
  troll: { kind: 'troll', name: 'Тролль-вождь', hp: 1500, dmg: 42, speed: 3.0, radius: 1.5, gold: 120, range: 1.2, atkCd: 1.8, windup: 0.7, boss: true, minRound: 4 },
  // Логово дракона (21–23 волны)
  ember: { kind: 'ember', name: 'Огненный сгусток', hp: 70, dmg: 26, speed: 4.6, radius: 0.55, gold: 9, range: 0.5, atkCd: 9, windup: 0.5, explode: 2.3, flying: true, minRound: 21 },
  drake: { kind: 'drake', name: 'Дракончик', hp: 125, dmg: 14, speed: 4.3, radius: 0.7, gold: 14, range: 0.7, atkCd: 0.95, windup: 0.3, flying: true, minRound: 21 },
  spitter: { kind: 'spitter', name: 'Огнеплюй', hp: 100, dmg: 16, speed: 3.3, radius: 0.65, gold: 14, range: 9.5, atkCd: 2.5, windup: 0.6, ranged: true, projSpeed: 11, keepDist: 7, flying: true, minRound: 21 },
  dragon: { kind: 'dragon', name: 'Красный дракон', hp: 5200, dmg: 58, speed: 2.7, radius: 2.6, gold: 600, range: 1.6, atkCd: 1.6, windup: 0.55, boss: true, minRound: 25 },
};

/** Общее усиление мобов — уравновешивает возросшую добычу золота. */
export const MOB_POWER = { hp: 1.28, dmg: 1.12 };

export function mobScale(round: number) {
  // В логове каждая следующая волна заметно злее предыдущей
  const lair = Math.max(0, round - (LAIR_ROUND - 1));
  return {
    hp: (1 + 0.32 * (round - 1) + 0.03 * (round - 1) ** 2) * MOB_POWER.hp * (1 + 0.13 * lair),
    dmg: (1 + 0.22 * (round - 1) + 0.011 * (round - 1) ** 2) * MOB_POWER.dmg * (1 + 0.08 * lair),
    gold: 1 + 0.1 * (round - 1),
  };
}

/** Состав волны: с каждым раундом мобов больше. */
export function roundComposition(round: number, players: number, rng: Rng): MobKind[] {
  const pf = 0.55 + 0.15 * Math.max(1, players);
  if (round >= DRAGON_ROUND) return ['dragon'];
  if (round >= LAIR_ROUND) {
    // Логово: только дракончики, огнеплюи и огненные сгустки, без боссов
    const total = Math.round((5 + 3.5 * round) * pf);
    const list: MobKind[] = [];
    for (let i = 0; i < total; i++) {
      const roll = rng.next();
      list.push(roll < 0.3 ? 'ember' : roll < 0.7 ? 'drake' : 'spitter');
    }
    return list;
  }
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
  if (isTrollRound(round)) list.push('troll');
  if (round >= 12 && isTrollRound(round)) list.push('troll');
  return list;
}
