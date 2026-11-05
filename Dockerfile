# Игровой сервер + веб-клиент в одном контейнере.
# Сборка:  docker build -t 25waves .
# Запуск:  docker run -p 2567:2567 25waves        → http://localhost:2567, /health
# TLS (https/wss) делает прокси перед контейнером: Caddy (deploy/vps), Fly.io, Render.
# Базовый образ можно сменить, например на зеркало: --build-arg NODE_IMAGE=mirror.gcr.io/library/node:22-alpine
ARG NODE_IMAGE=node:22-alpine
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY . .
# Веб-клиент, раздаваемый этим же сервером, подключается к своему адресу сам — VITE_SERVER_URL не нужен.
# Его можно задать, если веб-версия будет лежать на другом домене: --build-arg VITE_SERVER_URL=wss://…
ARG VITE_SERVER_URL=
ENV VITE_SERVER_URL=$VITE_SERVER_URL
RUN npm run build

FROM ${NODE_IMAGE}
WORKDIR /app
ENV NODE_ENV=production \
    PORT=2567 \
    HOST=0.0.0.0
COPY --from=build --chown=node:node /app/server/dist ./server/dist
COPY --from=build --chown=node:node /app/client/dist ./client/dist
USER node
EXPOSE 2567
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/health" || exit 1
# node сам обрабатывает SIGTERM: закрывает соединения с кодом 1012 и выходит
CMD ["node", "server/dist/server.mjs"]
