# Gate Cloud Build hardening (BY-11)

Engineering inventory of what a quality-gate run can reach, what this repo pins in
config, and which controls still need an owner-side GCP console (or `gcloud`) change.
No product/strategy content — ops runbooks for non-engineering topics live elsewhere.

Related config: [`cloudbuild-gate.yaml`](./cloudbuild-gate.yaml),
[`setup-gcp.sh`](./setup-gcp.sh), [`apps/api/src/delivery/gate-trigger.ts`](../apps/api/src/delivery/gate-trigger.ts),
[`apps/api/scripts/run-gate.ts`](../apps/api/scripts/run-gate.ts).

## Invariant

Submitted sources are **hostile input**. Anything a gate step can read, call, or write
is treated as attacker-reachable. Build **CONFIG** (images, steps, SA, secrets, caps)
is ours; candidate files are **data** materialized into our pinned harness only.

## Inventory — what a run can reach

| Surface                    | Before hardening                                                                                     | Intended after owner applies `setup-gcp.sh` + this config                                                                                                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Service account**        | Unspecified → project Cloud Build / Compute default (often broad: Editor-class or runtime SA powers) | `gate-runner@PROJECT.iam.gserviceaccount.com` only; submitted by `gamedev-app@…`, which may `actAs` no other account                                                                                           |
| **SA roles (intended)**    | n/a / ambient                                                                                        | Games-store `roles/storage.objectViewer` plus `objectAdmin` **conditioned to exclude every `manifest.json`** (see below); `secretmanager.secretAccessor` **on `github-token` only**; `roles/logging.logWriter` |
| **Secrets in step env**    | `GAMES_REPO_TOKEN` (`github-token`, contents:read)                                                   | Same sole secret; runner unsets it and scrubs the harness `git` remote **before** `check:game`                                                                                                                 |
| **Metadata server**        | GCE metadata credentials for the build SA                                                            | Same mechanism; blast radius limited by the gate SA’s IAM                                                                                                                                                      |
| **Network egress**         | Default Cloud Build pool: unrestricted egress                                                        | Still unrestricted until owner adds a private pool / VPC egress policy (below)                                                                                                                                 |
| **Writable paths**         | `/workspace`, `/tmp`, container root FS                                                              | Unchanged (ephemeral VM); no durable write except via games-store API                                                                                                                                          |
| **Source of build CONFIG** | This YAML + inline `gate-trigger` spec                                                               | Unchanged — slug/version are CLI data only                                                                                                                                                                     |
| **Timeout / machine**      | `3600s`, `E2_HIGHCPU_8`, default disk                                                                | `1800s`, `E2_HIGHCPU_8`, `diskSizeGb: 50`                                                                                                                                                                      |

### Egress the run actually needs

Allow-list target if/when a private worker pool or VPC-SC perimeter is applied:

1. **GitHub** (`github.com`) — shallow clone of the platform repo (public) and the games-repo harness (PAT).
2. **npm** (`registry.npmjs.org` and the registry’s CDN hosts) — `npm ci` for platform + harness.
3. **Debian apt** mirrors used by `node:22` — `ffmpeg`, `chromium`, `git`, `ca-certificates`.
4. **GCS JSON API** (`storage.googleapis.com`) — read candidate sources; write derived artifacts.
5. **This service** (`CANONICAL_HOST`) — `POST /api/internal/gate-verdict`, where the verdict goes.
6. **Secret Manager** — fetched by Cloud Build into `secretEnv` before steps (not by game code).
7. **Container image pulls** — `gcr.io/cloud-builders/git`, `node:22` (Cloud Build infrastructure).

No other Google APIs, no Firestore, no Cloud Run admin, no Artifact Registry push, no
ability to start further builds should be granted to `gate-runner`.

### Writable / durable paths

- Ephemeral: `/workspace/platform`, harness under `$TMPDIR/gate-harness-*`, apt/npm caches.
- Durable (via SA): derived artifacts under `gs://$GAMES_STORE_BUCKET/…` for the candidate
  version (`bundle.html` / `preview.html`, capture media). **Not** the manifest — see
  below.

## Store IAM: the verdict does not travel with the credential

The brief asks for “store write only.” Until 2026-09-08 the gate SA held
`roles/storage.objectAdmin` on the whole bucket, which includes **delete on every object,
published games included**, in the hands of the identity that runs hostile candidate code
by design. That was not sloppiness; it was forced by the write pattern. `putGateResult` /
`putHealthResult` update each version’s **manifest in place**, and GCS has no
overwrite-without-delete role — a replace is a delete plus a create of the same name — so
`objectCreator` + `objectViewer` could not record a verdict.

