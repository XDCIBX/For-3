import { CLASSES, ITEM_TEMPLATES, MOBS, RARITY, RARITIES, SLOT_NAMES, STAT_LABELS, type HeroClass, type MobKind, type Rarity, type Slot, type Stats } from '@game/shared';
import { BOT_NAMES_RU, ru, type UiDict, type UiKey } from './ru';
import { en, enData } from './en';
import { es, esData } from './es';
import { de, deData } from './de';
import { fr, frData } from './fr';
import { it, itData } from './it';
import { el, elData } from './el';

/**
 * Локализация. Тексты интерфейса — по ключам (ru.ts — исходник), игровые
 * названия — по идентификаторам из данных. Сообщения сервера приходят ключом
 * с параметрами и переводятся здесь же.
 */

export type Lang = 'en' | 'ru' | 'es' | 'de' | 'fr' | 'it' | 'el';

/** Языки в порядке показа в настройках, с самоназванием. */
export const LANGS: { id: Lang; name: string }[] = [
  { id: 'en', name: 'English' },
  { id: 'ru', name: 'Русский' },
  { id: 'es', name: 'Español' },
  { id: 'de', name: 'Deutsch' },
  { id: 'fr', name: 'Français' },
  { id: 'it', name: 'Italiano' },
  { id: 'el', name: 'Ελληνικά' },
];

/** Игровые названия на одном языке. */
export interface DataDict {
  classes: Record<HeroClass, { name: string; title: string; desc: string; passive: [string, string]; short?: string }>;
  /** Умение по id: [название, описание]. */
  skills: Record<string, [string, string]>;
  /** Предмет по шаблону: названия для пяти редкостей. */
  items: Record<string, [string, string, string, string, string]>;
  mobs: Record<MobKind, string>;
  stats: Record<keyof Stats, string>;
  slots: Record<Slot, string>;
  rarity: Record<Rarity, string>;
  /** Имена ботов в порядке BOT_NAMES_RU. */
  bots: string[];
}

/** Русские названия собираются из самих игровых данных — без дублирования. */
function ruData(): DataDict {
  const classes = {} as DataDict['classes'];
  const skills: DataDict['skills'] = {};
  for (const c of Object.values(CLASSES)) {
    classes[c.id] = { name: c.name, title: c.title, desc: c.desc, passive: [c.passive.name, c.passive.desc] };
    for (const s of c.skills) skills[s.id] = [s.name, s.desc];
  }
  const items: DataDict['items'] = {};
  for (const t of ITEM_TEMPLATES) items[t.id] = t.names;
  const mobs = {} as DataDict['mobs'];
  for (const [k, m] of Object.entries(MOBS)) mobs[k as MobKind] = m.name;
  const rarity = {} as DataDict['rarity'];
  for (const r of RARITIES) rarity[r] = RARITY[r].name;
  return { classes, skills, items, mobs, stats: STAT_LABELS, slots: SLOT_NAMES, rarity, bots: BOT_NAMES_RU };
}

const UI: Record<Lang, UiDict> = { ru, en, es, de, fr, it, el };
const DATA: Record<Lang, DataDict> = { ru: ruData(), en: enData, es: esData, de: deData, fr: frData, it: itData, el: elData };

let lang: Lang = 'en';

/** Язык системы, если он поддерживается, иначе английский. */
export function systemLang(): Lang {
  const prefs = [...(navigator.languages ?? []), navigator.language].filter(Boolean);
  for (const p of prefs) {
    const code = p.toLowerCase().split('-')[0] as Lang;
    if (code in UI) return code;
  }
  return 'en';
}

export function setLang(l: Lang) {
  lang = l in UI ? l : 'en';
  document.documentElement.lang = lang;
}

export function getLang(): Lang {
  return lang;
}

type Params = Record<string, string | number>;

function fill(s: string, p?: Params): string {
  if (!p) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in p ? String(p[k]) : m));
}

/** Строка на заданном языке (например, имя по умолчанию до выбора языка). */
export function tIn(l: Lang, key: UiKey): string {
  return (UI[l] ?? UI.en)[key] ?? UI.en[key] ?? key;
}

/** Строка интерфейса. Нет перевода — английский, затем сам ключ. */
export function t(key: UiKey, p?: Params): string {
  return fill(UI[lang][key] ?? UI.en[key] ?? key, p);
}

/** Строка по ключу, пришедшему с сервера (сообщение, ошибка); неизвестное — как есть. */
export function tServer(key: string, p?: Params): string {
  if (!(key in ru)) return key;
  const params: Params = { ...p };
  // Моб передаётся видом — подставляем название
  if (typeof params.mob === 'string') params.mob = mobName(params.mob as MobKind);
  for (const k of ['name', 'a', 'b', 'killer']) if (typeof params[k] === 'string') params[k] = playerName(params[k] as string);
  return t(key as UiKey, params);
}

const data = () => DATA[lang];

export const className = (c: HeroClass) => data().classes[c]?.name ?? CLASSES[c].name;
/** Короткое имя класса для карточки выбора. */
export const classShort = (c: HeroClass) => data().classes[c]?.short ?? (lang === 'ru' ? CLASSES[c].name.split(' ')[0] : className(c));
export const classTitle = (c: HeroClass) => data().classes[c]?.title ?? CLASSES[c].title;
export const classDesc = (c: HeroClass) => data().classes[c]?.desc ?? CLASSES[c].desc;
export const passiveName = (c: HeroClass) => data().classes[c]?.passive[0] ?? CLASSES[c].passive.name;
export const passiveDesc = (c: HeroClass) => data().classes[c]?.passive[1] ?? CLASSES[c].passive.desc;
export const skillName = (id: string) => data().skills[id]?.[0] ?? DATA.ru.skills[id]?.[0] ?? id;
export const skillDesc = (id: string) => data().skills[id]?.[1] ?? DATA.ru.skills[id]?.[1] ?? '';
export const mobName = (k: MobKind) => data().mobs[k] ?? MOBS[k]?.name ?? k;
export const statLabel = (k: keyof Stats) => data().stats[k] ?? STAT_LABELS[k];
export const slotName = (s: Slot) => data().slots[s] ?? SLOT_NAMES[s];
export const rarityName = (r: Rarity) => data().rarity[r] ?? RARITY[r].name;

export function itemName(tpl: string, rarity: Rarity): string {
  const i = RARITIES.indexOf(rarity);
  return data().items[tpl]?.[i] ?? DATA.ru.items[tpl]?.[i] ?? tpl;
}

/**
 * Имя игрока для показа: имена ботов («Бот Борис») переводятся,
 * имена людей — как есть.
 */
export function playerName(raw: string): string {
  if (lang === 'ru' || !raw.startsWith('Бот')) return raw;
  const rest = raw.slice(3).trim();
  const i = BOT_NAMES_RU.indexOf(rest);
  const nm = i >= 0 ? data().bots[i] ?? rest : rest;
  return nm ? `${t('botPrefix')} ${nm}` : t('botPrefix');
}

/** Значение характеристики с единицами текущего языка. */
export function formatStatL(key: keyof Stats, v: number, signed = true): string {
  const sign = signed && v > 0 ? '+' : '';
  if (key === 'attackSpeed' || key === 'crit' || key === 'cdr' || key === 'lifesteal') return `${sign}${Math.round(v * 100)}%`;
  if (key === 'speed') return `${sign}${v.toFixed(1)}`;
  if (key === 'regen') return `${sign}${v.toFixed(1)}${t('unit.perSec')}`;
  return `${sign}${Math.round(v)}`;
}
