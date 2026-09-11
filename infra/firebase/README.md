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

## Why a hash mismatch is not an outage

The `**` rewrite catches anything Hosting does not hold, and the Cloud Run image always
carries a complete copy of the same build. So if an upload and an image ever disagree — a
half-finished deploy, a rolled-back revision — the affected assets are served from the
origin uncached rather than 404ing. Degraded, not broken.

## Deploying by hand

```bash
npm run build --workspace apps/web
```

```bash
rm -rf infra/firebase/public/assets && cp -r apps/web/dist/assets infra/firebase/public/assets
```

```bash
npx firebase-tools deploy --only hosting --project gamedevpl --config infra/firebase/firebase.json
```

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
