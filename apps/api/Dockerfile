# Multi-stage image for the gamedev.pl submission API.
# Build context is the repo ROOT (this is a npm-workspaces monorepo):
#   docker build -f apps/api/Dockerfile -t gamedev-api .
#
# The API depends on the @gamedevpl/game-generator workspace package, which reads
# its template files at runtime, so the runtime stage carries that package's dist
# AND templates, plus prod node_modules (fastify, @fastify/cors, zod).

# ---- builder: install everything and compile TS -> dist ----
FROM node:20-slim AS builder
WORKDIR /app

COPY . .
# --ignore-scripts: skip the repo's `prepare`/husky hook (dev-only) during image builds.
RUN npm ci --ignore-scripts
RUN npm run build -w @gamedevpl/game-generator \
 && npm run build -w @gamedevpl/api

# ---- runtime: prod deps only + built output ----
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0

# Workspace package manifests must all be present for `npm ci` to resolve the tree.
COPY package.json package-lock.json ./
COPY packages/game-generator/package.json packages/game-generator/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --ignore-scripts

# Built output + the runtime template files the mock generator reads.
COPY --from=builder /app/packages/game-generator/dist packages/game-generator/dist
COPY --from=builder /app/packages/game-generator/templates packages/game-generator/templates
COPY --from=builder /app/apps/api/dist apps/api/dist

# Cloud Run sets $PORT (default 8080); server.ts reads PORT and HOST from env.
EXPOSE 8080
USER node
CMD ["node", "apps/api/dist/server.js"]
