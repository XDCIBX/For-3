import { CLASSES, HERO_CLASSES, MAX_PLAYERS, type HeroClass } from '@game/shared';
import { LANGS, classDesc, className, classShort, classTitle, passiveDesc, passiveName, playerName, skillDesc, skillName, t, type Lang } from '../i18n';
import type { ClientState } from '../net/state';
import { sfx } from '../audio/sfx';
import { CLASS_BG, el, esc } from './dom';
import { classIcon, skillIcon } from './icons';
import type { Settings } from '../settings';
import { autoFullscreen, fullscreenButton } from './fullscreen';

export interface MenuActions {
  create(): void;
  join(code: string): void;
  solo(): void;
  saveSettings(): void;
}

/** Главное меню. */
export function menuScreen(settings: Settings, act: MenuActions, error = ''): HTMLElement {
  const root = el(`
    <div class="screen menu">
      <div class="menu-box">
        <div class="logo stroke">25 WAVES<small>${t('menu.tagline')}</small></div>
        <div class="panel" style="padding:12px;display:flex;flex-direction:column;gap:9px">
          <div class="label">${t('menu.heroName')}</div>
          <input class="field" id="name" maxlength="14" placeholder="${t('menu.namePh')}" value="${esc(settings.name)}" />
          <button class="btn gold" id="create">${t('menu.create')}</button>
          <div class="row">
            <input class="field grow" id="code" maxlength="4" placeholder="${t('menu.codePh')}" style="text-transform:uppercase;letter-spacing:4px;text-align:center" />
            <button class="btn" id="join">${t('menu.join')}</button>
          </div>
          <button class="btn green" id="solo">${t('menu.solo')}</button>
          <div class="err" id="err">${esc(error)}</div>
        </div>
      </div>
      <div class="corner-btns">
        <button class="btn ghost small" id="help">${t('menu.help')}</button>
        <button class="btn ghost small" id="settings">${t('menu.settings')}</button>
      </div>
      <div class="version">v1.1 · 25 waves</div>
    </div>`);
  const name = root.querySelector<HTMLInputElement>('#name')!;
  const code = root.querySelector<HTMLInputElement>('#code')!;
  const err = root.querySelector<HTMLElement>('#err')!;
  const saveName = () => {
    settings.name = name.value.trim().slice(0, 14) || t('defaultName');
    act.saveSettings();
  };
  name.addEventListener('change', saveName);
  root.querySelector('#create')!.addEventListener('click', () => {
    sfx.unlock();
    sfx.click();
    saveName();
    autoFullscreen();
    act.create();
  });
  root.querySelector('#join')!.addEventListener('click', () => {
    sfx.unlock();
    sfx.click();
    saveName();
    const c = code.value.trim().toUpperCase();
    if (c.length !== 4) {
      err.textContent = t('menu.codeErr');
      return;
    }
    autoFullscreen();
    act.join(c);
  });
  code.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') (root.querySelector('#join') as HTMLElement).click();
  });
  root.querySelector('#solo')!.addEventListener('click', () => {
    sfx.unlock();
    sfx.click();
    saveName();
    autoFullscreen();
    act.solo();
  });
  root.querySelector('#settings')!.addEventListener('click', () => {
    sfx.unlock();
    sfx.click();
    root.appendChild(settingsModal(settings, act.saveSettings));
  });
  root.querySelector('#help')!.addEventListener('click', () => {
    sfx.unlock();
    sfx.click();
    root.appendChild(helpModal());
  });
  const fs = fullscreenButton('btn ghost small', false, (t) => (err.textContent = t));
  if (fs) root.querySelector('.corner-btns')!.prepend(fs);
  if (import.meta.env.VITE_DEMO) {
    // Веб-демо: только одиночная игра с ботами (сетевой режим — в приложении или через свой сервер)
    (root.querySelector('#create') as HTMLElement).style.display = 'none';
    (code.parentElement as HTMLElement).style.display = 'none';
    err.insertAdjacentHTML(
      'beforebegin',
      `<div style="font-size:13px;color:var(--muted);line-height:1.35">${t('menu.demoNote')}</div>`,
    );
  }
  return root;
}

