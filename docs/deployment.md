# Deployment

> **Status: ✅ Automated via GitHub Actions (`deploy.yml`).** The app (web + API) runs as **one Cloud Run
> service** at `https://gamedev-app-334141807880.europe-central2.run.app` (GCP project
> `gamedevpl`, region `europe-central2`, service `gamedev-app`, scale-to-zero). The live
> `www.gamedev.pl` GitHub Pages site is **not touched**. **The app is currently locked behind
> HTTP Basic Auth** (a temporary "not public yet" gate — see below). Browse/play is live;
> **submissions are pending the `github-token` secret** (submission routes return 503 until
> it is added — see below). See [`steel-thread-plan.md`](./steel-thread-plan.md) §M5.

## Automated CD Pipeline (`.github/workflows/deploy.yml`)

Deployments to Cloud Run are triggered on push to `the-new-gamedevpl`:

1. **CI Gate (`ci-gate`):** Runs `npm run lint`, `npm run type-check`, `npm run test`, `npm run build` on Node 20.
2. **Keyless OIDC Auth:** Authenticates via GCP Workload Identity Federation (no long-lived service account keys).
3. **Cloud Build Image Creation:** Submits image build using `infra/cloudbuild.yaml` to Artifact Registry. The WIF deployer service account must also have `roles/serviceusage.serviceUsageConsumer` and storage access for the default Cloud Build staging bucket; `infra/setup-wif.sh` grants both.
4. **Staging / Candidate Revision:** Deploys revision to Cloud Run with `--no-traffic --tag candidate`.
5. **Candidate Smoke Test:** Performs HTTP status check on `${CANDIDATE_URL}/api/health`.
6. **Traffic Promotion & Tag Cleanup:** Promotes traffic to the latest revision (`--to-latest`) and removes the candidate tag (`--remove-tags candidate`) only if the smoke test succeeds.

## Secrets & access (current live state)

Secrets live only in GCP Secret Manager (never in the repo); the Cloud Run runtime service
account (`<project-number>-compute@developer.gserviceaccount.com`) needs
`roles/secretmanager.secretAccessor` on each. `deploy.yml` and `infra/deploy-api.sh` wire whichever exist into
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

## How to deploy manually

[`apps/api/Dockerfile`](../apps/api/Dockerfile) is a multi-stage image built from the repo root
(monorepo context). It builds both the API and the static web bundle, and the Fastify server
serves that bundle from the same origin (`WEB_DIST_DIR`), so the browser makes only same-origin
requests to `/api` — no CORS, no second service, and the Pages site is never involved.

[`infra/deploy-api.sh`](../infra/deploy-api.sh) can be used to manually trigger Cloud Build, push to
Artifact Registry, and deploy to Cloud Run with `--min-instances 0` (scale-to-zero) from a local environment.

## Infrastructure

Infrastructure provision and deployment rely on GCP Cloud Run, Artifact Registry, Cloud Build, and Secret Manager. No Terraform configuration is used or required.
