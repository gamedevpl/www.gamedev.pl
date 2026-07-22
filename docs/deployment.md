# Deployment

> **Status: ✅ Deployed & live (2026-07-22).** The app (web + API) runs as **one Cloud Run
> service** at `https://gamedev-app-334141807880.europe-central2.run.app` (GCP project
> `gamedevpl`, region `europe-central2`, service `gamedev-app`, scale-to-zero). The live
> `www.gamedev.pl` GitHub Pages site is **not touched**. **The app is currently locked behind
> HTTP Basic Auth** (a temporary "not public yet" gate — see below). Browse/play is live;
> **submissions are pending the `github-token` secret** (submission routes return 503 until
> it is added — see below). See [`steel-thread-plan.md`](./steel-thread-plan.md) §M5.

## Secrets & access (current live state)

Secrets live only in GCP Secret Manager (never in the repo); the Cloud Run runtime service
account (`<project-number>-compute@developer.gserviceaccount.com`) needs
`roles/secretmanager.secretAccessor` on each. `infra/deploy-api.sh` wires whichever exist into
a single `--set-secrets` list.

| Secret                    | Purpose                                                                | State (2026-07-22)      |
| ------------------------- | ---------------------------------------------------------------------- | ----------------------- |
| `site-basic-auth`         | `"user:password"` → `SITE_BASIC_AUTH`; locks the whole app (web + API) | ✅ set (app is private) |
| `submission-token-secret` | HMAC key for the stateless status token → `SUBMISSION_TOKEN_SECRET`    | ✅ set                  |
| `github-token`            | Fine-grained PAT (Issues rw + PRs r + Contents r, games repo only)     | ❌ **not yet created**  |

- **Enable submissions:** create `github-token`, grant the runtime SA accessor on it, and
  redeploy. Both `github-token` and `submission-token-secret` must be present for submissions
  to leave 503.
- **Remove the access lock (make public):** `gcloud secrets delete site-basic-auth` and
  redeploy (or deploy without wiring it). Basic Auth over HTTPS is a stopgap; a domain +
  proper auth is a later decision.

## How to deploy (concrete)

### The app → Cloud Run, single same-origin service (owner-run)

[`apps/api/Dockerfile`](../apps/api/Dockerfile) is a multi-stage image built from the repo root
(monorepo context). It builds both the API and the static web bundle, and the Fastify server
serves that bundle from the same origin (`WEB_DIST_DIR`), so the browser makes only same-origin
requests to `/api` — no CORS, no second service, and the Pages site is never involved.

[`infra/deploy-api.sh`](../infra/deploy-api.sh) builds the image via Cloud Build, pushes it to
Artifact Registry, and deploys to Cloud Run with `--min-instances 0` (scale-to-zero). Two secrets
live in Secret Manager (never in the repo): `github-token` (a fine-grained PAT — Issues
read/write, Pull requests read, Contents read, scoped to the games repo only) and
`submission-token-secret` (`openssl rand -hex 32`). Non-secret config (`GAMES_REPO`,
`CATALOG_URL`) is plain env. The script wires the secrets **only if both exist**, so a first
deploy without them is browse/play-only (submission routes return 503); add the secrets and
redeploy to enable submissions. See the header comment in the script for the one-time
secret-creation commands.

If the owner prefers another host (Fly.io, a VPS), nothing in `apps/api` assumes Cloud Run — it
reads `PORT`/`HOST`/`WEB_DIST_DIR` from env.

Pointing a domain (e.g. `next.gamedev.pl`) at the Cloud Run service, and eventually replacing
the old Pages site, are separate owner decisions after the thread works end-to-end.

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
