// Сетевая игра в двух браузерах через настоящий сервер: создание комнаты, вход по коду, бой, перезагрузка
// страницы второго игрока (возврат в комнату посреди боя). Сервер: PORT=8799 node server/dist/server.mjs
//   node tools/browser/mp_browser.cjs [адрес]   → снимки mp_a.png, mp_b_back.png в текущей папке
const { chromium } = require('playwright');
const URL = process.argv[2] ?? 'http://localhost:8799/';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errs = [];
  const page = async (name) => {
    const ctx = await b.newContext({ viewport: { width: 960, height: 540 } });
    await ctx.addInitScript((n) => localStorage.setItem('three-heroes-settings', JSON.stringify({ name: n, lang: 'en', quality: 'low', sound: false, music: false })), name);
    const p = await ctx.newPage();
    p.setDefaultTimeout(120000);
    p.on('pageerror', (e) => errs.push(`${name}: ${e.message}`));
    p.on('console', (m) => { if (m.type() === 'error') errs.push(`${name}: ${m.text().slice(0, 200)}`); });
    await p.goto(URL);
    return p;
  };
  const A = await page('Anna');
  const B = await page('Boris');
  await A.click('#create');
  await A.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.querySelector('.code')?.textContent ?? ''));
  const code = await A.textContent('.code');
  console.log('комната', code);
  await B.fill('#code', code);
  await B.click('#join');
  await B.waitForSelector('#ready');
  await A.click('#ready');
  await B.click('#ready');
  await A.waitForTimeout(500);
  await A.click('#start');
  const hud = async (p) => (await p.evaluate(() => document.body.innerText.match(/Wave \d+\/25[\s\S]{0,40}/)?.[0]?.replace(/\s+/g, ' ') ?? '—'));
  const run = async (n) => {
    for (let i = 0; i < n; i++) {
      for (const [p, k] of [[A, ['KeyW', 'KeyD', 'KeyS', 'KeyA'][i % 4]], [B, ['KeyA', 'KeyW', 'KeyD', 'KeyS'][i % 4]]]) {
        await p.keyboard.down(k);
        await p.keyboard.press('Space');
        await p.waitForTimeout(300);
        await p.keyboard.up(k);
      }
    }
  };
  // Бой: оба бегают по кругу клавишами и бьют
  await run(2);
  console.log('A:', await hud(A), '| B:', await hud(B));
  // Второй игрок перезагружает страницу посреди боя — должен вернуться в ту же игру
  await B.reload();
  await B.waitForFunction(() => /Wave \d+\/25/.test(document.body.innerText), null, { timeout: 60000 }).catch(() => {});
  console.log('после перезагрузки A:', await hud(A), '| B:', await hud(B));
  await run(2);
  await A.screenshot({ path: 'mp_a.png' });
  await B.screenshot({ path: 'mp_b_back.png' });
  console.log('в конце A:', await hud(A), '| B:', await hud(B));
  console.log('ошибки:', errs.length ? errs.slice(0, 10) : 'нет');
  await b.close();
})();
