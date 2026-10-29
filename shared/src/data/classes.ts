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
    base: { maxHp: 310, damage: 22, armor: 18, speed: 5.2, attackSpeed: 1, crit: 0.05, cdr: 0, regen: 2.5, lifesteal: 0, skillPower: 22 },
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
    base: { maxHp: 195, damage: 26, armor: 6, speed: 5.0, attackSpeed: 1, crit: 0.05, cdr: 0.05, regen: 1.2, lifesteal: 0, skillPower: 26 },
    difficulty: 3,
    skills: [
      { id: 'bolt', name: 'Чародейская стрела', desc: 'Сгусток магии летит в цель.', cd: 0.75, aim: 'dir', range: 13 },
      { id: 'fireball', name: 'Огненный шар', desc: 'Взрывается при попадании и оставляет горящую землю.', cd: 5, aim: 'dir', range: 12, radius: 2.8 },
      { id: 'nova', name: 'Ледяная волна', desc: 'Замораживает всех врагов вокруг на 2 сек.', cd: 8, aim: 'self', range: 0, radius: 5 },
      { id: 'meteor', name: 'Метеор', desc: 'Через секунду с неба падает метеор: большой урон по площади и оглушение. Не бывает критическим.', cd: 14, aim: 'point', range: 11, radius: 3.5 },
    ],
  },
  archer: {
    id: 'archer',
    name: 'Лучник',
    title: 'Меткий следопыт',
    desc: 'Быстрый и ловкий. Расстреливает врагов издалека и ускользает от ударов.',
    color: '#3dbb5a',
    passive: { name: 'Зоркий глаз', desc: '+20% шанс критического удара и повышенная скорость бега.' },
    base: { maxHp: 195, damage: 20, armor: 7, speed: 5.8, attackSpeed: 1, crit: 0.2, cdr: 0, regen: 1.5, lifesteal: 0, skillPower: 20 },
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
    base: { maxHp: 230, damage: 14, armor: 10, speed: 5.6, attackSpeed: 1, crit: 0.1, cdr: 0, regen: 1.6, lifesteal: 0.06, skillPower: 14 },
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
    base: { maxHp: 205, damage: 21, armor: 8, speed: 5.1, attackSpeed: 1, crit: 0.05, cdr: 0.05, regen: 1.4, lifesteal: 0, skillPower: 21 },
    difficulty: 3,
    skills: [
      { id: 'spiritbolt', name: 'Духовная стрела', desc: 'Сгусток духовной энергии. Помощники атакуют цель.', cd: 0.75, aim: 'dir', range: 12 },
      { id: 'wolves', name: 'Духи-волки', desc: 'Призывает двух волков на 14 сек. Укусы замедляют.', cd: 11, aim: 'self', range: 0, radius: 2 },
      { id: 'golem', name: 'Каменный голем', desc: 'Голем на 16 сек.: принимает удары на себя и бьёт по площади, замедляя врагов.', cd: 16, aim: 'self', range: 0, radius: 2.2 },
      { id: 'totem', name: 'Тотем духов', desc: 'Тотем на 8 сек.: стреляет по врагам, каждые полсекунды ранит всех врагов в круге волной духов и лечит союзников рядом.', cd: 14, aim: 'point', range: 9, radius: 5.5 },
    ],
  },
  werewolf: {
    id: 'werewolf',
    name: 'Оборотень',
    title: 'Дитя полнолуния',
    desc: 'Свирепый боец ближнего боя. Прыгает на добычу, воем наводит ужас и обращается в огромного зверя.',
    color: '#c27a3a',
    passive: { name: 'Зов крови', desc: 'Когда здоровья меньше 40%, урон выше на 15%, а регенерация втрое сильнее (в дуэлях — только урон).' },
    base: { maxHp: 270, damage: 21, armor: 13, speed: 5.6, attackSpeed: 1, crit: 0.08, cdr: 0, regen: 2.0, lifesteal: 0.03, skillPower: 21 },
    difficulty: 2,
    skills: [
      { id: 'rend', name: 'Удар когтями', desc: 'Размашистый удар когтями по всем врагам перед собой.', cd: 0.55, aim: 'dir', range: 2.6 },
      { id: 'pounce', name: 'Прыжок хищника', desc: 'Прыжок в выбранную точку: при приземлении ранит и замедляет врагов вокруг.', cd: 7, aim: 'point', range: 8, radius: 2.6 },
      { id: 'howl', name: 'Вой', desc: 'Вой наводит ужас: враги вокруг ранены, на миг замирают от страха и замедляются.', cd: 10, aim: 'self', range: 0, radius: 6 },
      { id: 'beast', name: 'Звериная форма', desc: '8 сек. в облике огромного зверя: +25% урона, +20% скорости атаки, на 15% меньше получаемого урона.', cd: 20, aim: 'self', range: 0, radius: 1.5 },
    ],
  },
  dwarf: {
    id: 'dwarf',
    name: 'Гном',
    title: 'Мастер пороха',
    desc: 'Крепкий гном-инженер с мушкетоном. Ставит турели, швыряет пороховые бочки и сотрясает землю.',
    color: '#d08a2a',
    passive: { name: 'Каменная кровь', desc: 'Получает на 12% меньше урона, но бегает медленнее.' },
    base: { maxHp: 250, damage: 17, armor: 13, speed: 4.9, attackSpeed: 1, crit: 0.06, cdr: 0, regen: 1.8, lifesteal: 0, skillPower: 17 },
    difficulty: 2,
    skills: [
      { id: 'blast', name: 'Залп дробью', desc: 'Мушкетон стреляет веером из трёх дробин. Вблизи попадают все.', cd: 0.65, aim: 'dir', range: 8 },
      { id: 'bomb', name: 'Пороховая бочка', desc: 'Бочка летит в точку и взрывается: большой урон по площади и оглушение.', cd: 8, aim: 'point', range: 9, radius: 3 },
      { id: 'turret', name: 'Турель', desc: 'Механическая турель на 12 сек. стреляет по ближайшим врагам и отвлекает их.', cd: 15, aim: 'point', range: 6, radius: 1 },
      { id: 'quake', name: 'Землетрясение', desc: 'Удар о землю: волна ранит и оглушает всех врагов вокруг.', cd: 14, aim: 'self', range: 0, radius: 5 },
    ],
  },
};

export const STAT_LABELS: Record<keyof Stats, string> = {
  maxHp: 'Здоровье',
  damage: 'Сила атаки',
  armor: 'Броня',
  speed: 'Скорость',
  attackSpeed: 'Скор. атаки',
  crit: 'Крит. удар',
  cdr: 'Перезарядка',
  regen: 'Регенерация',
  lifesteal: 'Вампиризм',
  skillPower: 'Сила умений',
};

export const PERCENT_STATS: (keyof Stats)[] = ['attackSpeed', 'crit', 'cdr', 'lifesteal'];

export function formatStat(key: keyof Stats, v: number, signed = true): string {
  const sign = signed && v > 0 ? '+' : '';
  if (PERCENT_STATS.includes(key)) return `${sign}${Math.round(v * 100)}%`;
  if (key === 'speed') return `${sign}${v.toFixed(1)}`;
  if (key === 'regen') return `${sign}${v.toFixed(1)}/с`;
  return `${sign}${Math.round(v)}`;
}
