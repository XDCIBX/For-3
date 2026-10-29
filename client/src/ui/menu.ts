import { CLASSES, HERO_CLASSES, MAX_PLAYERS, type HeroClass } from '@game/shared';
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
        <div class="logo stroke">25 WAVES<small>25 волн до логова дракона</small></div>
        <div class="panel" style="padding:12px;display:flex;flex-direction:column;gap:9px">
          <div class="label">Имя героя</div>
          <input class="field" id="name" maxlength="14" placeholder="Введите имя" value="${esc(settings.name)}" />
          <button class="btn gold" id="create">⚔ Создать комнату</button>
          <div class="row">
            <input class="field grow" id="code" maxlength="4" placeholder="КОД" style="text-transform:uppercase;letter-spacing:4px;text-align:center" />
            <button class="btn" id="join">Войти</button>
          </div>
          <button class="btn green" id="solo">🛡 Играть с ботами</button>
          <div class="err" id="err">${esc(error)}</div>
        </div>
      </div>
      <div class="corner-btns">
        <button class="btn ghost small" id="help">❓ Как играть</button>
        <button class="btn ghost small" id="settings">⚙ Настройки</button>
      </div>
      <div class="version">v1.1 · 25 waves</div>
    </div>`);
  const name = root.querySelector<HTMLInputElement>('#name')!;
  const code = root.querySelector<HTMLInputElement>('#code')!;
  const err = root.querySelector<HTMLElement>('#err')!;
  const saveName = () => {
    settings.name = name.value.trim().slice(0, 14) || 'Герой';
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
      err.textContent = 'Введите код комнаты из 4 символов';
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
      '<div style="font-size:13px;color:var(--muted);line-height:1.35">Веб-демо: вы играете с двумя ботами. Игра на троих по сети — в приложении для iOS/Android или через свой сервер.</div>',
    );
  }
  return root;
}

export function settingsModal(settings: Settings, save: () => void, extra?: { label: string; cls: string; onClick: () => void }[]): HTMLElement {
  const m = el(`
    <div class="screen modal">
      <div class="panel">
        <h2>Настройки</h2>
        <div class="label">Адрес сервера</div>
        <input class="field" id="srv" value="${esc(settings.server)}" placeholder="ws://192.168.0.10:2567" />
        <label class="toggle">Звуки <input type="checkbox" id="snd" ${settings.sound ? 'checked' : ''}></label>
        <label class="toggle">Музыка <input type="checkbox" id="mus" ${settings.music ? 'checked' : ''}></label>
        <label class="toggle">Высокое качество графики <input type="checkbox" id="q" ${settings.quality === 'high' ? 'checked' : ''}></label>
        <label class="toggle">Вибрация <input type="checkbox" id="vib" ${settings.haptics ? 'checked' : ''}></label>
        <div id="extra" style="display:flex;flex-direction:column;gap:8px"></div>
        <button class="btn gold" id="ok">Готово</button>
      </div>
    </div>`);
  const extraBox = m.querySelector('#extra')!;
  for (const x of extra ?? []) {
    const b = el(`<button class="btn ${x.cls}">${esc(x.label)}</button>`);
    b.addEventListener('click', () => {
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
    settings.quality = q('#q').checked ? 'high' : 'low';
    settings.haptics = q('#vib').checked;
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
        <h2>Как играть</h2>
        <div style="font-size:14px;line-height:1.45">
          <p>🧙 <b>Трое героев</b> проходят <b>25 волн</b> чудовищ. Волны 1–20 — на острове, с 21-й — в <b>логове дракона</b>, где нападают дракончики, огнеплюи и огненные сгустки. На 25-й волне — финальный босс: <b>красный дракон</b>.</p>
          <p>💰 Золото с убитого моба получает <b>тот, кто нанёс последний удар</b>. Ещё немного золота даётся всем за пройденную волну.</p>
          <p>🍺 После волны герои попадают в <b>таверну</b>. Товар общий: если кто-то купил вещь — она исчезает у всех. Успейте первыми!</p>
          <p>⚔ Волны <b>5, 10, 15, 20 и 24 — ПвП</b>: дуэли каждого с каждым. Победа приносит золото, поражение — отнимает.</p>
          <p>🐉 Дракон кусает, жжёт дыханием конусом, бьёт хвостом и крыльями вокруг себя и плюётся огненными шарами — уходите из красных отметок и с горящей земли.</p>
          <p>🎮 <b>Управление:</b> левая половина экрана — джойстик. Справа — атака и умения. Коснитесь умения для автоприцела или потяните, чтобы прицелиться вручную. Перетащите на ✕ для отмены.</p>
          <p>⌨ На компьютере: WASD — движение, пробел/клик — атака, 1/2/3 — умения (в сторону курсора).</p>
        </div>
        <button class="btn gold" id="ok">Понятно!</button>
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
              <div class="label">${local ? 'Одиночная игра' : 'Код комнаты'}</div>
              <div class="code">${local ? 'СОЛО' : '----'}</div>
            </div>
            ${local ? '' : '<button class="btn small ghost" id="share">📋 Копировать</button>'}
            <span class="fs-slot"></span>
          </div>
          <div class="slots"></div>
          <div class="lobby-actions">
            <button class="btn ghost" id="leave">← Выйти</button>
          </div>
        </div>
        <div class="lobby-mid"></div>
        <div class="lobby-right">
          <div class="classes"></div>
          <div class="panel cls-info"></div>
          <div class="lobby-actions">
            <button class="btn green" id="ready">✔ Готов</button>
            <button class="btn gold" id="start">▶ Начать</button>
          </div>
        </div>
      </div>`);
    const fs = fullscreenButton('btn small ghost', true);
    if (fs) this.el.querySelector('.fs-slot')!.replaceWith(fs);
    this.el.querySelector('#leave')!.addEventListener('click', () => {
      sfx.click();
      act.leave();
    });
    this.el.querySelector('#start')!.addEventListener('click', () => {
      sfx.click();
      act.start();
    });
    this.el.querySelector('#share')?.addEventListener('click', () => {
      const code = this.el.querySelector('.code')!.textContent ?? '';
      void navigator.clipboard?.writeText(code).catch(() => {});
      sfx.click();
      (this.el.querySelector('#share') as HTMLElement).textContent = '✔ Скопировано';
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
    const code = this.el.querySelector('.code')!;
    if (code.textContent !== 'СОЛО') code.textContent = st.code;

    const slots = this.el.querySelector('.slots')!;
    slots.innerHTML = '';
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const p = players[i];
      if (!p) {
        // Хозяин добавляет бота прямо в пустое место — кнопка не съезжает
        if (me.host) {
          const b = el(`<button class="slot empty add-bot">🤖 Добавить бота</button>`);
          b.addEventListener('click', () => {
            sfx.click();
            this.act.addBot();
          });
          slots.appendChild(b);
        } else slots.appendChild(el(`<div class="slot empty">Ожидание героя…</div>`));
        continue;
      }
      if (me.host && p.bot && this.pickFor === p.id) {
        // Выбор класса бота: ряд свободных классов на месте строки
        const taken = new Set(players.filter((q) => q.id !== p.id).map((q) => q.c));
        const row = el(`<div class="slot bot-pick"><span class="bp-lbl">Класс:</span></div>`);
        for (const c of HERO_CLASSES) {
          const b = el<HTMLButtonElement>(`<button class="bp ${c === p.c ? 'sel' : ''}" style="background:${CLASS_BG[c]}" title="${CLASSES[c].name}" ${taken.has(c) ? 'disabled' : ''}>${classIcon(c)}</button>`);
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
          <div class="avatar ${me.host && p.bot ? 'pickable' : ''}" style="background:${CLASS_BG[p.c]}" ${me.host && p.bot ? 'title="Сменить класс бота"' : ''}>${classIcon(p.c)}</div>
          <div style="flex:1;min-width:0">
            <div class="nm">${esc(p.n)} ${p.id === me.id ? '<span style="color:var(--gold)">(вы)</span>' : ''}</div>
            <div class="sub">${CLASSES[p.c].name}${p.host ? ' · хозяин' : ''}${p.bot ? ' · бот' : ''}</div>
          </div>
          <span class="tag ${p.rdy ? 'ready' : 'wait'}">${p.rdy ? 'ГОТОВ' : 'ЖДЁТ'}</span>
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
          <div class="cn stroke">${CLASSES[c].name.split(' ')[0]}</div>
          <div class="owner">${owner ? esc(owner.n) : 'свободен'}</div>
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

    const c = CLASSES[this.viewCls ?? me.c];
    const info = this.el.querySelector('.cls-info')!;
    const diff = '★'.repeat(c.difficulty) + '☆'.repeat(3 - c.difficulty);
    info.innerHTML = `
      <h3 class="stroke" style="color:${c.color}">${c.name} <span style="font-size:13px;color:var(--muted)">— ${c.title}</span></h3>
      <div class="desc">${c.desc} <span style="color:var(--gold)">Сложность: ${diff}</span></div>
      <div class="skill-list">
        ${c.skills
          .map(
            (s, i) => `<div class="skill-row"><div class="si">${skillIcon(s.id)}</div><div><b>${i === 0 ? '⚔ ' : ''}${s.name}</b><span class="d">${s.desc}</span></div></div>`,
          )
          .join('')}
      </div>
      <div class="passive">✨ <b>${c.passive.name}:</b> ${c.passive.desc}
        <div style="margin-top:4px;color:var(--muted)">❤ ${c.base.maxHp} · ⚔ ${c.base.damage} · 🛡 ${c.base.armor} · 👟 ${c.base.speed}</div>
      </div>`;

    const readyBtn = this.el.querySelector<HTMLButtonElement>('#ready')!;
    readyBtn.textContent = me.rdy ? '✖ Не готов' : '✔ Готов';
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
