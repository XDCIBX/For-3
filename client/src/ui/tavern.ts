import { CLASSES, RARITY, SLOTS, SLOT_NAMES, STAT_LABELS, formatStat, sellValue, type Item, type StatKey } from '@game/shared';
import type { ClientState } from '../net/state';
import { sfx } from '../audio/sfx';
import { CLASS_BG, el, esc } from './dom';
import { COIN, MUG, classIcon, itemIcon } from './icons';

const EMPTY_ICON: Record<string, string> = { weapon: 'weapon', helmet: 'helm', armor: 'plate', boots: 'boots', amulet: 'amulet', ring: 'ring' };
const DEFAULT_WEAPON: Record<string, string> = { warrior: 'sword', mage: 'staff', archer: 'bow' };

const MAIN_STATS: StatKey[] = ['maxHp', 'damage', 'armor', 'speed', 'attackSpeed', 'crit', 'cdr', 'regen', 'lifesteal'];

/** Таверна: общий магазин, экипировка и готовность. */
export class TavernUi {
  readonly el: HTMLElement;
  private cards = new Map<string, HTMLElement>();
  private onBuy: (id: string) => void;
  private onReady: (v: boolean) => void;
  private lastKey = '';
  private lastEquipKey = '';
  private lastPartyKey = '';

  constructor(onBuy: (id: string) => void, onReady: (v: boolean) => void) {
    this.onBuy = onBuy;
    this.onReady = onReady;
    this.el = el(`
      <div class="screen tavern">
        <div class="shop">
          <div class="shop-head">
            <div class="shop-title"><span class="mug">${MUG}</span> Лавка «Пьяного Дракона»</div>
            <div class="timer">45</div>
          </div>
          <div class="party"></div>
          <div class="items"></div>
        </div>
        <div class="side">
          <div class="panel equip">
            <div class="row" style="justify-content:space-between;margin-bottom:6px">
              <div class="label">Снаряжение</div>
              <div class="gold-box" style="font-size:18px"><span class="coin">${COIN}</span><b>0</b></div>
            </div>
            <div class="equip-grid"></div>
            <div class="stats"></div>
          </div>
          <button class="btn green" id="tready">✔ Готов к бою</button>
        </div>
      </div>`);
  }

