import type { Snapshot } from '../protocol';

/**
 * Разностные снимки для сети. Каждый снимок по-прежнему перечисляет все объекты (кто исчез из списка —
 * исчез из игры), но у объекта, который был и в прошлом снимке, остаются только `id` и поля, изменившиеся
 * с тех пор: у стоящего моба — ничего, у бегущего — x, z. Имя, класс, максимум здоровья, вид снаряда и т. п.
 * уходят только в «полных» снимках (`full`: каждые 10 тиков и сразу после входа/возврата игрока).
 *
 * Сервер делает один текст на комнату и сжимает его для каждого клиента — поэтому чем короче снимок, тем
 * меньше работы процессору: в бою снимок в 2–3 раза короче. Клиент восстанавливает полные записи в
 * `decodeSnapshot` (ClientState.apply) — остальной код клиента видит снимки как раньше.
 */

type Entry = { id: string | number } & Record<string, unknown>;
const LISTS = ['P', 'M', 'S', 'R', 'Z'] as const;

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  return false;
}

/** Кодировщик одной комнаты: помнит, что ушло в прошлом снимке. */
export class DeltaEncoder {
  private prev: Record<string, Map<string | number, Entry>> = {};

  encode(s: Snapshot): Snapshot {
    const out = { ...s } as unknown as Record<string, unknown>;
    for (const k of LISTS) {
      const list = (s as unknown as Record<string, Entry[] | undefined>)[k];
      if (!list) continue;
      const before = this.prev[k];
      const now = new Map<string | number, Entry>();
      const res: Entry[] = new Array(list.length);
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        now.set(e.id, e);
        const p = s.full ? undefined : before?.get(e.id);
        if (!p) {
          res[i] = e;
          continue;
        }
        const d: Entry = { id: e.id };
        for (const f in e) if (f !== 'id' && !same(e[f], p[f])) d[f] = e[f];
        res[i] = d;
      }
      this.prev[k] = now;
      out[k] = res;
    }
    return out as unknown as Snapshot;
  }
}

/** Ключ, без которого запись объекта неполна (объект впервые виден в разностном снимке — ждём полный). */
const REQUIRED: Record<string, string> = { P: 'c', M: 'k', S: 'k', R: 'k', Z: 'k' };

/**
 * Восстановить полные записи по прошлому (уже восстановленному) снимку. Записи без базы пропускаются до
 * ближайшего полного снимка (≤ 0,5 с). Полные снимки и снимки старого формата проходят как есть.
 */
export function decodeSnapshot(s: Snapshot, prev: Snapshot | null): Snapshot {
  const S = s as unknown as Record<string, Entry[] | undefined>;
  const P = prev as unknown as Record<string, Entry[] | undefined> | null;
  for (const k of LISTS) {
    const list = S[k];
    if (!list) continue;
    let base: Map<string | number, Entry> | null = null;
    const res: Entry[] = [];
    for (const e of list) {
      // Запись с ключевым полем — полная (новый объект или полный снимок)
      if (e[REQUIRED[k]] !== undefined) {
        res.push(e);
        continue;
      }
      if (!base) {
        base = new Map();
        for (const q of P?.[k] ?? []) base.set(q.id, q);
      }
      const b = base.get(e.id);
      if (b) res.push(Object.assign({}, b, e));
    }
    S[k] = res;
  }
  return s;
}
