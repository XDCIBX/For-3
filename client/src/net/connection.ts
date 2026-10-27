import { Room, type C2S, type S2C } from '@game/shared';

export interface Connection {
  readonly local: boolean;
  rtt: number;
  send(msg: C2S): void;
  close(): void;
  onMessage: (m: S2C) => void;
  onClose: (reason: string) => void;
}

/** Подключение к игровому серверу по WebSocket. */
export class WsConnection implements Connection {
  readonly local = false;
  rtt = 0.08;
  onMessage: (m: S2C) => void = () => {};
  onClose: (reason: string) => void = () => {};
  private ws: WebSocket;
  private pingTimer = 0;
  private closedByUs = false;

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.onmessage = (ev) => {
      let m: S2C;
      try {
        m = JSON.parse(ev.data as string);
      } catch {
        return;
      }
      if (m.t === 'pong') {
        const r = (performance.now() - m.c) / 1000;
        this.rtt = this.rtt * 0.7 + r * 0.3;
        return;
      }
      this.onMessage(m);
    };
    ws.onclose = () => {
      clearInterval(this.pingTimer);
      if (!this.closedByUs) this.onClose('Соединение потеряно');
    };
    this.pingTimer = window.setInterval(() => this.send({ t: 'ping', c: performance.now() }), 2000);
  }

  static open(url: string, timeoutMs = 8000): Promise<WsConnection> {
    return new Promise((resolve, reject) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        reject(new Error('Неверный адрес сервера'));
        return;
      }
      const timer = setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) return;
        ws.close();
        reject(new Error('Сервер не отвечает'));
      }, timeoutMs);
      ws.onopen = () => {
        clearTimeout(timer);
        resolve(new WsConnection(ws));
      };
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error('Не удалось подключиться к серверу'));
      };
    });
  }

  send(msg: C2S) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close() {
    this.closedByUs = true;
    clearInterval(this.pingTimer);
    this.ws.close();
  }
}

/** Локальная игра: та же комната и симуляция, но прямо в приложении (без сети). */
export class LocalConnection implements Connection {
  readonly local = true;
  rtt = 0;
  onMessage: (m: S2C) => void = () => {};
  onClose: (reason: string) => void = () => {};
  private room: Room;
  private pid = '';
  private timer = 0;
  private acc = 0;
  private last = performance.now();

  constructor(name: string) {
    this.room = new Room('СОЛО');
    // ?round=5 — начать одиночную игру с указанного раунда (удобно для проверки ПвП и боссов)
    const r = Number(new URLSearchParams(window.location.search).get('round'));
    if (r > 1) this.room.game.startRound = r;
    queueMicrotask(() => {
      this.room.join(name, {
        send: (m) => {
          if (m.t === 'welcome') this.pid = m.id;
          this.onMessage(m);
        },
      });
    });
    this.timer = window.setInterval(() => {
      const now = performance.now();
      this.acc += Math.min(250, now - this.last);
      this.last = now;
      while (this.acc >= 50) {
        this.acc -= 50;
        this.room.step();
      }
    }, 16);
  }

  send(msg: C2S) {
    if (this.pid) this.room.handle(this.pid, msg);
  }

  close() {
    clearInterval(this.timer);
  }
}
