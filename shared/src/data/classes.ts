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
    base: { maxHp: 310, damage: 22, armor: 18, speed: 5.2, attackSpeed: 1, crit: 0.05, cdr: 0, regen: 2.5, lifesteal: 0, skillPower: 0 },
    difficulty: 1,
    skills: [
      { id: 'slash', name: 'Удар мечом', desc: 'Широкий взмах, задевающий всех врагов перед воином.', cd: 0.6, aim: 'dir', range: 2.8 },
      { id: 'charge', name: 'Рывок щитом', desc: 'Стремительный рывок: урон и оглушение всех на пути.', cd: 5, aim: 'dir', range: 7 },
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
    base: { maxHp: 195, damage: 26, armor: 6, speed: 5.0, attackSpeed: 1, crit: 0.05, cdr: 0.05, regen: 1.2, lifesteal: 0, skillPower: 0 },
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
    base: { maxHp: 195, damage: 20, armor: 7, speed: 5.8, attackSpeed: 1, crit: 0.2, cdr: 0, regen: 1.5, lifesteal: 0, skillPower: 0 },
    difficulty: 2,
    skills: [
      { id: 'shot', name: 'Выстрел', desc: 'Быстрая стрела на большую дистанцию.', cd: 0.5, aim: 'dir', range: 15 },
      { id: 'multishot', name: 'Залп', desc: 'Веер из 5 стрел.', cd: 5, aim: 'dir', range: 13 },
      { id: 'roll', name: 'Кувырок', desc: 'Перекат с неуязвимостью. Ускоряет атаки на 3 сек.', cd: 4, aim: 'dir', range: 5 },
      { id: 'rain', name: 'Дождь стрел', desc: 'Град стрел 3 сек. ранит и замедляет врагов в области.', cd: 12, aim: 'point', range: 13, radius: 3.5 },
    ],
  },
  hunter: {
    id: 'hunter',
    name: 'Охотник на демонов',
    title: 'Клинок тьмы',
    desc: 'Мастер парных клинков. Бьёт стремительно, ныряет в гущу врагов и пьёт их жизнь.',
    color: '#2fd07a',
    passive: { name: 'Жажда охоты', desc: 'Каждый удар — двумя клинками. Вампиризм 6%.' },
    base: { maxHp: 230, damage: 14, armor: 10, speed: 5.6, attackSpeed: 1, crit: 0.1, cdr: 0, regen: 1.6, lifesteal: 0.06, skillPower: 0 },
    difficulty: 2,
    skills: [
      { id: 'twin', name: 'Двойной удар', desc: 'Молниеносный удар двумя клинками перед собой.', cd: 0.42, aim: 'dir', range: 2.5 },
      { id: 'shadowdash', name: 'Теневой рывок', desc: 'Рывок сквозь врагов: урон всем на пути и краткая неуязвимость.', cd: 5, aim: 'dir', range: 6.5 },
      { id: 'glaive', name: 'Летящая глефа', desc: 'Глефа отскакивает между врагами — до 4 целей.', cd: 6, aim: 'dir', range: 10 },
      { id: 'demon', name: 'Демоническая форма', desc: '7 сек.: +40% скорости атаки, +25% скорости бега и +15% вампиризма.', cd: 18, aim: 'self', range: 0, radius: 1.5 },
    ],
  },
  summoner: {
    id: 'summoner',
    name: 'Призыватель',
    title: 'Голос духов',
    desc: 'Призывает духов-волков, каменного голема и тотем. Помощники сражаются сами и отвлекают врагов.',
    color: '#2ab8c8',
    passive: { name: 'Связь душ', desc: 'Помощники сильнеют вместе со снаряжением героя. Ближайший помощник забирает 35% урона по призывателю, а его гибель лечит на 10%.' },
    base: { maxHp: 205, damage: 21, armor: 8, speed: 5.1, attackSpeed: 1, crit: 0.05, cdr: 0.05, regen: 1.4, lifesteal: 0, skillPower: 0 },
    difficulty: 3,
    skills: [
      { id: 'spiritbolt', name: 'Духовная стрела', desc: 'Сгусток духовной энергии. Помощники атакуют цель.', cd: 0.75, aim: 'dir', range: 12 },
      { id: 'wolves', name: 'Духи-волки', desc: 'Призывает двух волков на 14 сек. Укусы замедляют.', cd: 11, aim: 'self', range: 0, radius: 2 },
      { id: 'golem', name: 'Каменный голем', desc: 'Голем на 16 сек.: принимает удары на себя и бьёт по площади, замедляя врагов.', cd: 16, aim: 'self', range: 0, radius: 2.2 },
      { id: 'totem', name: 'Тотем духов', desc: 'Тотем на 8 сек. стреляет по врагам и лечит союзников рядом.', cd: 14, aim: 'point', range: 9, radius: 5.5 },
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
  skillPower: 'Сила умений',
};

export const PERCENT_STATS: (keyof Stats)[] = ['attackSpeed', 'crit', 'cdr', 'lifesteal', 'skillPower'];

export function formatStat(key: keyof Stats, v: number, signed = true): string {
  const sign = signed && v > 0 ? '+' : '';
  if (PERCENT_STATS.includes(key)) return `${sign}${Math.round(v * 100)}%`;
  if (key === 'speed') return `${sign}${v.toFixed(1)}`;
  if (key === 'regen') return `${sign}${v.toFixed(1)}/с`;
  return `${sign}${Math.round(v)}`;
}
