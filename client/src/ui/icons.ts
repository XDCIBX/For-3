import type { HeroClass, Rarity } from '@game/shared';

const O = 'stroke="#2a1b14" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"';

const METAL: Record<Rarity, [string, string]> = {
  common: ['#e4eaee', '#a8b4bd'],
  rare: ['#bfe6ff', '#4aa8ff'],
  epic: ['#ecd4ff', '#a85cff'],
  legendary: ['#fff1b0', '#ffb321'],
};
const CLOTH: Record<Rarity, string> = { common: '#a07a52', rare: '#3f78d0', epic: '#7b3fc6', legendary: '#d2493a' };

let uid = 0;
function svg(body: string, defs = ''): string {
  return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" class="ico"><defs>${defs}</defs>${body}</svg>`;
}
function grad(id: string, a: string, b: string) {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
}

export function itemIcon(tpl: string, rarity: Rarity): string {
  const g = `g${uid++}`;
  const [m1, m2] = METAL[rarity];
  const defs = grad(g, m1, m2);
  const M = `url(#${g})`;
  const cloth = CLOTH[rarity];
  const wood = '#9a6a3a';
  const gold = '#ffc93c';
  switch (tpl) {
    case 'sword':
      return svg(
        `<g transform="rotate(45 32 32)"><path d="M27 42 V12 L32 4 L37 12 V42 Z" fill="${M}" ${O}/><path d="M32 8 V40" stroke="#fff" stroke-opacity=".6" stroke-width="2"/><rect x="17" y="41" width="30" height="6" rx="3" fill="${gold}" ${O}/><rect x="29" y="47" width="6" height="10" fill="#6a4024" ${O}/><circle cx="32" cy="60" r="3.5" fill="${gold}" ${O}/></g>`,
        defs,
      );
    case 'axe':
      return svg(
        `<g transform="rotate(30 32 32)"><rect x="29" y="6" width="6" height="54" rx="3" fill="${wood}" ${O}/><path d="M33 10 C48 6 56 14 54 30 C48 26 40 26 33 28 Z" fill="${M}" ${O}/><path d="M31 12 C22 12 18 18 18 24 C22 22 27 22 31 24 Z" fill="${M}" ${O}/></g>`,
        defs,
      );
    case 'hammer':
      return svg(`<g transform="rotate(35 32 32)"><rect x="29" y="18" width="6" height="42" rx="3" fill="${wood}" ${O}/><rect x="14" y="6" width="36" height="18" rx="4" fill="${M}" ${O}/><rect x="14" y="12" width="36" height="5" fill="${gold}"/></g>`, defs);
    case 'staff':
      return svg(
        `<rect x="29" y="18" width="6" height="44" rx="3" fill="${wood}" ${O} transform="rotate(20 32 40)"/><circle cx="40" cy="14" r="10" fill="${M}" ${O}/><circle cx="37" cy="11" r="3" fill="#fff" opacity=".8"/><path d="M30 20 L33 14 M50 20 L46 14" ${O} fill="none"/>`,
        defs,
      );
    case 'wand':
      return svg(
        `<rect x="29" y="22" width="5" height="36" rx="2.5" fill="#efe2c2" ${O} transform="rotate(35 32 40)"/><path d="M42 6 L45 14 L54 15 L47 20 L49 29 L42 24 L35 29 L37 20 L30 15 L39 14 Z" fill="${M}" ${O}/>`,
        defs,
      );
    case 'orb':
      return svg(
        `<path d="M20 56 H44 L40 48 H24 Z" fill="${wood}" ${O}/><circle cx="32" cy="28" r="19" fill="${M}" ${O}/><path d="M22 30 C26 18 40 18 42 28 C40 36 30 36 32 28" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="3"/><circle cx="25" cy="20" r="4" fill="#fff" opacity=".85"/>`,
        defs,
      );
    case 'glaives':
      return svg(
        `<g transform="rotate(-20 32 32)"><path d="M30 44 V12 L36 4 L37 14 V44 Z" fill="${M}" ${O}/><path d="M30 40 C14 38 10 24 16 14 C18 24 24 30 30 30 Z" fill="${M}" ${O}/><path d="M17 16 C16 26 22 34 30 36" fill="none" stroke="#5dff8a" stroke-width="2.5"/><rect x="27" y="44" width="12" height="5" rx="2" fill="${gold}" ${O}/><rect x="30" y="49" width="6" height="10" fill="#2c2733" ${O}/></g>`,
        defs,
      );
    case 'daggers':
      return svg(
        `<g transform="rotate(35 32 32)"><path d="M23 38 V14 L26 8 L29 14 V38 Z" fill="${M}" ${O}/><rect x="18" y="37" width="16" height="4" rx="2" fill="${gold}" ${O}/><rect x="24" y="41" width="4" height="10" fill="#4a3020" ${O}/></g><g transform="rotate(-35 32 32)"><path d="M35 38 V14 L38 8 L41 14 V38 Z" fill="${M}" ${O}/><rect x="30" y="37" width="16" height="4" rx="2" fill="${gold}" ${O}/><rect x="36" y="41" width="4" height="10" fill="#4a3020" ${O}/></g>`,
        defs,
      );
    case 'warblades':
      return svg(
        `<g transform="rotate(30 32 32)"><path d="M29 44 C28 30 30 18 40 6 C42 18 38 30 36 44 Z" fill="${M}" ${O}/><path d="M30 34 L25 32 M30 26 L25 23 M32 18 L27 15" ${O}/><rect x="24" y="43" width="18" height="5" rx="2" fill="${gold}" ${O}/><rect x="30" y="48" width="6" height="11" fill="#5a2a2a" ${O}/></g>`,
        defs,
      );
    case 'tome':
      return svg(
        `<rect x="12" y="10" width="38" height="46" rx="4" fill="${M}" ${O}/><rect x="46" y="13" width="7" height="40" fill="#f3ead2" ${O}/><rect x="12" y="10" width="7" height="46" fill="#2a1b14" opacity=".35"/><circle cx="32" cy="32" r="9" fill="none" stroke="#6ff0ff" stroke-width="3.5"/><circle cx="32" cy="32" r="3.5" fill="#6ff0ff"/><rect x="46" y="28" width="9" height="8" rx="2" fill="${gold}" ${O}/>`,
        defs,
      );
    case 'totemstaff':
      return svg(
        `<rect x="29" y="26" width="6" height="36" rx="3" fill="${wood}" ${O}/><rect x="23" y="16" width="18" height="14" rx="3" fill="#8a5a2b" ${O}/><circle cx="28" cy="22" r="2" fill="#c9343a"/><circle cx="36" cy="22" r="2" fill="#c9343a"/><path d="M22 10 C22 0 42 0 42 10 C42 16 22 16 22 10 Z" fill="#f3ead2" ${O}/><circle cx="28" cy="9" r="2.5" fill="${M}"/><circle cx="36" cy="9" r="2.5" fill="${M}"/><path d="M20 6 L12 2 M44 6 L52 2" ${O}/><path d="M24 30 L18 44" stroke="#e94b3c" stroke-width="4" stroke-linecap="round"/><path d="M40 30 L46 44" stroke="#2ab8c8" stroke-width="4" stroke-linecap="round"/>`,
        defs,
      );
    case 'bell':
      return svg(
        `<rect x="29" y="40" width="6" height="20" rx="3" fill="#5a3a22" ${O}/><path d="M18 40 C18 22 24 12 32 12 C40 12 46 22 46 40 Z" fill="${M}" ${O}/><rect x="14" y="38" width="36" height="6" rx="3" fill="${gold}" ${O}/><circle cx="32" cy="47" r="4" fill="#6ff0ff" ${O}/><circle cx="32" cy="9" r="4" fill="${gold}" ${O}/><path d="M24 22 C26 18 28 17 30 16" stroke="#fff" stroke-opacity=".7" stroke-width="3" fill="none"/>`,
        defs,
      );
    case 'bow':
    case 'recurve':
      return svg(
        tpl === 'bow'
          ? `<path d="M20 6 C50 14 50 50 20 58" fill="none" stroke="#2a1b14" stroke-width="9" stroke-linecap="round"/><path d="M20 6 C50 14 50 50 20 58" fill="none" stroke="${M}" stroke-width="5" stroke-linecap="round"/><path d="M20 6 V58" stroke="#f5f0e0" stroke-width="2"/><path d="M12 32 H54" ${O}/><path d="M54 32 L46 27 M54 32 L46 37" ${O} fill="none"/>`
          : `<path d="M22 6 C14 12 38 14 40 32 C38 50 14 52 22 58" fill="none" stroke="#2a1b14" stroke-width="9" stroke-linecap="round"/><path d="M22 6 C14 12 38 14 40 32 C38 50 14 52 22 58" fill="none" stroke="${M}" stroke-width="5" stroke-linecap="round"/><path d="M22 6 L22 58" stroke="#f5f0e0" stroke-width="2"/>`,
        defs,
      );
    case 'crossbow':
      return svg(
        `<rect x="28" y="16" width="8" height="44" rx="3" fill="${wood}" ${O}/><path d="M8 26 C20 12 44 12 56 26" fill="none" stroke="#2a1b14" stroke-width="9" stroke-linecap="round"/><path d="M8 26 C20 12 44 12 56 26" fill="none" stroke="${M}" stroke-width="5" stroke-linecap="round"/><path d="M8 26 L32 32 L56 26" stroke="#f5f0e0" stroke-width="2" fill="none"/><path d="M32 4 V30" ${O}/><path d="M32 4 L28 10 M32 4 L36 10" ${O} fill="none"/>`,
        defs,
      );
    case 'helm':
      return svg(
        `<path d="M10 40 C10 16 54 16 54 40 L54 46 L10 46 Z" fill="${M}" ${O}/><rect x="8" y="42" width="48" height="8" rx="3" fill="${gold}" ${O}/><rect x="29" y="30" width="6" height="22" fill="${M}" ${O}/><path d="M10 32 C2 26 4 14 8 10 C10 18 14 22 16 24" fill="#fff2d6" ${O}/><path d="M54 32 C62 26 60 14 56 10 C54 18 50 22 48 24" fill="#fff2d6" ${O}/>`,
        defs,
      );
    case 'hood':
      return svg(`<path d="M32 4 C14 6 8 22 10 40 L16 58 H48 L54 40 C56 22 50 6 32 4 Z" fill="${cloth}" ${O}/><path d="M32 18 C22 18 18 28 20 40 C24 46 40 46 44 40 C46 28 42 18 32 18 Z" fill="#3a2418" ${O}/><circle cx="27" cy="34" r="2.5" fill="#ffe14a"/><circle cx="37" cy="34" r="2.5" fill="#ffe14a"/>`);
    case 'plate':
      return svg(
        `<path d="M14 12 L24 8 C26 14 38 14 40 8 L50 12 L58 24 L50 30 L48 56 H16 L14 30 L6 24 Z" fill="${M}" ${O}/><path d="M32 16 V54" stroke="#2a1b14" stroke-width="2.5"/><path d="M20 36 H44" stroke="${gold}" stroke-width="4"/>`,
        defs,
      );
    case 'robe':
      return svg(`<path d="M22 6 H42 L46 22 L56 58 H8 L18 22 Z" fill="${cloth}" ${O}/><rect x="17" y="24" width="30" height="6" fill="${gold}" ${O}/><path d="M32 6 V22" stroke="#2a1b14" stroke-width="2.5"/><path d="M14 54 H50" stroke="${gold}" stroke-width="3"/>`);
    case 'leather':
      return svg(`<path d="M16 10 L26 6 L32 14 L38 6 L48 10 L56 24 L48 28 L48 56 H16 L16 28 L8 24 Z" fill="${cloth}" ${O}/><path d="M32 14 V56" stroke="#2a1b14" stroke-width="2.5"/><circle cx="28" cy="24" r="2" fill="${gold}"/><circle cx="28" cy="34" r="2" fill="${gold}"/><circle cx="28" cy="44" r="2" fill="${gold}"/><rect x="16" y="40" width="32" height="5" fill="#5a3a22"/>`);
    case 'boots':
      return svg(`<path d="M20 6 H38 V36 L54 42 C58 46 56 54 50 54 H16 C14 46 18 40 20 36 Z" fill="${cloth}" ${O}/><rect x="18" y="12" width="22" height="6" fill="${gold}" ${O}/><path d="M14 54 H54" ${O}/>${rarity === 'legendary' || rarity === 'epic' ? `<path d="M20 14 C10 8 6 16 8 22 C12 20 16 20 20 22 Z" fill="#fff" ${O}/>` : ''}`);
    case 'greaves':
      return svg(`<path d="M20 6 H40 V38 L54 44 C58 48 56 56 50 56 H14 C12 48 16 42 20 38 Z" fill="${M}" ${O}/><path d="M20 18 H40 M20 28 H40" stroke="#2a1b14" stroke-width="2.5"/><circle cx="30" cy="46" r="4" fill="${gold}" ${O}/>`, defs);
    case 'amulet':
      return svg(`<path d="M14 8 C14 26 22 32 32 34 C42 32 50 26 50 8" fill="none" stroke="${gold}" stroke-width="4"/><path d="M32 30 L44 42 L32 58 L20 42 Z" fill="${M}" ${O}/><path d="M32 34 L38 42 L32 50" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="2"/>`, defs);
    case 'talisman':
      return svg(`<path d="M14 8 C16 22 24 28 32 30" fill="none" stroke="#7a4a26" stroke-width="4"/><path d="M50 8 C48 22 40 28 32 30" fill="none" stroke="#7a4a26" stroke-width="4"/><path d="M26 28 C26 44 30 54 34 60 C40 50 40 40 38 28 Z" fill="#fff6e0" ${O}/><circle cx="32" cy="30" r="5" fill="${M}" ${O}/>`, defs);
    case 'ring':
      return svg(`<circle cx="32" cy="38" r="17" fill="none" stroke="#2a1b14" stroke-width="10"/><circle cx="32" cy="38" r="17" fill="none" stroke="${gold}" stroke-width="6"/><path d="M32 8 L42 18 L32 28 L22 18 Z" fill="${M}" ${O}/>`, defs);
    case 'band':
      return svg(`<circle cx="32" cy="36" r="18" fill="none" stroke="#2a1b14" stroke-width="10"/><circle cx="32" cy="36" r="18" fill="none" stroke="${M}" stroke-width="6"/><circle cx="32" cy="16" r="8" fill="#d0203a" ${O}/><circle cx="29" cy="13" r="2.5" fill="#fff" opacity=".8"/>`, defs);
  }
  return svg(`<circle cx="32" cy="32" r="20" fill="${M}" ${O}/>`, defs);
}

