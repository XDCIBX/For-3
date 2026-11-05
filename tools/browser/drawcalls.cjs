// node breakdown.cjs <quality> <round> — видимые меши (≈ отрисовки основного прохода) по владельцам
const { chromium } = require('playwright');
(async () => {
  const [q, round] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript((q) => localStorage.setItem('three-heroes-settings', JSON.stringify({ name: 'Lyra', lang: 'en', quality: q, sound: false, music: false })), q);
  const p = await ctx.newPage();
  p.setDefaultTimeout(240000);
  await p.goto(`http://localhost:5173/?round=${round}`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#solo');
  await p.click('#solo'); await p.waitForTimeout(1200);
  await p.click('#ready'); await p.waitForTimeout(300); await p.click('#start');
  await p.waitForFunction(() => { const g = window.__app.conn.room.game; return g.phase === 'battle' && g.mobs.size >= 8; }, null, { timeout: 200000 });
  await p.waitForTimeout(6000);
  const r = await p.evaluate(() => {
    const e = window.__app.engine, ri = e.renderer.info;
    // Отрисовки основного прохода при скрытых группах объектов: разница — их доля
    const calls = () => { ri.autoReset = false; ri.reset(); e.renderer.render(e.stage.scene, e.camera); const c = { calls: ri.render.calls, tris: ri.render.triangles }; ri.autoReset = true; return c; };
    const sets = { mobs: [...e.mobs.values()].map((v) => v.model.root), heroes: [...e.heroes.values()].map((v) => v.model.root), minions: [...e.minions.values()].map((v) => v.model.root) };
    const all = calls();
    const out = { all, mobCount: e.mobs.size };
    for (const [k, list] of Object.entries(sets)) {
      const was = list.map((o) => o.visible);
      list.forEach((o) => (o.visible = false));
      const c = calls();
      list.forEach((o, i) => (o.visible = was[i]));
      out[k] = { calls: all.calls - c.calls, tris: all.tris - c.tris };
    }
    out.perMob = out.mobs.calls / Math.max(1, e.mobs.size);
    return out;
  });
  console.log(q, round, JSON.stringify(r));
  await b.close();
})();
