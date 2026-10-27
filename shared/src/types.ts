export type HeroClass = 'warrior' | 'mage' | 'archer' | 'hunter' | 'summoner';
export const HERO_CLASSES: HeroClass[] = ['warrior', 'mage', 'archer', 'hunter', 'summoner'];

export type Slot = 'weapon' | 'helmet' | 'armor' | 'boots' | 'amulet' | 'ring';
export const SLOTS: Slot[] = ['weapon', 'helmet', 'armor', 'boots', 'amulet', 'ring'];

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legendary'];

export interface Stats {
  maxHp: number;
  damage: number;
  armor: number;
  speed: number;
  attackSpeed: number;
  crit: number;
  cdr: number;
  regen: number;
  lifesteal: number;
}
export type StatKey = keyof Stats;

export interface Item {
  id: string;
  tpl: string;
  name: string;
  slot: Slot;
  rarity: Rarity;
  cls: HeroClass | null;
  stats: Partial<Stats>;
  price: number;
}

export type Equip = Record<Slot, Item | null>;

export type Phase =
  | 'lobby'
  | 'intro'
  | 'battle'
  | 'clear'
  | 'tavern'
  | 'duel_intro'
  | 'duel'
  | 'duel_end'
  | 'gameover';

export type MobKind = 'slime' | 'goblin' | 'skeleton' | 'orc' | 'troll';

export type ProjKind = 'arrow' | 'bolt' | 'fireball' | 'earrow' | 'rock' | 'glaive' | 'spirit';

/** Призванные помощники призывателя. */
export type MinionKind = 'wolf' | 'golem' | 'totem';
export type ZoneKind = 'rain' | 'meteor' | 'burn' | 'slam';
