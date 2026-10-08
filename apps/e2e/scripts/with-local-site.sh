#!/usr/bin/env bash
# Serves the built SPA through the API on loopback, then runs "$@" against it.
# CI uses it to run framed-play on every PR: README.md § Framed play against a local build.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
dist="$root/apps/web/dist"
port="${E2E_LOCAL_PORT:-3099}"

# A stale or missing build tests nothing that this branch ships.
if [ ! -f "$dist/index.html" ] || [ ! -f "$dist/sw.js" ]; then
  echo "error: no web build at $dist; run: npm run build -w @gamedevpl/web" >&2
  exit 1
fi

log="$(mktemp)"
# Not NODE_ENV=production: that selects Firestore, and this server needs no store.
PORT="$port" HOST=127.0.0.1 WEB_DIST_DIR="$dist" \
  "$root/node_modules/.bin/tsx" "$root/apps/api/src/platform/server.ts" >"$log" 2>&1 &
server=$!
trap 'kill "$server" 2>/dev/null || true; wait "$server" 2>/dev/null || true; rm -f "$log"' EXIT

ready=0
for _ in $(seq 1 60); do
  if curl -sf -o /dev/null "http://127.0.0.1:$port/api/health"; then
    ready=1
    break
  fi
  if ! kill -0 "$server" 2>/dev/null; then break; fi
  sleep 1
done
if [ "$ready" != 1 ]; then
  echo "error: local API did not come up on port $port" >&2
  cat "$log" >&2
  exit 1
fi

# No token: globalSetup would exchange it against this server. No proxy: Playwright
# sends even loopback traffic through one.
env -u GAMEDEV_ACCESS_TOKEN -u HTTPS_PROXY -u https_proxy -u HTTP_PROXY -u http_proxy \
  E2E_BASE_URL="http://127.0.0.1:$port" "$@"