The write pattern is what changed. The gate now **POSTs its verdict** to
`POST /api/internal/gate-verdict`, and the API — whose identity the candidate cannot
reach — performs the manifest write. The gate's own bucket role is
`objectAdmin` **conditioned on `!resource.name.endsWith('/manifest.json')`**, plus
`objectViewer`. It can still rewrite its own derived artifacts, which a re-gate of the
same version needs; it can no longer touch any game's record.

Both halves are needed, and the second is easy to forget: the API's own runtime holds
`objectCreator` + `objectViewer` bucket-wide, which cannot replace an existing object
either. `setup-gcp.sh` therefore also grants it `objectAdmin` conditioned to
`games/**/manifest.json` — the exact mirror of the gate's condition. Move the write
without that grant and every gate reports progress against a 500 and finishes with no
verdict recorded.

### What binds a verdict to one game

An OIDC token would prove only _that gate-runner is calling_, which every gate run can
claim — including one running hostile code for a different game. So the endpoint takes a
**capability instead of an identity**: `gate-trigger.ts` mints an HMAC over
`{slug, version, exp}` with `SUBMISSION_TOKEN_SECRET` (already on the service — no new
secret, no new plumbing) and passes it in the build's step env. The endpoint verifies the
signature and refuses any body naming a different slug or version.

The capability names a **lane** as well as a version. A health re-gate's capability
records health and progress and nothing else, so candidate code cannot post
`kind: "gate"` and overwrite the acceptance verdict — which is provenance, and is
supposed to survive a red re-run. Progress is open to every lane; the three terminal
verdicts are not.

The capability is readable by candidate code, and that is fine: it is scoped to the game
that code already belongs to, and now to the one verdict its run is entitled to write. Six-hour expiry, so it outlives a queued build and not much
else.

### Applying the IAM change without stranding a build

A build carries the capability in its own immutable spec, so a run submitted by the
pre-change API has none and falls back to the direct writer. Revoke the gate's manifest
write while one of those is queued or running and it finishes its checks against a 403,
leaving a delivery unverified with no verdict and no error the agent can act on.
Deploying the new trigger does not retrofit a build already submitted.

So the revocation goes last, after the new code is serving and the queue is empty:

```bash
gcloud builds list --ongoing --project gamedevpl --filter='tags:gate' --format='value(id,createTime)'
```

Empty, or every entry started after the deploy, means nothing is stranded. `setup-gcp.sh`
is safe to re-run at any point before that — it only adds the narrow bindings; the
removal of the broad one is the step that needs the drain.

The same asymmetry applies in reverse. A **rollback** to a revision from before this
change puts the old trigger back, and its builds carry no capability, so they need the
direct write this revocation removed. `docs/runbooks/rollback-deploy.md` carries the one
command that restores it and the note to take it away again afterwards.

### Running the gate by hand

`infra/cloudbuild-gate.yaml` is still the hand-runnable path, and it needs the same
capability the trigger mints for itself — without one it runs every check and then 403s
on the manifest, having recorded nothing:

```bash
SUBMISSION_TOKEN_SECRET=... npm run gate:capability -w @gamedevpl/api -- --slug <slug> --version <version>
```

It prints `_GATE_VERDICT_URL` and `_GATE_VERDICT_TOKEN` and the `gcloud builds submit`
line to paste them into. Read the secret in-process rather than through `$(...)`: the
stored value keeps a trailing newline that command substitution strips, and the token
then verifies nowhere. Leaving both substitutions empty is supported and means "write
the manifest directly", which is what a local run against your own bucket wants; the
runner says so on stderr before it starts.

### What this still does not close

**A gate run can influence its own verdict.** The check runs inside the boundary it is
judging, so hostile code that survives to the reporting step can report green for itself.
Closing that means computing the verdict outside the run — a different architecture, not
an IAM change.

**A gate run can overwrite another version's artifacts.** The condition excludes
manifests, not other games: `bundle.html` and media of a published game are still
writable. Fixing it needs a per-slug scope, and IAM CEL cannot bind a runtime value. The
design that would: the gate writes artifacts under a `gate-staging/<build-id>/` prefix it
owns exclusively, and the API server-side-copies them into place when it accepts the
verdict — no Cloud Run bandwidth, one more moving part. Not built.

Versioning + soft-delete + the noncurrent-version prune on this bucket remain the
recovery control for both.

### Cloud Run runtime: staging-prefix mutate (MCP file staging)

The API runtime keeps bucket-wide `objectCreator` + `objectViewer` only — it must not be
able to destroy candidate/published versions. MCP `stage_source_file` / clear, however,
rewrite `games/<slug>/staging/<issue>/g<gen>/manifest.json` and delete staged sources.

`setup-gcp.sh` therefore also grants the runtime `roles/storage.objectAdmin` **with an
IAM condition** limited to object names under `games/<slug>/staging/…`. The condition uses
`resource.name.extract('…/games/{slug}/staging/') != ''` — IAM CEL on `resource.name`
only supports `startsWith` / `endsWith` / `extract` (not `contains`). Outside that
prefix the runtime still cannot overwrite or delete. Re-run `./infra/setup-gcp.sh` after
merging so production gets the binding (merge alone does not apply IAM).

