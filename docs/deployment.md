# Deployment

> **Status: ✅ Automated via GitHub Actions (`deploy.yml`).** The app (web + API) runs as **one Cloud Run
> service** at `https://gamedev-app-334141807880.europe-central2.run.app` (GCP project
> `gamedevpl`, region `europe-central2`, service `gamedev-app`, scale-to-zero). The live
> `www.gamedev.pl` GitHub Pages site is **not touched**. **The app is currently locked behind
> HTTP Basic Auth** (a temporary "not public yet" gate — see below). Browse/play is live;
> **submissions are pending the `github-token` secret** (submission routes return 503 until
> it is added — see below). See [`steel-thread-plan.md`](./steel-thread-plan.md) §M5.

## Automated CD Pipeline (`.github/workflows/deploy.yml`)

Deployments to Cloud Run are triggered on push to `master`:

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

## Outbound email (Resend)

Email is used for **beta invites** today (`npm run beta:invite`) and is the shared
foundation for **notifications** later (see [`notifications-plan.md`](./notifications-plan.md)).
The provider is **Resend** (EU / Ireland sending region), reached over its HTTP API — SMTP is
blocked on Cloud Run. The transport lives behind a seam ([`apps/api/src/mailer.ts`](../apps/api/src/mailer.ts)):
with `RESEND_API_KEY` present it sends for real, without it the mailer **degrades to a no-op
console logger**, so deploys stay green whether or not email is configured.

### Sender identity & DNS (one-time, owner-run)

Email is sent from a **dedicated subdomain** — `noreply@mail.gamedev.pl` — so sending
reputation is isolated from the root domain. In the Resend dashboard, **Add Domain →
`mail.gamedev.pl`**, choose the **EU (Ireland)** region, then add the records Resend generates
at the DNS host (gamedev.pl runs on **AWS Route 53**). Verified live values:

| Type | Name                                | Value                                             | Purpose                   |
| ---- | ----------------------------------- | ------------------------------------------------- | ------------------------- |
| MX   | `send.mail.gamedev.pl`              | `feedback-smtp.eu-west-1.amazonses.com` (prio 10) | bounce/complaint feedback |
| TXT  | `send.mail.gamedev.pl`              | `v=spf1 include:amazonses.com ~all`               | SPF (authorized senders)  |
| TXT  | `resend._domainkey.mail.gamedev.pl` | `p=…` (per-domain key from the dashboard)         | DKIM signing (1024-bit)   |

- **DKIM value is per-domain** — copy it verbatim from the Resend dashboard; it is not
  reproduced here.
- **DMARC needs no subdomain record.** The org-level `_dmarc.gamedev.pl` (`v=DMARC1; p=none;`)
  already covers `mail.gamedev.pl` via DMARC's organizational-domain fallback (subdomains
  inherit `p=` when no `sp=`/subdomain record exists). Add a dedicated `_dmarc.mail.gamedev.pl`
  only if you later want a different policy or separate reports for this stream.

### The `resend-api-key` secret

Like the other secrets, the key lives only in Secret Manager and is referenced **by name** in
both deploy paths; the value is never in the repo.

```bash
# Create (first time):
printf '%s' '<Resend API key: re_...>' \
  | gcloud secrets create resend-api-key --data-file=- --replication-policy=automatic --project gamedevpl
# Let the Cloud Run runtime SA read it:
gcloud secrets add-iam-policy-binding resend-api-key \
  --member="serviceAccount:334141807880-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" --project gamedevpl
# Rotate later (new version; takes effect on the next revision):
printf '%s' '<new key>' | gcloud secrets versions add resend-api-key --data-file=- --project gamedevpl
```

Optional plain env vars (both have code defaults, so only set to override):
`MAIL_FROM` (default `gamedev.pl <noreply@mail.gamedev.pl>`) and `INVITE_URL`
(default `https://www.gamedev.pl`).

### Sending beta invites

`beta:invite` pre-approves the address in the `waitlist` collection (same as `beta:approve`)
**and** emails the invitation, so a colleague gets a link instead of discovering the site and
joining the waitlist first. Run it from a shell with `RESEND_API_KEY` exported:

```bash
export RESEND_API_KEY='re_...'
npm run beta:invite -w @gamedevpl/api -- friend@example.com            # en
npm run beta:invite -w @gamedevpl/api -- friend@example.com --locale pl
npm run beta:invite -w @gamedevpl/api -- friend@example.com --dry-run  # preview: no write, no send
```

It refuses to run without `RESEND_API_KEY` (rather than silently not sending); `--dry-run`
previews the rendered email with no Firestore write and no send. See
[`.claude/skills/managing-beta-participants`](../.claude/skills/managing-beta-participants) for
the full access model.

## How to deploy manually

[`apps/api/Dockerfile`](../apps/api/Dockerfile) is a multi-stage image built from the repo root
(monorepo context). It builds both the API and the static web bundle, and the Fastify server
serves that bundle from the same origin (`WEB_DIST_DIR`), so the browser makes only same-origin
requests to `/api` — no CORS, no second service, and the Pages site is never involved.

[`infra/deploy-api.sh`](../infra/deploy-api.sh) can be used to manually trigger Cloud Build, push to
Artifact Registry, and deploy to Cloud Run with `--min-instances 0` (scale-to-zero) from a local environment.

## Infrastructure

Infrastructure provision and deployment rely on GCP Cloud Run, Artifact Registry, Cloud Build, and Secret Manager. No Terraform configuration is used or required.
