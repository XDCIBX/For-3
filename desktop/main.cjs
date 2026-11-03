// Десктопная оболочка «25 Waves» для Steam (Windows / macOS / Linux / Steam Deck).
// Игра — та же веб-сборка клиента (client/dist), скопированная в ./app.
const { app, BrowserWindow, Menu, net, protocol, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

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

if (!app.requestSingleInstanceLock()) app.quit();

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
  app.on('second-instance', () => {
    if (win.isMinimized()) win.restore();
    win.focus();
  });
});

app.on('window-all-closed', () => app.quit());
