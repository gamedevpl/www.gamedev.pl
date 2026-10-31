FROM node:22-bookworm-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da

RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium chromium-sandbox ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /verifier
COPY . .
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --ignore-scripts --no-audit --no-fund && npm run build:packages \
    && chmod -R a+rX /verifier

ENTRYPOINT ["node", "--import", "tsx", "apps/api/scripts/verify-api-kit-artifacts.ts", "--container"]
