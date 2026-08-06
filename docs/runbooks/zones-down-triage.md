# Runbook: zones are dead and the site is fine

Entry point for alerts **A6** (zone admission failing) and **A7** (world service 5xx).

**Last drilled: never.** (A6 timeout paths diagnosed from prod logs on 2026-08-02, 08-05
and 08-06; all three fixes covered by unit tests, none by a live drill. The first two were
each right about their own call and wrong about the problem — see step 1.)

**Check whether it was the deploy gate before you chase a player-facing outage.** The
browser gate plays real games against the candidate revision from a GitHub Actions runner,
which cold-starts `gamedev-world` — so an A6 whose timestamp falls inside a deploy is quite
possibly CI rather than anybody's evening. Correlate with
`gh run list --workflow="Deploy to Cloud Run"` and match the `Browser gate against the
candidate` step's window against the incident. The second consequence is the one that
bites: the gate **cannot fail on this**, because it inherits the shell's silent solo
fallback like any other client. It went green through the 2026-08-05 incident it caused.
A deploy passing its gate is not evidence that zones work.

Read this first, because it changes what "working" looks like: when the zone host refuses
a join, the shell falls back to solo play **without telling the player**. That is correct
— a game must be playable alone — and it is why this failure has no symptom. The site is
up, every request is a 200, `/health` is green, and each player is alone in a world they
think is shared. Both faults on this service's first day looked exactly like this.

So do not try to confirm the outage by loading the game. One browser window cannot tell a
working host from a dead one. Step 4 is how you actually check.

```bash
PROJECT_ID=gamedevpl; REGION=europe-west1; WORLD=gamedev-world
WORLD_URL="$(gcloud run services describe "$WORLD" --region "$REGION" \
  --project "$PROJECT_ID" --format='value(status.url)')"
echo "$WORLD_URL"
```

## 0. If you need it off right now

```bash
gcloud run services update gamedev-app --region "$REGION" --project "$PROJECT_ID" \
  --remove-env-vars ZONE_HOST_URL
```

Every game immediately plays as it did before zones existed. Nothing else is affected, no
redeploy is needed, and `gamedev-world` costs nothing left running while you diagnose.
This is a cheap, reversible stop — use it and take your time rather than debugging live.

## 1. What is the host actually saying?

```bash
gcloud run services logs read "$WORLD" --region "$REGION" --project "$PROJECT_ID" --limit 100
```

The wire reason a client gets (`zone_unavailable`) is deliberately uninformative — it
would otherwise tell someone holding a stolen ticket which part they got wrong. **The
cause is only in this log.** A6 fires on the line `zone admission failed`; the `err`
attached to it is the diagnosis.

Three causes have happened before and are worth checking by eye first:

- **`Script execution timed out` — and do not go looking for what was slow.** This one
  message accounts for five of the eight admission failures ever logged, and the stack
  named a different innocent function every time: `sin` (08-02 10:36Z), `cos` (08-02
  14:49Z), `reduce` (08-02 21:42Z), `loadSim` (08-05 21:56Z), `nextRandom` (08-06 00:31Z).
  Nothing was expensive — the last one blew 200 ms restoring **167 draws of a 1.2 KB
  state**, which is microseconds of work.

  The budgets are wall-clock and `isolated-vm` runs the sim on its own thread, so on a
  1-CPU instance that thread loses the core to the games-repo fetch, the Firestore read or
  GC and spends the budget without executing. Every fix that widened one call moved the
  loss to the next: wake (08-02) → load (08-05) → restore (08-06). Since 2026-08-06 all
  four once-per-join calls — realm construction, `init`, `restore`, `wake` — share
  `SIM_STARTUP_TIMEOUT_MS` (5 s), and the host runs on `--cpu 2` so the sim thread is not
  fighting the host thread. Ticks keep the tight ceiling; that is the one carrying the
  safety property.

  **So if this recurs, it is a real finding, not another budget to widen.** Five seconds
  of wall clock for a once-per-join call on two cores is not something a healthy sim runs
  out of. Note the slug (`zone admission failed` carries `slug` and `zoneId` since 08-06)
  and look at that game. The one exception worth checking first: a `wake` timeout is
  *expected* to degrade rather than refuse — it should log `zone wake catch-up skipped
  after timeout` at warn and still admit on the last snapshot, so a `wake` stack reaching
  A6 at all means the degrade path is not deployed or something is wrapping the error.