export function skillIcon(id: string): string {
  const g = `s${uid++}`;
  switch (id) {
    case 'slash':
      return svg(`<path d="M8 50 C20 20 40 10 58 8 C44 18 30 34 22 56 Z" fill="url(#${g})" ${O}/><path d="M18 46 C26 30 38 20 50 14" stroke="#fff" stroke-width="3" fill="none" opacity=".8"/>`, grad(g, '#ffffff', '#9fc4e0'));
    case 'charge':
      return svg(`<path d="M6 18 H22 M2 32 H18 M6 46 H22" ${O}/><circle cx="40" cy="32" r="20" fill="#c8412f" ${O}/><circle cx="40" cy="32" r="12" fill="url(#${g})" ${O}/><circle cx="40" cy="32" r="4" fill="#ffc93c" ${O}/>`, grad(g, '#e4eaee', '#8e9aa6'));
    case 'whirl':
      return svg(`<path d="M32 32 m-4 0 a4 4 0 1 1 8 0 a10 10 0 1 1 -20 0 a16 16 0 1 1 32 0 a22 22 0 1 1 -44 0" fill="none" stroke="#2a1b14" stroke-width="8" stroke-linecap="round"/><path d="M32 32 m-4 0 a4 4 0 1 1 8 0 a10 10 0 1 1 -20 0 a16 16 0 1 1 32 0 a22 22 0 1 1 -44 0" fill="none" stroke="url(#${g})" stroke-width="4" stroke-linecap="round"/>`, grad(g, '#ffffff', '#7ab8e0'));
    case 'warcry':
      return svg(`<path d="M10 22 L26 22 L40 10 V54 L26 42 H10 Z" fill="#e0533d" ${O}/><path d="M46 20 C52 26 52 38 46 44 M52 12 C62 22 62 42 52 52" fill="none" ${O} stroke="#ffc93c"/>`);
    case 'bolt':
      return svg(`<circle cx="34" cy="30" r="16" fill="url(#${g})" ${O}/><circle cx="29" cy="25" r="5" fill="#fff" opacity=".85"/><path d="M8 54 L20 42 M14 58 L22 50 M4 46 L14 40" ${O} stroke="#b08aff"/>`, grad(g, '#e8d8ff', '#7a4aff'));
    case 'fireball':
      return svg(`<path d="M30 58 C14 58 8 44 14 32 C18 40 22 40 22 36 C20 26 28 14 40 8 C36 20 46 24 48 34 C52 30 52 26 50 22 C58 32 56 58 30 58 Z" fill="url(#${g})" ${O}/><path d="M30 52 C22 52 20 44 24 38 C28 44 36 42 34 34 C42 40 40 52 30 52 Z" fill="#fff0a0"/>`, grad(g, '#ffd04a', '#ff4a1a'));
    case 'nova':
      return svg(`<g ${O} stroke="#2a1b14"><path d="M32 4 V60 M8 18 L56 46 M8 46 L56 18"/></g><g stroke="#bff4ff" stroke-width="3.5" stroke-linecap="round"><path d="M32 4 V60 M8 18 L56 46 M8 46 L56 18 M26 8 L32 14 L38 8 M26 56 L32 50 L38 56"/></g><circle cx="32" cy="32" r="7" fill="#7ae0ff" ${O}/>`);
    case 'meteor':
      return svg(`<path d="M6 6 L30 24 M14 4 L34 20 M4 16 L26 30" stroke="#ff8a30" stroke-width="5" stroke-linecap="round"/><circle cx="40" cy="40" r="16" fill="url(#${g})" ${O}/><circle cx="36" cy="36" r="4" fill="#3a2418"/><circle cx="46" cy="46" r="3" fill="#3a2418"/>`, grad(g, '#ffb04a', '#8a3a1a'));
    case 'shot':
      return svg(`<path d="M8 56 L52 12" ${O} stroke-width="5"/><path d="M8 56 L52 12" stroke="#c9a36a" stroke-width="3"/><path d="M58 6 L44 12 L52 20 Z" fill="#e0e8f0" ${O}/><path d="M8 56 L6 46 L12 50 Z M8 56 L18 58 L14 52 Z" fill="#e94b3c" ${O}/>`);
    case 'multishot':
      return svg(`<g ${O}><path d="M10 54 L50 8"/><path d="M10 54 L58 26"/><path d="M10 54 L32 4"/></g><g fill="#e0e8f0" ${O}><path d="M54 4 L44 8 L50 14 Z"/><path d="M60 24 L50 22 L52 30 Z"/><path d="M34 0 L26 6 L34 10 Z"/></g>`);
    case 'roll':
      return svg(`<path d="M50 30 A18 18 0 1 1 38 14" fill="none" stroke="#2a1b14" stroke-width="9" stroke-linecap="round"/><path d="M50 30 A18 18 0 1 1 38 14" fill="none" stroke="#7aff9a" stroke-width="5" stroke-linecap="round"/><path d="M34 6 L46 12 L36 22 Z" fill="#7aff9a" ${O}/>`);
    case 'twin':
      return svg(`<g transform="rotate(40 32 32)"><path d="M29 44 V10 L32 4 L35 10 V44 Z" fill="#e4eaee" ${O}/><rect x="25" y="44" width="14" height="5" fill="#2c2733" ${O}/></g><g transform="rotate(-40 32 32)"><path d="M29 44 V10 L32 4 L35 10 V44 Z" fill="#e4eaee" ${O}/><rect x="25" y="44" width="14" height="5" fill="#2c2733" ${O}/></g><path d="M10 30 C20 20 44 20 54 30" fill="none" stroke="#5dff8a" stroke-width="4" stroke-linecap="round"/>`);
    case 'shadowdash':
      return svg(`<path d="M6 22 H30 M4 34 H26 M8 46 H30" stroke="#7a3aff" stroke-width="5" stroke-linecap="round"/><path d="M30 14 C44 14 56 24 58 32 C56 40 44 50 30 50 C38 42 38 22 30 14 Z" fill="#2c2733" ${O}/><circle cx="44" cy="30" r="3.5" fill="#5dff8a"/>`);
    case 'glaive':
      return svg(`<circle cx="32" cy="32" r="22" fill="none" stroke="#5dff8a" stroke-width="3" stroke-dasharray="6 6" opacity=".7"/><path d="M32 12 C46 14 52 26 50 34 C46 26 40 22 32 22 Z" fill="#e4eaee" ${O}/><path d="M32 52 C18 50 12 38 14 30 C18 38 24 42 32 42 Z" fill="#e4eaee" ${O}/><circle cx="32" cy="32" r="7" fill="#2c2733" ${O}/><circle cx="32" cy="32" r="2.5" fill="#5dff8a"/>`);
    case 'demon':
      return svg(`<path d="M32 22 C20 8 8 10 2 18 C10 18 12 24 10 30 C16 26 20 28 22 34 Z" fill="#4a1a5a" ${O}/><path d="M32 22 C44 8 56 10 62 18 C54 18 52 24 54 30 C48 26 44 28 42 34 Z" fill="#4a1a5a" ${O}/><circle cx="32" cy="36" r="13" fill="#2c2733" ${O}/><path d="M22 28 L18 14 L28 26 M42 28 L46 14 L36 26" fill="#1a1612" ${O}/><path d="M25 36 H30 M34 36 H39" stroke="#5dff8a" stroke-width="3.5" stroke-linecap="round"/>`);
    case 'spiritbolt':
      return svg(`<path d="M8 56 C18 46 22 40 30 34" stroke="#6ff0ff" stroke-width="5" stroke-linecap="round" opacity=".6"/><circle cx="40" cy="24" r="14" fill="#6ff0ff" ${O}/><circle cx="40" cy="24" r="7" fill="#e8ffff"/><circle cx="36" cy="20" r="3" fill="#fff"/>`);
    case 'wolves':
      return svg(`<path d="M10 52 L14 22 L24 32 L32 26 L40 32 L50 22 L54 52 C46 60 18 60 10 52 Z" fill="#8af4ff" ${O}/><path d="M32 44 L26 50 H38 Z" fill="#1a3a44"/><circle cx="24" cy="40" r="3" fill="#fff" ${O}/><circle cx="40" cy="40" r="3" fill="#fff" ${O}/><path d="M16 26 L18 8 L26 22 M48 26 L46 8 L38 22" fill="#4ad0e0" ${O}/>`);
    case 'golem':
      return svg(`<path d="M14 24 L22 10 H42 L50 24 L54 46 L42 58 H22 L10 46 Z" fill="#8a8478" ${O}/><path d="M22 30 H30 M34 30 H42" stroke="#6ff0ff" stroke-width="4.5" stroke-linecap="round"/><path d="M24 44 L32 40 L40 44" stroke="#2a1b14" stroke-width="3" fill="none"/><path d="M18 14 L26 18 M46 14 L38 18" stroke="#5aa04a" stroke-width="4" stroke-linecap="round"/>`);
    case 'totem':
      return svg(`<rect x="22" y="18" width="20" height="42" rx="3" fill="#8a5a2b" ${O}/><path d="M22 38 H42" ${O}/><rect x="26" y="24" width="4" height="4" fill="#c9343a"/><rect x="34" y="24" width="4" height="4" fill="#c9343a"/><rect x="26" y="44" width="4" height="4" fill="#2ab8c8"/><rect x="34" y="44" width="4" height="4" fill="#2ab8c8"/><path d="M8 22 L22 26 M56 22 L42 26" stroke="#d9a441" stroke-width="6" stroke-linecap="round"/><circle cx="32" cy="10" r="7" fill="#6ff0ff" ${O}/>`);
    case 'rain':
      return svg(`<path d="M8 8 H56" stroke="#8ad0ff" stroke-width="5" stroke-linecap="round"/><g ${O}><path d="M14 16 V46 M30 14 V52 M46 16 V44"/></g><g fill="#e0e8f0" ${O}><path d="M10 44 L14 54 L18 44 Z"/><path d="M26 50 L30 60 L34 50 Z"/><path d="M42 42 L46 52 L50 42 Z"/></g>`);
  }
  return svg(`<circle cx="32" cy="32" r="20" fill="#fff" ${O}/>`);
}

