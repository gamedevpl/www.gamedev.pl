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
# The catalog and published games are served by the API itself (from the games repo via
# the authenticated GitHub API), so no games origin is baked into the bundle.
ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ARG VITE_GOOGLE_OAUTH_CLIENT_ID=
ENV VITE_GOOGLE_OAUTH_CLIENT_ID=$VITE_GOOGLE_OAUTH_CLIENT_ID
# Sign in with Apple's Services ID. Empty until the owner creates one in the Apple
# Developer portal, and an empty value simply hides the button (see AppleSignInButton).
ARG VITE_APPLE_SERVICES_ID=
ENV VITE_APPLE_SERVICES_ID=$VITE_APPLE_SERVICES_ID

COPY . .
# --ignore-scripts: skip the repo's `prepare`/husky hook (dev-only) during image builds.
RUN npm ci --ignore-scripts
# Delegate to the root `build` script rather than listing workspaces here. This file used
# to spell the sequence out, which meant adding a package updated the root script and left
# the image behind: #323 added @gamedevpl/zone-core, CI stayed green because the workspace
# root resolves it, and every deploy failed because `tsc -p apps/api` could not — the API
# imports real values from it (ticket minting, schema parsing), so it must be built first.
# One list, in package.json, is the fix that survives the next package.
RUN npm run build

# ---- runtime: prod deps only + built output ----
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    WEB_DIST_DIR=/app/apps/web/dist

# Workspace package manifests must all be present for `npm ci` to resolve the tree.
COPY package.json package-lock.json ./
COPY packages/game-generator/package.json packages/game-generator/
COPY packages/zone-core/package.json packages/zone-core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# --omit=optional keeps `isolated-vm` out of THIS image. It is zone-core's only external
# dependency and it is optional precisely so that consumers who never open a cage skip a
# native build. The API only mints tickets and parses schemas; the cage runs in the
# separate world service, which has its own Dockerfile and installs it there.
RUN npm ci --omit=dev --omit=optional --ignore-scripts

# Built output: API dist, game-generator dist + runtime templates, and the static web bundle.
COPY --from=builder /app/packages/game-generator/dist packages/game-generator/dist
COPY --from=builder /app/packages/game-generator/templates packages/game-generator/templates
COPY --from=builder /app/packages/zone-core/dist packages/zone-core/dist
COPY --from=builder /app/apps/api/dist apps/api/dist
COPY --from=builder /app/apps/web/dist apps/web/dist

# Cloud Run sets $PORT (default 8080); server.ts reads PORT and HOST from env.
EXPOSE 8080
USER node
CMD ["node", "apps/api/dist/server.js"]
