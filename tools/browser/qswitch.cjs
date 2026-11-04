const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  p.setDefaultTimeout(120000);
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  await p.goto('http://localhost:5173/?round=25', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForSelector('#solo');
  console.log('качество по умолчанию (десктоп, 4 ядра):', await p.evaluate(() => window.__app.engine.quality));
  await p.click('#solo'); await p.waitForTimeout(1000);
  await p.click('#ready'); await p.waitForTimeout(300); await p.click('#start');
  await p.evaluate(() => setInterval(() => { for (const q of window.__app.conn.room.game.players.values()) { q.hp = q.stats.maxHp; q.alive = true; } }, 100));
  await p.waitForFunction(() => [...window.__app.conn.room.game.mobs.values()].some((m) => m.kind === 'dragon' && m.spawnT <= 0), null, { timeout: 60000 });
  for (const q of ['low', 'high', 'ultra']) {
    await p.click('#pause'); await p.waitForTimeout(300);
    await p.click('#pmenu'); await p.waitForTimeout(300);
    await p.selectOption('.modal #q', q);
    await p.click('.modal #ok'); await p.waitForTimeout(300);
    await p.click('#resume'); await p.waitForTimeout(2500);
    console.log('качество', q, '→', await p.evaluate(() => { const e = window.__app.engine; return e.quality + ' тени ' + e.renderer.shadowMap.enabled + ' кадров/с(примерно) ' + e.renderer.info.render.calls + ' вызовов'; }));
  }
  // Герой идёт прямо в дракона — дракон не сдвигается
  const res = await p.evaluate(async () => {
    const A = window.__app;
    const g = A.conn.room.game;
    const me = g.players.get(A.st.myId);
    const d = [...g.mobs.values()].find((m) => m.kind === 'dragon');
    me.stats.maxHp = me.hp = 1e7;
    d.speed = 0;
    d.dcd = { breath: 99, lob: 99, sweep: 99, roar: 99, step: 9 };
    me.x = d.x; me.z = d.z + d.radius + 3;
    const before = [d.x, d.z];
    A.conn.send({ t: 'cast', s: 1, dx: 0, dz: -1, d: 7 });
    await new Promise((r) => setTimeout(r, 1500));
    return { сдвиг: Math.hypot(d.x - before[0], d.z - before[1]).toFixed(3), дистанция: Math.hypot(me.x - d.x, me.z - d.z).toFixed(2), радиус: d.radius };
  });
  console.log('рывок в дракона:', JSON.stringify(res));
  console.log('ошибки:', errs.length ? errs : 'нет');
  await browser.close();
})();
