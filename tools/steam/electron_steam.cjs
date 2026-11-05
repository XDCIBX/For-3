// Прогон собранной Linux-версии с подставной libsteam_api (tools/steam/mock_steam_api.c):
// игровой сервер на 2599 (PORT=2599 node server/dist/server.mjs), запуск: xvfb-run -a node electron_steam.cjs
const { _electron } = require('playwright');
const WebSocket = require('/home/user/For-3/node_modules/ws');
function room() {
  const ws = new WebSocket('ws://127.0.0.1:2599');
  return new Promise((res) => {
    ws.on('open', () => ws.send(JSON.stringify({ t: 'create', name: 'Host' })));
    ws.on('message', (d) => { const m = JSON.parse(d); if (m.t === 'welcome') res({ ws, code: m.code }); });
  });
}
(async () => {
  const r1 = await room(), r2 = await room();
  console.log('rooms', r1.code, r2.code);
  const app = await _electron.launch({
    executablePath: '/home/user/For-3/desktop/release/linux-unpacked/25waves',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--w25-join=${r1.code}`, '--w25-server=ws://127.0.0.1:2599'],
    env: { ...process.env, MOCK_JOIN: r2.code, LANG: 'ru_RU.UTF-8', LANGUAGE: 'ru' },
  });
  const logs = [];
  const grab = (d) => logs.push(...String(d).split('\n').filter((l) => /\[mock\]|\[steam\]/.test(l)));
  app.process().stderr.on('data', grab);
  app.process().stdout.on('data', grab);
  const win = await app.firstWindow();
  win.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await win.waitForSelector('#steamInvite', { timeout: 60000 });
  console.log('lobby code:', await win.textContent('.code'), '| name in slot:', await win.evaluate(() => document.querySelector('.slots')?.textContent?.includes('Тестер')));
  await win.click('#steamInvite');
  await win.screenshot({ path: 'elobby2.png' });
  // Через ~40 с подставной Steam присылает «Присоединиться» ко второй комнате
  await win.waitForFunction((c) => document.querySelector('.code')?.textContent === c, r2.code, { timeout: 90000 });
  console.log('after runtime join, code:', await win.textContent('.code'));
  await win.waitForTimeout(1500);
  console.log(logs.join('\n'));
  await app.close();
  r1.ws.close(); r2.ws.close();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
