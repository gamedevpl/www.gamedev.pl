FROM node:22-bookworm-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee

# Google Chrome stable, not Debian's `chromium`, which trails upstream security releases.
# Same install as infra/gate-runner.Dockerfile; keep the two in step.
ARG CHROME_MIN_MAJOR=157
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
    && curl -fsSL https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] https://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends google-chrome-stable \
    && major="$(google-chrome --version | sed -E 's/[^0-9]*([0-9]+)\..*/\1/')" \
    && echo "google-chrome major ${major}" && [ "${major}" -ge "${CHROME_MIN_MAJOR}" ] \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /verifier
COPY . .
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --ignore-scripts --no-audit --no-fund && npm run build:packages \
    && chmod -R a+rX /verifier

ENTRYPOINT ["node", "--import", "tsx", "apps/api/scripts/verify-api-kit-artifacts.ts", "--container"]
