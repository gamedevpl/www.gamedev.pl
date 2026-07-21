# agent-runner: a self-contained container that runs ONE game-generation job and
# exits, emitting a GameProject (see packages/game-generator/src/types.ts) as JSON.
#
# The default path (AGENT_MODE=mock) needs NO network and NO tokens, so this image
# BUILDS and RUNS end-to-end offline. The runner is dependency-free ESM JS — there
# is no npm install or build step inside the image.
#
# This harness is AGENT-AGNOSTIC: which agent/CLI/auth runs inside is a runtime
# concern injected via env vars (AGENT_CMD/AGENT_ARGS), never hardcoded. AGENT_MODE=
# external is pluggable but UNSET BY DEFAULT — with no AGENT_CMD it refuses to run,
# so the image can never execute a third-party agent or spend money by accident.
# Running a subscription coding CLI as multi-tenant backend compute is an unresolved
# ToS question — see ../../docs/risks-and-open-questions.md (B1/B2).
FROM node:20-slim

# Prerequisites for the Claude Code CLI (git is required; ripgrep backs its search
# tools — a copy ships with the CLI on glibc, the system package is belt-and-braces;
# ca-certificates for HTTPS to the API).
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ripgrep ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Installed as ROOT, on purpose: npm's global prefix (/usr/local/lib/node_modules)
# is root-owned, so a global install after `USER agent` would fail with EACCES.
# Installing here puts `claude` on PATH for every user, including `agent`.
# Nothing is authenticated at build time — no key is baked into the image.
RUN npm install -g @anthropic-ai/claude-code && claude --version

# Non-root: the job runs as an unprivileged user. stdout is the primary output
# contract, so no writable host mount is required for the default flow.
RUN useradd --create-home --shell /bin/bash agent
# Pre-create OUTPUT_PATH's directory owned by `agent`. Without this the unprivileged
# user cannot mkdir /out, so the documented file artifact silently never appears
# (stdout still works, but the run logs a confusing EACCES).
RUN mkdir -p /out && chown agent:agent /out
WORKDIR /app

# The runner and its template working dir. Copied explicitly (no node_modules, no
# build) to keep the image minimal and the build offline-friendly.
COPY --chown=agent:agent runner.mjs ./runner.mjs
COPY --chown=agent:agent template ./template

# Defaults; callers override with -e. OUTPUT_PATH is the conventional file mount
# point; stdout is the primary contract that ContainerGameGenerator parses.
#
# HOME must be set and writable: the Claude Code CLI creates ~/.claude on first run,
# and fails without it. DISABLE_AUTOUPDATER stops the CLI trying to update itself in
# an ephemeral container (pointless, and it would fail as non-root anyway).
ENV AGENT_MODE=mock \
    PROMPT="" \
    OUTPUT_PATH=/out/game-project.json \
    HOME=/home/agent \
    DISABLE_AUTOUPDATER=1

USER agent
ENTRYPOINT ["node", "/app/runner.mjs"]
