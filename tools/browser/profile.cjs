// node prof.cjs <quality> <round> — профиль JS в бою: функции с наибольшим собственным временем
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
  await p.evaluate(() => { for (const pl of window.__app.conn.room.game.players.values()) pl.hp = pl.stats.maxHp = 1e9; });
  await p.waitForTimeout(4000);
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start');
  await p.waitForTimeout(15000);
  const { profile } = await cdp.send('Profiler.stop');
  const self = new Map();
  const dt = profile.timeDeltas;
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const t = new Map();
  for (let i = 0; i < profile.samples.length; i++) t.set(profile.samples[i], (t.get(profile.samples[i]) ?? 0) + (dt[i] ?? 0));
  let total = 0;
  for (const [id, us] of t) {
    const n = byId.get(id); const f = n.callFrame;
    const key = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + us); total += us;
  }
  const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 28);
  console.log(`всего ${(total / 1000).toFixed(0)} мс`);
  for (const [k, us] of top) console.log(((us / total) * 100).toFixed(1).padStart(5) + '%  ' + k);
  await b.close();
})();
