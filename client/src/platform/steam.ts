/**
 * Steam в десктопной сборке (Electron): мост window.steam из desktop/preload.cjs.
 * В браузере и на телефоне моста нет — все вызовы молча ничего не делают.
 */

interface SteamBridge {
  status(): Promise<{ ok: boolean; appId: number; name: string; lang: string; error: string; overlay: boolean } | null>;
  achieve(id: string): void;
  invite(connect: string): void;
  presence(connect: string, status: string): void;
  overlay(dialog: string): void;
  takeJoin(): Promise<string>;
  onJoin(cb: (connect: string) => void): void;
  onOverlay(cb: (active: boolean) => void): void;
}

/** Достижения игры. Те же имена (API Name) нужно завести в Steamworks для настоящего AppID. */
export type Achievement = 'FIRST_WAVE' | 'WAVE_10' | 'TROLL_SLAYER' | 'DUEL_WINNER' | 'DRAGON_LAIR' | 'DRAGON_SLAYER';

const bridge = (window as unknown as { steam?: SteamBridge }).steam;

/** Приглашение: код комнаты и адрес сервера пригласившего. */
export interface JoinInfo {
  code: string;
  server?: string;
}

/** Строка подключения для приглашения и кнопки «Присоединиться» в списке друзей Steam. */
export function connectString(code: string, server: string): string {
  return `--w25-join=${code} --w25-server=${server}`;
}

/** Разбор строки подключения; посторонние символы и чужие адреса отбрасываются. */
export function parseConnect(s: string): JoinInfo | null {
  const code = /--w25-join=([A-Za-z0-9]{4})(?![A-Za-z0-9])/.exec(s)?.[1];
  if (!code) return null;
  const server = /--w25-server=(wss?:\/\/[A-Za-z0-9.\-[\]:]+(?:\/[A-Za-z0-9._~\-/]*)?)(?:\s|$)/.exec(s)?.[1];
  return { code: code.toUpperCase(), server };
}

class SteamClient {
  readonly available = !!bridge;
  ok = false;
  name = '';
  private got = new Set<string>();
  private presenceKey = '';

  /** Подключение; возвращает приглашение, с которым игру запустили (если было). */
  async init(onJoin: (j: JoinInfo) => void, onOverlay: (active: boolean) => void): Promise<JoinInfo | null> {
    if (!bridge) return null;
    try {
      const st = await bridge.status();
      this.ok = !!st?.ok;
      this.name = st?.name ?? '';
      if (!this.ok) return null;
      bridge.onJoin((c) => {
        const j = parseConnect(c);
        if (j) onJoin(j);
      });
      bridge.onOverlay(onOverlay);
      return parseConnect(await bridge.takeJoin());
    } catch {
      this.ok = false;
      return null;
    }
  }

  achieve(id: Achievement) {
    if (!this.ok || this.got.has(id)) return;
    this.got.add(id);
    bridge?.achieve(id);
  }

  invite(code: string, server: string) {
    if (this.ok) bridge?.invite(connectString(code, server));
  }

  /** Статус в списке друзей; code — комната, к которой можно присоединиться. */
  presence(code: string | null, server: string, status: string) {
    if (!this.ok) return;
    const connect = code ? connectString(code, server) : '';
    const key = connect + '|' + status;
    if (key === this.presenceKey) return;
    this.presenceKey = key;
    bridge?.presence(connect, status);
  }
}

export const steam = new SteamClient();
