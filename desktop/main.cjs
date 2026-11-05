// Десктопная оболочка «25 Waves» для Steam (Windows / macOS / Linux / Steam Deck).
// Игра — та же веб-сборка клиента (client/dist), скопированная в ./app.
const { app, BrowserWindow, Menu, ipcMain, net, protocol, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { Steam } = require('./steam.cjs');

const ROOT = path.join(__dirname, 'app');
const STATE_FILE = () => path.join(app.getPath('userData'), 'window.json');

// Свой защищённый протокол app://: модули, localStorage и Gamepad API работают как на сайте
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

// Оверлей Steam рисуется поверх GPU-процесса только в этом режиме
app.commandLine.appendSwitch('in-process-gpu');
app.commandLine.appendSwitch('disable-direct-composition');
// Звук без обязательного клика по странице
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const primary = app.requestSingleInstanceLock();
if (!primary) app.quit();

// Steam — до создания окна, чтобы оверлей успел встроиться. Без Steam игра работает как обычно.
const steam = new Steam();
const steamInit = primary ? steam.init(app, __dirname) : false;
// Игру запустили не через Steam (только для настоящего AppID) — Steam перезапустит её сам
if (steamInit === 'restart') app.exit(0);
else if (steamInit) console.log(`[steam] подключено: AppID ${steam.appId}, игрок ${steam.name}`);
else console.log(`[steam] не подключено (${steam.error}) — игра без Steam`);

/** Параметры приглашения из командной строки (--w25-join=КОД --w25-server=адрес). */
function joinArgs(argv) {
  return argv.filter((a) => /^--w25-(join|server)=/.test(a)).join(' ');
}
let pendingJoin = joinArgs(process.argv) || steam.launchCommandLine();
let pageReady = false;

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE(), 'utf8'));
  } catch {
    return { fullscreen: true, width: 1280, height: 720 };
  }
}

function saveState(win) {
  try {
    const b = win.getNormalBounds();
    fs.writeFileSync(STATE_FILE(), JSON.stringify({ fullscreen: win.isFullScreen(), width: b.width, height: b.height, x: b.x, y: b.y }));
  } catch {
    /* не страшно: в следующий раз окно откроется по умолчанию */
  }
}

function createWindow() {
  const st = loadState();
  const win = new BrowserWindow({
    title: '25 Waves',
    width: st.width ?? 1280,
    height: st.height ?? 720,
    x: st.x,
    y: st.y,
    minWidth: 960,
    minHeight: 540,
    fullscreen: st.fullscreen !== false,
    backgroundColor: '#1b1330',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Сеть по локальной сети идёт по ws://; в релизе адрес сервера — wss:// (VITE_SERVER_URL)
      allowRunningInsecureContent: true,
      backgroundThrottling: false,
      spellcheck: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  win.once('ready-to-show', () => win.show());
  win.on('close', () => saveState(win));

  // F11 и Alt+Enter — полноэкранный режим; Ctrl+Shift+I — инструменты разработчика только в отладке
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.alt && input.key === 'Enter')) {
      win.setFullScreen(!win.isFullScreen());
      e.preventDefault();
    }
    if (!app.isPackaged && input.control && input.shift && input.key.toLowerCase() === 'i') win.webContents.toggleDevTools();
  });
  // Внешние ссылки — в браузере, а не внутри игры
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://')) e.preventDefault();
  });
  void win.loadURL('app://game/index.html');
  return win;
}

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    const { pathname } = new URL(req.url);
    const rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
    const file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(ROOT + path.sep)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  // На macOS нужно меню приложения (Cmd+Q, полноэкранный режим), на остальных — без меню
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }]));
  } else Menu.setApplicationMenu(null);
  const win = createWindow();
  app.on('second-instance', (_e, argv) => {
    if (win.isMinimized()) win.restore();
    win.focus();
    const join = joinArgs(argv);
    if (join && pageReady) win.webContents.send('steam:join', join);
    else if (join) pendingJoin = join;
  });
  setupSteamIpc(win);
});

/** Запросы страницы к Steam. Всё, что приходит со страницы, проверяем: длина, допустимые символы. */
function setupSteamIpc(win) {
  const fromGame = (e) => e.senderFrame?.url?.startsWith('app://');
  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
  ipcMain.handle('steam:status', (e) =>
    fromGame(e) ? { ok: steam.ok, appId: steam.appId, name: steam.name, lang: steam.lang, error: steam.error, overlay: steam.overlayEnabled() } : null,
  );
  ipcMain.handle('steam:takeJoin', (e) => {
    if (!fromGame(e)) return '';
    pageReady = true;
    const j = pendingJoin;
    pendingJoin = '';
    return j;
  });
  ipcMain.on('steam:achieve', (e, id) => {
    if (fromGame(e) && /^[A-Z0-9_]{1,64}$/.test(str(id, 64))) steam.achieve(id);
  });
  ipcMain.on('steam:invite', (e, connect) => {
    if (fromGame(e)) steam.invite(str(connect, 255));
  });
  ipcMain.on('steam:presence', (e, connect, status) => {
    if (fromGame(e)) steam.presence(str(connect, 255), str(status, 255));
  });
  ipcMain.on('steam:overlay', (e, dialog) => {
    const d = str(dialog, 32);
    if (fromGame(e) && ['Friends', 'Community', 'Players', 'Settings', 'OfficialGameGroup', 'Stats', 'Achievements'].includes(d)) steam.overlay(d);
  });
  steam.on('join', (connect) => {
    // Страница ещё грузится — отдадим приглашение, когда она спросит
    if (!pageReady) pendingJoin = connect;
    else if (!win.isDestroyed()) win.webContents.send('steam:join', connect);
  });
  steam.on('overlay', (active) => {
    if (!win.isDestroyed()) win.webContents.send('steam:overlayActive', active);
  });
}

app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => steam.shutdown());
