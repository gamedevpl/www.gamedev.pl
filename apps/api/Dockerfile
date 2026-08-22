# Multi-stage image for the gamedev.pl app: one service that serves BOTH the static
# web build and the submission API from the same origin (so the live www.gamedev.pl
# Pages site is never touched, and the browser makes only same-origin requests).
# Build context is the repo ROOT (this is a npm-workspaces monorepo):
#   docker build -f apps/api/Dockerfile -t gamedev-app .
#
# The runtime stage carries each workspace package's dist plus prod node_modules
# (fastify, @fastify/cors, @fastify/static, zod).

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
# The party relay's URL. This one is load-bearing rather than cosmetic: once the relay is
# split out, the app origin stops serving /api/mp/ws, so a bundle built without this value
# resolves the socket to its own origin and every lobby 404s. Empty is correct only while
# the socket is still served in-process. See apps/web/src/mp/protocol.ts.
ARG VITE_MP_RELAY_URL=
ENV VITE_MP_RELAY_URL=$VITE_MP_RELAY_URL

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
COPY packages/contract/package.json packages/contract/
COPY packages/zone-core/package.json packages/zone-core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# NOT --omit=optional, and the reason is worth the paragraph. It used to be here to keep
# `isolated-vm` (zone-core's optional dependency, needed only by the world service) out of
# this image — but esbuild ships its native engine the same way, as optional per-platform
# packages (`@esbuild/linux-x64`), with its postinstall as the only fallback. Combined with
# --ignore-scripts, that flag installed esbuild's JavaScript wrapper and none of its engine,
# so every `build()` and `transform()` in this container threw at runtime.
#
# Nothing noticed for months: published games are served from the pre-baked snapshot, so the
# server never assembled one. The remix code lane is the first feature that needs to, and it
# answered "this game cannot be remixed that deeply yet" for every game on the site.
#
# --ignore-scripts still does the job the flag was reached for: isolated-vm arrives as source
# and is never compiled, which costs disk and nothing else, while esbuild's engine is a
# prebuilt binary that needs no script to work. Keep both flags off this line together.
RUN npm ci --omit=dev --ignore-scripts

# Built output: API dist, workspace package dists, and the static web bundle.
#
# Unlike `npm run build` above, this list is NOT driven by package.json — every workspace
# package the API imports needs its own COPY line here (and a package.json COPY above), or
# the runtime stage boots with a `dist/` the builder never populated. #323 (zone-core) and
# the @gamedevpl/contract package below both shipped as ERR_MODULE_NOT_FOUND at container
# boot, caught only by the "Production image" CI job's health-check — not by a green build.
COPY --from=builder /app/packages/contract/dist packages/contract/dist
COPY --from=builder /app/packages/zone-core/dist packages/zone-core/dist
COPY --from=builder /app/apps/api/dist apps/api/dist
COPY --from=builder /app/apps/web/dist apps/web/dist

# Cloud Run sets $PORT (default 8080); server.ts reads PORT and HOST from env.
EXPOSE 8080
USER node
CMD ["node", "apps/api/dist/server.js"]
