# Только игровой сервер (WebSocket + /health), без веб-клиента: пересобирается лишь при изменениях
# server/, shared/ и зависимостей. Контекст сборки — корень репозитория:
#   docker build -f server/Dockerfile -t 25waves-server .
#   docker run -p 2567:2567 25waves-server        → ws://localhost:2567, http://localhost:2567/health
# TLS (wss://) делает прокси перед контейнером (Render, Fly.io, Caddy). PORT хостинг может задать сам.
ARG NODE_IMAGE=node:22-alpine
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
# Ставим зависимости только сервера и общей логики — без Three.js, Vite и Capacitor
RUN npm ci --workspace @game/server --workspace @game/shared
COPY shared/ shared/
COPY server/ server/
# esbuild собирает сервер вместе с ws и shared в один файл — в итоговом образе node_modules не нужны
RUN npm run build --workspace @game/server

FROM ${NODE_IMAGE}
WORKDIR /app
ENV NODE_ENV=production \
    PORT=2567 \
    HOST=0.0.0.0
COPY --from=build --chown=node:node /app/server/dist ./server/dist
USER node
EXPOSE 2567
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/health" || exit 1
CMD ["node", "server/dist/server.mjs"]
