# The gamedev-world zone host (docs/p3-zone-host-infra.md).
#
# A separate image from apps/api, and the separation is the point rather than a
# packaging detail. This image contains the `isolated-vm` native addon, which needs a
# C++ toolchain to build; putting it in the image that serves the whole website would
# make every site deploy hostage to that build. It also deploys on its own cadence, so
# shipping a CSS change does not mass-hibernate every live world.
#
# Build context is the repo ROOT (npm workspaces):
#   docker build -f apps/world/Dockerfile -t gamedev-world .

# ---- builder: toolchain present, so the native addon compiles ----
FROM node:20-slim AS builder
WORKDIR /app

# node-gyp needs python3, make and a C++ compiler to build isolated-vm.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY . .
# NOT --ignore-scripts here, unlike the API image: the install scripts are exactly what
# builds isolated-vm. Skipping them produces an image that boots and then refuses every
# zone, which is the correct refusal (see assertProductionCage) but a terrible way to
# find out.
RUN npm ci
RUN npm run build -w @gamedevpl/zone-core \
 && npm run build -w @gamedevpl/world

# ---- runtime: prod deps only + built output ----
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0

# Workspace manifests must all be present for `npm ci` to resolve the tree.
COPY package.json package-lock.json ./
COPY packages/game-generator/package.json packages/game-generator/
COPY packages/zone-core/package.json packages/zone-core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/world/package.json apps/world/
RUN npm ci --omit=dev --ignore-scripts

# The compiled addon comes from the builder rather than being rebuilt here, so the
# runtime layer keeps no toolchain. Both stages are the same base image and the same
# Node ABI, so the binary is the one this Node will load.
COPY --from=builder /app/node_modules/isolated-vm node_modules/isolated-vm
COPY --from=builder /app/packages/zone-core/dist packages/zone-core/dist
COPY --from=builder /app/apps/world/dist apps/world/dist

# Cloud Run sets $PORT; server.ts reads PORT and HOST from env.
EXPOSE 8081
USER node
CMD ["node", "apps/world/dist/server.js"]
