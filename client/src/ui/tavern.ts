import { CLASSES, RARITY, SLOTS, SLOT_NAMES, STAT_LABELS, computeStats, formatStat, sellValue, type Item, type StatKey, type Stats } from '@game/shared';
import type { ClientState } from '../net/state';
import { sfx } from '../audio/sfx';
import { CLASS_BG, el, esc, onTap } from './dom';
import { COIN, MUG, classIcon, itemIcon } from './icons';

const EMPTY_ICON: Record<string, string> = { weapon: 'weapon', helmet: 'helm', armor: 'plate', boots: 'boots', amulet: 'amulet', ring: 'ring' };
const DEFAULT_WEAPON: Record<string, string> = { warrior: 'sword', mage: 'staff', archer: 'bow', hunter: 'glaives', summoner: 'totemstaff', werewolf: 'claws', dwarf: 'blunderbuss' };

const MAIN_STATS: StatKey[] = ['maxHp', 'damage', 'skillPower', 'armor', 'speed', 'attackSpeed', 'crit', 'cdr', 'regen', 'lifesteal'];

/** Таверна: общий магазин, экипировка и готовность. */
export class TavernUi {
  readonly el: HTMLElement;
  private cards = new Map<string, HTMLElement>();
  private onBuy: (id: string) => void;
  private onReady: (v: boolean) => void;
  private lastKey = '';
  private lastEquipKey = '';
  private lastPartyKey = '';
  private lastStatsKey = '';
  /** Статы до последней покупки и когда она была — чтобы пару секунд подсвечивать, что изменилось. */
  private prevStats: Stats | null = null;
  private gain: { from: Stats; t: number } | null = null;
  /** Предмет под курсором: показываем, как изменятся статы. */
  private preview: Item | null = null;
  private st: ClientState | null = null;

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
              <div class="label">Мой герой</div>
              <div class="gold-box" style="font-size:18px"><span class="coin">${COIN}</span><b>0</b></div>
            </div>
            <div class="equip-grid"></div>
            <div class="stats"></div>
          </div>
          <button class="btn green" id="tready">✔ Готов к бою</button>
        </div>
      </div>`);
    onTap(this.el.querySelector<HTMLElement>('#tready')!, () => {
      const me = this.st?.me;
      if (!me) return;
      sfx.click();
      this.onReady(!me.rdy);
    });
  }

  /** Меняем DOM только при реальных изменениях — лишние мутации ломают касания на iOS. */
  private setText(sel: string, text: string) {
    const n = this.el.querySelector<HTMLElement>(sel)!;
    if (n.textContent !== text) n.textContent = text;
    return n;
  }

  update(st: ClientState) {
    const me = st.me;
    if (!me) return;
    this.st = st;
    const t = Math.ceil(st.timer);
    const timer = this.setText('.timer', `⏳ ${t}`);
    if (timer.classList.contains('low') !== t <= 10) timer.classList.toggle('low', t <= 10);
    this.setText('.equip .gold-box b', String(me.g));

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
    }
    if (this.gain && performance.now() - this.gain.t > 2400) {
      // Подсветка покупки погасла — перерисовываем без неё
      this.gain = null;
      this.lastStatsKey = '';
    }
    if (me.stats) {
      const sk = MAIN_STATS.map((k) => me.stats![k].toFixed(3)).join() + `|${this.preview?.id ?? ''}|${ek}`;
      if (sk !== this.lastStatsKey) {
        this.lastStatsKey = sk;
        this.renderStats(me.stats);
      }
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
    const rb = this.setText('#tready', me.rdy ? '✖ Ещё покупаю' : '✔ Готов к бою');
    const rc = `btn ${me.rdy ? 'ghost' : 'green'}`;
    if (rb.className !== rc) rb.className = rc;
  }

  /** Характеристики героя: после покупки выросшие значения подсвечиваются, при наведении на товар — прогноз. */
  private renderStats(cur: Stats) {
    const me = this.st?.me;
    const box = this.el.querySelector('.stats')!;
    if (this.prevStats && MAIN_STATS.some((k) => Math.abs(this.prevStats![k] - cur[k]) > 1e-6)) this.gain = { from: this.prevStats, t: performance.now() };
    this.prevStats = { ...cur };
    const changed = this.gain && performance.now() - this.gain.t < 2400 ? this.gain.from : null;
    const it = this.preview;
    const pv = it && me?.eq && (!it.cls || it.cls === me.c) ? computeStats(me.c, { ...me.eq, [it.slot]: it }) : null;
    box.innerHTML = MAIN_STATS.map((k) => {
      let cls = '';
      let extra = '';
      if (pv && Math.abs(pv[k] - cur[k]) > 1e-6) {
        const up = pv[k] > cur[k];
        cls = up ? 'pv-up' : 'pv-down';
        extra = `<i>→ ${formatStat(k, pv[k], false)}</i>`;
      } else if (changed && Math.abs(changed[k] - cur[k]) > 1e-6) {
        // Анимацию запускаем один раз, при повторной отрисовке просто держим цвет
        if (performance.now() - this.gain!.t > 100) cls = 'kept';
        const d = cur[k] - changed[k];
        cls += d > 0 ? ' got-up' : ' got-down';
        extra = `<i>(${formatStat(k, d)})</i>`;
      }
      return `<div class="${cls}"><span>${STAT_LABELS[k]}</span><b>${formatStat(k, cur[k], false)}${extra}</b></div>`;
    }).join('');
  }

  private setPreview(it: Item | null) {
    this.preview = it;
    const me = this.st?.me;
    if (me?.stats) {
      this.lastStatsKey = '';
      this.renderStats(me.stats);
    }
  }

  private makeCard(it: Item): HTMLElement {
    const card = el(`<div class="item r-${it.rarity}"></div>`);
    card.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'mouse') this.setPreview(it);
    });
    card.addEventListener('pointerleave', () => {
      if (this.preview === it) this.setPreview(null);
    });
    onTap(card, () => {
      if (card.classList.contains('cant') || card.classList.contains('wrong')) {
        sfx.hurt();
        card.animate([{ transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'none' }], { duration: 200 });
        return;
      }
      this.preview = null;
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
