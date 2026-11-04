// Полный прогон 25 волн в браузере (dev-сервер): ошибки страницы, утечки памяти, FPS
const { chromium } = require('playwright');
(async () => {
  const CLS = process.argv[2] ?? 'warrior';
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info'] });
  const p = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  p.on('console', (m) => { if (m.text().startsWith('КЛИК')) console.log('   ' + m.text()); if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ' ' + m.text().slice(0, 200)); });
  await p.goto('http://localhost:5173/');
  await p.evaluate(() => document.addEventListener('click', (e) => { const t = e.target.closest && e.target.closest('button'); if (t) console.warn('КЛИК ' + (t.id || t.className) + ' ' + t.textContent.slice(0, 30)); }, true));
  await p.waitForTimeout(1500);
  await p.tap('#solo'); await p.waitForTimeout(800);
  await p.evaluate((c) => { const a = window.__app; a.conn.send({ t: 'pick', cls: c }); }, CLS);
  await p.waitForTimeout(300);
  await p.tap('#ready'); await p.waitForTimeout(300); await p.tap('#start');
  const T0 = Date.now();
  let lastR = 0, frames = 0, lastPh = '';
  const fpsStart = { t: Date.now(), f: 0 };
  await p.evaluate(() => { window.__frames = 0; const f = () => { window.__frames++; requestAnimationFrame(f); }; requestAnimationFrame(f); });
  while (Date.now() - T0 < 25 * 60 * 1000) {
    const st = await p.evaluate(() => {
      const a = window.__app;
      if (!a.conn) return { lost: true, screen: a.screen, ui: document.querySelector('#ui')?.innerText?.slice(0, 300) };
      const g = a.conn.room.game;
      const mem = a.engine.renderer.info.memory; const ren = a.engine.renderer.info.render;
      return { ph: g.phase, r: g.round, mobs: g.mobs.size, geo: mem.geometries, tex: mem.textures, prog: a.engine.renderer.info.programs?.length, calls: ren.calls, heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : 0, frames: window.__frames, res: g.result, dom: document.getElementsByTagName('*').length };
    });
    if (st.lost) { console.log('СЕССИЯ ПОТЕРЯНА', JSON.stringify(st)); await p.screenshot({ path: 'lost.png' }); break; }
    if (st.ph !== lastPh) console.log('  фаза', st.ph, 'волна', st.r, 't=' + ((Date.now() - T0) / 1000).toFixed(0) + 'с');
    if (st.ph === 'gameover') { console.log('КОНЕЦ', JSON.stringify(st.res)); break; }
    if (st.r !== lastR && (st.ph === 'battle' || st.ph === 'duel')) {
      const fps = ((st.frames - fpsStart.f) / ((Date.now() - fpsStart.t) / 1000)).toFixed(1);
      console.log(`волна ${st.r} ${st.ph}: геометрий ${st.geo} текстур ${st.tex} шейдеров ${st.prog} вызовов ${st.calls} heap ${st.heap}МБ DOM ${st.dom} fps(пред.) ${fps} t=${((Date.now() - T0) / 1000).toFixed(0)}с`);
      fpsStart.t = Date.now(); fpsStart.f = st.frames; lastR = st.r;
      await p.screenshot({ path: `run_${CLS}_${st.r}.png` });
    }
    // Управление: джойстик и кнопки умений касаниями
    if (st.ph === 'battle' || st.ph === 'duel') {
      const x = 120 + Math.random() * 60, y = 290 + Math.random() * 40;
      await p.touchscreen.tap(x, y).catch(() => {});
      for (const s of ['.sk.s0', '.sk.s1', '.sk.s2', '.sk.s3']) if (Math.random() < 0.4) { const b = await p.$(s); const bb = b && await b.boundingBox(); if (bb) await p.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); }
      // Ускоряем: через пару секунд боя добиваем мобов (кроме дракона — его ранят частями)
      await p.evaluate(() => {
        if (!window.__app.conn) return;
        const g = window.__app.conn.room.game;
        for (const m of g.mobs.values()) { if (m.spawnT > 0) continue; if (m.kind === 'dragon') g.damageMob(m, m.maxHp * 0.06, false, null); else if (Math.random() < 0.3) g.damageMob(m, 1e9, false, null); }
        if (g.phase === 'duel') for (const q of g.players.values()) if (q.bot && Math.random() < 0.2) g.damagePlayer(q, 60, false, null);
      });
    }
    if (st.ph === 'tavern' && lastPh !== 'tavern') {
      await p.waitForTimeout(1500);
      const cards = await p.$$('.item');
      for (const c of cards.slice(0, 2)) { await c.tap().catch(() => {}); await p.waitForTimeout(200); }
      await p.tap('#tready').catch(() => {});
    }
    lastPh = st.ph;
    await p.waitForTimeout(400);
  }
  console.log('ошибки:', errs.length ? errs.slice(0, 15) : 'нет');
  await browser.close();
})();
