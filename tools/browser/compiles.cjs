// node compiles.cjs <quality> <round> — сколько раз компилируются шейдеры в бою и кто их вызывает
const { chromium } = require('playwright');
(async () => {
  const [q, round] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript((q) => {
    localStorage.setItem('three-heroes-settings', JSON.stringify({ name: 'Lyra', lang: 'en', quality: q, sound: false, music: false }));
    window.__links = [];
    for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) {
      const orig = C.prototype.linkProgram;
      C.prototype.linkProgram = function (p) { if (window.__track) window.__links.push(new Error().stack.split('\n').slice(2, 9).map((s) => s.trim().replace(/\?t=\d+|\?v=[0-9a-f]+/g, '').replace(/http:\/\/localhost:5173\//, '')).join(' < ')); return orig.call(this, p); };
    }
  }, q);
  const p = await ctx.newPage();
  p.setDefaultTimeout(240000);
  await p.goto(`http://localhost:5173/?round=${round}`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#solo');
  await p.click('#solo'); await p.waitForTimeout(1200); await p.evaluate(() => { window.__track = true; window.__p0 = window.__app.engine.renderer.info.programs.length; });
  await p.click('#ready'); await p.waitForTimeout(300); await p.click('#start');
  await p.waitForFunction(() => { const g = window.__app.conn.room.game; return g.phase === 'battle' && g.mobs.size >= 8; }, null, { timeout: 200000 });
  await p.evaluate(() => { for (const pl of window.__app.conn.room.game.players.values()) pl.hp = pl.stats.maxHp = 1e9; });
  await p.evaluate(() => { window.__tBattle = window.__links.length; });
  await p.waitForTimeout(30000);
  const r = await p.evaluate(() => ({ links: window.__links.slice(window.__tBattle), before: window.__tBattle, progs0: window.__p0, progs1: window.__app.engine.renderer.info.programs.length }));
  console.log(`${q} r${round}: до боя ${r.before}, в первые 30 с боя: ${r.links.length}, программ было ${r.progs0} → стало ${r.progs1}`);
  const by = new Map();
  for (const s of r.links) { const k = s.split(' < ').filter((x) => !/chunk-|three/.test(x)).slice(0, 2).join(' < ') || s.slice(0, 200); by.set(k, (by.get(k) ?? 0) + 1); }
  for (const [k, n] of [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(String(n).padStart(4), k.slice(0, 260));
  await b.close();
})();
