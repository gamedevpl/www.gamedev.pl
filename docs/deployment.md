# Deployment

> **Status: 🚧 M5 in progress (2026-07-22).** Hosts are chosen and the API deploy is built:
> the web app publishes to `www.gamedev.pl/next/` (Pages `gh-pages` branch) and the submission
> API runs on Cloud Run (scale-to-zero) via [`infra/deploy-api.sh`](../infra/deploy-api.sh).
> See [`steel-thread-plan.md`](./steel-thread-plan.md) §M5 for the acceptance scenario.

## How to deploy (concrete)

### Submission API → Cloud Run (owner-run)

[`apps/api/Dockerfile`](../apps/api/Dockerfile) is a multi-stage image built from the repo root
(monorepo context). [`infra/deploy-api.sh`](../infra/deploy-api.sh) builds it via Cloud Build,
pushes to Artifact Registry, and deploys to Cloud Run with `--min-instances 0`. Two secrets live
in Secret Manager (never in the repo): `github-token` (a fine-grained PAT — Issues read/write,
Pull requests read, Contents read, scoped to the games repo only) and `submission-token-secret`
(`openssl rand -hex 32`). Non-secret config (`GAMES_REPO`, `CATALOG_URL`, `WEB_ORIGIN`) is passed
as plain env. `WEB_ORIGIN=https://www.gamedev.pl` pins CORS to the site. See the header comment
in the script for the one-time secret-creation commands.

If the owner prefers another host (Fly.io, a VPS), nothing in `apps/api` assumes Cloud Run — it
reads `PORT`/`HOST` from env and needs only the four env vars plus two secrets above.

### Web app → `www.gamedev.pl/next/` (CI)

A workflow in this repo builds `apps/web` with `base: '/next/'`, `VITE_GAMES_ORIGIN`, and
`VITE_API_BASE_URL` (the Cloud Run URL), then publishes the output into the `next/` directory of
the `gh-pages` branch **without touching the root** (the old site stays live). Flipping the root
to the new app is a separate owner decision after the thread works end-to-end.

## What production needs

The games-repo pivot removes agent compute, job queues, auth proxies, and agent-runner images
from the deployment. The expected components are:

| Component            | Responsibility                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------- |
| Web app              | Static catalog and player UI                                                             |
| Games origin         | Published `catalog.json` and self-contained game bundles on a separate cookieless origin |
| Submission API       | Validate/rate-limit specs and create narrowly scoped repository issues                   |
| Repository workflows | Validate agent PRs and publish merged games                                              |

Browsing and playing should not require the submission API. GitHub Pages is the simplest first
games origin; a bucket/CDN is the scaling option. The choice remains open.

## Required security properties

- Separate app and games origins; the games origin has no app cookies or privileged endpoints.
- Restrictive CSP for game documents, especially `connect-src`, navigation, framing, and
  external assets.
- Repository credentials remain server-side and have only the permissions the submission flow
  needs.
- Untrusted PR validation receives no deployment credentials.
- Deployments use GitHub OIDC/workload identity rather than long-lived cloud keys.
- Third-party actions are pinned to commit SHAs and workflows declare least-privilege
  `permissions:`.
- Production publishing runs only from a protected branch/environment with rollback support.

## Current CI

`.github/workflows/ci.yml` installs dependencies and runs lint, type-check, tests, and build on
pushes and pull requests. It is a development gate, not a deployment workflow. No production
deploy workflow currently exists.

The dedicated games repository will need two additional workflows:

1. Validate changed games on every PR without secrets.
2. Publish catalog and bundles after a reviewed merge to its protected default branch.

## Infrastructure as code

The previous Terraform described deleted container-generation services and was intentionally
retired. New infrastructure must be written only after these decisions are recorded:

- games-repo location and output contract;
- GitHub Pages versus bucket/CDN;
- hosting platform for the web app and submission API;
- identity, moderation, and expected submission volume;
- custom domains, retention, rollback, and takedown operations.

Until then, `infra/` is a documented placeholder and `terraform apply` must create nothing.

## Suggested sequence

1. Create the games repository and its validation/publish contract.
2. Publish seed games to a separate origin.
3. Connect the catalog/player without adding backend state.
4. Design submission identity, rights, moderation, and abuse controls.
5. Add the minimal submission API.
6. Select hosting and implement narrowly scoped infrastructure and deployment workflows.
