import type { Equip, HeroClass, Item, Rarity, Slot, Stats } from '../types';
import { RARITIES, SLOTS } from '../types';
import { CLASSES, PERCENT_STATS } from './classes';
import type { Rng } from '../rng';
import { SELL_BACK, SHOP_SIZE } from '../constants';

export interface RarityDef {
  name: string;
  color: string;
  mult: number;
  priceMult: number;
}

export const RARITY: Record<Rarity, RarityDef> = {
  common: { name: 'Обычный', color: '#c9d3da', mult: 1, priceMult: 1 },
  rare: { name: 'Редкий', color: '#47a8ff', mult: 1.65, priceMult: 2.2 },
  epic: { name: 'Эпический', color: '#be6bff', mult: 2.5, priceMult: 4.4 },
  legendary: { name: 'Легендарный', color: '#ffb321', mult: 3.6, priceMult: 7.5 },
  relic: { name: 'Реликвия', color: '#ff3b3b', mult: 5, priceMult: 11.5 },
};

/** Сила умений, которую даёт любой предмет в зависимости от редкости. */
export const SKILL_POWER: Record<Rarity, number> = { common: 0.03, rare: 0.06, epic: 0.1, legendary: 0.15, relic: 0.21 };

export interface ItemTemplate {
  id: string;
  slot: Slot;
  cls: HeroClass | null;
  /** Название для каждой редкости: обычный, редкий, эпический, легендарный, реликвия. */
  names: [string, string, string, string, string];
  stats: Partial<Stats>;
}

export const SLOT_NAMES: Record<Slot, string> = {
  weapon: 'Оружие',
  helmet: 'Голова',
  armor: 'Доспех',
  boots: 'Обувь',
  amulet: 'Амулет',
  ring: 'Кольцо',
};

