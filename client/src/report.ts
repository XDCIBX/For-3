/**
 * Сообщить о непредвиденной ошибке в консоль, не чаще раза в 5 секунд на источник:
 * игра продолжает работать, а лог не забивается одной и той же ошибкой каждый кадр.
 */
const lastAt = new Map<string, number>();

export function reportOnce(where: string, e: unknown) {
  const now = performance.now();
  if (now - (lastAt.get(where) ?? -1e9) < 5000) return;
  lastAt.set(where, now);
  console.error(`[${where}]`, e);
}
