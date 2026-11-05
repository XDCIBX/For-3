// Steamworks для десктопной сборки: оверлей, достижения, приглашения друзей, «Присоединиться» из списка друзей.
//
// Библиотека steam_api (из Steamworks SDK, папка steam/redist) подключается через FFI (koffi) по плоскому
// C-интерфейсу SDK — без компиляции C++-аддона под каждую версию Electron. Обратные вызовы Steam
// разбираются вручную (SteamAPI_ManualDispatch_*), раз в 100 мс.
//
// Если Steam не запущен, библиотеки нет или что-то пошло не так — игра работает как обычно, без Steam.
const path = require('node:path');
const fs = require('node:fs');

/** Номера обратных вызовов (k_iCallback из заголовков SDK). */
const CB = {
  GameOverlayActivated: 300 + 31,
  GameRichPresenceJoinRequested: 300 + 37,
  UserStatsReceived: 1100 + 1,
  UserStatsStored: 1100 + 2,
  UserAchievementStored: 1100 + 3,
  NewUrlLaunchParameters: 1000 + 14,
};

const INIT_ERR = ['ok', 'failed', 'no-steam-client', 'version-mismatch'];

/** Настройки Steam: steam.config.json рядом с main.cjs; AppID можно переопределить переменной STEAM_APP_ID. */
function loadConfig(dir) {
  let cfg = { appId: 480, restartViaSteam: false, achievements: {} };
  try {
    cfg = { ...cfg, ...JSON.parse(fs.readFileSync(path.join(dir, 'steam.config.json'), 'utf8')) };
  } catch (e) {
    console.warn('[steam] steam.config.json не прочитан:', e.message);
  }
  const env = Number(process.env.STEAM_APP_ID);
  if (Number.isInteger(env) && env > 0) cfg.appId = env;
  return cfg;
}

/** Путь к steam_api под текущую платформу: в сборке — resources/steam, при разработке — steam/redist/<os>. */
function libPath(app, dir) {
  const name = process.platform === 'win32' ? 'steam_api64.dll' : process.platform === 'darwin' ? 'libsteam_api.dylib' : 'libsteam_api.so';
  const os = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux';
  const base = app.isPackaged ? path.join(process.resourcesPath, 'steam') : path.join(dir, 'steam', 'redist', os);
  return path.join(base, name);
}

class Steam {
  constructor() {
    this.ok = false;
    this.error = '';
    this.appId = 0;
    this.name = '';
    this.lang = '';
    this.map = {};
    this.listeners = { join: [], overlay: [] };
    this.timer = null;
    this.stats = false;
    this.pending = [];
  }

