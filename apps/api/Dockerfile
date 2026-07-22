# Multi-stage image for the gamedev.pl app: one service that serves BOTH the static
# web build and the submission API from the same origin (so the live www.gamedev.pl
# Pages site is never touched, and the browser makes only same-origin requests).
# Build context is the repo ROOT (this is a npm-workspaces monorepo):
#   docker build -f apps/api/Dockerfile -t gamedev-app .
#
# The API depends on the @gamedevpl/game-generator workspace package, which reads
# its template files at runtime, so the runtime stage carries that package's dist
# AND templates, plus prod node_modules (fastify, @fastify/cors, @fastify/static, zod).

# ---- builder: install everything and compile TS + build the web app ----
FROM node:20-slim AS builder
WORKDIR /app

# Web build-time config (baked into the static bundle). Same-origin API, so no base URL.
ARG VITE_GAMES_ORIGIN=https://gamedevpl.github.io/www.gamedev.pl-games
ARG VITE_API_BASE_URL=
ENV VITE_GAMES_ORIGIN=$VITE_GAMES_ORIGIN \
    VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY . .
# --ignore-scripts: skip the repo's `prepare`/husky hook (dev-only) during image builds.
RUN npm ci --ignore-scripts
RUN npm run build -w @gamedevpl/game-generator \
 && npm run build -w @gamedevpl/api \
 && npm run build -w @gamedevpl/web

# ---- runtime: prod deps only + built output ----
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    WEB_DIST_DIR=/app/apps/web/dist

# Workspace package manifests must all be present for `npm ci` to resolve the tree.
COPY package.json package-lock.json ./
COPY packages/game-generator/package.json packages/game-generator/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --ignore-scripts

# Built output: API dist, game-generator dist + runtime templates, and the static web bundle.
COPY --from=builder /app/packages/game-generator/dist packages/game-generator/dist
COPY --from=builder /app/packages/game-generator/templates packages/game-generator/templates
COPY --from=builder /app/apps/api/dist apps/api/dist
COPY --from=builder /app/apps/web/dist apps/web/dist

# Cloud Run sets $PORT (default 8080); server.ts reads PORT and HOST from env.
EXPOSE 8080
USER node
CMD ["node", "apps/api/dist/server.js"]
