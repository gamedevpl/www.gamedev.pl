# Deployment

> **Status: ✅ Live in closed beta at [www.gamedev.pl](https://www.gamedev.pl)**, deployed
> automatically by GitHub Actions (`deploy.yml`) after CI succeeds on `master`.
>
> The app (web + API) runs as **one Cloud Run service**: project `gamedevpl`, region
> **`europe-west1`**, service `gamedev-app`, scale-to-zero and pinned to **one instance** until
> the party relay is split out (see "Splitting the party relay out" below). The
> custom domain is a native Cloud Run domain mapping; the apex `gamedev.pl` 301-redirects to
> `www`. The old GitHub Pages site no longer serves this domain — it survives only in this
> repo's early history.
>
> **Access is gated by `PRIVATE_BETA=true`**, not by HTTP Basic Auth: anonymous visitors get
> the splash, and data routes require a session on the beta allowlist. Published games named
> by `PUBLIC_PLAY_SLUGS` are the deliberate promotional exception. Browse, play, and
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

Deployments to Cloud Run start when the **CI** workflow completes successfully on
`master` (`workflow_run`) — not on the push itself. That way lint / type-check / test /
build / image-boot run once (in CI), and deploy does not re-pay for them. Manual
`workflow_dispatch` on `deploy.yml` is the escape hatch for redeploying the current tip.

1. **CI (prerequisite):** `ci.yml` on `master` — secret scan, lint/type-check/test/build, games-repo contract, production image boot.
2. **Keyless OIDC Auth:** Authenticates via GCP Workload Identity Federation (no long-lived service account keys).
3. **Cloud Build Image Creation:** Submits image build using `infra/cloudbuild.yaml` to Artifact Registry. The WIF deployer service account must also have `roles/serviceusage.serviceUsageConsumer` and storage access for the default Cloud Build staging bucket; `infra/setup-wif.sh` grants both.
4. **Staging / Candidate Revision:** Deploys revision to Cloud Run with `--no-traffic --tag candidate`.
5. **Candidate Smoke Test:** Anonymous checks (health, shell, beta wall on catalog/games, waitlist open, forged bearer token rejected) plus an **authenticated smoke** when the `GAMEDEV_ACCESS_TOKEN` repo secret exists — bearer auth, token→cookie exchange, a session-walled route, and catalog/play assemble, run as the CI bot (see [`agent-access-tokens.md`](./agent-access-tokens.md)). Skips loudly when the secret is absent. The step also reads `/api/auth/token-info` and warns when the CI token has **seven days or fewer** left: expiry is mandatory and a lapsed token fails this step, which blocks promotion, so the warning is the only lead time there is. It never fails the step on the expiry check alone — an expired token is already caught by the bearer 401 above it.
6. **Browser gate (`apps/e2e`):** Drives real Chromium against the candidate and asserts the site works where HTTP checks cannot see — most importantly that **published games actually run**. See below for why this blocks.
7. **Zone host (`gamedev-world`):** when `ZONE_HOST_URL` is set, CI advances the zone host's **image only** — never its env or secrets, which stay `infra/deploy-world.sh`'s business — and only when the world's own inputs changed (`apps/world`, `packages/zone-core`, `packages/contract`, the lockfile). It is deliberately not rebuilt on every deploy: a redeploy drains running zones, and `apps/world/Dockerfile` states the rule that shipping a CSS change must not mass-hibernate every live world. Runs before promotion, same as the relay, because the host is the server and the new bundle is its client.
8. **Traffic Promotion & Tag Cleanup:** Promotes traffic to the latest revision (`--to-latest`) and removes the candidate tag (`--remove-tags candidate`) only if **both** the curl smoke checks and the browser gate succeed.

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
called frozen. The sandbox invariant (`allow-scripts allow-pointer-lock`, never `allow-same-origin`) is asserted
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

### The env manifest

Both deploy paths build the service's environment independently, and `--set-env-vars`
**replaces the whole map** — so a variable one path threads and the other does not is not
half-configured, it is deleted the next time the other path runs. That is the 2026-08-04
incident recorded in [`infra/deploy-api.sh`](../infra/deploy-api.sh): a hand-set
`TRANSLATE_BUILD_LOG=false` stopped a Vertex spend leak, then vanished under an unrelated
deploy ten minutes later.

[`infra/env-manifest.json`](../infra/env-manifest.json) declares every service variable and
secret once. [`infra/check-env-manifest.mjs`](../infra/check-env-manifest.mjs) asserts both
paths thread exactly that set, and runs as part of `npm run lint`, so adding a variable to
one path alone now fails CI instead of reverting itself in production months later.

**Adding a variable:** add it to the manifest _and_ to both deploy paths in the same
change. A name that only looks like a service variable — a step-local, or something read by
a CLI rather than the service — goes under `notServiceVars` with a reason.

| Secret                                 | Purpose                                                                                                                                                                                                                                                        | State (2026-07-26)                                                                                  |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `github-token`                         | Fine-grained PAT (Issues rw + PRs r + Contents r, games repo only)                                                                                                                                                                                             | ✅ set — submissions on                                                                             |
| `GAMES_REPO_TOKEN` (GitHub Actions)    | Contents:read PAT on the games repo — validation checkout, CI lockstep check (`npm run contract:games-repo`), and snapshot bake (`publish-games.yml`)                                                                                                          | ⚠️ set on the GitHub repo (not GCP) so assemble/Check 4/music drift fails CI                        |
| `SITE_DISPATCH_TOKEN` (GitHub Actions) | Fine-grained PAT that lets the **games repo** dispatch validation and `games-published` into this repo — see [`games-snapshot.md`](./games-snapshot.md)                                                                                                        | ⚠️ set on the _games_ repo; without it the site serves the previous snapshot until a manual publish |
| `submission-token-secret`              | HMAC key for the stateless status token → `SUBMISSION_TOKEN_SECRET`                                                                                                                                                                                            | ✅ set                                                                                              |
| `MCP_AUTHORIZATION_SERVERS` (optional) | Comma-separated issuer URL(s) for the MCP OAuth authorization server — advertised in `/.well-known/oauth-protected-resource` when set. Wired into the deploy ENV_VARS map as the canonical app origin (`https://www.gamedev.pl`); not a Secret Manager secret. | ✅ set — `https://www.gamedev.pl`                                                                   |
| _(none — static)_                      | Live MCP discovery document at `/.well-known/mcp/server.json` (BY-18c). Auth facts stay in the PRM URL above; listing drafts live under `listings/mcp/` and are **not** submitted from deploy.                                                                 | always on                                                                                           |
| `session-secret`                       | HMAC key for session cookies → `SESSION_SECRET`                                                                                                                                                                                                                | ✅ set                                                                                              |
| `gemini-api-key`                       | Gemini managed-agent credential → `GEMINI_API_KEY`                                                                                                                                                                                                             | optional                                                                                            |
| `openai-api-key`                       | OpenAI managed-agent credential → `OPENAI_API_KEY`; same secret also wired to `SEED_OPENAI_API_KEY` (round-0 seeding, ops: seed-provider-selection-plan.md)                                                                                                    | optional                                                                                            |
| `anthropic-api-key`                    | Anthropic managed-agent credential → `MANAGED_AGENT_API_KEY`; same secret also wired to `SEED_ANTHROPIC_API_KEY`                                                                                                                                               | optional                                                                                            |
| `meta-api-key`                         | Round-0 seed provider credential → `SEED_META_API_KEY` — not provisioned; gated on the wave-3 legal/credential steps in seed-provider-selection-plan.md                                                                                                        | not set                                                                                             |
| `openrouter-api-key`                   | Round-0 seed provider credential → `SEED_OPENROUTER_API_KEY`; OpenRouter routes to `SEED_OPENROUTER_MODEL` (repo var), default `google/gemini-3.5-flash-lite`                                                                                                  | ✅ set                                                                                              |
| `resend-api-key`                       | Outbound email → `RESEND_API_KEY` (see below)                                                                                                                                                                                                                  | ✅ set                                                                                              |
| `vapid-private-key`                    | Web push signing → `VAPID_PRIVATE_KEY`                                                                                                                                                                                                                         | ✅ set                                                                                              |
| `site-basic-auth`                      | Former "not public yet" lock → `SITE_BASIC_AUTH`                                                                                                                                                                                                               | 🗑️ orphaned — no code or config references it; safe to delete (below)                               |

### Managed agent configuration

The managed backend is selected by these Cloud Run variables; the deploy scripts carry them
on every revision because `--set-env-vars` replaces the whole map:

| Variable                            | Meaning                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------- |
| `MANAGED_AGENT_VENDOR`              | Provider adapter: `anthropic`, `copilot`, `gemini`, or `openai`         |
| `MANAGED_AGENT_MODEL`               | Anthropic model label                                                   |
| `MANAGED_AGENT_GEMINI_MODEL`        | Gemini model label; falls back to the built-in default                  |
| `MANAGED_AGENT_OPENAI_MODEL`        | OpenAI model label — **required for OpenAI, never defaulted**           |
| `MANAGED_AGENT_ID`                  | Managed Agent resource                                                  |
| `MANAGED_AGENT_ENVIRONMENT_ID`      | Managed Environment resource                                            |
| `MANAGED_AGENT_MAX_SECONDS`         | Per-session wall-clock limit — required for every vendor                |
| `MANAGED_AGENT_MAX_LIST_COST_CENTS` | Anthropic budget in whole US cents                                      |
| `MANAGED_AGENT_COPILOT_MAX_CREDITS` | Copilot per-round credit ceiling                                        |
| `MANAGED_AGENT_MAX_TOTAL_TOKENS`    | Gemini and OpenAI native token ceiling (shared variable, either vendor) |
| `MANAGED_AGENT_VAULT_IDS`           | Optional static vaults for probe-only integrations                      |
| `MANAGED_AGENT_MCP_URL`             | The MCP endpoint the agent calls — required for every vendor            |
| `MANAGED_AGENT_COPILOT_MCP_REPO`    | The scratch repo Copilot dispatches into — required for Copilot         |
| `MANAGED_AGENT_DELIVERY_MODE`       | `preview` or `publish`                                                  |

`MANAGED_AGENT_API_KEY` is wired from the `anthropic-api-key` Secret Manager secret,
`GEMINI_API_KEY` from `gemini-api-key`, and `OPENAI_API_KEY` from `openai-api-key`. Neither
belongs in variables, the repository, or a workflow body. If the selected vendor's variables
or secret are absent, the platform slot remains unset and platform jobs stay queued; self
builds continue to work.

When `MANAGED_AGENT_MCP_URL` is set, each managed round receives its own short-lived
build-channel capability through a vendor vault. The vault is created for that session, is
keyed to the exact MCP URL, and is archived when the session ends or is cancelled. Do not put a
creator OAuth token or creator key in `MANAGED_AGENT_VAULT_IDS`: those vaults are only a
backward-compatible probe escape hatch.

`site-basic-auth` is a leftover: the running revision does not wire it, and the site answers
without an auth challenge. Access is controlled by `PRIVATE_BETA` and the beta allowlist
instead.

**Nothing references it — verified 2026-08-26.** No `.ts`, `.sh`, `.yml` or `.yaml` in the
repo mentions `site-basic-auth` or `SITE_BASIC_AUTH`, and it is absent from
[`infra/env-manifest.json`](../infra/env-manifest.json), which both deploy paths are now
asserted against. The remaining copies are this page, the M3 note in
[`auth-and-usage-plan.md`](./auth-and-usage-plan.md) and the historical snapshot in
[`steel-thread-plan.md`](./steel-thread-plan.md). Deleting it is an owner action:

```bash
gcloud secrets delete site-basic-auth --project gamedevpl
```

**`GAMES_REPO_TOKEN` is one hourly REST budget shared by two very different consumers.**
The CI lockstep check spends 2 requests per run. The snapshot bake used to spend roughly a
thousand — one per source and media file across every published game — on every
`games-published` dispatch, and on 2026-07-28 that emptied the PAT's ~5,000 requests/hour
and 403'd everything else holding it, CI included. The bake now downloads the games repo
as **one tarball** (`fetchGamesRepoArchive`), so a full bake costs 1 request instead of
~1,000; see [`games-snapshot.md`](./games-snapshot.md). If that download fails it falls
back to per-file reads, which is slower and expensive but still bakes.

A shared budget can still run out — the site's own serving reads go through the separate
`github-token`, but nothing stops a burst of manual re-bakes. The contract check
therefore treats an unreadable games repo as _no evidence about drift_: it annotates the
job with GitHub's own quota headers and passes, rather than reddening every PR in this
repo over a shared budget. Real drift still fails. Set
`GAMES_CONTRACT_REQUIRE_REMOTE=1` on the job to demand the live comparison and fail when
it cannot be made. A bake that 403s **does** stay red — that one is a real outage, since
it means the snapshot did not refresh.

**Opening the site to everyone** is a config change, not a code change: set `PRIVATE_BETA=false`
on the service (and clear the allowlists if you want). Nothing needs redeploying from source.

### Promotional game links during closed beta

Open the operator console at `/admin/limits` and edit **Promotional game links**. Enter a
comma-separated list such as `airtime,another-game`, then save. The change is stored in
Firestore and reaches instances within the displayed propagation window; no redeploy is
needed. `PUBLIC_PLAY_SLUGS` remains an optional deploy-time fallback for bootstrapping an
empty config. The API still requires each game to be published, and all other catalog,
draft, and creation routes remain gated.

## Outbound email (Resend)

Email is used for **beta invites** today (`npm run beta:invite`) and is the shared
foundation for **notifications** later (see [`notifications-plan.md`](./notifications-plan.md)).
The provider is **Resend** (EU / Ireland sending region), reached over its HTTP API — SMTP is
blocked on Cloud Run. The transport lives behind a seam ([`apps/api/src/notifications/mailer.ts`](../apps/api/src/notifications/mailer.ts)):
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

Optional plain env var on the service (has a code default, so only set to
override): `MAIL_FROM` (default `gamedev.pl <noreply@mail.gamedev.pl>`). Set it
as a repo variable — both deploy paths thread it, so a value set by hand on the
revision is wiped by the next deploy.

`INVITE_URL` (default `https://www.gamedev.pl`) is **not** a service variable:
only the `beta:invite` and `beta:welcome` CLIs read it, and those run on the operator's
machine, so set it in the shell you run the script from.

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

### Sending the waitlist welcome

`beta:welcome` mails people already on the Firestore waitlist once a spot is opening —
the email the splash promised. It is a **preview by default**: no send and no writes
until `--send`. Language follows waitlist `locale`, then a `.pl` email domain, else
English. From is the already-verified `Grzegorz <noreply@mail.gamedev.pl>`; Reply-To is
`grzegorz@gamedev.pl`, so a reply reaches the owner without adding a Resend sending domain.

```bash
# Preview everyone currently pending (no mail, no writes)
npm run beta:welcome -w @gamedevpl/api

# One person, still a preview
npm run beta:welcome -w @gamedevpl/api -- --only you@example.com

# Let that person in for real (approve + send)
export RESEND_API_KEY='re_...'
npm run beta:welcome -w @gamedevpl/api -- --approve --send --only you@example.com
```

`--send` without `RESEND_API_KEY` is refused. `--send` to pending rows also requires
`--approve`, so the mail and the allowlist stay in sync. A successful send stamps
`welcomeEmailedAt` on the waitlist doc; later runs skip those rows unless `--force`.

**Owner setup before the first real send** (the script will not do this):

1. Add a Google Workspace alias so `grzegorz@gamedev.pl` receives mail (inbound only —
   Resend keeps sending from `mail.gamedev.pl`).
2. Send one `--only you@… --approve --send` to yourself and confirm that Reply-To is
   `grzegorz@gamedev.pl` and that a reply reaches the alias.

Do not change the service `MAIL_FROM` — notification mail should keep using the subdomain.

`INVITE_URL` (default `https://www.gamedev.pl`) is read by this CLI too.

### Sending a one-time invite link

When you do not know the invitee's email, open `/admin/waitlist` and use **One-time invite
links → Create invite link**. Copy the returned link into the conversation. It is a bearer
link: the first account to accept it through Google or Apple receives beta access, and the
same link cannot be used by a second account.

The raw code is returned only when the link is created. Firestore stores its SHA-256 hash,
and claiming uses a transaction. The panel shows claimed/revoked status and can revoke an
unused link. If a link is lost or shared accidentally, revoke it and create a replacement.

A claim also writes the claimant's approved `waitlist` row (`recordBetaInviteAdmission`),
which is what makes the invite durable rather than a one-session pass: the row is what
`/admin/waitlist` lists and what `isWaitlistApproved` reads on every later sign-in. Without
it the claimant would hold a 12-hour session and then be locked out, because the link that
let them in is already spent. The row carries the uid always, and the email only when the
provider verified it — the Google/Apple sign-in paths pass one, `/api/beta-invites/claim`
does not. `requestedAt` is preserved when the claimant had already joined the waitlist.

Invites claimed before that write existed leave no row. Reconcile them:

```bash
npm run beta:invite:backfill -w @gamedevpl/api            # report only
npm run beta:invite:backfill -w @gamedevpl/api -- --apply # write the rows
```

It walks `betaInvites` where `status == 'claimed'`, takes email/name from the bound
account, and skips claimants who are already approved.

## Issuing agent access tokens

Coding agents authenticate to the deployed site with personal access tokens
([`agent-access-tokens.md`](./agent-access-tokens.md)). Deliberately **no new deployment
config**: no Secret Manager entry, no Cloud Run env var, nothing to rotate at the
infrastructure level. The only prerequisite is that `ADMIN_UIDS` already contains your uid,
which it must for the operator telemetry views anyway.

### Reviewer assessment desk

Trusted colleagues who walk the catalog (and shared creator drafts) with keep/cut
judgments use the unlisted `/review` desk — see
[`game-assessment-plan.md`](./game-assessment-plan.md) (includes the grant/revoke steps).

`REVIEWER_UIDS` is a GitHub repository variable (comma-separated `g:<sub>` uids), threaded
by both [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) and
[`infra/deploy-api.sh`](../infra/deploy-api.sh) — same durability rule as `ADMIN_UIDS`.
Admins are reviewers automatically. Locally, `REVIEWER_UIDS=dev:local` (or
`dev:<handle>` after `POST /api/auth/dev`) unlocks the desk against the in-memory store.

```bash
gh variable set REVIEWER_UIDS --body "g:111...,g:222..."
gh workflow run deploy.yml
```

### Minting a token

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
- **It needs the `playerFeedback.uid` collection-group index** from step 7 of
  [`infra/setup-gcp.sh`](../infra/setup-gcp.sh). A `9 FAILED_PRECONDITION` means one of two
  different things, and they have different remedies — read which one the message says:
  - _"That index is not ready yet"_ — the index exists and is **building**. Wait a minute
    and re-run the erase. Re-running the setup script does nothing; it will just report the
    index as already present.
  - _"no matching index found"_ — the index was never created. Run the setup script, then
    wait for the build as above.

  Either way nothing has been erased when this fires. That is arranged rather than lucky:
  feedback is the only step needing an index, so it runs **before** any vote is cleared,
  which is why an index failure cannot leave a half-done erase. A failure later in the run
  (a dropped connection during the vote walk) can leave feedback deleted and some votes
  still standing — re-run it, the command is idempotent and finishes the job.

## Naming games that predate slugs

A slug is minted at submission now, so this is for records written before that and for
anything that died between the record and its slug. Those games still work — the studio
addresses them by status token — but a token in the URL bar is what slugs exist to stop.

There are two ways in, and they run the same code (`runSlugBackfill`): the operator route
`POST /api/admin/slug-backfill?dryRun=1`, which needs an admin browser session, and the
CLI, which needs only gcloud credentials for the project:

```bash
npm run slug:backfill -w @gamedevpl/api -- --dry-run   # report, write nothing
npm run slug:backfill -w @gamedevpl/api --             # name them
```

Always rehearse first: a slug is a permanent public address. The dry run prints the exact
`{jobId, title, slug}` it would write, including the collisions it resolves — two
games called "Space Miner" get `space-miner` and `space-miner-2`, in the same run.

Abandoned builds are skipped on purpose. Their creator stopped them, so they need no
address, and taking one would only spend a name.

The CLI reads the published catalog from `gs://…-games-snapshots` before it starts, so a
minted name cannot collide with a published game — the server asks GitHub for the same
list, but the snapshot is what production actually serves and gcloud can already read it.
If that read fails the run stops rather than guess; `--skip-catalog` overrides, which is
only safe when you already know the backlog's titles.

The API is not involved and there is nothing to deploy. Note that
`POST /api/admin/slug-backfill` is `isAdminSession`-only and answers 404 to a personal
access token by design (see [agent access tokens](agent-access-tokens.md)) — the CLI is
the path for when no browser session is available, not a way around that rule.

## How to deploy manually

[`apps/api/Dockerfile`](../apps/api/Dockerfile) is a multi-stage image built from the repo root
(monorepo context). It builds both the API and the static web bundle, and the Fastify server
serves that bundle from the same origin (`WEB_DIST_DIR`), so the browser makes only same-origin
requests to `/api` — no CORS and no second service.

[`infra/deploy-api.sh`](../infra/deploy-api.sh) can be used to manually trigger Cloud Build, push
to Artifact Registry, and deploy to Cloud Run from a local environment. It deploys with
`--min-instances 0` (scale-to-zero) and a `--max-instances` value it derives — see below.

**Why the instance ceiling is 1, and what lifts it:** the multiplayer relay keeps party-mode
lobbies in the memory of a single process ([`apps/api/src/realtime/mp.ts`](../apps/api/src/realtime/mp.ts)). A
second instance would put a phone controller and the screen it controls in different processes,
and the lobby would appear empty — intermittently, which is how it gets blamed on the guest's
wifi. Raising the cap therefore requires moving that state out of the app process first. It is
not a knob to turn under load, and it is no longer _reachable_ as one: both deploy paths compute
the ceiling from `MP_RELAY_URL` rather than accepting it as input, and
[`apps/api/src/mp-relay-deploy.test.ts`](../apps/api/src/mp-relay-deploy.test.ts) fails CI if
that coupling is broken.

### Splitting the party relay out (lifting the ceiling)

The relay is the only thing that needs the pin, so it moves to its own Cloud Run service and
that service takes the pin instead. **Both services run the same image** — the role is chosen by
env (`MP_RELAY_ONLY` on the relay, `MP_RELAY_URL` on the app) — because a second Dockerfile is a
second thing to drift. See [`multiplayer-plan.md` §4.6](./multiplayer-plan.md) and
[`apps/api/src/realtime/mp-relay.ts`](../apps/api/src/realtime/mp-relay.ts) for the design.

Rollout, owner-run and in this order:

1. `PROJECT_ID=gamedevpl ./infra/deploy-relay.sh` — creates `gamedev-mp-relay` from whatever
   image `gamedev-app` is currently running, pins it to one instance, mounts `session-secret`
   (room tokens are HMAC'd from it), raises the request timeout to an hour so a websocket is
   not dropped after five minutes, and pins the OIDC audience to the service's own URL. It
   finishes by proving that an unauthenticated room-creation call is **refused**.
2. Set the Actions variable **`MP_RELAY_URL`** to the URL the script prints, then re-run the
   deploy workflow. That single variable moves room creation to the relay, stops the app serving
   the socket, and lifts the app's ceiling — one switch on purpose, because a raised ceiling on a
   service that still owns rooms is the exact outage the split exists to prevent.
3. `ALERT_EMAIL=… SERVICE=gamedev-mp-relay ./infra/setup-monitoring.sh` — a service with no
   uptime check and no alert policy is unmonitored by construction.
4. Open a lobby, join from a phone, confirm the controller moves something. Nothing above proves
   that; a relay can health-check green while the QR code goes nowhere.

Once `MP_RELAY_URL` is set, `deploy.yml` moves the relay onto each new image **before** promoting
the app — server before client, since the promoted web bundle is the relay's websocket client.
Only `--image` is updated, so a deploy cannot silently reconfigure the relay by omission.

Security shape worth understanding before touching it: the relay is `--allow-unauthenticated`
because a phone that scanned a QR has no Google identity and never will. What protects it is
app-level — the room token verified in the socket's first frame, and an audience-pinned OIDC
token from the app service on the internal create route. Missing either `MP_RELAY_AUDIENCE` or
`MP_RELAY_CALLER_SA` makes that route **deny-all**
([`internal-auth.ts`](../apps/api/src/platform/internal-auth.ts)), so a half-configured relay refuses to
open rooms rather than opening them to the internet. `PRIVATE_BETA=true` with no allowlist walls
every other route the shared image happens to register, which needs no maintenance: the relay's
whole job lives in the two paths the wall exempts.

## Infrastructure

Infrastructure provision and deployment rely on GCP Cloud Run, Artifact Registry, Cloud Build, and Secret Manager. No Terraform configuration is used or required.
