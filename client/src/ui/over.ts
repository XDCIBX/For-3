import type { ClientState } from '../net/state';
import { CLASS_BG, el, esc } from './dom';
import { classIcon } from './icons';
import { className, playerName, t } from '../i18n';

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
        <div class="over-title" style="color:${win ? 'var(--gold)' : '#ff8a7a'}">${win ? t('over.win') : t('over.lose')}</div>
        <div style="font-weight:700;color:var(--muted)">${win ? t('over.winText') : t('over.loseText', { n: st.result?.round ?? st.round })}</div>
        <table class="score">
          <tr><th></th><th style="text-align:left">${t('over.hero')}</th><th>${t('over.kills')}</th><th>${t('over.damage')}</th><th>${t('over.pvp')}</th><th>${t('over.gold')}</th></tr>
          ${players
            .map(
              (p, i) => `<tr>
              <td>${i === 0 ? '👑' : ''}</td>
              <td style="text-align:left"><div class="row"><div class="pi" style="width:28px;height:28px;border-radius:8px;border:2px solid var(--ink);padding:2px;background:${CLASS_BG[p.c]}">${classIcon(p.c)}</div>${esc(playerName(p.n))} <span style="color:var(--muted);font-size:12px">${className(p.c)}</span></div></td>
              <td class="${p.k === bestKills && p.k > 0 ? 'crown' : ''}">${p.k}</td>
              <td class="${p.dmg === bestDmg && p.dmg > 0 ? 'crown' : ''}">${p.dmg}</td>
              <td class="${p.pw === bestPvp && p.pw > 0 ? 'crown' : ''}">${p.pw}–${p.pl}</td>
              <td style="color:#ffe07a">${p.g}</td></tr>`,
            )
            .join('')}
        </table>
        <button class="btn gold" id="menu">${t('over.menu')}</button>
      </div>
    </div>`);
  root.querySelector('#menu')!.addEventListener('click', onMenu);
  return root;
}
