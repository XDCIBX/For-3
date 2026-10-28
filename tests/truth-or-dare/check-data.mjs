// Проверка базы карточек: количество, уникальность и доля 18+/21+.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = readFileSync(new URL("../../docs/data.js", import.meta.url), "utf8");
const ctx = { window: {} };
vm.runInNewContext(src, ctx);
const data = ctx.window.TOD_DATA;

const expected = { truth: 300, dare: 200 };
const levels = ["0+", "18+", "21+"];
let ok = true;
const fail = (msg) => { console.error("✗ " + msg); ok = false; };
const seen = new Set();

for (const kind of Object.keys(expected)) {
  const counts = Object.fromEntries(levels.map((l) => [l, (data[kind][l] || []).length]));
  const total = counts["0+"] + counts["18+"] + counts["21+"];
  const adult = counts["18+"] + counts["21+"];
  console.log(`${kind}: всего ${total}, 0+ ${counts["0+"]}, 18+ ${counts["18+"]}, 21+ ${counts["21+"]}, взрослых ${(adult / total * 100).toFixed(1)}%`);
  if (total !== expected[kind]) fail(`${kind}: ожидалось ${expected[kind]}, найдено ${total}`);
  if (adult / total !== 0.7) fail(`${kind}: доля 18+/21+ должна быть ровно 70%`);
  for (const l of levels) for (const text of data[kind][l]) {
    const key = text.toLowerCase().replace(/[^а-яёa-z0-9]/g, "");
    if (!text.trim()) fail(`${kind} ${l}: пустая карточка`);
    if (seen.has(key)) fail(`дубликат: «${text}»`);
    seen.add(key);
  }
}
console.log(ok ? "✓ база карточек в порядке" : "Есть ошибки");
process.exit(ok ? 0 : 1);