export function classIcon(cls: HeroClass): string {
  switch (cls) {
    case 'warrior':
      return svg(`<path d="M12 40 C12 18 52 18 52 40 V48 H12 Z" fill="#b8c4ce" ${O}/><rect x="10" y="42" width="44" height="8" rx="3" fill="#ffc93c" ${O}/><rect x="29" y="30" width="6" height="22" fill="#b8c4ce" ${O}/><path d="M12 32 C4 26 6 14 10 8 C12 18 16 22 18 24" fill="#fff2d6" ${O}/><path d="M52 32 C60 26 58 14 54 8 C52 18 48 22 46 24" fill="#fff2d6" ${O}/>`);
    case 'mage':
      return svg(`<path d="M6 50 C20 44 44 44 58 50 C50 56 14 56 6 50 Z" fill="#6b3fc4" ${O}/><path d="M18 48 L30 6 C36 10 40 12 46 12 L44 48 Z" fill="#7b4fd4" ${O}/><path d="M19 42 H45" stroke="#ffc93c" stroke-width="5"/><path d="M34 22 L36 27 L41 27 L37 30 L39 35 L34 32 L30 35 L31 30 L27 27 L32 27 Z" fill="#ffe14a"/>`);
    case 'hunter':
      return svg(`<g transform="rotate(35 32 32)"><path d="M29 46 V10 L32 3 L35 10 V46 Z" fill="#d8e8e0" ${O}/><rect x="26" y="46" width="12" height="10" fill="#2c2733" ${O}/></g><g transform="rotate(-35 32 32)"><path d="M29 46 V10 L32 3 L35 10 V46 Z" fill="#d8e8e0" ${O}/><rect x="26" y="46" width="12" height="10" fill="#2c2733" ${O}/></g><path d="M20 30 H44" stroke="#5dff8a" stroke-width="4" stroke-linecap="round"/>`);
    case 'summoner':
      return svg(`<path d="M14 52 C14 30 50 30 50 52 Z" fill="#2a8f9a" ${O}/><path d="M16 26 L12 6 L22 22 M26 22 L26 2 L32 20 M38 20 L42 2 L42 22 M48 22 L54 6 L50 26" fill="#fff" ${O}/><rect x="14" y="22" width="36" height="7" rx="3" fill="#c9343a" ${O}/><circle cx="32" cy="42" r="6" fill="#6ff0ff" ${O}/>`);
    case 'archer':
      return svg(`<path d="M18 4 C52 12 52 52 18 60" fill="none" stroke="#2a1b14" stroke-width="9" stroke-linecap="round"/><path d="M18 4 C52 12 52 52 18 60" fill="none" stroke="#9a6a3a" stroke-width="5" stroke-linecap="round"/><path d="M18 4 V60" stroke="#f5f0e0" stroke-width="2"/><path d="M8 32 H58" ${O}/><path d="M58 32 L50 26 M58 32 L50 38" ${O} fill="none"/><path d="M8 32 L4 26 M8 32 L4 38" stroke="#e94b3c" stroke-width="3" stroke-linecap="round"/>`);
  }
}

