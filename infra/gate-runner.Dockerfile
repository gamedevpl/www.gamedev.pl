# The image the quality gate runs in.
#
# Every gate run used to rebuild this environment from scratch inside the paid build:
# clone the platform, `apt-get install ffmpeg chromium`, `npm ci` the monorepo, then
# `npm run build:packages` — four phases identical on every run, before a single line of
# the candidate was looked at. Baking them here moves that work onto the GitHub runner,
# inside its free allowance, exactly as `deploy.yml` already does for the app image:
#
#   Built on this runner, not in Cloud Build. […] every master push was paying Cloud
#   Build to do it a second time — 627 builds and ~1,900 default-pool minutes in
#   August 2026, for work GitHub's runner does inside its free allowance.
#
# Same trade, second place. September 2026 was ~2 gate runs a day at roughly 12 paid
# minutes each, of which 4–5 were this setup; the budget alert that prompted the change
# fired on a month that would otherwise have finished just under its ceiling.
#
# HOSTILE-INPUT INVARIANT (BY-11): this image is CONFIG, not data. It is built from the
# platform repo at a reviewed commit and pinned by digest-bearing tag into the build
# spec. Candidate sources never enter it — they are fetched inside the run, as before.
# One consequence is a tightening rather than a cost saving: the paid step no longer
# runs `apt-get` in the same container that later executes agent-authored code.
#
# Build context is the repo ROOT (npm workspaces):
#   docker build -f infra/gate-runner.Dockerfile -t gate-runner .

# node:22 and not -slim, deliberately. Today's inline step installs on top of the full
# image and runs `npm ci` with scripts enabled, so zone-core's optional `isolated-vm`
# compiles against a toolchain that is present. Slimming the base here would change what
# the gate's dependency tree resolves to, which is a different change from making it
# faster — and one that would be discovered as a failing gate rather than a failing build.
FROM node:22

# Chromium from apt rather than a per-run Playwright/Puppeteer download: the capture
# harness expects a browser on PATH, and one install at image build time beats a fetch
# inside every gate run.
RUN apt-get update -qq \
 && apt-get install -y -qq --no-install-recommends ffmpeg chromium git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# A shim rather than the browser itself, for two reasons carried over verbatim from the
# inline step (keep the three in step — here, infra/cloudbuild-gate.yaml, and
# apps/api/src/delivery/gate-trigger.ts):
#
#   1. Debian installs the browser as `chromium`, while the capture harness defaults to
#      spawning `google-chrome` — "a browser is on PATH" is not enough, it has to be
#      under a name the harness looks for, or capture dies on ENOENT.
#   2. Build steps run as root, and Chrome refuses to start as root without --no-sandbox.
#      `tools/capture.ts` adds that flag for neither case and does not take it from the
#      environment. Fixed here rather than in the games repo on purpose: that file is
#      hashed whole into `captureSourceHash`, so touching it restages the media of every
#      published game — a catalog-wide recapture to fix our container.
RUN chrome_bin="$(command -v chromium || command -v chromium-browser || command -v google-chrome)" \
 && printf '#!/bin/sh\nexec "%s" --no-sandbox "$@"\n' "$chrome_bin" > /usr/local/bin/gate-chrome \
 && chmod +x /usr/local/bin/gate-chrome

ENV GAME_CAPTURE_CHROME=/usr/local/bin/gate-chrome \
    CHROME_PATH=/usr/local/bin/gate-chrome \
    PUPPETEER_SKIP_DOWNLOAD=1

# The platform the gate runs *from*. Not the harness: that is the games repo at the
# version's own pinned engine ref, which only the manifest knows, so the runner still
# fetches it per run.
#
# Baking it changes one thing worth stating plainly. The gate used to clone `master` at
# the moment of the run; it now carries the platform from the image, which `deploy.yml`
# builds from the same commit it deploys. So a candidate is checked against the code that
# is actually serving the site rather than a master that may be minutes ahead of it —
# which is the stricter reading of what a gate verdict is supposed to mean.
WORKDIR /opt/platform
COPY . .

# Scripts left enabled, matching the inline step this replaces: see the base-image note
# above, and apps/api/Dockerfile's paragraph on why --omit=optional must stay off an
# esbuild-bearing install.
RUN npm ci --no-audit --no-fund

# Workspace packages resolve through `main: dist/index.js`, and `dist` is gitignored —
# `npm ci` symlinks them but leaves them unbuilt. The gate did not run this once, and the
# first `@gamedevpl/contract` import to reach its module graph took every run down at
# load: no verdict written, deliveries stuck in `submitted` reading as "verification
# hasn't started". Keep ahead of gate:run.
RUN npm run build:packages

# No CMD: Cloud Build supplies the entrypoint and the command for each run.
