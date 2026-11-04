const { _electron } = require('playwright');
(async () => {
  const app = await _electron.launch({
    executablePath: require('path').join(__dirname, '../../desktop/release/linux-unpacked/25waves'),
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ozone-platform=headless'],
    timeout: 120000,
  });
  const p = await app.firstWindow();
  p.setDefaultTimeout(90000);
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  await p.waitForSelector('#solo', { timeout: 120000 });
  console.log('адрес:', p.url(), '| заголовок:', await p.title(), '| протокол сервера:', await p.evaluate(() => JSON.parse(localStorage.getItem('three-heroes-settings') || '{}').server ?? 'по умолчанию'));
  console.log('язык:', await p.textContent('#solo'), '| качество:', await p.evaluate(() => JSON.parse(localStorage.getItem('three-heroes-settings') || '{}').quality ?? 'по умолчанию'));
  // Имитация геймпада: левый стик вправо, A зажата
  await p.evaluate(() => {
    const mk = (pressed) => ({ pressed, value: pressed ? 1 : 0, touched: pressed });
    window.__pad = { axes: [1, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, i) => mk(i === 0)) };
    navigator.getGamepads = () => [{ id: 'Xbox', index: 0, connected: true, mapping: 'standard', timestamp: performance.now(), axes: window.__pad.axes, buttons: window.__pad.buttons }];
  });
  await p.click('#solo'); await p.waitForTimeout(1200);
  await p.click('#ready'); await p.waitForTimeout(300); await p.click('#start');
  await p.waitForTimeout(8000);
  const st = await p.evaluate(() => { const b = document.querySelector('.round-box')?.textContent?.replace(/\s+/g, ' ').trim(); return b; });
  console.log('бой:', st);
  await p.screenshot({ path: 'electron_battle.png' });
  // Start на геймпаде — пауза
  await p.evaluate(() => { window.__pad.buttons[9] = { pressed: true, value: 1, touched: true }; });
  await p.waitForTimeout(800);
  console.log('Start → пауза:', !!(await p.$('.pause-ov')));
  console.log('ошибки:', errs.length ? errs : 'нет');
  await app.close();
})();