export const COIN = svg(`<circle cx="32" cy="32" r="24" fill="#ffd23a" ${O}/><circle cx="32" cy="32" r="16" fill="none" stroke="#c88a10" stroke-width="3"/><path d="M28 22 H36 M32 22 V42 M26 42 H38" stroke="#c88a10" stroke-width="4" stroke-linecap="round"/><circle cx="24" cy="22" r="4" fill="#fff6c0"/>`);
export const SKULL = svg(`<path d="M32 6 C16 6 10 18 12 30 C13 36 18 38 18 44 V52 H46 V44 C46 38 51 36 52 30 C54 18 48 6 32 6 Z" fill="#f2ebd6" ${O}/><circle cx="24" cy="30" r="6" fill="#2a1b14"/><circle cx="40" cy="30" r="6" fill="#2a1b14"/><path d="M32 36 L28 42 H36 Z" fill="#2a1b14"/><path d="M26 52 V46 M32 52 V46 M38 52 V46" stroke="#2a1b14" stroke-width="2.5"/>`);
export const SWORDS = svg(`<g transform="rotate(45 32 32)"><path d="M29 40 V8 L32 2 L35 8 V40 Z" fill="#e4eaee" ${O}/><rect x="22" y="40" width="20" height="5" rx="2" fill="#ffc93c" ${O}/><rect x="30" y="45" width="4" height="12" fill="#6a4024" ${O}/></g><g transform="rotate(-45 32 32)"><path d="M29 40 V8 L32 2 L35 8 V40 Z" fill="#e4eaee" ${O}/><rect x="22" y="40" width="20" height="5" rx="2" fill="#ffc93c" ${O}/><rect x="30" y="45" width="4" height="12" fill="#6a4024" ${O}/></g>`);
export const HEART = svg(`<path d="M32 56 C10 40 4 28 10 18 C16 8 28 10 32 20 C36 10 48 8 54 18 C60 28 54 40 32 56 Z" fill="#e8463a" ${O}/><circle cx="20" cy="22" r="4" fill="#fff" opacity=".7"/>`);
export const MUG = svg(`<rect x="12" y="16" width="30" height="40" rx="4" fill="#9a6a3a" ${O}/><path d="M42 24 C54 24 54 46 42 46" fill="none" ${O} stroke-width="6"/><path d="M42 24 C54 24 54 46 42 46" fill="none" stroke="#9a6a3a" stroke-width="3"/><path d="M10 18 C10 8 22 6 26 12 C30 4 44 8 44 18 Z" fill="#fff6e0" ${O}/>`);
