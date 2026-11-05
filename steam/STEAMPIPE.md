# Загрузка сборок в Steam (SteamPipe)

Файлы — в `steam/steampipe/`:

| Файл | Что это |
|---|---|
| `ids.json` | **Единственное место**, где задаются AppID и ID трёх депо (сейчас заглушки) |
| `app_build.vdf`, `depot_windows.vdf`, `depot_macos.vdf`, `depot_linux.vdf` | Шаблоны SteamPipe |
| `make-vdf.mjs` | Подставляет ID и пути, пишет готовые файлы в `steam/steampipe/build/` (не в git) |
| `guard-code.mjs` | Код Steam Guard для входа в CI (если выбран вход по секрету аутентификатора) |

Загрузку по тегу `v*` или вручную делает задание `steam` в `.github/workflows/desktop.yml`.
Пароли и токены в репозитории не хранятся — только в секретах GitHub.

## 1. Steamworks: AppID и депо

1. **App Admin → SteamPipe → Depots**: создайте три депо и укажите каждому ОС:
   - Windows (64-bit), macOS, Linux + SteamOS.
2. Впишите номера в `steam/steampipe/ids.json` вместо `APP_ID`, `DEPOT_ID_WINDOWS`, `DEPOT_ID_MACOS`,
   `DEPOT_ID_LINUX` и закоммитьте. ID — не секрет.
   Тот же AppID — в `desktop/steam.config.json` (это AppID внутри игры; там же `"restartViaSteam": true` и
   `"achievements": {}`). Пока там тестовый 480, `make-vdf.mjs` загрузку не пропустит — чтобы в Steam не
   ушла сборка с достижениями тестового приложения (пробная загрузка: флаг `--allow-appid-mismatch`).
3. **Installation → General → Launch Options** (по одной на ОС):

   | ОС | Executable | Arguments |
   |---|---|---|
   | Windows | `25Waves.exe` | — |
   | macOS | `25 Waves.app` | — |
   | Linux + SteamOS | `25waves` | `--no-sandbox` |

4. **Publish** (кнопка вверху страницы Steamworks) — изменения вступают в силу только после публикации.

## 2. Аккаунт для загрузки

Заведите **отдельный аккаунт Steam** только для сборок (так советует Valve). В Steamworks:
**Users & Permissions → Manage Users** → пригласите его и дайте права только на это приложение:
*Edit App Metadata* и *Publish App Changes To Steam*. Включите на нём Steam Guard.

## 3. Первая загрузка вручную (рекомендуется — так же получите config.vdf для CI)

Нужен компьютер с Linux, macOS или Windows и `steamcmd`:
- Linux: `mkdir -p ~/Steam && curl -fsSL https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz | tar -xz -C ~/Steam`
- macOS: `curl -fsSL https://steamcdn-a.akamaihd.net/client/installer/steamcmd_osx.tar.gz | tar -xz`
- Windows: steamcmd из Steamworks SDK (`tools/ContentBuilder/builder/steamcmd.exe`)

1. Получите сборки: **Actions → «Сборка для Steam» → Run workflow** (галочку «Загрузить» не ставьте),
   скачайте три артефакта `25-waves-win/mac/linux` и распакуйте в `desktop/release/`:
   ```bash
   mkdir -p desktop/release
   for f in 25-waves-*.tar.gz; do tar -xzf "$f" -C desktop/release; done
   ```
   Получатся `desktop/release/win-unpacked`, `mac-universal`, `linux-unpacked`. Можно собрать и самому:
   `cd desktop && npm ci && npm run dist:linux` (Windows-сборку — на Windows, macOS — на Mac).
2. Сначала проверьте без загрузки (предпросмотр):
   ```bash
   node steam/steampipe/make-vdf.mjs --preview
   ~/Steam/steamcmd.sh +login ЛОГИН_ДЛЯ_СБОРОК +run_app_build "$(pwd)/steam/steampipe/build/app_build.vdf" +quit
   ```
   steamcmd спросит пароль и код Steam Guard, покажет список файлов каждого депо и ничего не загрузит.