export function settingsModal(settings: Settings, save: () => void, extra?: { label: string; cls: string; onClick: () => void; confirm?: string }[]): HTMLElement {
  const m = el(`
    <div class="screen modal">
      <div class="panel">
        <h2>${t('set.title')}</h2>
        <label class="toggle">${t('set.lang')} <select class="field lang-sel" id="lang">${LANGS.map((l) => `<option value="${l.id}" ${l.id === settings.lang ? 'selected' : ''}>${l.name}</option>`).join('')}</select></label>
        <div class="label">${t('set.server')}</div>
        <input class="field" id="srv" value="${esc(settings.server)}" placeholder="ws://192.168.0.10:2567" />
        <label class="toggle">${t('set.sound')} <input type="checkbox" id="snd" ${settings.sound ? 'checked' : ''}></label>
        <label class="toggle">${t('set.music')} <input type="checkbox" id="mus" ${settings.music ? 'checked' : ''}></label>
        <label class="toggle">${t('set.quality')} <select class="field lang-sel" id="q">${(['low', 'high', 'ultra'] as const).map((v) => `<option value="${v}" ${settings.quality === v ? 'selected' : ''}>${t(v === 'low' ? 'set.qLow' : v === 'high' ? 'set.qHigh' : 'set.qUltra')}</option>`).join('')}</select></label>
        <label class="toggle">${t('set.vibration')} <input type="checkbox" id="vib" ${settings.haptics ? 'checked' : ''}></label>
        <div id="extra" style="display:flex;flex-direction:column;gap:8px"></div>
        <button class="btn gold" id="ok">${t('set.done')}</button>
      </div>
    </div>`);
  const extraBox = m.querySelector('#extra')!;
  for (const x of extra ?? []) {
    const b = el(`<button class="btn ${x.cls}">${esc(x.label)}</button>`);
    // Опасное действие (выход из идущей игры) — только со второго нажатия
    let armed = 0;
    b.addEventListener('click', () => {
      if (x.confirm && performance.now() - armed > 3000) {
        armed = performance.now();
        b.textContent = x.confirm;
        setTimeout(() => {
          if (b.isConnected) b.textContent = x.label;
        }, 3000);
        return;
      }
      m.remove();
      x.onClick();
    });
    extraBox.appendChild(b);
  }
  const q = (id: string) => m.querySelector<HTMLInputElement>(id)!;
  m.querySelector('#ok')!.addEventListener('click', () => {
    settings.server = q('#srv').value.trim();
    settings.sound = q('#snd').checked;
    settings.music = q('#mus').checked;
    settings.quality = (m.querySelector<HTMLSelectElement>('#q')!.value as Settings['quality']) ?? 'high';
    settings.haptics = q('#vib').checked;
    settings.lang = (m.querySelector<HTMLSelectElement>('#lang')!.value as Lang) ?? settings.lang;
    save();
    sfx.click();
    m.remove();
  });
  return m;
}

function helpModal(): HTMLElement {
  const m = el(`
    <div class="screen modal">
      <div class="panel" style="width:min(560px,94vw);max-height:100%;overflow-y:auto">
        <h2>${t('help.title')}</h2>
        <div style="font-size:14px;line-height:1.45">
          ${(['help.p1', 'help.p2', 'help.p3', 'help.p4', 'help.p5', 'help.p6', 'help.p7', 'help.p8'] as const).map((k) => `<p>${t(k)}</p>`).join('')}
        </div>
        <button class="btn gold" id="ok">${t('help.ok')}</button>
      </div>
    </div>`);
  m.querySelector('#ok')!.addEventListener('click', () => m.remove());
  return m;
}

export interface LobbyActions {
  pick(cls: HeroClass): void;
  ready(v: boolean): void;
  start(): void;
  addBot(): void;
  kick(id: string): void;
  botCls(id: string, cls: HeroClass): void;
  leave(): void;
  /** Пригласить друзей через оверлей Steam (только десктопная сборка в Steam). */
  invite?: () => void;
}

/** Лобби комнаты: игроки, выбор класса, готовность. */
export class LobbyScreen {
  readonly el: HTMLElement;
  private act: LobbyActions;
  private viewCls: HeroClass | null = null;
  /** Бот, для которого сейчас открыт выбор класса. */
  private pickFor: string | null = null;
  private lastKey = '';

