// node pv.cjs <имя> <query> [WxH]
const { chromium } = require('playwright');
(async () => {
  const [name, query, size = '1400x700'] = process.argv.slice(2);
  const [W, H] = size.split('x').map(Number);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: W, height: H } });
  p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await p.goto('http://localhost:5173/dev/preview.html?' + query);
  await p.waitForTimeout(4000);
  await p.screenshot({ path: name + '.png', timeout: 120000 });
  await b.close();
})();
