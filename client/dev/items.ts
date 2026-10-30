// Просмотр 3D-иконок предметов: /dev/items.html?r=epic
import { ITEM_TEMPLATES, type Rarity } from '@game/shared';
import { itemIcon3d } from '../src/render/itemIcons';
import { itemIcon } from '../src/ui/icons';

const q = new URLSearchParams(location.search);
const r = (q.get('r') ?? 'epic') as Rarity;
const g = document.getElementById('g')!;
g.innerHTML = ITEM_TEMPLATES.map((t) => `<div class="c" title="${t.id}">${itemIcon3d(t.id, r, (q.get('cls') ?? 'warrior') as 'warrior', itemIcon(t.id, r))}</div>`).join('');