Staging manifest writes use GCS `ifGenerationMatch` with retry so concurrent
`stage_source_file` calls cannot drop each other's entries.

### Compensating controls (owner console — required follow-up)

Add these to the post-merge owner list (not done by merging this PR):

1. **Object versioning + soft-delete + noncurrent prune** on `GAMES_STORE_BUCKET` —
   applied by `setup-gcp.sh` (versioning on, soft-delete 30d, lifecycle deletes
   noncurrent versions after 30d). Live originals are never aged out. Re-run
   `./infra/setup-gcp.sh` if a fresh project is missing these.
2. **Longer-term (record, do not block):** route verdict/manifest writes through the API’s
   own runtime identity (or a narrow “manifest writer” SA the gate calls via an internal
   endpoint), so the Cloud Build gate SA can drop to `objectCreator` + `objectViewer` and
   lose bucket-wide delete.

## What this PR tightens in config

1. **Invariant comment block** in `cloudbuild-gate.yaml` (and matching notes in the trigger).
2. **Pinned `serviceAccount`** to `gate-runner@…` in YAML and `gate-trigger.ts`.
3. **Hard caps**: timeout `1800s`, `machineType: E2_HIGHCPU_8`, `diskSizeGb: 50`.
4. **Sole secret** remains `github-token` → `GAMES_REPO_TOKEN`; no other `secretEnv`.
5. **`setup-gcp.sh`** creates `gate-runner` and binds the least-privilege roles above;
   grants the Cloud Run runtime SA (`gamedev-app@…`, see `setup-runtime-sa.sh`)
   `roles/iam.serviceAccountUser` **on that SA** so delivery can `actAs` it when
   submitting builds. That per-SA binding is the whole `actAs` boundary: the runtime
   holds no project-wide `serviceAccountUser`, so it cannot start a build as anything
   but `gate-runner`.
6. **`run-gate.ts`**: after harness fetch/install, strip token from env and `git remote`
   so `check:game` (agent-authored tree) does not inherit the PAT.

## Owner console / `gcloud` actions (not done by merge alone)

These require project credentials. Re-run or perform after merging:

1. **Apply SA + IAM** — `./infra/setup-gcp.sh` (or the gate-runner block alone). Until this
   exists, builds that set `serviceAccount: gate-runner@…` will fail to start. The same
   script also grants the Cloud Run runtime conditional `objectAdmin` on
   `games/*/staging/**` (MCP file staging overwrite/clear) — re-run after that change
   lands or staging will 403 on the second file.
2. **Confirm default Cloud Build SA is not still Editor** — historically
   `PROJECT_NUMBER@cloudbuild.gserviceaccount.com` received broad project roles. Gate
   builds must not rely on it; audit and remove excess roles if present
   (`gcloud projects get-iam-policy`).
3. **Confirm `github-token` is contents:read only** on `gamedevpl/www.gamedev.pl-games`
   (and not a dispatch / workflow PAT). Rotate if scope is wider than clone.
4. **Egress restriction (recommended, console/Terraform-or-gcloud)** — Cloud Build YAML
   cannot allow-list destinations. Owner options:
   - Private worker pool attached to a VPC with egress firewall / Cloud NAT allow-list
     matching the destinations above; or
   - VPC Service Controls perimeter around the project with appropriate egress rules.
     Until then, treat open egress as accepted residual risk bounded by the gate SA.
5. **Done (September 2026): the runtime no longer holds project-wide
   `roles/iam.serviceAccountUser`.** The services moved off the default compute account
   (project-wide editor + serviceAccountUser) onto per-service identities, and the only
   `actAs` the app holds is the per-SA binding on `gate-runner`. `docs/deployment.md`
   "Runtime identities" has the rollout; `PRUNE_DEFAULT_COMPUTE=1 ./infra/setup-runtime-sa.sh`
   is the final step that strips the old account.
6. **Bucket versioning / soft-delete / noncurrent prune** — applied by `setup-gcp.sh`
   (see store-bucket block). Confirm with
   `gcloud storage buckets describe gs://$GAMES_STORE_BUCKET --format='yaml(versioning_enabled,soft_delete_policy,lifecycle_config)'`
   after the first post-BY-11 run if you have not already.
7. **Optional longer-term:** move manifest/verdict writes off the gate SA so it can drop
   to `objectCreator`+`objectViewer` (API-mediated writes).

## Out of scope / unchanged

- Game iframe sandbox (`allow-scripts allow-pointer-lock`, no `allow-same-origin`) — not
  touched; browser publish path is a different trust boundary
  ([`docs/security-model.md`](../docs/security-model.md)).
- No secrets or tokens are committed in this change.
