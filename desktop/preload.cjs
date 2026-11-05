// Мост между страницей игры и Steam (главный процесс). Страница видит только window.steam с этими методами.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('steam', {
  /** { ok, appId, name, lang, error } */
  status: () => ipcRenderer.invoke('steam:status'),
  achieve: (id) => ipcRenderer.send('steam:achieve', String(id)),
  invite: (connect) => ipcRenderer.send('steam:invite', String(connect)),
  presence: (connect, status) => ipcRenderer.send('steam:presence', connect ? String(connect) : '', status ? String(status) : ''),
  overlay: (dialog) => ipcRenderer.send('steam:overlay', String(dialog || 'Friends')),
  /** Приглашение, с которым игру запустили (один раз), или пустая строка. */
  takeJoin: () => ipcRenderer.invoke('steam:takeJoin'),
  onJoin: (cb) => ipcRenderer.on('steam:join', (_e, connect) => cb(String(connect))),
  onOverlay: (cb) => ipcRenderer.on('steam:overlayActive', (_e, active) => cb(!!active)),
});
