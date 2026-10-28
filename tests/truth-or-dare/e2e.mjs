// Сквозной тест в браузере: node tests/truth-or-dare/e2e.mjs [папка для скриншотов]
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = fileURLToPath(new URL("../../docs/", import.meta.url));
const shots = process.argv[2];
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "") || "index.html";
  try {
    const body = await readFile(join(root, path));
    res.writeHead(200, { "content-type": (types[extname(path)] || "application/octet-stream") + "; charset=utf-8" });
    res.end(body);
  } catch { res.writeHead(404).end(); }
}).listen(0);
const url = `http://127.0.0.1:${server.address().port}/`;

let failed = 0;
const check = (cond, msg) => { console.log((cond ? "✓ " : "✗ ") + msg); if (!cond) failed++; };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
// Шрифты Google в тестах не нужны
await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());

await page.goto(url);
check(await page.isVisible("#ageGate"), "при первом входе спрашивается возраст");
if (shots) await page.screenshot({ path: `${shots}/1-age.png` });

// Младше 18 — доступен только 0+
await page.click('[data-age="0"]');
check(await page.isDisabled('.level[data-level="18+"]'), "до 18 лет уровень 18+ недоступен");
check(await page.isDisabled('.level[data-level="21+"]'), "до 18 лет уровень 21+ недоступен");
check((await page.textContent("#levelHint")).includes("90 правд и 60 действий"), "до 18 лет в колоде 90 правд и 60 действий");

// Сброс и вход как 21+
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.click('[data-age="21"]');
check(!(await page.isVisible("#ageGate")), "окно возраста закрылось");
check((await page.textContent("#levelHint")).includes("300 правд и 200 действий"), "21+: в колоде все 300 правд и 200 действий");

for (const name of ["Аня", "Макс", "Лиза"]) {
  await page.fill("#playerName", name);
  await page.press("#playerName", "Enter");
}
await page.fill("#playerName", "аня");
await page.press("#playerName", "Enter");
check((await page.locator("#playerList li").count()) === 3, "добавлено 3 игрока, дубликат отклонён");
if (shots) await page.screenshot({ path: `${shots}/2-setup.png` });

await page.click("#startBtn");
check(await page.isVisible("#game"), "игра началась");
check((await page.textContent("#turnName")) === "Аня", "первым ходит первый игрок");

await page.click(".btn-truth");
await page.waitForTimeout(800);
check(await page.locator("#card.flipped.truth").count() === 1, "карточка правды перевернулась");
const t1 = await page.textContent("#cardText");
check(t1.length > 5, "текст правды показан: " + t1);
if (shots) await page.screenshot({ path: `${shots}/3-truth.png` });
await page.click("#doneBtn");
check((await page.textContent("#turnName")) === "Макс", "ход перешёл ко второму игроку");

await page.click(".btn-dare");
await page.waitForTimeout(800);
check(await page.locator("#card.flipped.dare").count() === 1, "карточка действия перевернулась");
if (shots) await page.screenshot({ path: `${shots}/4-dare.png` });
await page.click("#skipBtn");
check((await page.textContent("#toast")).startsWith("Штраф"), "за пропуск назначается штраф");

// Прогон всей колоды: без повторов до перемешивания
const seen = new Set();
let dup = false;
for (let i = 0; i < 299; i++) {
  await page.evaluate(() => {
    document.querySelector(".btn-truth").click();
    document.getElementById("doneBtn").click();
  });
}
const counter = await page.textContent("#counter");
check(counter.startsWith("Осталось: 0 правд"), "после 300 правд колода пуста: " + counter);
await page.click(".btn-truth");
check((await page.textContent("#toast")).includes("перемешана"), "пустая колода перемешивается заново");
await page.click("#doneBtn");

// Повторы внутри одной колоды
const texts = await page.evaluate(() => {
  const out = [];
  for (let i = 0; i < 199; i++) {
    document.querySelector(".btn-dare").click();
    out.push(document.getElementById("cardText").textContent);
    document.getElementById("doneBtn").click();
  }
  return out;
});
for (const t of texts) { if (seen.has(t)) dup = true; seen.add(t); }
check(!dup && texts.length === 199, "199 действий подряд без повторов");

await page.click("#scoreBtn");
check(await page.isVisible("#scoreModal"), "открывается таблица счёта");
check((await page.locator("#scores li").count()) === 3, "в счёте 3 игрока");
if (shots) await page.screenshot({ path: `${shots}/5-score.png` });
await page.click("#closeScore");

// Отключаем уровни: только 21+
await page.click("#backBtn");
await page.click('.level[data-level="0+"]');
await page.click('.level[data-level="18+"]');
check((await page.textContent("#levelHint")).includes("90 правд и 60 действий"), "только 21+: 90 правд и 60 действий");
await page.click("#startBtn");
const levels = await page.evaluate(() => {
  const out = new Set();
  for (let i = 0; i < 40; i++) {
    document.querySelector('[data-kind="random"]').click();
    out.add(document.getElementById("cardLevel").textContent);
    document.getElementById("doneBtn").click();
  }
  return [...out];
});
check(levels.length === 1 && levels[0] === "21+", "выпадают только карточки 21+");

// Настройки сохраняются после перезагрузки
await page.reload();
check(!(await page.isVisible("#ageGate")), "возраст запомнился");
check((await page.locator("#playerList li").count()) === 3, "игроки запомнились");

// Широкий экран
await page.setViewportSize({ width: 1280, height: 800 });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
check(!overflow, "нет горизонтальной прокрутки");
await page.setViewportSize({ width: 320, height: 640 });
check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), "нет горизонтальной прокрутки на 320px");

check(errors.length === 0, "нет ошибок JavaScript" + (errors.length ? ": " + errors.join("; ") : ""));

await browser.close();
server.close();
console.log(failed ? `\n${failed} проверок не прошло` : "\nВсе проверки пройдены");
process.exit(failed ? 1 : 0);