  update(st: ClientState) {
    const me = st.me;
    if (!me) return;
    const timer = this.el.querySelector<HTMLElement>('.timer')!;
    const t = Math.ceil(st.timer);
    timer.textContent = `⏳ ${t}`;
    timer.classList.toggle('low', t <= 10);
    (this.el.querySelector('.equip .gold-box b') as HTMLElement).textContent = String(me.g);

    // Товары
    const box = this.el.querySelector('.items')!;
    const ids = new Set(st.shop.map((i) => i.id));
    for (const [id, card] of this.cards) {
      if (!ids.has(id)) {
        this.cards.delete(id);
        card.classList.add('sold');
        setTimeout(() => card.remove(), 400);
      }
    }
    st.shop.forEach((it, idx) => {
      let card = this.cards.get(it.id);
      if (!card) {
        card = this.makeCard(it);
        card.style.animationDelay = `${idx * 0.04}s`;
        this.cards.set(it.id, card);
        box.appendChild(card);
      }
    });
    if (st.shop.length === 0 && !box.querySelector('.empty-shop')) box.appendChild(el(`<div class="empty-shop">Всё раскупили! 🍺</div>`));
    if (st.shop.length > 0) box.querySelector('.empty-shop')?.remove();

    const key = `${me.g}|${me.c}|${me.eq ? SLOTS.map((s) => me.eq![s]?.id ?? '-').join() : ''}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      for (const it of st.shop) this.fillCard(this.cards.get(it.id)!, it, st);
    }

    // Экипировка
    const ek = me.eq ? SLOTS.map((s) => me.eq![s]?.id ?? '-').join() : '';
    if (ek !== this.lastEquipKey && me.stats) {
      this.lastEquipKey = ek;
      const grid = this.el.querySelector('.equip-grid')!;
      grid.innerHTML = SLOTS.map((s) => {
        const it = me.eq?.[s];
        return it
          ? `<div class="eslot r-${it.rarity}" title="${esc(it.name)}">${itemIcon(it.tpl, it.rarity)}</div>`
          : `<div class="eslot empty" title="${SLOT_NAMES[s]}">${itemIcon(EMPTY_ICON[s] === 'weapon' ? DEFAULT_WEAPON[me.c] : EMPTY_ICON[s], 'common')}</div>`;
      }).join('');
      this.el.querySelector('.stats')!.innerHTML = MAIN_STATS.map((k) => `<div><span>${STAT_LABELS[k]}</span><b>${formatStat(k, me.stats![k], false)}</b></div>`).join('');
    }

    // Отряд
    const players = st.order.map((id) => st.players.get(id)!).filter(Boolean);
    const pk = players.map((p) => `${p.id}${p.g}${p.rdy}${p.con}`).join();
    if (pk !== this.lastPartyKey) {
      this.lastPartyKey = pk;
      this.el.querySelector('.party')!.innerHTML = players
        .map(
          (p) => `<div class="pl ${p.id === me.id ? 'me' : ''}"><div class="pi" style="background:${CLASS_BG[p.c]}">${classIcon(p.c)}</div>
            <span class="pn">${esc(p.n)}</span>
            <span class="pg">${p.g}💰</span>
            <span class="tag ${p.rdy ? 'ready' : 'wait'}">${p.rdy ? '✔' : '…'}</span></div>`,
        )
        .join('');
    }
    const rb = this.el.querySelector<HTMLButtonElement>('#tready')!;
    rb.textContent = me.rdy ? '✖ Ещё покупаю' : '✔ Готов к бою';
    rb.className = `btn ${me.rdy ? 'ghost' : 'green'}`;
    rb.onclick = () => {
      sfx.click();
      this.onReady(!me.rdy);
    };
  }

  private makeCard(it: Item): HTMLElement {
    const card = el(`<div class="item r-${it.rarity}"></div>`);
    card.addEventListener('click', () => {
      if (card.classList.contains('cant') || card.classList.contains('wrong')) {
        sfx.hurt();
        card.animate([{ transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'none' }], { duration: 200 });
        return;
      }
      this.onBuy(it.id);
    });
    return card;
  }

  private fillCard(card: HTMLElement, it: Item, st: ClientState) {
    const me = st.me!;
    const cur = me.eq?.[it.slot] ?? null;
    const wrong = !!it.cls && it.cls !== me.c;
    const refund = cur ? sellValue(cur) : 0;
    const cant = me.g + refund < it.price;
    card.classList.toggle('wrong', wrong);
    card.classList.toggle('cant', !wrong && cant);
    const keys = new Set<StatKey>([...(Object.keys(it.stats) as StatKey[]), ...(cur ? (Object.keys(cur.stats) as StatKey[]) : [])]);
    const lines = [...keys]
      .map((k) => {
        const v = (it.stats[k] ?? 0) - (cur?.stats[k] ?? 0);
        if (Math.abs(v) < 0.001) return '';
        const has = it.stats[k] ?? 0;
        return `<div class="${v < 0 ? 'worse' : ''}">${STAT_LABELS[k]} ${formatStat(k, has)}${cur ? ` <small>(${v > 0 ? '▲' : '▼'})</small>` : ''}</div>`;
      })
      .join('');
    card.innerHTML = `
      <div class="rar">${RARITY[it.rarity].name}</div>
      <div class="slot-tag">${SLOT_NAMES[it.slot]}</div>
      <div class="ii">${itemIcon(it.tpl, it.rarity)}</div>
      <div class="in">${esc(it.name)}</div>
      <div class="st">${lines}</div>
      ${wrong ? `<div class="who">Только: ${CLASSES[it.cls!].name}</div>` : cur ? `<div class="who" style="color:#5a4a3a">Старое продастся за ${refund}</div>` : ''}
      <div class="price"><span class="coin">${COIN}</span>${it.price}</div>`;
  }
}
