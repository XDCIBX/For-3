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

### Где добавлять

1. Репозиторий на GitHub → **Settings** → слева **Environments** → **New environment**.
2. **Name:** `steam` (именно так, маленькими буквами) → **Configure environment**.
3. Необязательно: **Required reviewers** → вы сами — тогда каждая загрузка ждёт вашего «Approve».
4. Внизу **Environment secrets** → **Add environment secret**: в поле **Name** — имя из таблицы,
   в поле **Value** — значение, как описано ниже. Кнопка **Add secret**. Повторить для каждого секрета.

Нужен **либо вариант 1, либо вариант 2**. Рекомендуется вариант 1 — тогда добавляются всего два секрета.

| Name | Когда нужен | Что вписать в Value |
|---|---|---|
| `STEAM_USERNAME` | всегда | Логин аккаунта для сборок |
| `STEAM_CONFIG_VDF` | вариант 1 | Файл `config.vdf`, закодированный в base64, одной строкой |
| `STEAM_PASSWORD` | вариант 2 | Пароль аккаунта для сборок |
| `STEAM_TOTP_SECRET` | вариант 2 | `shared_secret` мобильного аутентификатора |

### `STEAM_USERNAME`

**Имя аккаунта**, которое вводится при входе в Steam, — не ник в профиле и не почта. Посмотреть: клиент
Steam → правый верхний угол → *Об аккаунте* → строка «Аккаунт …». Пример значения: `w25builder`
(без кавычек и пробелов).

### `STEAM_CONFIG_VDF` (вариант 1)

Это сохранённый вход steamcmd — после него Steam больше не спрашивает код Steam Guard.

1. Один раз войдите через steamcmd на своём компьютере (см. шаг 3) и выйдите:
   ```
   steamcmd +login w25builder +quit
   ```
   steamcmd спросит пароль и код Steam Guard (из письма или приложения Steam) — введите их.
2. Найдите файл `config.vdf`:
   - Linux (steamcmd распакован в `~/Steam`): `~/Steam/config/config.vdf`
     (если ставили пакетом: `~/.steam/steam/config/config.vdf`; найти: `find ~ -path "*config/config.vdf"`)
   - macOS: `~/Library/Application Support/Steam/config/config.vdf`
   - Windows: `config\config.vdf` в папке, где лежит `steamcmd.exe`
3. Закодируйте файл в base64 — получится одна длинная строка из латинских букв, цифр, `+`, `/`
   (в конце бывает `=`):
   - Linux: `base64 -w0 ~/Steam/config/config.vdf`
   - macOS: `base64 -i ~/Library/Application\ Support/Steam/config/config.vdf | pbcopy` (строка сразу в буфере)
   - Windows (PowerShell):
     `[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\steamcmd\config\config.vdf")) | Set-Clipboard`
4. Вставьте эту строку **целиком** в Value — без кавычек, пробелов и переносов.

Файл даёт доступ к аккаунту без пароля — храните его как пароль и никуда больше не выкладывайте. Если загрузка
однажды упадёт с `Login Failure` или запросом кода (сменили пароль, вышли из всех сеансов) — повторите
шаги 1–4 и обновите секрет (**Update secret**).

### `STEAM_PASSWORD` и `STEAM_TOTP_SECRET` (вариант 2, вместо `STEAM_CONFIG_VDF`)

- `STEAM_PASSWORD` — обычный пароль аккаунта для сборок, как есть.
- `STEAM_TOTP_SECRET` — секретный ключ мобильного аутентификатора Steam Guard (`shared_secret`). Официальное
  приложение Steam его не показывает; он есть, только если аутентификатор привязан через сторонний инструмент
  (например, Steam Desktop Authenticator — поле `"shared_secret"` в файле `.maFile`). Значение вида
  `AbCdEf0123456789xyzABCdefGH=` — вставить как есть. Из него CI сам считает 5-значный код при каждом входе.

Вариант 2 удобен тем, что ничего не нужно обновлять, но требует аутентификатора со сторонним инструментом.
Если его нет — берите вариант 1.

### Не секрет: адрес сервера

Адрес игрового сервера для сборок — **переменная** репозитория, а не секрет окружения:
Settings → Secrets and variables → Actions → вкладка **Variables** → **New repository variable** →
Name `SERVER_URL`, Value `wss://game.ваш-домен` (см. `deploy/README.md`).

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