  constructor(act: LobbyActions, local: boolean) {
    this.act = act;
    this.el = el(`
      <div class="screen lobby">
        <div class="lobby-left">
          <div class="panel code-box">
            <div style="flex:1">
              <div class="label">${local ? t('lobby.solo') : t('lobby.code')}</div>
              <div class="code" ${local ? 'data-local="1"' : ''}>${local ? t('lobby.soloCode') : '----'}</div>
            </div>
            ${local ? '' : `<button class="btn small ghost" id="share">${t('lobby.copy')}</button>`}
            <span class="fs-slot"></span>
          </div>
          <div class="slots"></div>
          <div class="lobby-actions">
            <button class="btn ghost" id="leave">${t('lobby.leave')}</button>
            ${!local && act.invite ? `<button class="btn" id="steamInvite">${t('lobby.steamInvite')}</button>` : ''}
          </div>
        </div>
        <div class="lobby-mid"></div>
        <div class="lobby-right">
          <div class="classes"></div>
          <div class="panel cls-info"></div>
          <div class="lobby-actions">
            <button class="btn green" id="ready">${t('lobby.ready')}</button>
            <button class="btn gold" id="start">${t('lobby.start')}</button>
          </div>
        </div>
      </div>`);
    const fs = fullscreenButton('btn small ghost', true);
    if (fs) this.el.querySelector('.fs-slot')!.replaceWith(fs);
    this.el.querySelector('#leave')!.addEventListener('click', () => {
      sfx.click();
      act.leave();
    });
    this.el.querySelector('#steamInvite')?.addEventListener('click', () => {
      sfx.click();
      act.invite?.();
    });
    this.el.querySelector('#start')!.addEventListener('click', () => {
      sfx.click();
      act.start();
    });
    this.el.querySelector('#share')?.addEventListener('click', () => {
      const code = this.el.querySelector('.code')!.textContent ?? '';
      void navigator.clipboard?.writeText(code).catch(() => {});
      sfx.click();
      (this.el.querySelector('#share') as HTMLElement).textContent = t('lobby.copied');
    });
  }

  update(st: ClientState) {
    const me = st.me;
    if (!me) return;
    const players = st.order.map((id) => st.players.get(id)!).filter(Boolean);
    if (this.pickFor && !players.some((p) => p.id === this.pickFor && p.bot)) this.pickFor = null;
    const key = JSON.stringify([st.code, players.map((p) => [p.id, p.n, p.c, p.rdy, p.host, p.bot]), this.viewCls, this.pickFor, me.host]);
    if (key === this.lastKey) return;
    this.lastKey = key;
    const code = this.el.querySelector<HTMLElement>('.code')!;
    if (!code.dataset.local) code.textContent = st.code;

    const slots = this.el.querySelector('.slots')!;
    slots.innerHTML = '';
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const p = players[i];
      if (!p) {
        // Хозяин добавляет бота прямо в пустое место — кнопка не съезжает
        if (me.host) {
          const b = el(`<button class="slot empty add-bot">${t('lobby.addBot')}</button>`);
          b.addEventListener('click', () => {
            sfx.click();
            this.act.addBot();
          });
          slots.appendChild(b);
        } else slots.appendChild(el(`<div class="slot empty">${t('lobby.waiting')}</div>`));
        continue;
      }
      if (me.host && p.bot && this.pickFor === p.id) {
        // Выбор класса бота: ряд свободных классов на месте строки
        const taken = new Set(players.filter((q) => q.id !== p.id).map((q) => q.c));
        const row = el(`<div class="slot bot-pick"><span class="bp-lbl">${t('lobby.class')}</span></div>`);
        for (const c of HERO_CLASSES) {
          const b = el<HTMLButtonElement>(`<button class="bp ${c === p.c ? 'sel' : ''}" style="background:${CLASS_BG[c]}" title="${className(c)}" ${taken.has(c) ? 'disabled' : ''}>${classIcon(c)}</button>`);
          b.addEventListener('click', () => {
            sfx.click();
            this.pickFor = null;
            if (c !== p.c) this.act.botCls(p.id, c);
            this.lastKey = '';
            this.update(st);
          });
          row.appendChild(b);
        }
        slots.appendChild(row);
        continue;
      }
      const s = el(`
        <div class="slot">
          <div class="avatar ${me.host && p.bot ? 'pickable' : ''}" style="background:${CLASS_BG[p.c]}" ${me.host && p.bot ? `title="${t('lobby.changeBot')}"` : ''}>${classIcon(p.c)}</div>
          <div style="flex:1;min-width:0">
            <div class="nm">${esc(playerName(p.n))} ${p.id === me.id ? `<span style="color:var(--gold)">${t('lobby.you')}</span>` : ''}</div>
            <div class="sub">${className(p.c)}${p.host ? ` · ${t('lobby.host')}` : ''}${p.bot ? ` · ${t('lobby.bot')}` : ''}</div>
          </div>
          <span class="tag ${p.rdy ? 'ready' : 'wait'}">${p.rdy ? t('lobby.tagReady') : t('lobby.tagWait')}</span>
          ${me.host && p.bot ? `<button class="btn red small" data-kick="${p.id}">✕</button>` : ''}
        </div>`);
      s.querySelector('[data-kick]')?.addEventListener('click', () => this.act.kick(p.id));
      if (me.host && p.bot) {
        s.querySelector('.avatar')!.addEventListener('click', () => {
          sfx.click();
          this.pickFor = p.id;
          this.lastKey = '';
          this.update(st);
        });
      }
      slots.appendChild(s);
    }

