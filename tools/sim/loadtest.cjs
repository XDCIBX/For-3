// Нагрузочный тест настоящего сервера: ROOMS комнат по 3 сетевых игрока, которые бегают и жмут умения.
// Меряет процессор серверного процесса (вместе с потоками сжатия), отправленный трафик и задержку тиков.
//   node tools/sim/loadtest.cjs <pid сервера> [адрес]    ROOMS=60 DUR=60 (секунд)
// Сервер запускать отдельно: PORT=8799 node server/dist/server.mjs
const fs = require('fs');
const WebSocket = require('ws');
const zlib = require('zlib');
// LEGACY=1 — клиенты старого формата (полные снимки текстом, permessage-deflate)
const LEGACY = process.env.LEGACY === '1';
const [pid, URL = 'ws://localhost:8799'] = process.argv.slice(2);
const ROOMS = +(process.env.ROOMS ?? 60);
const DUR = +(process.env.DUR ?? 60) * 1000;
const CLS = ['warrior', 'mage', 'archer', 'hunter', 'summoner', 'werewolf', 'dwarf'];
let seed = 7;
const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
const cpu = () => { const f = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' '); return (+f[11] + +f[12]) / 100; };
const rss = () => +fs.readFileSync(`/proc/${pid}/status`, 'utf8').match(/VmRSS:\s+(\d+)/)[1] / 1024;
let msgs = 0, bytes = 0, gaps = [], errors = 0, pings = [];
const phases = {};
function client(first, onWelcome) {
  const ws = new WebSocket(URL, { perMessageDeflate: true });
  const c = { ws, id: null, code: null, last: 0, ph: '', prev: null };
  ws.on('error', () => errors++);
  ws.on('open', () => ws.send(JSON.stringify(LEGACY ? first : { ...first, z: 1 })));
  ws.on('message', (d, isBinary) => {
    bytes += d.length;
    let m;
    if (isBinary) {
      if (d[0] === 1 && !c.prev) { errors++; return; }
      const text = zlib.inflateRawSync(d.subarray(1), d[0] === 1 ? { dictionary: c.prev } : {});
      c.prev = text;
      m = JSON.parse(text.toString());
    } else m = JSON.parse(String(d));
    if (m.t === 'pong') { pings.push(performance.now() - m.c); return; }
    if (m.t === 'welcome') { c.id = m.id; c.code = m.code; onWelcome?.(c); return; }
    if (m.t !== 's') return;
    msgs++;
    const now = Date.now();
    if (c.last) gaps.push(now - c.last);
    c.last = now;
    c.ph = m.ph;
  });
  c.send = (o) => ws.readyState === 1 && ws.send(JSON.stringify(o));
  return c;
}
const all = [];
async function room(i) {
  const host = await new Promise((res) => client({ t: 'create', name: 'H' + i }, res));
  const others = await Promise.all([1, 2].map((k) => new Promise((res) => client({ t: 'join', code: host.code, name: `P${i}_${k}` }, res))));
  const team = [host, ...others];
  team.forEach((c, k) => { c.send({ t: 'pick', cls: CLS[(i + k * 3) % 7] }); c.send({ t: 'ready', v: true }); });
  await new Promise((r) => setTimeout(r, 300));
  host.send({ t: 'start' });
  all.push(...team);
}
(async () => {
  for (let i = 0; i < ROOMS; i++) await room(i);
  console.log(`комнат ${ROOMS}, клиентов ${all.length}; разогрев 5 с`);
  // Игроки: каждые 100 мс — движение, иногда умение, в таверне — «готов»
  const act = setInterval(() => {
    for (const c of all) {
      const a = rnd() * Math.PI * 2;
      if (rnd() < 0.5) c.send({ t: 'in', mx: Math.cos(a), mz: Math.sin(a) });
      if (rnd() < 0.3) c.send({ t: 'cast', s: (rnd() * 4) | 0, dx: Math.cos(a), dz: Math.sin(a), d: 4 + rnd() * 6 });
      if (c.ph === 'tavern' && rnd() < 0.05) c.send({ t: 'ready', v: true });
      // Пинг: задержка ответа сервера (пока поток занят тиками, сообщения ждут)
      if (rnd() < 0.1) c.send({ t: 'ping', c: performance.now() });
    }
  }, 100);
  await new Promise((r) => setTimeout(r, 5000));
  const c0 = cpu(), t0 = Date.now(); msgs = 0; bytes = 0; gaps = []; pings = [];
  await new Promise((r) => setTimeout(r, DUR));
  const sec = (Date.now() - t0) / 1000, used = cpu() - c0;
  for (const c of all) phases[c.ph] = (phases[c.ph] ?? 0) + 1;
  gaps.sort((a, b) => a - b);
  const q = (p) => gaps[Math.floor(gaps.length * p)] ?? 0;
  console.log(`процессор сервера: ${(used / sec * 100).toFixed(1)} % одного ядра → ${(used / sec / ROOMS * 1000).toFixed(2)} мс процессора на комнату в секунду`);
  console.log(`оценка: одно ядро ≈ ${Math.floor(ROOMS / (used / sec))} комнат (${Math.floor(ROOMS / (used / sec)) * 3} игроков)`);
  console.log(`трафик к игрокам: ${(bytes / sec / 1024).toFixed(0)} КБ/с всего, ${(bytes / sec / all.length / 1024).toFixed(1)} КБ/с на игрока; снимков ${(msgs / sec / all.length).toFixed(1)}/с на игрока`);
  console.log(`интервал между снимками: медиана ${q(0.5)} мс, 99 % ${q(0.99)} мс, макс ${gaps.at(-1)} мс; память сервера ${rss().toFixed(0)} МБ; ошибок ${errors}`);
  pings.sort((a, b) => a - b);
  const pq = (p) => (pings[Math.floor(pings.length * p)] ?? 0).toFixed(1);
  console.log(`пинг до сервера (локально): медиана ${pq(0.5)} мс, 99 % ${pq(0.99)} мс, макс ${(pings.at(-1) ?? 0).toFixed(1)} мс`);
  console.log('фазы у клиентов:', JSON.stringify(phases));
  clearInterval(act);
  for (const c of all) c.ws.close();
  setTimeout(() => process.exit(0), 500);
})();
