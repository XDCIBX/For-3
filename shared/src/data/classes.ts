import type { HeroClass, Stats } from '../types';

export type AimKind = 'dir' | 'point' | 'self';

export interface SkillDef {
  id: string;
  name: string;
  desc: string;
  /** Базовая перезарядка, сек. */
  cd: number;
  aim: AimKind;
  range: number;
  /** Радиус области (для индикатора прицела). */
  radius?: number;
}

export interface ClassDef {
  id: HeroClass;
  name: string;
  title: string;
  desc: string;
  color: string;
  passive: { name: string; desc: string };
  base: Stats;
  skills: [SkillDef, SkillDef, SkillDef, SkillDef];
  difficulty: number;
}

export const CLASSES: Record<HeroClass, ClassDef> = {
  warrior: {
    id: 'warrior',
    name: 'Воин',
    title: 'Несокрушимый страж',
    desc: 'Закован в сталь, рвётся в самую гущу врагов. Держит удар и защищает союзников.',
    color: '#e0533d',
    passive: { name: 'Стойкость', desc: 'Высокая броня и быстрое восстановление здоровья.' },
    base: { maxHp: 280, damage: 22, armor: 14, speed: 5.2, attackSpeed: 1, crit: 0.05, cdr: 0, regen: 2.5, lifesteal: 0 },
    difficulty: 1,
    skills: [
      { id: 'slash', name: 'Удар мечом', desc: 'Широкий взмах, задевающий всех врагов перед воином.', cd: 0.6, aim: 'dir', range: 2.8 },
      { id: 'charge', name: 'Рывок щитом', desc: 'Стремительный рывок: урон и оглушение всех на пути.', cd: 6, aim: 'dir', range: 7 },
      { id: 'whirl', name: 'Вихрь', desc: 'Воин вращается 2 сек., нанося урон всем вокруг.', cd: 9, aim: 'self', range: 0, radius: 3 },
      { id: 'warcry', name: 'Боевой клич', desc: 'Союзники рядом наносят +25% урона, воин получает на 40% меньше урона. Враги атакуют воина.', cd: 16, aim: 'self', range: 0, radius: 9 },
    ],
  },
  mage: {
    id: 'mage',
    name: 'Маг',
    title: 'Повелитель стихий',
    desc: 'Хрупкий, но смертоносный. Сжигает толпы врагов и замораживает их на месте.',
    color: '#8a5cff',
    passive: { name: 'Магический щит', desc: 'Щит поглощает урон и восстанавливается, если маг не получает урон 4 сек.' },
    base: { maxHp: 170, damage: 26, armor: 5, speed: 5.0, attackSpeed: 1, crit: 0.05, cdr: 0.05, regen: 1.2, lifesteal: 0 },
    difficulty: 3,
    skills: [
      { id: 'bolt', name: 'Чародейская стрела', desc: 'Сгусток магии летит в цель.', cd: 0.75, aim: 'dir', range: 13 },
      { id: 'fireball', name: 'Огненный шар', desc: 'Взрывается при попадании и оставляет горящую землю.', cd: 5, aim: 'dir', range: 12, radius: 2.8 },
      { id: 'nova', name: 'Ледяная волна', desc: 'Замораживает всех врагов вокруг на 2 сек.', cd: 8, aim: 'self', range: 0, radius: 5 },
      { id: 'meteor', name: 'Метеор', desc: 'Через секунду с неба падает метеор: огромный урон и оглушение.', cd: 14, aim: 'point', range: 11, radius: 3.5 },
    ],
  },
  archer: {
    id: 'archer',
    name: 'Лучник',
    title: 'Меткий следопыт',
    desc: 'Быстрый и ловкий. Расстреливает врагов издалека и ускользает от ударов.',
    color: '#3dbb5a',
    passive: { name: 'Зоркий глаз', desc: '+20% шанс критического удара и повышенная скорость бега.' },
    base: { maxHp: 195, damage: 20, armor: 7, speed: 5.8, attackSpeed: 1, crit: 0.2, cdr: 0, regen: 1.5, lifesteal: 0 },
    difficulty: 2,
    skills: [
      { id: 'shot', name: 'Выстрел', desc: 'Быстрая стрела на большую дистанцию.', cd: 0.5, aim: 'dir', range: 15 },
      { id: 'multishot', name: 'Залп', desc: 'Веер из 5 стрел.', cd: 5, aim: 'dir', range: 13 },
      { id: 'roll', name: 'Кувырок', desc: 'Перекат с неуязвимостью. Ускоряет атаки на 3 сек.', cd: 4, aim: 'dir', range: 5 },
      { id: 'rain', name: 'Дождь стрел', desc: 'Град стрел 3 сек. ранит и замедляет врагов в области.', cd: 12, aim: 'point', range: 13, radius: 3.5 },
    ],
  },
};

export const STAT_LABELS: Record<keyof Stats, string> = {
  maxHp: 'Здоровье',
  damage: 'Урон',
  armor: 'Броня',
  speed: 'Скорость',
  attackSpeed: 'Скор. атаки',
  crit: 'Крит. удар',
  cdr: 'Перезарядка',
  regen: 'Регенерация',
  lifesteal: 'Вампиризм',
};

export const PERCENT_STATS: (keyof Stats)[] = ['attackSpeed', 'crit', 'cdr', 'lifesteal'];

export function formatStat(key: keyof Stats, v: number, signed = true): string {
  const sign = signed && v > 0 ? '+' : '';
  if (PERCENT_STATS.includes(key)) return `${sign}${Math.round(v * 100)}%`;
  if (key === 'speed') return `${sign}${v.toFixed(1)}`;
  if (key === 'regen') return `${sign}${v.toFixed(1)}/с`;
  return `${sign}${Math.round(v)}`;
}