    const classes = this.el.querySelector('.classes')!;
    classes.innerHTML = '';
    for (const c of HERO_CLASSES) {
      const owner = players.find((p) => p.c === c);
      const taken = owner && owner.id !== me.id;
      const card = el(`
        <div class="cls-card ${me.c === c ? 'sel' : ''} ${taken ? 'taken' : ''}" style="--cc:${CLASSES[c].color}">
          <div class="ci">${classIcon(c)}</div>
          <div class="cn stroke">${classShort(c)}</div>
          <div class="owner">${owner ? esc(playerName(owner.n)) : t('lobby.free')}</div>
        </div>`);
      card.addEventListener('click', () => {
        sfx.click();
        this.viewCls = c;
        if (!taken) this.act.pick(c);
        this.lastKey = '';
        this.update(st);
      });
      classes.appendChild(card);
    }

    const ci = this.viewCls ?? me.c;
    const c = CLASSES[ci];
    const info = this.el.querySelector('.cls-info')!;
    const diff = '★'.repeat(c.difficulty) + '☆'.repeat(3 - c.difficulty);
    info.innerHTML = `
      <h3 class="stroke" style="color:${c.color}">${className(ci)} <span style="font-size:13px;color:var(--muted)">— ${classTitle(ci)}</span></h3>
      <div class="desc">${classDesc(ci)} <span style="color:var(--gold)">${t('lobby.difficulty')}: ${diff}</span></div>
      <div class="skill-list">
        ${c.skills
          .map(
            (s, i) => `<div class="skill-row"><div class="si">${skillIcon(s.id)}</div><div><b>${i === 0 ? '⚔ ' : ''}${skillName(s.id)}</b><span class="d">${skillDesc(s.id)}</span></div></div>`,
          )
          .join('')}
      </div>
      <div class="passive">✨ <b>${passiveName(ci)}:</b> ${passiveDesc(ci)}
        <div style="margin-top:4px;color:var(--muted)">❤ ${c.base.maxHp} · ⚔ ${c.base.damage} · 🛡 ${c.base.armor} · 👟 ${c.base.speed}</div>
      </div>`;

    const readyBtn = this.el.querySelector<HTMLButtonElement>('#ready')!;
    readyBtn.textContent = me.rdy ? t('lobby.notReady') : t('lobby.ready');
    readyBtn.className = `btn ${me.rdy ? 'ghost' : 'green'}`;
    readyBtn.onclick = () => {
      sfx.click();
      this.act.ready(!me.rdy);
    };
    const startBtn = this.el.querySelector<HTMLButtonElement>('#start')!;
    startBtn.style.display = me.host ? '' : 'none';
    startBtn.disabled = !players.every((p) => p.rdy);
  }
}
