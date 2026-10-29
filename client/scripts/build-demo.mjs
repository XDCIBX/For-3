// Собирает однофайловую веб-демо (dist-demo/three-heroes.html): JS и CSS встроены в страницу.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = new URL('../dist-demo/', import.meta.url).pathname;
const html = readFileSync(join(dir, 'index.html'), 'utf8');
const js = html.match(/<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"><\/script>/);
const css = html.match(/<link rel="stylesheet" crossorigin href="\.\/(assets\/[^"]+\.css)">/);
if (!js || !css) throw new Error('Не найдены ассеты в index.html');
const script = readFileSync(join(dir, js[1]), 'utf8').replace(/<\/script/gi, '<\\/script');
const style = readFileSync(join(dir, css[1]), 'utf8');

const page = `<title>25 waves</title>
<meta name="theme-color" content="#1b1330">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Rubik:wght@500;700;800;900&display=swap">
<style>
${style}
html, body { height: 100%; background: #1b1330; color-scheme: dark; }
</style>
<canvas id="game"></canvas>
<div id="ui"></div>
<div id="boot"><div class="boot-logo">25 WAVES</div><div class="boot-bar"><i></i></div></div>
<script type="module">
${script}
</script>
`;
writeFileSync(join(dir, 'three-heroes.html'), page);
console.log(`dist-demo/three-heroes.html: ${(page.length / 1024).toFixed(0)} КБ`);