3. Настоящая загрузка — то же без `--preview`:
   ```bash
   node steam/steampipe/make-vdf.mjs
   ~/Steam/steamcmd.sh +login ЛОГИН_ДЛЯ_СБОРОК +run_app_build "$(pwd)/steam/steampipe/build/app_build.vdf" +quit
   ```
   В конце: `Successfully finished AppID … build (BuildID …)`.

Загрузить только часть платформ: `--only windows,linux`.

## 4. Секреты GitHub для автоматической загрузки

**Settings → Environments → New environment → `steam`** (там же можно включить *Required reviewers* —
тогда каждая загрузка ждёт вашего подтверждения). В этом окружении → **Add environment secret**:

| Секрет | Обязателен | Что вписать |
|---|---|---|
| `STEAM_USERNAME` | да | Логин аккаунта для сборок |
| `STEAM_CONFIG_VDF` | вариант 1 | Содержимое `config.vdf` в base64 (см. ниже) |
| `STEAM_PASSWORD` | вариант 2 | Пароль аккаунта для сборок |
| `STEAM_TOTP_SECRET` | вариант 2 | `shared_secret` мобильного аутентификатора (base64) |

**Вариант 1 (проще): сохранённый вход.** После ручного входа из шага 3 steamcmd хранит токен в
`~/Steam/config/config.vdf` (Windows: `config\config.vdf` рядом с `steamcmd.exe`). Закодируйте и вставьте в секрет:
```bash
base64 -w0 ~/Steam/config/config.vdf      # macOS: base64 -i ~/Steam/config/config.vdf
```
Токен живёт долго, но может истечь (смена пароля, выход из всех сеансов) — тогда повторите вход и обновите секрет.

**Вариант 2: код из аутентификатора.** Нужен `shared_secret` мобильного аутентификатора аккаунта для
сборок (его выдают инструменты вроде Steam Desktop Authenticator при привязке). Код генерирует
`guard-code.mjs`. Подходит, если не хочется обновлять `config.vdf`.

Адрес игрового сервера для сборок — **переменная** (не секрет) репозитория `SERVER_URL`
(Settings → Secrets and variables → Actions → Variables), см. `deploy/README.md`.

## 5. Загрузка из GitHub

- **По тегу:** `git tag v1.0.0 && git push origin v1.0.0` — соберутся три платформы и загрузятся в Steam.
  Если ID или секреты ещё не настроены, загрузка пропускается с предупреждением (сборки всё равно в артефактах).
- **Вручную:** Actions → «Сборка для Steam» → Run workflow → галочка «Загрузить сборки в Steam»; в поле
  ветки можно указать закрытую ветку (например `beta`), тогда сборка сразу станет на ней активной.

Журнал steamcmd и отчёты SteamPipe — в артефакте `steampipe-logs`.

## 6. Выставить сборку в ветку default

Steam не позволяет выставить ветку `default` автоматически — только вручную:

1. Steamworks → **App Admin → SteamPipe → Builds**.
2. Найдите сборку (описание — `25 Waves v1.0.0 (…)`), в колонке **Set build live on branch** выберите
   `default` → **Preview Change** → **Set Build Live Now**.
3. До выхода игры ветку `default` видят только владельцы ключей и сотрудники; после — все покупатели.

Совет: заведите закрытую ветку `beta` (**SteamPipe → Builds → Manage branches**, с паролем), выставляйте
сборки туда (`branch: beta` при ручном запуске), проверяйте установку через Steam на всех ОС и только
потом переносите на `default`.

## Что проверить после первой загрузки

- Установить игру через Steam на Windows, macOS и Linux/Steam Deck и запустить — права на запуск файлов
  и симлинки macOS-приложения должны сохраниться (сборки упаковываются в tar, чтобы ничего не потерялось).
- Оверлей Steam (Shift+Tab), достижения и приглашение друзей (см. `steam/README.md`).