  /**
   * Подключение к Steam. Вызывать до создания окна: оверлей встраивается в процесс при запуске.
   * Возвращает false и пишет причину в this.error, если Steam недоступен.
   * Возвращает 'restart', если игру надо закрыть — Steam перезапустит её сам (только для настоящего AppID).
   */
  init(app, dir) {
    const cfg = loadConfig(dir);
    this.appId = cfg.appId;
    this.map = cfg.achievements ?? {};
    let koffi;
    try {
      koffi = require('koffi');
    } catch (e) {
      this.error = 'koffi: ' + e.message;
      return false;
    }
    const file = libPath(app, dir);
    if (!fs.existsSync(file)) {
      this.error = 'нет библиотеки ' + file;
      return false;
    }
    try {
      const lib = koffi.load(file);
      // CallbackMsg_t: HSteamUser, int m_iCallback, uint8* m_pubParam, int m_cubParam
      const CallbackMsg = koffi.struct('CallbackMsg_t', { user: 'int32', id: 'int32', param: 'void *', size: 'int32' });
      const f = {
        RestartAppIfNecessary: lib.func('bool SteamAPI_RestartAppIfNecessary(uint32)'),
        InitFlat: lib.func('int SteamAPI_InitFlat(uint8_t *err)'),
        Shutdown: lib.func('void SteamAPI_Shutdown()'),
        GetPipe: lib.func('int32 SteamAPI_GetHSteamPipe()'),
        DispatchInit: lib.func('void SteamAPI_ManualDispatch_Init()'),
        RunFrame: lib.func('void SteamAPI_ManualDispatch_RunFrame(int32)'),
        NextCallback: lib.func('bool SteamAPI_ManualDispatch_GetNextCallback(int32, _Out_ CallbackMsg_t *msg)'),
        FreeCallback: lib.func('void SteamAPI_ManualDispatch_FreeLastCallback(int32)'),
        Friends: lib.func('void *SteamAPI_SteamFriends_v018()'),
        UserStats: lib.func('void *SteamAPI_SteamUserStats_v013()'),
        Apps: lib.func('void *SteamAPI_SteamApps_v009()'),
        Utils: lib.func('void *SteamAPI_SteamUtils_v011()'),
        PersonaName: lib.func('const char *SteamAPI_ISteamFriends_GetPersonaName(void *)'),
        ActivateOverlay: lib.func('void SteamAPI_ISteamFriends_ActivateGameOverlay(void *, const char *)'),
        InviteDialog: lib.func('void SteamAPI_ISteamFriends_ActivateGameOverlayInviteDialogConnectString(void *, const char *)'),
        SetRichPresence: lib.func('bool SteamAPI_ISteamFriends_SetRichPresence(void *, const char *, const char *)'),
        ClearRichPresence: lib.func('void SteamAPI_ISteamFriends_ClearRichPresence(void *)'),
        SetAchievement: lib.func('bool SteamAPI_ISteamUserStats_SetAchievement(void *, const char *)'),
        GetAchievement: lib.func('bool SteamAPI_ISteamUserStats_GetAchievement(void *, const char *, _Out_ bool *done)'),
        ClearAchievement: lib.func('bool SteamAPI_ISteamUserStats_ClearAchievement(void *, const char *)'),
        StoreStats: lib.func('bool SteamAPI_ISteamUserStats_StoreStats(void *)'),
        NumAchievements: lib.func('uint32 SteamAPI_ISteamUserStats_GetNumAchievements(void *)'),
        LaunchCommandLine: lib.func('int SteamAPI_ISteamApps_GetLaunchCommandLine(void *, uint8_t *buf, int size)'),
        GameLanguage: lib.func('const char *SteamAPI_ISteamApps_GetCurrentGameLanguage(void *)'),
        OverlayEnabled: lib.func('bool SteamAPI_ISteamUtils_IsOverlayEnabled(void *)'),
        NotificationPosition: lib.func('void SteamAPI_ISteamUtils_SetOverlayNotificationPosition(void *, int)'),
      };
      this.koffi = koffi;
      this.f = f;
      this.CallbackMsg = CallbackMsg;

      // Настоящий AppID: если игру запустили не из Steam, Steam перезапустит её сам
      if (cfg.restartViaSteam && this.appId !== 480 && f.RestartAppIfNecessary(this.appId)) return 'restart';
      // Без steam_appid.txt: Steam берёт AppID из окружения (в релизе его выставляет сам клиент Steam)
      if (!process.env.SteamAppId) {
        process.env.SteamAppId = String(this.appId);
        process.env.SteamGameId = String(this.appId);
      }
      const err = Buffer.alloc(1024);
      const r = f.InitFlat(err);
      if (r !== 0) {
        this.error = `${INIT_ERR[r] ?? r}: ${err.toString('utf8').replace(/\0.*$/s, '')}`;
        return false;
      }
      f.DispatchInit();
      this.pipe = f.GetPipe();
      this.friends = f.Friends();
      this.userStats = f.UserStats();
      this.apps = f.Apps();
      this.utils = f.Utils();
      this.name = f.PersonaName(this.friends) || '';
      this.lang = f.GameLanguage(this.apps) || '';
      // Всплывашки «Достижение получено» — в правом нижнем углу (k_EPositionBottomRight = 3)
      f.NotificationPosition(this.utils, 3);
      this.ok = true;
      this.timer = setInterval(() => this.pump(), 100);
      // С версии SDK 1.61 статистика загружается сама при запуске; достижения до её прихода копим в очереди
      this.stats = false;
      return true;
    } catch (e) {
      this.error = e.message;
      this.ok = false;
      return false;
    }
  }

