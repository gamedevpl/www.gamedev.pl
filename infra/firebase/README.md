# Production Hosting config

Serves the built web assets from Firebase Hosting's CDN and rewrites everything else to the
Cloud Run service. Uploaded by the deploy workflow; `npm run lint` guards its shape through
`infra/check-firebase-hosting.mjs`.

## Why only `assets/` is uploaded

Measured on a live preview channel, 2026-09-04. Hosting appends `cookie` to `Vary` on every
response it takes from a Cloud Run rewrite:

```
vary: Origin, accept-encoding,cookie,need-authorization, x-fh-requested-host, accept-encoding
```

Signed-in callers each carry a distinct `__session`, so the edge keys a separate cache entry
per person. Two requests for the same asset with different cookies both reported
`x-cache: MISS`, against `HIT` three times running with no cookie at all. Files Hosting
serves itself carry no `cookie` in `Vary`.

Every user of the closed beta is signed in. Routing assets through the rewrite would leave a
CDN that caches nothing for the only audience there is, which is the opposite of the point.

`index.html` is deliberately **not** uploaded. Hosting matches static files before rewrites,
so shipping it here would bypass the origin's SPA shell handling — the part that answers a
real 404 for unknown deep links and 200 only for known ones.

## Keeping old imports available

An open tab or service-worker shell can reference chunks from a previous deployment.
The Cloud Run fallback carries only its own build, so once Hosting and Cloud Run both
advance, that fallback cannot serve old imports. Keeping archived Hosting versions for
rollback does not make their files available at the live URL.

`infra/deploy-hosting.mjs` publishes the current build plus retired assets for **seven
days after replacement**. It uses the documented [Hosting REST deployment API](https://firebase.google.com/docs/hosting/api-deploy):
create a version, populate its complete path-to-gzip-SHA256 manifest, upload missing
blobs, finalize, then release. Hosting reuses previously uploaded content by hash.
Only `/assets/` is included; headers and the Cloud Run rewrite come from `firebase.json`.
Unsupported config additions fail explicitly rather than being silently ignored.

Each version carries one content-addressed `retention-<sha256>.json` ledger. Current
files have no expiry. On replacement they receive a seven-day deadline; later deploys
preserve that deadline. Expired files are omitted on the next deploy. A file reused by
the current build becomes current again. The first deployment without a ledger seeds
retention from all files in the existing live version, regardless of its age; files
already removed before rollout cannot be recovered this way.

The publisher lists **ACTIVE** files across all API pages, verifies ledger coverage,
rejects changed content at an existing immutable URL, and refuses to release if a
retained blob is unavailable. It checks the finalized manifest and detects an intervening
live release before publishing. Production deploys remain serialized by the workflow;
the API has no compare-and-swap release operation, so do not publish manually alongside it.

Before Cloud Run traffic promotion, public GETs verify the new ledger and representative
current and retired entry, App, locale and CSS files on the site's `web.app` origin.
They compare raw bytes, so changing gzip implementations does not create false failures.
CDN propagation gets bounded retries. A failed check stops promotion; the asset release
may already be live, but includes the previous build. Retry the deployment after diagnosis.
The gate samples public responses and checks the complete API manifest; it is not a
probe of every asset from every CDN location or custom domain.

`prune-hosting-versions.sh` still keeps ten archived versions for rollback. Files retained
in the new live manifest remain referenced even when their original version is pruned.
Storage now includes the current build and seven days of retired content, plus retained
archives; adjust the retention window only with that cost and old-tab support in mind.

Roll back application code by redeploying it through this publisher, which retains the
newer assets too. Directly releasing an old Hosting version also restores its old
manifest and ledger, bypassing the retention guarantee for subsequent builds. Tabs older
than the retention window still need [bounded chunk recovery](../../docs/frontend-chunk-recovery.md).

## Deploying by hand

```bash
npm run build:packages
```

```bash
npm run build --workspace apps/web
```

```bash
node infra/deploy-hosting.mjs --dry-run
```

```bash
node infra/deploy-hosting.mjs
```

Use authenticated `gcloud` with `roles/firebasehosting.admin` and quota-project access
(`roles/serviceusage.serviceUsageConsumer`). The workflow uses its existing WIF deploy
identity; no new credential or bucket is needed. Dry-run reads live files and computes
the manifest without creating a version. Do not use a plain Firebase CLI deploy for
production assets: it replaces the live manifest without carrying retained files.

Build with the same `VITE_*` values as the image, including a defined-empty
`VITE_API_BASE_URL`; otherwise the entry hashes differ. Publish and verify assets before
promoting the matching Cloud Run image. A missing current asset can fall through to that
image, but that fallback does not protect chunks from older images.

Each command stands alone: interactive zsh does not treat `#` as a comment unless
`INTERACTIVE_COMMENTS` is set, so an annotated command line pasted into it arrives as extra
arguments and the CLI answers "Too many arguments".

## Before the DNS cutover

Attaching `www.gamedev.pl` to Hosting changes what the service sees. `TRUST_EDGE_CLIENT_IP`
must be turned on in the same window — behind the edge, `request.ip` is Google's frontend, so
leaving it off collapses every per-IP limiter onto a handful of addresses and starts refusing
real traffic on product routes.

Turning it on is safe even though the service's `*.run.app` URL stays reachable: the edge
header is only trusted when the peer Cloud Run appended is one of Google's own addresses,
which a direct caller cannot arrange. Closing the direct URL by configuration was measured
to be impossible without also killing the rewrite. See `docs/deployment.md`.
