import { CLASSES } from '@game/shared';
import type { ClientState } from '../net/state';
import { CLASS_BG, el, esc } from './dom';
import { classIcon } from './icons';

/** Итоги игры. */
export function overScreen(st: ClientState, onMenu: () => void): HTMLElement {
  const win = st.result?.win ?? false;
  const players = [...st.players.values()].sort((a, b) => b.g + b.dmg / 10 - (a.g + a.dmg / 10));
  const best = (f: (p: (typeof players)[number]) => number) => Math.max(...players.map(f));
  const bestKills = best((p) => p.k);
  const bestDmg = best((p) => p.dmg);
  const bestPvp = best((p) => p.pw);
  const root = el(`
    <div class="screen over">
      <div class="panel over-box">
        <div class="over-title" style="color:${win ? 'var(--gold)' : '#ff8a7a'}">${win ? '🏆 ПОБЕДА!' : '💀 ПОРАЖЕНИЕ'}</div>
        <div style="font-weight:700;color:var(--muted)">${win ? 'Остров спасён! Героев воспоют барды.' : `Герои продержались до раунда ${st.result?.round ?? st.round}.`}</div>
        <table class="score">
          <tr><th></th><th style="text-align:left">Герой</th><th>Убийства</th><th>Урон</th><th>ПвП</th><th>Золото</th></tr>
          ${players
            .map(
              (p, i) => `<tr>
              <td>${i === 0 ? '👑' : ''}</td>
              <td style="text-align:left"><div class="row"><div class="pi" style="width:28px;height:28px;border-radius:8px;border:2px solid var(--ink);padding:2px;background:${CLASS_BG[p.c]}">${classIcon(p.c)}</div>${esc(p.n)} <span style="color:var(--muted);font-size:12px">${CLASSES[p.c].name}</span></div></td>
              <td class="${p.k === bestKills ? 'crown' : ''}">${p.k}</td>
              <td class="${p.dmg === bestDmg ? 'crown' : ''}">${p.dmg}</td>
              <td class="${p.pw === bestPvp && p.pw > 0 ? 'crown' : ''}">${p.pw}–${p.pl}</td>
              <td style="color:#ffe07a">${p.g}</td></tr>`,
            )
            .join('')}
        </table>
        <button class="btn gold" id="menu">В главное меню</button>
      </div>
    </div>`);
  root.querySelector('#menu')!.addEventListener('click', onMenu);
  return root;
}
