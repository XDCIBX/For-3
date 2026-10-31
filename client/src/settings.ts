import { DEFAULT_PORT } from '@game/shared';

export interface Settings {
  name: string;
  server: string;
  sound: boolean;
  music: boolean;
  quality: 'high' | 'low';
  haptics: boolean;
}

const KEY = 'three-heroes-settings';

/**
 * Адрес сервера по умолчанию. Для релиза его зашивают при сборке:
 * VITE_SERVER_URL=wss://game.example.com npm run build. Иначе: если страница отдана
 * игровым сервером — он же; в приложении — адрес в локальной сети.
 */
export function defaultServer(): string {
  const baked = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (baked) return baked;
  const { protocol, hostname, port } = window.location;
  const isNative = protocol === 'capacitor:' || protocol === 'ionic:' || ((hostname === 'localhost' || hostname === '127.0.0.1') && !port);
  if (isNative) return `ws://192.168.0.10:${DEFAULT_PORT}`;
  const ws = protocol === 'https:' ? 'wss:' : 'ws:';
  // Dev-сервер Vite (5173) → игровой сервер на стандартном порту
  if (port === '5173' || port === '4173') return `${ws}//${hostname}:${DEFAULT_PORT}`;
  return `${ws}//${window.location.host}`;
}

export function loadSettings(): Settings {
  const lowEnd = (navigator.hardwareConcurrency ?? 8) <= 4;
  const def: Settings = { name: 'Герой', server: defaultServer(), sound: true, music: true, quality: lowEnd ? 'low' : 'high', haptics: true };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...def, ...JSON.parse(raw) };
  } catch {
    /* хранилище недоступно */
  }
  return def;
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* хранилище недоступно */
  }
}

/** Данные для переподключения (живут в рамках сессии). */
export function saveSession(code: string, token: string) {
  try {
    sessionStorage.setItem('th-session', JSON.stringify({ code, token, t: Date.now() }));
  } catch {
    /* ignore */
  }
}
export function loadSession(): { code: string; token: string } | null {
  try {
    const s = JSON.parse(sessionStorage.getItem('th-session') ?? 'null');
    if (s && Date.now() - s.t < 5 * 60_000) return s;
  } catch {
    /* ignore */
  }
  return null;
}
export function clearSession() {
  try {
    sessionStorage.removeItem('th-session');
  } catch {
    /* ignore */
  }
}
