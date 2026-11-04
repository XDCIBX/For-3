const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto('file://' + __dirname + '/logo.html');
  await p.waitForTimeout(800);
  await p.screenshot({ path: 'logo_1280x720.png', omitBackground: true });
  await b.close();
})();
