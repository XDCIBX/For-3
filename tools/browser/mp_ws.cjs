// Сетевой тест: 3 клиента, комната, игра с мусором и переподключением
const WebSocket = require('ws');
const URL = 'ws://localhost:8799';
const DUR = +(process.env.DUR ?? 150) * 1000;
const T0 = Date.now();
const log = (...a) => console.log(((Date.now() - T0) / 1000).toFixed(1) + 's', ...a);
const errs = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function connect(name, first) {
  const c = { name, snaps: 0, last: null, id: null, token: null, code: null, shop: [] };
  c.ws = new WebSocket(URL);
  c.ws.on('error', () => {});
  c.send = (o) => c.ws.readyState === 1 && c.ws.send(typeof o === 'string' ? o : JSON.stringify(o));
  c.welcome = new Promise((res) => {
    c.ws.on('message', (d) => {
      const m = JSON.parse(String(d));
      if (m.t === 'welcome') { Object.assign(c, { id: m.id, token: m.token, code: m.code }); res(c); }
      else if (m.t === 'err') errs.push(name + ': ' + m.msg);
      else if (m.t === 's') { c.snaps++; c.last = m; if (m.shop) c.shop = m.shop; }
    });
  });
  c.ws.on('open', () => c.send(first));
  return c;
}
(async () => {
  const A = connect('Аня', { t: 'create', name: 'Аня' });
  await A.welcome;
  log('комната', A.code);
  const B = connect('Боря', { t: 'join', code: A.code.toLowerCase(), name: 'Боря' });
  const C = connect('Вика', { t: 'join', code: A.code, name: '<b>Вика</b>' + 'x'.repeat(200) });
  await Promise.all([B.welcome, C.welcome]);
  const bad = connect('Чужой', { t: 'join', code: 'ZZZZ', name: 'x' });
  await sleep(300);
  let cl = [A, B, C];
  const cls = ['warrior', 'mage', 'werewolf'];
  cl.forEach((c, i) => c.send({ t: 'pick', cls: cls[i] }));
  // Мусор до старта
  for (const junk of ['не json', '[]', '123', 'null', '{"t":"__proto__"}', '{"t":"cast","s":"abc","dx":"x"}', '{"t":"create","name":"еще"}', '{"t":"kick","id":"' + B.id + '"}', '{"t":"pick","cls":"dragon"}', '{"t":"in","mx":1e308,"mz":-1e308}'])
    B.send(junk);
  await sleep(200);
  cl.forEach((c) => c.send({ t: 'ready', v: true }));
  await sleep(200);
  A.send({ t: 'start' });
  let rejoined = false;
  let lastPh = '';
  while (Date.now() - T0 < DUR) {
    await sleep(100);
    for (const c of cl) {
      const r = Math.random();
      if (r < 0.3) c.send({ t: 'in', mx: Math.random() * 2 - 1, mz: Math.random() * 2 - 1 });
      if (r < 0.25) c.send({ t: 'cast', s: (Math.random() * 4) | 0, dx: Math.random() * 2 - 1, dz: Math.random() * 2 - 1, d: Math.random() * 12 });
      if (c.last?.ph === 'tavern') {
        if (c.shop.length && Math.random() < 0.1) c.send({ t: 'buy', id: c.shop[0].id });
        if (Math.random() < 0.05) c.send({ t: 'ready', v: true });
      }
    }
    const s = A.last;
    if (s && s.ph + s.rd !== lastPh) { lastPh = s.ph + s.rd; log('фаза', s.ph, 'волна', s.rd, 'мобов', s.M.length, 'снимков A/B/C', A.snaps, B.snaps, C.snaps); }
    // Боря теряет связь и возвращается по токену
    if (!rejoined && Date.now() - T0 > DUR * 0.4) {
      rejoined = true;
      const tok = B.token, code = B.code;
      B.ws.terminate();
      await sleep(1500);
      const B2 = connect('Боря2', { t: 'rejoin', code, token: tok });
      await B2.welcome;
      log('Боря вернулся, id совпадает:', B2.id === B.id);
      cl = [A, B2, C];
    }
  }
  const health = await fetch('http://localhost:8799/health').then((r) => r.json()).catch(() => null);
  log('ошибки от сервера:', errs, 'здоровье:', health);
  const me = A.last.P.find((p) => p.id === A.id);
  log('итог: фаза', A.last.ph, 'волна', A.last.rd, 'Аня hp', me && me.hp);
  process.exit(0);
})();
