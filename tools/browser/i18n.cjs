// Меню, настройки, лобби, бой и таверна на разных языках
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errs = [];
  for (const lang of (process.argv[2] ?? 'en,el,de').split(',')) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: lang });
    const p = await ctx.newPage();
    p.setDefaultTimeout(90000);
    p.on('pageerror', (e) => errs.push(lang + ' PAGEERROR ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error') errs.push(lang + ' ' + m.text().slice(0, 200)); });
    await p.goto('http://localhost:5173/?round=' + (process.env.ROUND ?? 1), { waitUntil: 'domcontentloaded', timeout: 120000 });
    await p.waitForSelector('#solo', { timeout: 120000 });
    await p.waitForTimeout(2000);
    await p.screenshot({ path: `i18n_${lang}_menu.png` });
    await p.click('#settings'); await p.waitForTimeout(300);
    await p.screenshot({ path: `i18n_${lang}_settings.png` });
    await p.click('.modal #ok');
    await p.click('#solo'); await p.waitForTimeout(1500);
    await p.screenshot({ path: `i18n_${lang}_lobby.png` });
    await p.click('#ready'); await p.waitForTimeout(300); await p.click('#start');
    await p.waitForTimeout(6000);
    await p.screenshot({ path: `i18n_${lang}_battle.png` });
    // Таверна
    for (let i = 0; i < 60; i++) {
      const ph = await p.evaluate(() => window.__app.conn.room.game.phase);
      if (ph === 'tavern') break;
      await p.evaluate(() => { const g = window.__app.conn.room.game; g.spawnQueue = []; for (const m of g.mobs.values()) g.damageMob(m, 1e9, false, null); });
      await p.waitForTimeout(500);
    }
    await p.waitForTimeout(2500);
    await p.screenshot({ path: `i18n_${lang}_tavern.png` });
    await ctx.close();
  }
  console.log('ошибки:', errs.length ? errs : 'нет');
  await browser.close();
})();
