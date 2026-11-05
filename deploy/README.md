# Публичный игровой сервер (wss://)

Сервер — один процесс Node.js: комнаты, игровой цикл (20 тиков/с) и раздача веб-версии игры на одном порту.
Шифрование (HTTPS → `wss://`) делает прокси перед ним: Caddy на своём VPS, либо сам хостинг (Fly.io, Render).

**Важно:** запускайте **ровно один** экземпляр сервера. Комнаты хранятся в памяти; на двух экземплярах игрок
с кодом комнаты может попасть не на тот сервер и получить «Комната не найдена».

## Настройки (переменные окружения)

| Переменная | По умолчанию | Что делает |
|---|---|---|
| `PORT` | `2567` | Порт HTTP и WebSocket (Fly/Render задают сами) |
| `HOST` | `0.0.0.0` | На каком адресе слушать |
| `TRUST_PROXY` | выкл. | `1` — сервер за прокси: IP игрока берётся из `X-Forwarded-For` (включать **только** за прокси) |
| `MAX_ROOMS` | `300` | Предел комнат (около 900 игроков); сверх — «Сервер переполнен» |
| `MAX_CONN_PER_IP` | `16` | Предел соединений с одного адреса |
| `ALLOWED_ORIGINS` | пусто (все) | Разрешённые источники через запятую, например `https://game.example.com,app://game,https://localhost,capacitor://localhost` |
| `HEARTBEAT_MS` | `25000` | Интервал проверки «живых» соединений; молчащие закрываются, игрок переподключается |
| `APP_VERSION` | `1.0.0` | Версия в ответе `/health` |
| `STATIC_DIR` | `client/dist` | Папка с веб-клиентом |

`GET /health` → `{"ok":true,"version":"1.0.0","uptime":…,"rooms":…,"players":…}` (при остановке — 503).
По `SIGTERM` сервер перестаёт пускать новых, закрывает соединения с кодом 1012 и выходит (без 10-секундного
ожидания Docker).

Нагрузка: одна комната — несколько процентов одного ядра; 1 vCPU и 512 МБ хватит на десятки комнат.

## Варианты хостинга

Цены — ориентир на ноябрь 2026 по сторонним обзорам; перед заказом проверьте на сайте хостинга.
Задержка — до игроков в Европе при размещении во Франкфурте/Германии.

| Вариант | Цена в месяц | Задержка по Европе | Плюсы | Минусы |
|---|---|---|---|---|
| **A. VPS Hetzner** (CX23: 2 vCPU, 4 ГБ, 20 ТБ трафика; Нюрнберг/Фалькенштейн) + Caddy | ≈ €5,5–6 (с IPv4) | ≈ 15–40 мс (Центр. Европа), 50–70 мс (Испания, Греция) | Дёшево, запас мощности, полный контроль | Нужен домен; обновления ОС и Docker — на вас |
| **B. Fly.io** (shared-cpu-1x, 512 МБ, регион `fra`) | ≈ $4–5 (256 МБ — от ≈ $2,2) | ≈ 15–40 мс | Без своего сервера, HTTPS и адрес `*.fly.dev` сразу, деплой одной командой | Нужна банковская карта; оплата за использование |
| **C. Render** (Starter, Frankfurt) | $7 | ≈ 15–40 мс | Уже настроен (`render.yaml`, кнопка в README), HTTPS и адрес `*.onrender.com` сразу | Дороже; бесплатный тариф засыпает через 15 мин — для релиза не годится |

Рекомендация: для релиза в Steam — **A** (дешевле всего при большом онлайне) или **B** (меньше всего возни).
**C** — если нужен самый простой старт по кнопке.

## Деплой

### A. Свой VPS (Hetzner или любой другой) + Caddy

1. Купите VPS с Ubuntu 24.04 (регион — Германия), добавьте свой SSH-ключ.
2. Купите домен (или используйте поддомен уже имеющегося) и создайте DNS-запись **A** `game.ваш-домен` →
   IP сервера. Дождитесь, пока она заработает (`ping game.ваш-домен`).
3. На сервере:
   ```bash
   curl -fsSL https://get.docker.com | sh
   git clone https://github.com/XDCIBX/For-3.git 25waves && cd 25waves
   git checkout claude/2-5d-multiplayer-game-9pdxlb
   cp deploy/vps/.env.example deploy/vps/.env
   nano deploy/vps/.env          # GAME_DOMAIN=game.ваш-домен, ACME_EMAIL=ваша почта
   docker compose -f deploy/vps/docker-compose.yml up -d --build
   ```
