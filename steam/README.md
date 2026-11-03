# Выпуск «25 Waves» в Steam

Всё, что нужно для страницы магазина и загрузки сборок, лежит в этой папке:

| Что | Где |
|---|---|
| Тексты страницы на 7 языках, теги, системные требования, возрастной рейтинг и ответы для анкет | [`STORE.md`](STORE.md) |
| Скриншоты 1920×1080 (8 шт.) | [`screenshots/`](screenshots/) |
| Капсулы магазина и библиотеки, логотип, иконка | [`art/`](art/) |
| Конфиги загрузки сборок (SteamPipe) | `app_build.vdf`, `depot_*.vdf` |
| Десктопная сборка (Electron) | [`../desktop/`](../desktop/) |

## 1. Приложение в Steamworks

1. Зарегистрируйтесь в [Steamworks](https://partner.steamgames.com/) и оплатите Steam Direct (100 $ за игру,
   возвращаются после 1000 $ выручки). Нужны налоговая и банковская анкеты.
2. Создайте приложение — получите **AppID**. В разделе **SteamPipe → Depots** создайте три депо:
   Windows, macOS, Linux (у каждого — свой **Depot ID** и своя операционная система).
3. Подставьте AppID и Depot ID в `app_build.vdf` и `depot_*.vdf` (сейчас там 1000000–1000003).
4. **Installation → General → Launch Options** — три варианта запуска:

   | ОС | Исполняемый файл | Аргументы |
   |---|---|---|
   | Windows | `25Waves.exe` | — |
   | macOS | `25 Waves.app` | — |
   | Linux / SteamOS | `25waves` | `--no-sandbox` (песочница Chromium не работает внутри Steam Runtime) |

## 2. Сервер для сетевой игры

Одиночная игра с ботами работает без сервера. Для кооператива и ПвП по сети нужен публичный сервер —
он уже готов (`server/`, Docker, Render — см. корневой README). Поднимите его за HTTPS и запомните адрес
вида `wss://game.example.com`: он зашивается в сборку, игрокам ничего вводить не придётся.

## 3. Сборка

**Через GitHub Actions (рекомендуется):** в настройках репозитория добавьте секрет `SERVER_URL`
(адрес сервера), затем **Actions → «Сборка для Steam» → Run workflow** (или запушьте тег `v1.0.0`).
Когда сборка закончится, в артефактах появятся `25-waves-win`, `25-waves-mac`, `25-waves-linux`.

**Вручную** (на своём компьютере, Node.js 22):

```bash
npm ci
cd desktop
npm ci
VITE_SERVER_URL=wss://game.example.com npm run dist:win     # или dist:mac / dist:linux
```

Готовые папки: `desktop/release/win-unpacked`, `mac-universal`, `linux-unpacked` — их и загружает SteamPipe.
Проверить игру без сборки: `cd desktop && npm start`.

**macOS:** без подписи Gatekeeper предупреждает при первом запуске. Для релиза нужен аккаунт Apple Developer
(99 $/год): сертификат «Developer ID Application» и нотаризация. В CI для этого есть секреты
`MAC_CERT_P12_BASE64`, `MAC_CERT_PASSWORD`, `APPLE_ID`, `APPLE_APP_PASSWORD`, `APPLE_TEAM_ID`; добавьте в
`desktop/package.json` → `build.mac` строки `"hardenedRuntime": true` и `"notarize": true`.

## 4. Загрузка сборки

Скачайте [Steamworks SDK](https://partner.steamgames.com/downloads/list), положите сборки (или артефакты
CI, распакованные в `desktop/release/`) и выполните из папки `steam/`:

```bash
steamcmd +login ВАШ_ЛОГИН +run_app_build "$(pwd)/app_build.vdf" +quit
```

Затем в Steamworks: **SteamPipe → Builds** → выберите сборку → **Set build live** на ветке `default`
(сначала можно на закрытой ветке `beta` для теста).

## 5. Страница магазина

- **Store Page Admin → Description:** тексты из `STORE.md` (краткое и полное описание — для каждого языка).
- **Languages:** отметьте 7 языков, столбец «Interface» и «Subtitles», без «Full Audio».
- **Graphical Assets → Store Assets:** `header_capsule_920x430`, `small_capsule_462x174`,
  `main_capsule_1232x706`, `vertical_capsule_748x896`, `page_background_1438x810`.
- **Library Assets:** `library_capsule_600x900`, `library_header_920x430`, `library_hero_3840x1240`
  (без текста), `library_logo_1280x720` (прозрачный фон; в редакторе расположите его слева внизу).
- **Screenshots:** восемь файлов из `screenshots/` в этом порядке (первые четыре показываются в поиске).
- **Community icon:** `art/community_icon_184x184.jpg`; иконка исполняемого файла уже зашита в сборку.
- **Trailer:** очень желателен (страницы с видео продаются заметно лучше), в этом наборе его нет —
  проще всего записать 30–60 секунд игры с OBS: бой на острове, таверна, дуэль, дракон.
- **Content Survey / рейтинги:** ответы — в разделе «Возрастной рейтинг» файла `STORE.md`.

## 6. Steam Deck и контроллеры

- Бой полностью управляется геймпадом: левый стик/крестовина — движение, правый стик — прицел,
  A/RT — атака (удержание — серия), X/LB, Y/RB, B/LT — умения, Start — пауза.
- Меню — мышью или касанием (на Steam Deck работает сенсорный экран). Поэтому в Steamworks укажите
  **Partial Controller Support** и для Steam Input — шаблон «Геймпад» (в меню трекпад работает как мышь).
- Интерфейс проверен в разрешении 1280×800.

## 7. Перед кнопкой «Выпустить»

- [ ] Сборки запущены на Windows, macOS и Linux/Steam Deck: меню, одиночная игра, сетевая игра через ваш сервер.
- [ ] Страница «Скоро выйдет» опубликована минимум за 2 недели до релиза (требование Steam).
- [ ] Обе проверки Valve пройдены: страница магазина и сборка (обычно по 3–5 рабочих дней).
- [ ] Указаны цена и дата выхода; при желании — скидка на запуск.
- [ ] Сервер поднят за HTTPS и отвечает на `/health` (там же видно число открытых комнат); следите за
  загрузкой процессора в первые дни после запуска.

## Чего пока нет

- **Steamworks SDK** не подключён: нет достижений Steam, приглашений друзей через Steam и сетевой игры через
  серверы Valve — комнаты работают по 4-символьному коду через ваш сервер. Подключается библиотекой
  `steamworks.js` в `desktop/main.cjs`, когда будет AppID.
- Трейлер нужно записать отдельно.
