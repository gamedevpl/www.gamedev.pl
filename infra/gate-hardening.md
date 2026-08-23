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

| Surface                    | Before hardening                                                                                     | Intended after owner applies `setup-gcp.sh` + this config                                                                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Service account**        | Unspecified → project Cloud Build / Compute default (often broad: Editor-class or runtime SA powers) | `gate-runner@PROJECT.iam.gserviceaccount.com` only                                                                                                                                  |
| **SA roles (intended)**    | n/a / ambient                                                                                        | Games-store `roles/storage.objectAdmin` **on that bucket only** (includes delete — see below); `secretmanager.secretAccessor` **on `github-token` only**; `roles/logging.logWriter` |
| **Secrets in step env**    | `GAMES_REPO_TOKEN` (`github-token`, contents:read)                                                   | Same sole secret; runner unsets it and scrubs the harness `git` remote **before** `check:game`                                                                                      |
| **Metadata server**        | GCE metadata credentials for the build SA                                                            | Same mechanism; blast radius limited by the gate SA’s IAM                                                                                                                           |
| **Network egress**         | Default Cloud Build pool: unrestricted egress                                                        | Still unrestricted until owner adds a private pool / VPC egress policy (below)                                                                                                      |
| **Writable paths**         | `/workspace`, `/tmp`, container root FS                                                              | Unchanged (ephemeral VM); no durable write except via games-store API                                                                                                               |
| **Source of build CONFIG** | This YAML + inline `gate-trigger` spec                                                               | Unchanged — slug/version are CLI data only                                                                                                                                          |
| **Timeout / machine**      | `3600s`, `E2_HIGHCPU_8`, default disk                                                                | `1800s`, `E2_HIGHCPU_8`, `diskSizeGb: 50`                                                                                                                                           |

### Egress the run actually needs

Allow-list target if/when a private worker pool or VPC-SC perimeter is applied:

1. **GitHub** (`github.com`) — shallow clone of the platform repo (public) and the games-repo harness (PAT).
2. **npm** (`registry.npmjs.org` and the registry’s CDN hosts) — `npm ci` for platform + harness.
3. **Debian apt** mirrors used by `node:22` — `ffmpeg`, `chromium`, `git`, `ca-certificates`.
4. **GCS JSON API** (`storage.googleapis.com`) — read candidate sources; write manifest / derived artifacts.
5. **Secret Manager** — fetched by Cloud Build into `secretEnv` before steps (not by game code).
6. **Container image pulls** — `gcr.io/cloud-builders/git`, `node:22` (Cloud Build infrastructure).

No other Google APIs, no Firestore, no Cloud Run admin, no Artifact Registry push, no
ability to start further builds should be granted to `gate-runner`.

### Writable / durable paths

- Ephemeral: `/workspace/platform`, harness under `$TMPDIR/gate-harness-*`, apt/npm caches.
- Durable (via SA): objects under `gs://$GAMES_STORE_BUCKET/…` for the candidate version
  (manifest gate/health fields, `bundle.html` / `preview.html`, capture media). The SA
  role that enables those writes is `objectAdmin`, which also permits **delete/overwrite
  of every object in the bucket** — see “Store IAM: why objectAdmin” below.

## Store IAM: why `objectAdmin` (delete on every stored game)

The brief asks for “store write only.” The gate SA is granted
`roles/storage.objectAdmin` on the games-store bucket instead. That role includes
**delete** on every object in the bucket — including published games — and it is held by
the identity that executes hostile candidate code by design. This is not sloppiness: it
is forced by the current write pattern.

`putGateResult` / `putHealthResult` update each candidate version’s **manifest in place**.
GCS has no IAM role that permits overwrite-without-delete (a replace is implementationally
a delete + create of the same name). `roles/storage.objectCreator` + `objectViewer` cannot
perform that update, so the gate cannot record a verdict without `objectAdmin` (or an
equally powerful custom role with `storage.objects.delete`).

Accepted residual risk until a compensating control lands: a compromised gate run can
delete or overwrite any store object the SA can name, not merely “create namespaced
immutable objects.”

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
   grants the Cloud Run runtime SA `roles/iam.serviceAccountUser` **on that SA** so
   delivery can `actAs` it when submitting builds.
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
5. **Optional: drop project-wide `roles/iam.serviceAccountUser` on the runtime SA** if it
   was granted only so Cloud Build could run as arbitrary SAs — prefer the
   per-SA binding `setup-gcp.sh` adds on `gate-runner` only.
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