4. Проверка: `curl https://game.ваш-домен/health`. Адрес для сборок — `wss://game.ваш-домен`.
5. Обновление: `git pull && docker compose -f deploy/vps/docker-compose.yml up -d --build`.
6. Брандмауэр: открыты только 22, 80, 443 (`ufw allow 22,80,443/tcp && ufw enable`).

Caddy сам получает и продлевает сертификат Let's Encrypt, WebSocket проксирует без настройки.

### B. Fly.io

1. Зарегистрируйтесь на fly.io, привяжите карту, установите `flyctl` и выполните `fly auth login`.
2. В `fly.toml` (корень репозитория) замените `app = "CHANGE-ME-25waves"` на своё уникальное имя.
3. Из корня репозитория:
   ```bash
   fly launch --copy-config --no-deploy
   fly deploy --ha=false        # одна машина — обязательно
   fly scale count 1
   ```
4. Проверка: `curl https://<имя>.fly.dev/health`. Адрес для сборок — `wss://<имя>.fly.dev`.
5. Свой домен (необязательно): `fly certs add game.ваш-домен` и запись DNS, которую покажет команда.

### C. Render

1. Кнопка **Deploy to Render** в корневом README (или New → Blueprint → этот репозиторий).
2. `render.yaml` уже задаёт регион Frankfurt, тариф Starter, один экземпляр и `TRUST_PROXY=1`.
3. Проверка: `https://<имя>.onrender.com/health`. Адрес для сборок — `wss://<имя>.onrender.com`.

### C2. Render с Runtime = Docker (только сервер, без веб-версии)

Образ `server/Dockerfile` — только WebSocket-сервер и `/health` (12 пакетов, без Three.js/Vite), пересобирается
лишь при изменениях сервера и общей логики. Поля Web Service:

| Поле | Значение |
|---|---|
| Root Directory | пусто |
| Docker Build Context Directory | `.` |
| Dockerfile Path | `./server/Dockerfile` |
| Docker Command | пусто |
| Pre-Deploy Command | пусто |
| Build Filters → Included Paths | `server/**`, `shared/**`, `package.json`, `package-lock.json`, `.dockerignore` |
| Build Filters → Ignored Paths | `**/*.md`, `shared/test/**` |
| Environment Variables | `TRUST_PROXY` = `1` (`PORT` Render задаёт сам) |
| Health Check Path | `/health` |

Веб-версию при этом раздаёт не этот сервер (страница `/` отвечает 404) — играть через приложения и ПК-сборку
с `VITE_SERVER_URL=wss://<имя>.onrender.com`. Если нужна и веб-версия на том же адресе — корневой `Dockerfile`.

## Адрес сервера в сборках (`VITE_SERVER_URL`)

Адрес зашивается в клиент при сборке, игрокам ничего вводить не нужно (в настройках его можно сменить).

| Сборка | Как задать |
|---|---|
| **Веб-версия с этого же сервера** | Ничего: страница, открытая с `https://game.ваш-домен`, подключается к своему адресу сама |
| **Веб-версия на другом хостинге** (itch.io, Pages) | `VITE_SERVER_URL=wss://game.ваш-домен npm run build --workspace client` |
| **Android / iOS** | `cd client && VITE_SERVER_URL=wss://game.ваш-домен npm run build && npx cap sync`, затем Android Studio / Xcode |
| **ПК (Electron, Steam)** | `cd desktop && VITE_SERVER_URL=wss://game.ваш-домен npm run dist:win` (`dist:linux`, `dist:mac`) |
| **GitHub Actions** (APK и сборки для Steam) | Settings → Secrets and variables → Actions → **Variables** → `SERVER_URL` = `wss://game.ваш-домен` |

Локально адрес можно один раз записать в `client/.env.production.local`:
```
VITE_SERVER_URL=wss://game.ваш-домен
```
(файл в git не попадает; действует для `npm run build`, в том числе при сборке ПК-версии).

## Что нужно сделать вам

1. Выбрать вариант (A, B или C).
2. Завести аккаунт у хостинга (для A и B — с банковской картой).
3. Для A: купить VPS и домен (или поддомен) и создать DNS-запись. Для B и C домен необязателен.
4. Выполнить шаги деплоя выше (или дать мне доступ — тогда сделаю сам).
5. Добавить переменную `SERVER_URL` в GitHub (Settings → Variables) — после этого CI соберёт APK и ПК-версии
   с этим адресом.
6. Открыть `https://<адрес>/health` и проверить сетевую игру с двух устройств.
