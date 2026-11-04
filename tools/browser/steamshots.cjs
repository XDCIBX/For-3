// Постановочные скриншоты для Steam: node steamshots.cjs <сцена> [WxH]
const { chromium } = require('playwright');
const scene = process.argv[2];
const [W, H] = (process.argv[3] ?? '1920x1080').split('x').map(Number);
const LANG = process.env.LANG_UI ?? 'en';
const ROUND = { island: 9, troll: 4, tavern: 18, duel: 5, lair: 22, dragon: 25, dragon2: 25, lobby: 1, menu: 1 }[scene];
const CLS = {
  island: ['mage', 'warrior', 'archer'],
  troll: ['werewolf', 'dwarf', 'summoner'],
  tavern: ['warrior', 'mage', 'archer'],
  duel: ['hunter', 'mage', 'warrior'],
  lair: ['dwarf', 'warrior', 'mage'],
  dragon: ['archer', 'warrior', 'summoner'],
  dragon2: ['mage', 'werewolf', 'hunter'],
  lobby: ['mage', 'warrior', 'archer'],
  menu: ['warrior', 'mage', 'archer'],
}[scene];
const NAMES = ['Lyra', 'Bram', 'Kestrel'];

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, locale: LANG });
  await ctx.addInitScript(([lang, name, QUAL]) => {
    localStorage.setItem('three-heroes-settings', JSON.stringify({ name, lang, quality: QUAL, sound: false, music: false, haptics: false }));
  }, [LANG, NAMES[0], process.env.Q ?? 'high']);
  const p = await ctx.newPage();
  p.setDefaultTimeout(180000);
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  await p.goto(`http://localhost:5173/?shots=1&round=${ROUND}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await p.waitForSelector('#solo', { timeout: 180000 });
  const wait = (ms) => p.waitForTimeout(ms);
  const shot = async (name) => {
    await p.screenshot({ path: `steam_${name}_${W}x${H}${LANG === 'en' ? '' : '_' + LANG}.png`, timeout: 180000 });
    console.log('снято', name);
  };
  if (scene === 'menu') {
    await wait(4000);
    await shot('menu');
    return browser.close();
  }
  await p.click('#solo');
  await wait(1500);
  // Классы: свой и ботов, имена напарников
  await p.evaluate(([cls, names]) => {
    const A = window.__app;
    const g = A.conn.room.game;
    // Сначала освобождаем нужные классы: себе — временный, ботам — их, затем себе нужный
    const spare = ['warrior', 'mage', 'archer', 'hunter', 'summoner', 'werewolf', 'dwarf'].filter((c) => !cls.includes(c));
    A.conn.send({ t: 'pick', cls: spare[0] });
    const bots = [...g.players.values()].filter((q) => q.bot);
    bots.forEach((b, i) => A.conn.send({ t: 'botcls', id: b.id, cls: spare[i + 1] }));
    bots.forEach((b, i) => {
      A.conn.send({ t: 'botcls', id: b.id, cls: cls[i + 1] });
      b.name = names[i + 1];
    });
    A.conn.send({ t: 'pick', cls: cls[0] });
  }, [CLS, NAMES]);
  await wait(800);
  if (scene === 'lobby') {
    await p.evaluate(() => [...document.querySelectorAll('.cls-card')][1].click());
    await wait(2500);
    await shot('lobby');
    return browser.close();
  }
  await p.click('#ready');
  await wait(300);
  await p.click('#start');
  // Снаряжение под этап игры; герои не умирают во время съёмки
  await p.evaluate(([round]) => {
    const A = window.__app;
    const S = window.__shared;
    const g = A.conn.room.game;
    const weapon = { warrior: 'sword', mage: 'staff', archer: 'bow', hunter: 'warblades', summoner: 'totemstaff', werewolf: 'claws', dwarf: 'blunderbuss' };
    const armor = { warrior: 'plate', mage: 'robe', archer: 'leather', hunter: 'leather', summoner: 'robe', werewolf: 'leather', dwarf: 'plate' };
    const rar = round >= 20 ? ['legendary', 'relic', 'epic'] : round >= 12 ? ['epic', 'legendary', 'rare'] : round >= 6 ? ['rare', 'epic', 'rare'] : ['common', 'rare', 'common'];
    let i = 0;
    for (const q of g.players.values()) {
      const r = rar[i++ % rar.length];
      const set = [weapon[q.cls], armor[q.cls], i % 2 ? 'helm' : 'hood', i % 2 ? 'greaves' : 'boots', 'amulet', 'ring'];
      if (round > 2) for (const t of set) {
        const it = S.makeItem(S.TEMPLATE_BY_ID[t], r, round);
        q.equip[it.slot] = it;
      }
      q.stats = S.computeStats(q.cls, q.equip);
      q.hp = q.stats.maxHp;
      q.gold = 180 + round * 22;
    }
    g.dirty = true;
    setInterval(() => {
      const floor = g.phase === 'duel' ? 0.7 : 0.82;
      for (const q of g.players.values()) if (q.alive) q.hp = Math.max(q.hp, q.stats.maxHp * floor);
    }, g.phase === 'duel' || round === 5 ? 50 : 250);
  }, [ROUND]);
  const phase = () => p.evaluate(() => window.__app.conn.room.game.phase);
  const until = async (f, ms = 60000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (await f()) return true;
      await wait(400);
    }
    return false;
  };
  await until(async () => (await phase()) === 'battle' || (await phase()) === 'duel_intro', 30000);
  // Мобы вокруг героя
  const spawnAround = (kinds, r0, r1) =>
    p.evaluate(([kinds, r0, r1]) => {
      const A = window.__app;
      const g = A.conn.room.game;
      const me = g.players.get(A.st.myId);
      kinds.forEach((k, i) => {
        const a = (i / kinds.length) * Math.PI * 2 + 0.3;
        const r = r0 + ((i * 37) % 10) / 10 * (r1 - r0);
        g.spawnMob(k, me.x + Math.sin(a) * r, me.z - Math.cos(a) * r * 0.8 - 1.5);
      });
    }, [kinds, r0, r1]);
  // Умение героя в сторону ближайшей толпы
  const cast = (s, distMul = 1) =>
    p.evaluate(([s, distMul]) => {
      const A = window.__app;
      const g = A.conn.room.game;
      const me = g.players.get(A.st.myId);
      const mobs = [...g.mobs.values()].filter((m) => m.spawnT <= 0);
      let best = null;
      let bd = 1e9;
      for (const m of mobs) {
        const d = Math.hypot(m.x - me.x, m.z - me.z);
        if (d < bd) {
          bd = d;
          best = m;
        }
      }
      if (!best) return A.conn.send({ t: 'cast', s, dx: 0, dz: -1, d: 6 });
      const dx = best.x - me.x;
      const dz = best.z - me.z;
      const d = Math.hypot(dx, dz) || 1;
      A.conn.send({ t: 'cast', s, dx: dx / d, dz: dz / d, d: d * distMul });
    }, [s, distMul]);
  // Мобы живут дольше, чтобы попасть в кадр
  const toughen = (k) => p.evaluate((k) => {
    for (const m of window.__app.conn.room.game.mobs.values()) if (m.kind !== 'troll' && m.kind !== 'dragon') {
      m.maxHp *= k;
      m.hp = m.maxHp;
    }
  }, k);
  const clearMobs = () => p.evaluate(() => {
    const g = window.__app.conn.room.game;
    g.spawnQueue = [];
    for (const m of [...g.mobs.values()]) g.mobs.delete(m.id);
  });

  if (scene === 'island') {
    await wait(4000);
    await spawnAround(['orc', 'goblin', 'goblin', 'skeleton', 'orc', 'goblin', 'slime', 'goblin', 'orc', 'skeleton', 'goblin', 'slime'], 6, 9);
    await toughen(4);
    await wait(3500);
    await cast(1);
    await wait(700);
    await cast(0);
    await wait(300);
    await shot('island');
  } else if (scene === 'troll') {
    await until(async () => p.evaluate(() => [...window.__app.conn.room.game.mobs.values()].some((m) => m.kind === 'troll')), 40000);
    await p.evaluate(() => {
      const A = window.__app;
      const g = A.conn.room.game;
      const me = g.players.get(A.st.myId);
      const t = [...g.mobs.values()].find((m) => m.kind === 'troll');
      t.x = me.x + 2.5;
      t.z = me.z - 4.5;
      t.spawnT = 0;
    });
    await spawnAround(['goblin', 'orc', 'goblin', 'slime', 'goblin', 'skeleton'], 7, 10);
    await toughen(3);
    await wait(4000);
    await cast(3);
    await wait(1200);
    await cast(2);
    await wait(600);
    await cast(0);
    await wait(200);
    await shot('troll');
  } else if (scene === 'tavern') {
    await wait(1500);
    await clearMobs();
    await until(async () => (await phase()) === 'tavern', 40000);
    await p.evaluate(() => {
      const A = window.__app;
      const S = window.__shared;
      const g = A.conn.room.game;
      const me = g.players.get(A.st.myId);
      g.shop = S.generateShop(g.rng, 23, [...g.players.values()].map((q) => q.cls));
      me.gold = 2600;
      g.dirty = true;
    });
    await wait(16000);
    // Наведение на товар — прогноз характеристик
    await p.hover('.items .item:nth-child(2)');
    await wait(1500);
    await shot('tavern');
  } else if (scene === 'duel') {
    // Ждём свою дуэль; чужие заканчиваем быстрее
    await until(async () => {
      return p.evaluate(() => {
        const A = window.__app;
        const g = A.conn.room.game;
        const d = g.duels?.[g.duelIdx];
        const mine = d && d.includes(A.st.myId);
        if (g.phase === 'duel' && !mine) g.endDuel(d[0]);
        return g.phase === 'duel' && mine;
      });
    }, 120000);
    await wait(2500);
    console.log('дуэль', await p.evaluate(() => { const g = window.__app.conn.room.game; return g.duelIdx + ' ' + g.duels[g.duelIdx].join('-') + ' я ' + window.__app.st.myId; }));
    await p.evaluate(() => {
      const A = window.__app;
      const g = A.conn.room.game;
      const d = g.duels[g.duelIdx];
      const me = g.players.get(A.st.myId);
      const foe = g.players.get(d.find((id) => id !== A.st.myId));
      foe.x = me.x + 1.5;
      foe.z = me.z - 4.2;
    });
    const castFoe = (s) => p.evaluate((s) => {
      const A = window.__app;
      const g = A.conn.room.game;
      const d = g.duels[g.duelIdx];
      const me = g.players.get(A.st.myId);
      const foe = g.players.get(d.find((id) => id !== A.st.myId));
      const dx = foe.x - me.x;
      const dz = foe.z - me.z;
      const l = Math.hypot(dx, dz);
      A.conn.send({ t: 'cast', s, dx: dx / l, dz: dz / l, d: l });
    }, s);
    await castFoe(3);
    await wait(600);
    await castFoe(2);
    await wait(700);
    await castFoe(0);
    await wait(150);
    await shot('duel');
    console.log('после снимка', await p.evaluate(() => { const g = window.__app.conn.room.game; return g.phase + ' ' + g.duelIdx; }));
  } else if (scene === 'lair') {
    await wait(1500);
    await clearMobs();
    await spawnAround(['drake', 'spitter', 'ember', 'drake', 'drake', 'spitter', 'ember', 'drake', 'ember', 'spitter', 'drake'], 7, 10);
    await toughen(3);
    await wait(4000);
    await cast(1, 1);
    await wait(700);
    await cast(2, 0.5);
    await wait(900);
    await cast(0);
    await wait(250);
    await shot('lair');
  } else if (scene === 'dragon' || scene === 'dragon2') {
    await until(async () => p.evaluate(() => [...window.__app.conn.room.game.mobs.values()].some((m) => m.kind === 'dragon' && m.spawnT <= 0)), 40000);
    await p.evaluate((breath) => {
      const A = window.__app;
      const g = A.conn.room.game;
      const me = g.players.get(A.st.myId);
      const d = [...g.mobs.values()].find((m) => m.kind === 'dragon');
      // Герои — перед мордой дракона, дракон смотрит на них
      d.x = me.x + 0.5;
      d.z = me.z - 6.2;
      d.rot = Math.atan2(me.x - d.x, me.z - d.z);
      d.dcd = { breath: 99, lob: 99, sweep: 99, roar: 99, step: 9 };
      d.skill = null;
      d.windup = -1;
      d.hp = d.maxHp * (breath ? 0.72 : 0.38);
      let i = 0;
      for (const q of g.players.values()) {
        if (q.id === me.id) continue;
        q.x = me.x + (i ? 3.4 : -3.4);
        q.z = me.z + (i ? 0.6 : -0.4);
        i++;
      }
    }, scene === 'dragon');
    if (scene === 'dragon2') {
      await spawnAround(['drake', 'ember', 'drake', 'spitter'], 7, 9);
      await toughen(3);
    }
    await wait(1500);
    // Дракон замирает на месте и начинает умение
    await p.evaluate((breath) => {
      const A = window.__app;
      const g = A.conn.room.game;
      const me = g.players.get(A.st.myId);
      const d = [...g.mobs.values()].find((m) => m.kind === 'dragon');
      d.x = me.x + 0.5;
      d.z = me.z - 6.2;
      d.rot = Math.atan2(me.x - d.x, me.z - d.z);
      d.skill = null;
      d.windup = -1;
      d.dcd = breath ? { breath: 0, lob: 99, sweep: 99, roar: 99, step: 9 } : { breath: 99, lob: 0, sweep: 99, roar: 99, step: 9 };
    }, scene === 'dragon');
    if (scene === 'dragon2') {
      await wait(500);
      await cast(1, 0.9);
    }
    await wait(scene === 'dragon' ? 1600 : 1000);
    await cast(0);
    await wait(150);
    await shot(scene);
  }
  if (errs.length) console.log('ошибки:', errs);
  await browser.close();
})();
