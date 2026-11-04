// Покадровая съёмка удара в одну картинку: name query skill times(через запятую)
const { chromium } = require('playwright');
(async () => {
  const [name, query, skill = 0, times = '0,0.08,0.16,0.24,0.32,0.4'] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await browser.newPage({ viewport: { width: 360, height: 380 } });
  p.on('pageerror', e => console.log('PAGEERROR: ' + e.message));
  await p.goto('http://localhost:5173/dev/preview.html?freeze=1&' + query);
  await p.waitForTimeout(2500);
  const ts = times.split(',').map(Number);
  for (let i = 0; i < ts.length; i++) {
    await p.evaluate(([s, t]) => window.__pose(s, t), [i === 0 ? +skill : -1, i === 0 ? ts[0] : ts[i] - ts[i - 1]]);
    await p.waitForTimeout(100);
    await p.screenshot({ path: `${name}_${i}.png` });
  }
  await browser.close();
  const { execSync } = require('child_process');
  execSync(`python3 -c "
from PIL import Image
ims=[Image.open('${name}_%d.png'%i) for i in range(${ts.length})]
w,h=ims[0].size; out=Image.new('RGB',(w*min(4,len(ims)),h*((len(ims)+3)//4)))
for i,im in enumerate(ims): out.paste(im,((i%4)*w,(i//4)*h))
out.save('${name}.png')"`);
})();
