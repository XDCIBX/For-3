export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function el<T extends HTMLElement = HTMLElement>(html: string): T {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as T;
}

export function $(root: ParentNode, sel: string): HTMLElement {
  return root.querySelector(sel) as HTMLElement;
}

export const CLASS_BG: Record<string, string> = {
  warrior: 'linear-gradient(180deg,#ff8a6a,#c8412f)',
  mage: 'linear-gradient(180deg,#b08aff,#6a3ad8)',
  archer: 'linear-gradient(180deg,#7ae07a,#2f9a3f)',
  hunter: 'linear-gradient(180deg,#4a3a5a,#1a1622)',
  summoner: 'linear-gradient(180deg,#6ae0e8,#1f7f8a)',
  werewolf: 'linear-gradient(180deg,#d8945a,#7a4a24)',
  dwarf: 'linear-gradient(180deg,#f0b860,#a8662a)',
};

export const RARITY_CSS: Record<string, string> = {
  common: '#c9d3da',
  rare: '#47a8ff',
  epic: '#be6bff',
  legendary: '#ffb321',
  relic: '#ff3b3b',
};

/**
 * Надёжное нажатие на тач-экранах. iOS иногда не присылает click, если во время касания
 * меняется DOM (таймер, золото), поэтому срабатываем на pointerup; click остаётся для
 * мыши и клавиатуры, а дубль после касания отбрасываем. Сдвиг пальца — это прокрутка.
 */
export function onTap(node: HTMLElement, fn: () => void) {
  let down: { id: number; x: number; y: number } | null = null;
  let tapAt = 0;
  node.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') down = { id: e.pointerId, x: e.clientX, y: e.clientY };
  });
  node.addEventListener('pointerup', (e) => {
    if (!down || down.id !== e.pointerId) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > 14) return;
    tapAt = performance.now();
    fn();
  });
  node.addEventListener('pointercancel', () => (down = null));
  node.addEventListener('click', () => {
    if (performance.now() - tapAt < 800) return;
    fn();
  });
}
