#!/usr/bin/env node
// Собирает готовые .vdf для SteamPipe из шаблонов и ids.json → steam/steampipe/build/.
//
//   node steam/steampipe/make-vdf.mjs [--content desktop/release] [--desc "25 Waves 1.0.0"]
//                                     [--setlive beta] [--preview] [--only windows,linux]
//
// Затем: steamcmd +login <логин> +run_app_build "$(pwd)/steam/steampipe/build/app_build.vdf" +quit
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? '') : def;
};
const flag = (name) => args.includes(`--${name}`);

const ids = JSON.parse(readFileSync(join(here, 'ids.json'), 'utf8'));
const version = JSON.parse(readFileSync(join(root, 'desktop/package.json'), 'utf8')).version;
const content = resolve(root, opt('content', 'desktop/release'));
const desc = opt('desc', `25 Waves ${version}`);
const setLive = opt('setlive', '');
const only = opt('only', 'windows,macos,linux').split(',').map((s) => s.trim()).filter(Boolean);
const DIRS = { windows: 'win-unpacked', macos: 'mac-universal', linux: 'linux-unpacked' };

const fail = (msg) => {
  console.error(`make-vdf: ${msg}`);
  process.exit(1);
};
const isId = (v) => /^\d+$/.test(String(v));
if (!isId(ids.appId)) fail(`в steam/steampipe/ids.json не вписан AppID (сейчас "${ids.appId}")`);
for (const os of only) {
  if (!DIRS[os]) fail(`неизвестная платформа ${os}`);
  if (!isId(ids.depots?.[os])) fail(`в steam/steampipe/ids.json не вписан ID депо для ${os} (сейчас "${ids.depots?.[os]}")`);
  const dir = join(content, DIRS[os]);
  if (!existsSync(dir) || readdirSync(dir).length === 0) fail(`нет сборки ${dir} — соберите npm run dist:* или распакуйте артефакт CI`);
}
// AppID внутри игры (desktop/steam.config.json) должен совпадать с загружаемым, иначе достижения уйдут не туда
const runtime = JSON.parse(readFileSync(join(root, 'desktop/steam.config.json'), 'utf8'));
if (String(runtime.appId) !== String(ids.appId) && !flag('allow-appid-mismatch'))
  fail(
    `в desktop/steam.config.json appId = ${runtime.appId}, а загружается ${ids.appId}. Впишите туда тот же AppID ` +
      `(и "achievements": {}, "restartViaSteam": true) — или запустите с --allow-appid-mismatch для пробной загрузки`,
  );
if (setLive && /^default$/i.test(setLive)) fail('ветку default через загрузку выставить нельзя — только вручную в Steamworks');
if (!/^[\w.-]*$/.test(setLive)) fail(`странное имя ветки: ${setLive}`);

const out = join(here, 'build');
mkdirSync(join(out, 'output'), { recursive: true });
const vars = {
  APP_ID: ids.appId,
  DESC: desc.replace(/"/g, "'"),
  CONTENT_ROOT: content,
  BUILD_OUTPUT: join(out, 'output'),
  SET_LIVE: setLive,
  PREVIEW: flag('preview') ? '1' : '0',
  DEPOT_WINDOWS: ids.depots.windows,
  DEPOT_MACOS: ids.depots.macos,
  DEPOT_LINUX: ids.depots.linux,
};
const fill = (text) =>
  text.replace(/\$\{(\w+)\}/g, (_, k) => {
    if (!(k in vars)) fail(`неизвестная подстановка \${${k}}`);
    return String(vars[k]).replace(/\\/g, '/');
  });

let app = fill(readFileSync(join(here, 'app_build.vdf'), 'utf8'));
// Не загружаемые сейчас платформы убираем из списка депо
for (const os of Object.keys(DIRS)) {
  if (only.includes(os)) continue;
  app = app.replace(new RegExp(`^\\s*"${ids.depots[os]}" "depot_${os}\\.vdf"\\n`, 'm'), '');
}
writeFileSync(join(out, 'app_build.vdf'), app);
for (const os of Object.keys(DIRS)) writeFileSync(join(out, `depot_${os}.vdf`), fill(readFileSync(join(here, `depot_${os}.vdf`), 'utf8')));

console.log(`make-vdf: AppID ${ids.appId}, платформы: ${only.join(', ')}, сборки из ${content}`);
console.log(`make-vdf: ${setLive ? `сразу на ветку ${setLive}` : 'ветка — вручную в Steamworks'}${flag('preview') ? ', ПРЕДПРОСМОТР (без загрузки)' : ''}`);
console.log(`make-vdf: готово → ${join(out, 'app_build.vdf')}`);
