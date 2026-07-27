# Deployment

> **Status: ✅ Live in closed beta at [www.gamedev.pl](https://www.gamedev.pl)**, deployed
> automatically by GitHub Actions (`deploy.yml`) on every push to `master`.
>
> The app (web + API) runs as **one Cloud Run service**: project `gamedevpl`, region
> **`europe-west1`**, service `gamedev-app`, scale-to-zero with **`--max-instances 1`**. The
> custom domain is a native Cloud Run domain mapping; the apex `gamedev.pl` 301-redirects to
> `www`. The old GitHub Pages site no longer serves this domain — it survives only in this
> repo's early history.
>
> **Access is gated by `PRIVATE_BETA=true`**, not by HTTP Basic Auth: anonymous visitors get
> the splash, and data routes require a session on the beta allowlist. Browse, play, and
> **submissions are all live** — the `github-token` secret exists, so submission routes no
> longer 503.

<!-- Verified against the running service on 2026-07-26: region, URL, env, scale and secrets
     all read back from `gcloud run services describe`. If you change any of it, re-read
     rather than trusting this block. -->

**Ground truth, if you need to check rather than trust this page:**

```bash
gcloud run services describe gamedev-app --region europe-west1 --project gamedevpl
gcloud secrets list --project gamedevpl
```

## Automated CD Pipeline (`.github/workflows/deploy.yml`)

Deployments to Cloud Run are triggered on push to `master`:

1. **CI Gate (`ci-gate`):** Runs `npm run lint`, `npm run type-check`, `npm run test`, `npm run build` on Node 20.
2. **Keyless OIDC Auth:** Authenticates via GCP Workload Identity Federation (no long-lived service account keys).
3. **Cloud Build Image Creation:** Submits image build using `infra/cloudbuild.yaml` to Artifact Registry. The WIF deployer service account must also have `roles/serviceusage.serviceUsageConsumer` and storage access for the default Cloud Build staging bucket; `infra/setup-wif.sh` grants both.
4. **Staging / Candidate Revision:** Deploys revision to Cloud Run with `--no-traffic --tag candidate`.
5. **Candidate Smoke Test:** Anonymous checks (health, shell, public catalog/play, walls hold, forged bearer token rejected) plus an **authenticated smoke** when the `GAMEDEV_ACCESS_TOKEN` repo secret exists — bearer auth, token→cookie exchange, and a session-walled route, run as the CI bot (see [`agent-access-tokens.md`](./agent-access-tokens.md)). Skips loudly when the secret is absent.
6. **Browser gate (`apps/e2e`):** Drives real Chromium against the candidate and asserts the site works where HTTP checks cannot see — most importantly that **published games actually run**. See below for why this blocks.
7. **Traffic Promotion & Tag Cleanup:** Promotes traffic to the latest revision (`--to-latest`) and removes the candidate tag (`--remove-tags candidate`) only if **both** the curl smoke checks and the browser gate succeed.

### Why the browser gate blocks a deploy

Playable games are the product; a site that loads but plays nothing is worth nothing. Every
other check stops at HTTP, so play can be completely broken while the deploy is green:
proving `/api/games/<slug>` returns HTML says nothing about whether that HTML _runs_. A CSP
header, a sandbox change, a bundle regression or a broken assembler each return a healthy
200 and a black screen.

The one thing that must not block is a single badly-written game — those live in a separate,
agent-maintained repo and change independently of this one. So `games-playable.test.ts`
samples several single-player games and decides by breadth:

| Sample result        | Meaning                      | Outcome                                 |
| -------------------- | ---------------------------- | --------------------------------------- |
| most games fail      | the deploy broke play        | **blocks promotion**                    |
| exactly one fails    | that game is broken          | `::warning::`, ships                    |
| only one game exists | no warn path to fall back on | its failure **blocks** — it is the site |

Liveness is _change_, not brightness: the canvas is read in-frame and digested, so a sprite
moving across a uniform background still counts as alive, and a dark palette is not mistaken
for a black screen. A game that never moves on its own is poked with input before being
called frozen. The sandbox invariant (`allow-scripts`, never `allow-same-origin`) is asserted
on every sampled game's rendered frame — something jsdom unit tests cannot do.

Locally, the suite skips without a token or a browser — a contributor should not get
failures they cannot act on. **In CI that would be the worst outcome**: a skipped suite
exits 0 and the deploy promotes having verified nothing. So the workflow sets
`E2E_REQUIRED=1`, and `gate-prerequisites.test.ts` (which never skips) turns an unusable
environment into a failed deploy. It also pins `PLAYWRIGHT_BROWSERS_PATH` for both the
install and the run: unpinned, `playwright install` writes to `~/.cache/ms-playwright`
while the suite looks in `/opt/pw-browsers`, and the gate skips itself into uselessness.

Run it yourself against anything: `E2E_BASE_URL=https://www.gamedev.pl npm run e2e`.

## Secrets & access (current live state)

Secrets live only in GCP Secret Manager (never in the repo); the Cloud Run runtime service
account (`<project-number>-compute@developer.gserviceaccount.com`) needs
`roles/secretmanager.secretAccessor` on each. `deploy.yml` and `infra/deploy-api.sh` wire whichever exist into
a single `--set-secrets` list.

| Secret                                 | Purpose                                                                                                                                  | State (2026-07-26)                                                                                  |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `github-token`                         | Fine-grained PAT (Issues rw + PRs r + Contents r, games repo only)                                                                       | ✅ set — submissions on                                                                             |
| `GAMES_REPO_TOKEN` (GitHub Actions)    | Contents:read PAT on the games repo — CI lockstep check (`npm run contract:games-repo`) and the snapshot bake (`publish-games.yml`)      | ⚠️ set on the GitHub repo (not GCP) so assemble/Check 4/music drift fails CI                        |
| `SITE_DISPATCH_TOKEN` (GitHub Actions) | Fine-grained PAT that lets the **games repo** dispatch `games-published` into this repo — see [`games-snapshot.md`](./games-snapshot.md) | ⚠️ set on the _games_ repo; without it the site serves the previous snapshot until a manual publish |
| `submission-token-secret`              | HMAC key for the stateless status token → `SUBMISSION_TOKEN_SECRET`                                                                      | ✅ set                                                                                              |
| `session-secret`                       | HMAC key for session cookies → `SESSION_SECRET`                                                                                          | ✅ set                                                                                              |
| `resend-api-key`                       | Outbound email → `RESEND_API_KEY` (see below)                                                                                            | ✅ set                                                                                              |
| `vapid-private-key`                    | Web push signing → `VAPID_PRIVATE_KEY`                                                                                                   | ✅ set                                                                                              |
| `site-basic-auth`                      | Former "not public yet" lock → `SITE_BASIC_AUTH`                                                                                         | ⚠️ exists but **unused**                                                                            |

`site-basic-auth` is a leftover: the running revision does not wire it, and the site answers
without an auth challenge. Access is controlled by `PRIVATE_BETA` and the beta allowlist
instead. Delete the secret when you are sure nothing references it.

**Opening the site to everyone** is a config change, not a code change: set `PRIVATE_BETA=false`
on the service (and clear the allowlists if you want). Nothing needs redeploying from source.

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

## Issuing agent access tokens

Coding agents authenticate to the deployed site with personal access tokens
([`agent-access-tokens.md`](./agent-access-tokens.md)). Deliberately **no new deployment
config**: no Secret Manager entry, no Cloud Run env var, nothing to rotate at the
infrastructure level. The only prerequisite is that `ADMIN_UIDS` already contains your uid,
which it must for the operator telemetry views anyway.

Issue one the same way you approve a beta tester — from a shell with gcloud credentials for
the project:

```bash
npm run token:mint   -w @gamedevpl/api -- bot:e2e --name "claude cloud vm"
npm run token:list   -w @gamedevpl/api -- bot:e2e
npm run token:revoke -w @gamedevpl/api -- <tokenId>
```

The token prints once and is never recoverable. It creates a `bot:` account on first mint;
those accounts are excluded from creator metrics, so agent traffic does not move the
product numbers.

Storage is one new Firestore collection, `accessTokens`, keyed by token id. No composite
index is required. Expired tokens are already refused at authentication. Do **not** point
a Firestore TTL policy at `expiresAt` as stored today — that field is an ISO string, and
TTL only deletes on Timestamp/Date values (a no-op policy otherwise). Self-cleaning would
need a dedicated Timestamp field or an operator sweep; it is hygiene, not a control.

## Honouring a deletion request

The privacy notice (§8) promises that deleting an account removes the votes and written
feedback that person left on games. Deletion arrives by email, so it is an operator command
rather than an endpoint — a destructive uid-targeted route would be attack surface buying
nothing when a human already has to verify the request out of band.

```bash
npm run player:erase -w @gamedevpl/api -- g:12345 --dry-run   # preview
npm run player:erase -w @gamedevpl/api -- g:12345 --confirm   # do it
```

One of `--dry-run` or `--confirm` is required; neither-or-both exits with usage, because
the destructive reading is not one to guess at. The command is idempotent, so re-running
after a partial failure is safe.

Two things worth knowing before you run it:

- **Votes are cleared through the same transaction the product uses**, not deleted
  directly. Vote tallies live on the parent `games/{slug}` document, so a raw delete would
  leave `votesUp`/`votesDown` overstating reality permanently — a number every visitor
  sees, wrong, with nothing to catch it.
- **Play telemetry is not touched, and that is the point.** Play events carry no uid, no IP
  and no user agent by construction, so there is nothing in them to erase and nothing that
  could be found if you tried. The erase path for play data is that it was never attributed.

## How to deploy manually

[`apps/api/Dockerfile`](../apps/api/Dockerfile) is a multi-stage image built from the repo root
(monorepo context). It builds both the API and the static web bundle, and the Fastify server
serves that bundle from the same origin (`WEB_DIST_DIR`), so the browser makes only same-origin
requests to `/api` — no CORS and no second service.

[`infra/deploy-api.sh`](../infra/deploy-api.sh) can be used to manually trigger Cloud Build, push
to Artifact Registry, and deploy to Cloud Run from a local environment. It deploys with
`--min-instances 0` (scale-to-zero) and `--max-instances 1`.

**Why `--max-instances 1`:** the multiplayer relay keeps party-mode lobbies in the memory of a
single process ([`apps/api/src/mp.ts`](../apps/api/src/mp.ts)). A second instance would put a
phone controller and the screen it controls in different processes, and the lobby would appear
empty. Raising the cap therefore requires moving that state out of process first — it is not a
knob to turn under load.

## Infrastructure

Infrastructure provision and deployment rely on GCP Cloud Run, Artifact Registry, Cloud Build, and Secret Manager. No Terraform configuration is used or required.