export const ITEM_TEMPLATES: ItemTemplate[] = [
  // --- Оружие воина ---
  { id: 'sword', slot: 'weapon', cls: 'warrior', names: ['Тренировочный меч', 'Стальной меч', 'Рунный клинок', 'Клинок Рассвета', 'Меч Багровой Зари'], stats: { damage: 6, crit: 0.03 } },
  { id: 'axe', slot: 'weapon', cls: 'warrior', names: ['Топор дровосека', 'Боевой топор', 'Секира Берсерка', 'Погибель Титанов', 'Секира Кровавой Луны'], stats: { damage: 8, lifesteal: 0.03 } },
  { id: 'hammer', slot: 'weapon', cls: 'warrior', names: ['Деревянная кувалда', 'Железный молот', 'Громовой молот', 'Молот Небес', 'Молот Падшего Бога'], stats: { damage: 5, maxHp: 30 } },
  // --- Оружие мага ---
  { id: 'staff', slot: 'weapon', cls: 'mage', names: ['Кривой посох', 'Посох мудреца', 'Посох Бури', 'Посох Архимага', 'Посох Первородного Огня'], stats: { damage: 7, cdr: 0.04 } },
  { id: 'wand', slot: 'weapon', cls: 'mage', names: ['Ивовая палочка', 'Жезл искр', 'Жезл Пламени', 'Скипетр Вечности', 'Жезл Алого Феникса'], stats: { damage: 5, attackSpeed: 0.08 } },
  { id: 'orb', slot: 'weapon', cls: 'mage', names: ['Стеклянный шар', 'Хрустальная сфера', 'Око Бездны', 'Сердце Звезды', 'Сердце Багрового Солнца'], stats: { damage: 6, maxHp: 20, crit: 0.02 } },
  // --- Оружие лучника ---
  { id: 'bow', slot: 'weapon', cls: 'archer', names: ['Охотничий лук', 'Длинный лук', 'Эльфийский лук', 'Лук Лунного Света', 'Лук Кровавой Охоты'], stats: { damage: 6, crit: 0.04 } },
  { id: 'crossbow', slot: 'weapon', cls: 'archer', names: ['Самострел', 'Тяжёлый арбалет', 'Арбалет Ассасина', 'Глаз Бури', 'Арбалет Судного Дня'], stats: { damage: 8, armor: 1 } },
  { id: 'recurve', slot: 'weapon', cls: 'archer', names: ['Короткий лук', 'Рогатый лук', 'Лук Ветров', 'Шёпот Леса', 'Лук Алого Заката'], stats: { damage: 5, attackSpeed: 0.1 } },
  // --- Оружие охотника на демонов (парное) ---
  { id: 'glaives', slot: 'weapon', cls: 'hunter', names: ['Учебные глефы', 'Стальные глефы', 'Глефы Скверны', 'Глефы Падшей Звезды', 'Глефы Иллидари'], stats: { damage: 5, attackSpeed: 0.06 } },
  { id: 'daggers', slot: 'weapon', cls: 'hunter', names: ['Ржавые кинжалы', 'Парные стилеты', 'Клыки Ночи', 'Жала Бездны', 'Клыки Пожирателя'], stats: { damage: 5, crit: 0.04 } },
  { id: 'warblades', slot: 'weapon', cls: 'hunter', names: ['Тесаки охотника', 'Боевые клинки', 'Клинки Крови', 'Пожиратели Душ', 'Клинки Пылающей Бездны'], stats: { damage: 6, lifesteal: 0.03 } },
  // --- Оружие призывателя ---
  { id: 'tome', slot: 'weapon', cls: 'summoner', names: ['Потрёпанный гримуар', 'Книга духов', 'Гримуар Предков', 'Кодекс Вечности', 'Книга Мёртвых Королей'], stats: { damage: 6, cdr: 0.04 } },
  { id: 'totemstaff', slot: 'weapon', cls: 'summoner', names: ['Резной посох', 'Посох шамана', 'Тотем Грома', 'Древо Жизни', 'Тотем Первых Предков'], stats: { damage: 5, maxHp: 30 } },
  { id: 'bell', slot: 'weapon', cls: 'summoner', names: ['Медный колокольчик', 'Колокол зова', 'Колокол Предков', 'Глас Небес', 'Колокол Конца Времён'], stats: { damage: 5, attackSpeed: 0.08 } },
  // --- Голова ---
  { id: 'helm', slot: 'helmet', cls: null, names: ['Кожаная шапка', 'Железный шлем', 'Шлем Стража', 'Корона Королей', 'Венец Багрового Короля'], stats: { maxHp: 25, armor: 3 } },
  { id: 'hood', slot: 'helmet', cls: null, names: ['Тряпичный капюшон', 'Капюшон следопыта', 'Капюшон Тени', 'Венец Мудрости', 'Капюшон Алой Тени'], stats: { crit: 0.03, cdr: 0.03 } },
  // --- Доспех ---
  { id: 'plate', slot: 'armor', cls: null, names: ['Стёганка', 'Кольчуга', 'Латы Паладина', 'Доспех Дракона', 'Латы Огненного Титана'], stats: { maxHp: 40, armor: 6 } },
  { id: 'robe', slot: 'armor', cls: null, names: ['Холщовая рубаха', 'Мантия ученика', 'Мантия Чародея', 'Одеяние Звездочёта', 'Мантия Кровавой Луны'], stats: { maxHp: 20, damage: 3, cdr: 0.03 } },
  { id: 'leather', slot: 'armor', cls: null, names: ['Кожанка', 'Куртка рейнджера', 'Доспех Ночи', 'Шкура Феникса', 'Шкура Багрового Дракона'], stats: { maxHp: 25, armor: 3, attackSpeed: 0.05 } },
  // --- Обувь ---
  { id: 'boots', slot: 'boots', cls: null, names: ['Лапти', 'Кожаные сапоги', 'Сапоги-скороходы', 'Крылатые сандалии', 'Поступь Пламени'], stats: { speed: 0.35, armor: 2 } },
  { id: 'greaves', slot: 'boots', cls: null, names: ['Деревянные башмаки', 'Железные поножи', 'Сабатоны Стража', 'Поступь Титана', 'Сабатоны Вулкана'], stats: { armor: 4, maxHp: 20, speed: 0.12 } },
  // --- Амулет ---
  { id: 'amulet', slot: 'amulet', cls: null, names: ['Медный амулет', 'Серебряный кулон', 'Амулет Ярости', 'Слеза Богини', 'Око Древних'], stats: { damage: 4, regen: 0.6 } },
  { id: 'talisman', slot: 'amulet', cls: null, names: ['Клык волка', 'Оберег', 'Талисман Жизни', 'Сердце Феникса', 'Кровь Феникса'], stats: { maxHp: 30, regen: 1.0 } },
  // --- Кольцо ---
  { id: 'ring', slot: 'ring', cls: null, names: ['Медное кольцо', 'Серебряное кольцо', 'Кольцо Силы', 'Кольцо Всевластия', 'Кольцо Багрового Владыки'], stats: { damage: 3, crit: 0.03 } },
  { id: 'band', slot: 'ring', cls: null, names: ['Простое колечко', 'Кольцо вампира', 'Перстень Крови', 'Перстень Вечной Ночи', 'Перстень Вечной Крови'], stats: { lifesteal: 0.03, attackSpeed: 0.05 } },
];

