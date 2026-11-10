// node leaks.cjs <класс> <с волны> <до волны> — кто копит геометрии и текстуры между волнами.
// Каждая созданная геометрия/текстура запоминается с местом создания; после dispose() забывается.
// В конце — живые объекты, созданные после первой контрольной волны, по местам создания.
const { chromium } = require('playwright');
(async () => {
  const [cls = 'summoner', from = '6', to = '12'] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--expose-gc'] });
  const p = await b.newPage({ viewport: { width: 844, height: 390 } });
  p.setDefaultTimeout(240000);
  p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await p.goto(`http://localhost:5173/?round=${from}`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#solo');
  await p.evaluate(() => {
    const T = window.__THREE;
    const live = (window.__live = new Map());
    let seq = 0;
    for (const [name, C] of [['geo', T.BufferGeometry], ['tex', T.Texture]]) {
      const store = new WeakMap();
      Object.defineProperty(C.prototype, 'uuid', {
        configurable: true,
        get() { return store.get(this); },
        set(v) {
          store.set(this, v);
          const stack = new Error().stack.split('\n').slice(2).filter((l) => !/three\.(module|core)|node_modules/.test(l)).slice(0, 4)
            .map((l) => l.trim().replace(/^at /, '').replace(/https?:\/\/[^/]+\/src\//, '').replace(/\?t=\d+/, '')).join(' < ');
          const id = ++seq;
          live.set(id, { name, stack, ref: new WeakRef(this), gen: window.__gen || 0 });
          this.addEventListener('dispose', () => live.delete(id));
        },
      });
    }
  });
  await p.click('#solo'); await p.waitForTimeout(800);
  await p.evaluate((c) => window.__app.conn.send({ t: 'pick', cls: c }), cls);
  await p.click('#ready'); await p.waitForTimeout(300); await p.click('#start');
  let marked = false, last = 0;
  for (;;) {
    const st = await p.evaluate(() => {
      const g = window.__app.conn.room.game;
      if (g.phase === 'battle' || g.phase === 'duel') {
        for (const m of g.mobs.values()) if (m.spawnT <= 0 && Math.random() < 0.3) g.damageMob(m, 1e9, false, null);
        if (g.phase === 'duel') for (const q of g.players.values()) if (q.bot && Math.random() < 0.2) g.damagePlayer(q, 60, false, null);
        for (const q of g.players.values()) if (!q.bot) q.hp = q.stats.maxHp;
      }
      const mem = window.__app.engine.renderer.info.memory;
      return { ph: g.phase, r: g.round, geo: mem.geometries, tex: mem.textures };
    });
    if (st.ph === 'tavern') {
      const cards = await p.$$('.item');
      for (const c of cards.slice(0, 2)) await c.click().catch(() => {});
      await p.click('#tready').catch(() => {});
    }
    if (st.r !== last && st.ph === 'battle') { last = st.r; console.log('волна', st.r, 'геометрий', st.geo, 'текстур', st.tex); }
    if (!marked && st.r >= +from + 1 && st.ph === 'battle') { marked = true; await p.evaluate(() => (window.__gen = 1)); console.log('— отметка —'); }
    if ((st.r >= +to && st.ph === 'battle') || st.ph === 'gameover') break;
    await p.waitForTimeout(500);
  }
  const rep = await p.evaluate(() => {
    if (window.gc) window.gc();
    const by = {};
    for (const v of window.__live.values()) {
      if (v.gen !== 1 || !v.ref.deref()) continue;
      const k = v.name + ' ' + v.stack;
      by[k] = (by[k] || 0) + 1;
    }
    return Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 25);
  });
  console.log('Живые объекты, созданные после отметки (без dispose):');
  for (const [k, n] of rep) console.log(String(n).padStart(5), k.slice(0, 330));
  await b.close();
})();
