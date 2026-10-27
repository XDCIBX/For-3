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
};

export const RARITY_CSS: Record<string, string> = {
  common: '#c9d3da',
  rare: '#47a8ff',
  epic: '#be6bff',
  legendary: '#ffb321',
};