- **`not a constructor` / anything about `Isolate`** — the isolate cage loaded but is not
  usable. The host boots, passes its own cage assertion, serves `/health`, and fails
  every join. Fixed once in `packages/zone-core/src/cage.ts`; a recurrence most likely
  means the image was built without the native addon.
- **a missing seat, or an error naming a zone that should exist** — a zone was reaped
  mid-admission. `ZoneHost` holds a zone while a join is in flight for exactly this
  reason; if this reappears, the hold is the thing that broke.

## 2. Is the host even reachable, and does it think it has zones?

```bash
curl -sS "$WORLD_URL/health"
```

`{"ok":true,"zones":N,...}` — `zones` is how many worlds are live in memory. **Zero is
not a fault**: an idle host has no zones and that is the entire cost model. Zero _while
somebody is playing_ is the fault.

No answer at all means the service is not running: go to step 3.

## 3. Did it refuse to start?

```bash
gcloud run revisions list --service "$WORLD" --region "$REGION" --project "$PROJECT_ID" \
  --format='table(metadata.name, status.conditions[0].message, metadata.creationTimestamp)' \
  --sort-by=~metadata.creationTimestamp --limit 5
```

The host **exits rather than downgrade** when the `isolated-vm` cage is unavailable, and
that is intended: `node:vm` passes every test in the repo and is not a security boundary,
so running production on it would silently delete the whole safety argument. A revision
that will not come up with a cage error in its log is the system working.

Do not "fix" this by setting `ZONE_CAGE` or relaxing `NODE_ENV`. Rebuild the image
(`infra/deploy-world.sh`) — the addon needs Node 22 at both build and runtime, and npm
skips it _silently_ on an engine mismatch, so an image that built cleanly can still have
no addon in it.

## 4. Confirm it is fixed — two windows, not one

Sign in and open the game in two separate browser sessions (two profiles, or one
incognito). Both watchers must appear in the **same** world and see each other move.

Two sessions that each look fine is the failure, not the fix.

```bash
# While both are connected:
curl -sS "$WORLD_URL/health"   # zones must be 1, not 0
```

## 5. Is the app still pointed at it?

```bash
gcloud run services describe gamedev-app --region "$REGION" --project "$PROJECT_ID" \
  --format='value(spec.template.spec.containers[0].env)' | tr ',' '\n' | grep -i zone
```

`ZONE_HOST_URL` must be present and match `$WORLD_URL`. If it is missing and nobody
removed it deliberately, an app deploy wiped it — `--set-env-vars` replaces the whole map.
Both deploy paths thread it through, so this should not happen; if it did, that is the
bug, not the host.

## Open: one failure nobody has explained

**2026-07-29 22:11 UTC, revision `gamedev-world-00004-kq8`.** A single join was refused
on a healthy host — the first thing A6 ever caught, hours after it was armed. The cause
is unknown and now unknowable: `ZoneAdmissionError` carried only the wire reason at the
time, so the error that `join` actually threw was discarded before it reached the log.
That is fixed (the wrapper keeps its `cause`), which means the _next_ one will say.

Keep it in mind if a `zone_unavailable` appears without an obvious cause. A single failed
join is not necessarily a defect — a transient games-repo fetch or Firestore read would
do it, and recovering on the next attempt is the design working — but one has happened,
it was never explained, and a second of the same shape should not be waved through as
"probably that transient thing again".

That warning has now paid for itself. 2026-08-05 was exactly that shape — one refused join
on a host that was healthy before and after — and it was a real bug with a one-line fix,
found only because the wrapper kept its `cause`. Treat "just the one, it recovered" as a
thing to explain, not a thing to close.

## What this runbook does not cover

Zone _state_ problems — a world that loads but is wrong, stuck, or unplayable. That is a
game's simulation, not the platform, and the host will report itself perfectly healthy
throughout. The zone document lives at `zones/{zoneId}` in Firestore; deleting it while
the zone is empty gives the next visitor a fresh world and is the blunt instrument of
last resort.