  /** Разбор очереди обратных вызовов Steam. */
  pump() {
    if (!this.ok) return;
    const f = this.f;
    try {
      f.RunFrame(this.pipe);
      const msg = {};
      while (f.NextCallback(this.pipe, msg)) {
        try {
          this.handle(msg.id, msg.param, msg.size);
        } finally {
          f.FreeCallback(this.pipe);
        }
      }
    } catch (e) {
      console.warn('[steam] ошибка обработки обратных вызовов:', e.message);
    }
  }

  handle(id, param, size) {
    const k = this.koffi;
    switch (id) {
      case CB.GameOverlayActivated: {
        const active = k.decode(param, 'uint8') !== 0;
        for (const cb of this.listeners.overlay) cb(active);
        break;
      }
      case CB.GameRichPresenceJoinRequested: {
        // CSteamID (8 байт), затем char[256] — строка подключения
        const connect = size > 8 ? String(k.decode(param, 8, 'char', -1) ?? '') : '';
        for (const cb of this.listeners.join) cb(connect);
        break;
      }
      case CB.NewUrlLaunchParameters: {
        const cmd = this.launchCommandLine();
        if (cmd) for (const cb of this.listeners.join) cb(cmd);
        break;
      }
      case CB.UserStatsReceived:
        if (!this.stats) {
          this.stats = true;
          const q = this.pending.splice(0);
          for (const a of q) this.achieve(a);
        }
        break;
      default:
        break;
    }
  }

  /** Имя достижения в Steam: по таблице из настроек (для тестового AppID 480 — достижения Spacewar). */
  apiName(id) {
    if (Object.prototype.hasOwnProperty.call(this.map, id)) return this.map[id];
    return id;
  }

  /** Открыть достижение. Повторные вызовы безопасны: Steam просто ничего не делает. */
  achieve(id) {
    if (!this.ok) return false;
    const name = this.apiName(id);
    if (!name) return false;
    try {
      const done = [false];
      if (this.f.GetAchievement(this.userStats, name, done) && done[0]) return true;
      const ok = this.f.SetAchievement(this.userStats, name);
      if (!ok && !this.stats) {
        // Статистика ещё не пришла — повторим после UserStatsReceived
        if (!this.pending.includes(id)) this.pending.push(id);
        return false;
      }
      this.f.StoreStats(this.userStats);
      return ok;
    } catch (e) {
      console.warn('[steam] достижение', id, e.message);
      return false;
    }
  }

  /** Только для отладки: сбросить достижение. */
  clearAchievement(id) {
    if (!this.ok) return false;
    const name = this.apiName(id);
    if (!name) return false;
    const ok = this.f.ClearAchievement(this.userStats, name);
    this.f.StoreStats(this.userStats);
    return ok;
  }

  /** Окно оверлея «Пригласить друзей» со строкой подключения к комнате. */
  invite(connect) {
    if (!this.ok) return false;
    this.f.InviteDialog(this.friends, connect);
    return true;
  }

  /**
   * Статус в списке друзей. connect — строка для кнопки «Присоединиться к игре»
   * (пусто — кнопки нет), status — текст статуса.
   */
  presence(connect, status) {
    if (!this.ok) return;
    if (!connect && !status) {
      this.f.ClearRichPresence(this.friends);
      return;
    }
    this.f.SetRichPresence(this.friends, 'connect', connect || '');
    this.f.SetRichPresence(this.friends, 'status', status || '');
  }

  overlay(dialog) {
    if (!this.ok) return false;
    this.f.ActivateOverlay(this.friends, dialog || 'Friends');
    return true;
  }

  overlayEnabled() {
    return this.ok ? !!this.f.OverlayEnabled(this.utils) : false;
  }

  /** Командная строка, с которой Steam запустил игру по приглашению (steam://run/<appid>//<параметры>). */
  launchCommandLine() {
    if (!this.ok) return '';
    const buf = Buffer.alloc(1024);
    const n = this.f.LaunchCommandLine(this.apps, buf, buf.length);
    return n > 0 ? buf.toString('utf8', 0, n).replace(/\0.*$/s, '') : '';
  }

  on(kind, cb) {
    this.listeners[kind].push(cb);
  }

  shutdown() {
    if (!this.ok) return;
    clearInterval(this.timer);
    this.ok = false;
    try {
      this.f.Shutdown();
    } catch {
      /* закрываемся всё равно */
    }
  }
}

module.exports = { Steam, loadConfig };
