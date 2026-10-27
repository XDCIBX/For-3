import { Capacitor } from '@capacitor/core';

/** Полноэкранный режим браузера (в нативном приложении игра и так на весь экран). */

type FsDoc = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => Promise<void> };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };

const doc = document as FsDoc;

export function fullscreenSupported(): boolean {
  if (Capacitor.isNativePlatform()) return false;
  const el = document.documentElement as FsEl;
  return !!(el.requestFullscreen || el.webkitRequestFullscreen);
}

export function isFullscreen(): boolean {
  return !!(doc.fullscreenElement || doc.webkitFullscreenElement);
}

/** iPhone не умеет открывать страницу на весь экран — только через «На экран Домой». */
function isIPhone(): boolean {
  return /iPhone|iPod/.test(navigator.userAgent);
}

export async function enterFullscreen(): Promise<boolean> {
  const el = document.documentElement as FsEl;
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    else return false;
    // На Android закрепляем горизонтальную ориентацию
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    await o?.lock?.('landscape').catch(() => {});
    return true;
  } catch {
    return false;
  }
}

export async function exitFullscreen() {
  try {
    if (doc.exitFullscreen) await doc.exitFullscreen();
    else await doc.webkitExitFullscreen?.();
  } catch {
    /* уже не в полноэкранном режиме */
  }
}

export async function toggleFullscreen(): Promise<boolean> {
  if (isFullscreen()) {
    await exitFullscreen();
    return true;
  }
  return enterFullscreen();
}

/** На телефонах и планшетах при старте игры сразу разворачиваемся на весь экран. */
export function autoFullscreen() {
  const touch = window.matchMedia('(pointer: coarse)').matches;
  if (touch && fullscreenSupported() && !isFullscreen()) void enterFullscreen();
}

const buttons = new Set<HTMLElement>();

function refresh() {
  const on = isFullscreen();
  for (const b of buttons) {
    b.dataset.on = on ? '1' : '';
    const label = b.querySelector('.fs-label');
    if (label) label.textContent = on ? 'Свернуть' : 'На весь экран';
    b.title = on ? 'Выйти из полноэкранного режима' : 'На весь экран';
  }
}
document.addEventListener('fullscreenchange', refresh);
document.addEventListener('webkitfullscreenchange', refresh);

const ICON_ON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>`;
const ICON_OFF = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>`;

/**
 * Кнопка «На весь экран». compact — только значок (для HUD).
 * На iPhone вместо неё подсказка, как добавить игру на экран «Домой».
 */
export function fullscreenButton(className: string, compact = false, onHint?: (text: string) => void): HTMLElement | null {
  const supported = fullscreenSupported();
  if (!supported && !(isIPhone() && !Capacitor.isNativePlatform())) return null;
  const b = document.createElement('button');
  b.className = `${className} fs-btn`;
  b.type = 'button';
  b.innerHTML = `<span class="fs-on">${ICON_ON}</span><span class="fs-off">${ICON_OFF}</span>${compact ? '' : '<span class="fs-label">На весь экран</span>'}`;
  b.addEventListener('click', async () => {
    if (!supported) {
      onHint?.('На iPhone: «Поделиться» → «На экран „Домой“», и игра откроется на весь экран');
      return;
    }
    const ok = await toggleFullscreen();
    refresh();
    setTimeout(refresh, 300);
    if (!ok) onHint?.('Браузер не разрешил полноэкранный режим');
  });
  // Старые кнопки (с прошлых экранов) больше не обновляем
  for (const x of buttons) if (!x.isConnected) buttons.delete(x);
  buttons.add(b);
  refresh();
  return b;
}