export const TEMPLATE_BY_ID: Record<string, ItemTemplate> = Object.fromEntries(ITEM_TEMPLATES.map((t) => [t.id, t]));

let itemCounter = 0;

/** Вероятности редкостей в зависимости от раунда. */
export function rarityWeights(round: number): Record<Rarity, number> {
  const r = Math.max(1, round);
  return {
    common: Math.max(8, 70 - r * 6),
    rare: 25 + r * 1.5,
    epic: r >= 3 ? 4 + r * 2 : 0,
    legendary: r >= 6 ? (r - 5) * 1.6 : 0,
    relic: r >= 10 ? (r - 9) * 0.9 : 0,
  };
}

function rollRarity(rng: Rng, round: number): Rarity {
  const w = rarityWeights(round);
  const total = RARITIES.reduce((s, k) => s + w[k], 0);
  let x = rng.next() * total;
  for (const k of RARITIES) {
    x -= w[k];
    if (x <= 0) return k;
  }
  return 'common';
}

export function makeItem(tpl: ItemTemplate, rarity: Rarity, round: number, rng?: Rng): Item {
  const rd = RARITY[rarity];
  const ri = RARITIES.indexOf(rarity);
  const roundScale = 1 + 0.14 * (round - 1);
  const stats: Partial<Stats> = {};
  for (const [k, base] of Object.entries(tpl.stats) as [keyof Stats, number][]) {
    const jitter = rng ? rng.range(0.9, 1.12) : 1;
    let v: number;
    if (PERCENT_STATS.includes(k)) {
      v = base * rd.mult * (1 + 0.04 * (round - 1)) * jitter;
      v = Math.round(v * 100) / 100;
    } else if (k === 'speed' || k === 'regen') {
      v = base * rd.mult * (1 + 0.05 * (round - 1)) * jitter;
      v = Math.round(v * 10) / 10;
    } else {
      v = Math.round(base * rd.mult * roundScale * jitter);
    }
    if (v > 0) stats[k] = v;
  }
  stats.skillPower = SKILL_POWER[rarity];
  const price = Math.round((28 * rd.priceMult * (1 + 0.22 * (round - 1))) / 5) * 5;
  return {
    id: `it${Date.now().toString(36)}${(itemCounter++).toString(36)}`,
    tpl: tpl.id,
    name: tpl.names[ri],
    slot: tpl.slot,
    rarity,
    cls: tpl.cls,
    stats,
    price,
  };
}

export function rollItem(rng: Rng, round: number, filter: (t: ItemTemplate) => boolean): Item {
  const pool = ITEM_TEMPLATES.filter(filter);
  return makeItem(rng.pick(pool), rollRarity(rng, round), round, rng);
}

/** Ассортимент таверны: по оружию для каждого класса в игре + случайные вещи. */
export function generateShop(rng: Rng, round: number, classes: HeroClass[]): Item[] {
  const items: Item[] = [];
  const uniq = [...new Set(classes)];
  for (const c of uniq) items.push(rollItem(rng, round, (t) => t.cls === c));
  const nonWeapon = SLOTS.filter((s) => s !== 'weapon');
  // хотя бы по одному предмету в разные слоты
  const slotOrder = rng.shuffle([...nonWeapon]);
  let i = 0;
  while (items.length < SHOP_SIZE) {
    const slot = i < slotOrder.length ? slotOrder[i] : rng.chance(0.25) ? 'weapon' : rng.pick(nonWeapon);
    const cls = uniq.length ? rng.pick(uniq) : null;
    items.push(rollItem(rng, round, (t) => t.slot === slot && (t.slot !== 'weapon' || t.cls === cls)));
    i++;
  }
  return items;
}

export function emptyEquip(): Equip {
  return { weapon: null, helmet: null, armor: null, boots: null, amulet: null, ring: null };
}

export function computeStats(cls: HeroClass, equip: Equip): Stats {
  const s: Stats = { ...CLASSES[cls].base };
  for (const slot of SLOTS) {
    const it = equip[slot];
    if (!it) continue;
    for (const [k, v] of Object.entries(it.stats) as [keyof Stats, number][]) s[k] += v;
  }
  s.crit = Math.min(0.75, s.crit);
  s.cdr = Math.min(0.5, s.cdr);
  s.lifesteal = Math.min(0.35, s.lifesteal);
  s.attackSpeed = Math.min(3, s.attackSpeed);
  s.speed = Math.min(9, s.speed);
  return s;
}

/** Цена возврата при замене. */
export function sellValue(it: Item): number {
  return Math.floor(it.price * SELL_BACK);
}

export function itemScore(it: Item | null): number {
  if (!it) return 0;
  return RARITY[it.rarity].mult * 10 + it.price / 50;
}
