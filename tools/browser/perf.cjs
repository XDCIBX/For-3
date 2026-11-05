// node perf.cjs <quality> <round> [WxH] — нагрузка кадра в бою: JS, подготовка отрисовки, отрисовки, треугольники
const { chromium } = require('playwright');
(async () => {
  const [q, round, size = '1280x720'] = process.argv.slice(2);
  const [W, H] = size.split('x').map(Number);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: W, height: H } });
  await ctx.addInitScript((q) => localStorage.setItem('three-heroes-settings', JSON.stringify({ name: 'Lyra', lang: 'en', quality: q, sound: false, music: false })), q);
  const p = await ctx.newPage();
  p.setDefaultTimeout(240000);
  p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await p.goto(`http://localhost:5173/?round=${round}`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#solo');
  await p.click('#solo'); await p.waitForTimeout(1200);
  await p.click('#ready'); await p.waitForTimeout(300); await p.click('#start');
  // Ждём бой с толпой мобов (симуляция идёт в реальном времени)
  await p.waitForFunction(() => { const g = window.__app.conn.room.game; return g.phase === 'battle' && g.mobs.size >= 8; }, null, { timeout: 200000 });
  await p.waitForTimeout(8000);
  const r = await p.evaluate(async () => {
    const A = window.__app, e = A.engine, ri = e.renderer.info;
    // Неуязвимые герои, чтобы бой не кончился во время замера
    for (const pl of A.conn.room.game.players.values()) { pl.hp = pl.stats.maxHp = 1e9; }
    const origRender = e.renderer.render.bind(e.renderer);
    let rt = 0;
    e.renderer.render = (s, c) => { const t0 = performance.now(); origRender(s, c); rt += performance.now() - t0; };
    const origFrame = A.frame.bind(A);
    const frames = [];
    A.frame = (t) => { rt = 0; ri.autoReset = false; ri.reset(); const t0 = performance.now(); origFrame(t); frames.push({ js: performance.now() - t0, rt, calls: ri.render.calls, tris: ri.render.triangles }); ri.autoReset = true; };
    await new Promise((res) => setTimeout(res, 12000));
    A.frame = origFrame;
    const f = frames.slice(2);
    const avg = (k) => f.reduce((a, x) => a + x[k], 0) / f.length;
    const med = (k) => { const v = f.map((x) => x[k]).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
    const g = A.conn.room.game;
    return { frames: f.length, jsMed: med('js').toFixed(1), renderMed: med('rt').toFixed(1), jsOther: (med('js') - med('rt')).toFixed(1), calls: Math.round(avg('calls')), tris: Math.round(avg('tris')), mobs: g.mobs.size, geo: ri.memory.geometries, tex: ri.memory.textures, progs: ri.programs.length };
  });
  console.log(`${q} r${round} ${size}`, JSON.stringify(r));
  await b.close();
})();
