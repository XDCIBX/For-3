// Ключевой арт без интерфейса: [Q=ultra] [T=мс] [NEAR=м] node keyart.cjs <имя> <WxH> <камера: x,y,z> <взгляд: x,y,z> [fov]
// Координаты камеры — относительно гнезда дракона (герои стоят на +z от дракона)
const { chromium } = require('playwright');
const [name, size, camS, lookS, fovS] = process.argv.slice(2);
const [W, H] = size.split('x').map(Number);
const cam = camS.split(',').map(Number);
const look = lookS.split(',').map(Number);
const fov = Number(fovS ?? 42);
// Q=ultra — качество графики (по умолчанию high); TMO — тайм-аут кадра в мс (ультра на программной графике — долго)
const QUAL = process.env.Q ?? 'high';
const TMO = Number(process.env.TMO) || 240000;
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, locale: 'en' });
  await ctx.addInitScript((q) => localStorage.setItem('three-heroes-settings', JSON.stringify({ name: 'Lyra', lang: 'en', quality: q, sound: false, music: false })), QUAL);
  const p = await ctx.newPage();
  p.setDefaultTimeout(TMO);
  p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await p.goto('http://localhost:5173/?shots=1&round=25', { waitUntil: 'domcontentloaded', timeout: TMO });
  await p.waitForSelector('#solo', { timeout: TMO });
  await p.click('#solo');
  await p.waitForTimeout(1500);
  await p.evaluate(() => {
    const A = window.__app;
    const g = A.conn.room.game;
    A.conn.send({ t: 'pick', cls: 'dwarf' });
    const bots = [...g.players.values()].filter((q) => q.bot);
    A.conn.send({ t: 'botcls', id: bots[0].id, cls: 'mage' });
    A.conn.send({ t: 'botcls', id: bots[1].id, cls: 'archer' });
    A.conn.send({ t: 'pick', cls: 'warrior' });
  });
  await p.waitForTimeout(500);
  await p.click('#ready');
  await p.waitForTimeout(300);
  await p.click('#start');
  await p.waitForFunction(() => [...window.__app.conn.room.game.mobs.values()].some((m) => m.kind === 'dragon' && m.spawnT <= 0), null, { timeout: 120000 });
  // Снаряжение, неподвижные герои лицом к дракону
  await p.evaluate(() => {
    const A = window.__app;
    const S = window.__shared;
    const g = A.conn.room.game;
    const gear = {
      warrior: ['sword', 'plate', 'helm', 'greaves', 'amulet', 'ring'],
      mage: ['staff', 'robe', 'hood', 'boots', 'amulet', 'ring'],
      archer: ['bow', 'leather', 'hood', 'boots', 'talisman', 'band'],
    };
    const rar = { warrior: 'relic', mage: 'legendary', archer: 'legendary' };
    const d = [...g.mobs.values()].find((m) => m.kind === 'dragon');
    window.__nest = { x: d.x, z: d.z };
    const slots = { warrior: [0, 0], mage: [-2.6, 0.9], archer: [2.6, 0.9] };
    for (const q of g.players.values()) {
      for (const t of gear[q.cls]) {
        const it = S.makeItem(S.TEMPLATE_BY_ID[t], rar[q.cls], 25);
        q.equip[it.slot] = it;
      }
      q.stats = S.computeStats(q.cls, q.equip);
      q.hp = q.stats.maxHp;
      q.bot = false;
      q.connected = true;
      q.input = { mx: 0, mz: 0 };
      const [ox, oz] = slots[q.cls];
      q.x = d.x + ox;
      q.z = d.z + 7.5 + oz;
      q.rot = Math.atan2(d.x - q.x, d.z - q.z);
      q.faceT = 99;
    }
    g.dirty = true;
    d.dcd = { breath: 99, lob: 99, sweep: 99, roar: 99, step: 9 };
    d.skill = null;
    d.windup = -1;
    d.hp = d.maxHp;
    window.__hold = setInterval(() => {
      for (const q of g.players.values()) q.hp = q.stats.maxHp;
      d.x = window.__nest.x;
      d.z = window.__nest.z;
    }, 30);
  });
  await p.addStyleTag({ content: '#ui { display: none !important; }' });
  await p.waitForTimeout(2500);
  // Скрываем подписи и полоски здоровья над головами, ставим камеру
  await p.evaluate(([cam, look, fov]) => {
    const A = window.__app;
    const e = A.engine;
    const n = window.__nest;
    e.cleanShot = true;
    e.camOverride = { pos: [n.x + cam[0], cam[1], n.z + cam[2]], look: [n.x + look[0], look[1], n.z + look[2]], fov };
    const hide = () => {
      for (const v of e.heroes.values()) {
        if (v.label) v.label.visible = false;
        v.bar.group.visible = false;
        // Кольца под ногами (метки и баффы) в постановочном кадре не нужны
        v.model.root.traverse((o) => {
          if (o.geometry && (o.geometry.type === 'RingGeometry' || o.geometry.parameters?.innerRadius !== undefined)) o.visible = false;
        });
      }
      for (const v of e.mobs.values()) if (v.bar) v.bar.group.visible = false;
      for (const z of e.zones.values()) z.obj.visible = false;
      if (e.selfRing) e.selfRing.visible = false;
    };
    hide();
    window.__hide = setInterval(hide, 30);
    // Дракон выдыхает огонь в сторону героев
    const g = A.conn.room.game;
    const d = [...g.mobs.values()].find((m) => m.kind === 'dragon');
    d.rot = Math.atan2(cam[0] * 0.35, cam[2]);
    d.dcd.breath = 0;
  }, [cam, look, fov]);
  console.log('камера', await p.evaluate(() => JSON.stringify(window.__app.engine.camOverride)), 'фаза', await p.evaluate(() => window.__app.conn.room.game.phase));
  // NEAR=метры: гасим светящиеся частицы ближе этого расстояния к камере — в «ультра» свечение (bloom)
  // превращает их в крупные размытые пятна по краям кадра
  const NEAR = Number(process.env.NEAR ?? 0);
  if (NEAR > 0)
    await p.evaluate((near) => {
      const e = window.__app.engine;
      const cull = () => {
        const c = e.camera.position;
        for (const pool of [e.fx.add, e.fx.norm]) {
          for (let i = 0; i < pool.life.length; i++) {
            if (pool.life[i] <= 0) continue;
            const dx = pool.pos[i * 3] - c.x, dy = pool.pos[i * 3 + 1] - c.y, dz = pool.pos[i * 3 + 2] - c.z;
            if (dx * dx + dy * dy + dz * dz < near * near) pool.life[i] = 0.0001;
          }
        }
      };
      window.__cull = setInterval(cull, 16);
    }, NEAR);
  await p.waitForTimeout(Number(process.env.T ?? 1500));
  await p.evaluate(() => (window.__app.conn.room.game.paused = true));
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${name}.png`, timeout: TMO });
  console.log('снято', name);
  await browser.close();
})();
