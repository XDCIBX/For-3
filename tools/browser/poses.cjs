const { chromium } = require('playwright');
(async () => {
  const [name, query, n = 1, gap = 150] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await browser.newPage({ viewport: { width: 900, height: 480 } });
  p.on('pageerror', e => console.log('PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') console.log('ERR', m.text().slice(0, 300)); });
  await p.goto('http://localhost:5173/dev/preview.html?' + query);
  await p.waitForTimeout(2500);
  for (let i = 0; i < +n; i++) { await p.screenshot({ path: `${name}${i}.png`, timeout: 60000 }); await p.waitForTimeout(+gap); }
  await browser.close();
})();
