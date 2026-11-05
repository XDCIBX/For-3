const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info'] });
  const p = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ' ' + m.text().slice(0, 200)); });
  const info = () => p.evaluate(() => { const a = window.__app; const mem = a.engine.renderer.info.memory; const g = a.conn?.room.game; return `экран ${a.screen} фаза ${g?.phase} волна ${g?.round} геом ${mem.geometries} текстур ${mem.textures} heap ${Math.round(performance.memory.usedJSHeapSize / 1e6)}МБ`; });
  const finishWave = async (until) => {
    for (let i = 0; i < 120; i++) {
      const ph = await p.evaluate(() => window.__app.conn.room.game.phase);
      if (until(ph)) return ph;
      await p.evaluate(() => { const g = window.__app.conn.room.game; g.spawnQueue = []; for (const m of g.mobs.values()) g.damageMob(m, 1e9, false, null); if (g.phase === 'tavern') g.timer = Math.min(g.timer, 0.1); });
      await p.waitForTimeout(400);
    }
  };
  await p.goto('http://localhost:5173/?round=2');
  await p.waitForTimeout(1500);
  for (let game = 0; game < 3; game++) {
    await p.tap('#solo'); await p.waitForTimeout(800);
    await p.tap('#ready'); await p.waitForTimeout(300); await p.tap('#start'); await p.waitForTimeout(1200);
    console.log('игра', game, 'старт:', await info());
    for (let w = 0; w < 3; w++) {
      await finishWave((ph) => ph === 'tavern');
      await p.waitForTimeout(800);
      const cards = await p.$$('.item');
      for (const c of cards.slice(0, 2)) { await c.tap().catch(() => {}); await p.waitForTimeout(200); }
      await finishWave((ph) => ph === 'battle' || ph === 'duel');
      console.log('   после таверны:', await info());
    }
    await p.screenshot({ path: `cycle_${game}.png` });
    // Выход через меню паузы: первое нажатие — подтверждение, второе — выход
    await p.tap('#pause'); await p.waitForTimeout(400);
    // У хоста ❚❚ ставит паузу — меню открывается кнопкой на затемнении
    if (await p.$('.pause-ov #pmenu')) { await p.tap('.pause-ov #pmenu'); await p.waitForTimeout(400); }
    const ex = await p.$('.modal .btn.red');
    await ex.tap(); await p.waitForTimeout(300);
    console.log('   после 1-го нажатия выхода:', await p.evaluate(() => window.__app.screen), await ex.textContent());
    await ex.tap(); await p.waitForTimeout(1500);
    console.log('   после 2-го:', await info());
    // Без перезагрузки страницы — следующая игра в той же вкладке
    if (game < 2) { await p.evaluate((r) => history.replaceState(null, '', '/?round=' + r), game === 0 ? 21 : 2); }
  }
  console.log('ошибки:', errs.length ? errs : 'нет');
  await browser.close();
})();
