// Проверка динамического разрешения на синтетических кадрах (vsync: интервал кратен периоду экрана)
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 800, height: 450 } });
  await p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => !!window.__app, null, { timeout: 120000 });
  const res = await p.evaluate(() => {
    const e = window.__app.engine;
    e.resize = () => {};
    const cases = [
      ['60 Гц, запас по видеокарте', 60, (s) => 6 * s * s],
      ['120 Гц, видеокарта 12 мс', 120, (s) => 12 * s * s],
      ['144 Гц, видеокарта 8 мс', 144, (s) => 8 * s * s],
      ['240 Гц, видеокарта 6 мс', 240, (s) => 6 * s * s],
      ['120 Гц, упор в процессор 11 мс', 120, (s) => 11 + 0.5 * s * s],
      ['60 Гц, слабая видеокарта 30 мс', 60, (s) => 30 * s * s],
      ['120 Гц, слабый телефон 24 мс', 120, (s) => 24 * s * s],
    ];
    const out = [];
    for (const [name, hz, cost] of cases) {
      // сброс состояния
      e.resScale = 1;
      e.perf = { last: 0, ema: 16, t: 0, win: [Infinity, Infinity], mins: [], refresh: 16.7, good: 0, tryT: 0, tryEma: 0, lockUntil: 0 };
      const period = 1000 / hz;
      let now = 1000;
      const trace = [];
      for (let i = 0; i < 6000; i++) {
        // первые 5 с — меню (лёгкая сцена), дальше бой
        const work = now < 6000 ? 3 : cost(e.resScale);
        const iv = Math.max(1, Math.ceil(work / period - 1e-6)) * period;
        now += iv;
        e.adaptResolution(now);
        if (i % 600 === 599) trace.push(e.resScale.toFixed(2));
      }
      const work = cost(e.resScale);
      const fps = 1000 / (Math.max(1, Math.ceil(work / period - 1e-6)) * period);
      out.push(`${name}: экран ≈${e.displayHz} Гц, разрешение ×${e.resScale.toFixed(2)}, ~${Math.round(fps)} FPS  [${trace.join(' ')}]`);
    }
    return out;
  });
  console.log(res.join('\n'));
  await b.close();
})();
