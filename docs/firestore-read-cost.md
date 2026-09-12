# Firestore read cost

Reads, not writes, are what the free tier runs out of. The cost-controls program bounded
writes and paid vendor calls; the day this document starts from, the project was doing
~364K document reads a day against a 50K/day free tier while writing a few hundred.

The shape is never a loop. It is always the same mistake: **a collection query on a path
that something polls**, so the read rate is set by how many browser tabs are open rather
than by how much the data changes.

## The rule

> Read a collection once per window, never once per request.

Two corollaries, both of which have been got wrong here:

1. **The window must be wider than the poll it serves.** A sixty-second window behind a
   two-minute poll has always expired by the time the same tab comes back, so it costs
   the same as no cache at all while looking like one.
2. **A write that makes a cached answer wrong must drop it.** Otherwise the window's
   width is a lie about how stale the surface may be, and someone will widen it until
   the product is wrong.

## Where the windows are

| Surface                    | Poll  | Window | Dropped by                                                                                  |
| -------------------------- | ----- | ------ | ------------------------------------------------------------------------------------------- |
| `/api/catalog` enrichment  | —     | 10 min | writing an enrichment (`catalog-enricher.ts`)                                               |
| store catalog + media      | —     | 10 min | publishing a game (`catalog-routes.ts`)                                                     |
| notify sweep health scan   | 2 min | 10 min | recording a verdict (`notify-sweep-routes.ts`)                                              |
| notify sweep per-job derive | 2 min | 0/10/60 min by stillness | a move, a status change, uncollected feedback (`sweep-cadence.ts`) |
| `/api/review/status` badge | 2 min | 10 min | the reviewer's own verdict; an operator's sweep change or requeue (`review-queue-cache.ts`) |
| `/api/notifications` bell  | 1 min | 5 min  | creating, reading or clearing a notification (`notification-cache.ts`)                      |
| Studio connect guide       | 10 s  | —      | reads one document by id; cadence widens instead (`LocalActivityStatus.tsx`)                |

Per-user surfaces — the reviewer badge and the bell — key their windows by uid, and the
bell keys by store as well, so one person's queue can never answer another's poll. That
is a correctness property with tests, not a performance detail.

What each window costs in freshness is bounded, but the bound is **one window for any
action, including your own**. The caches are process-local, and the API deploys with
`--max-instances 4` whenever `MP_RELAY_URL` is set (`.github/workflows/deploy.yml`), so a
write handled by one instance drops only that instance's window: your next poll can land
on another and get the old answer. On a single instance, and for whichever instance
served the write, an own action is reflected immediately — but do not design a surface
that needs that, and do not write it down as a guarantee. Making own-write freshness true
across instances needs shared invalidation (a durable version key both instances read),
which is not what a badge is worth.

## The floor underneath the windows

Every one of those windows removes a _collection scan_. None of them removes the read that
happens before the route runs: `getSessionUser` reads `users/{uid}` on **every
authenticated request**, so a signed-in tab pays one document lookup per poll, per
surface, forever. Four polled surfaces on one open tab is a few thousand reads a day
before any route does its own work.

Two things bound it:

1. **`FirestoreIdentityStore` holds the session user for 30 seconds** and drops the entry
   on every write through the store — profile edits, tier changes, deletion requests. It
   is deliberately much shorter than the content windows above, because `tier` and the
   block live on that document. The cost is real and must be stated: a block applied
   **outside** the app, or on another instance, is enforced up to 30 seconds late. A block
   applied through the API is immediate on the instance that applied it.
2. **A poll that has nothing to report widens itself.** The connect guide asked every ten
   seconds whether a local agent was running, whether or not one existed, and rendered
   nothing when the answer was no — an invisible ~17K reads a day for one forgotten tab.
   It now polls fast while a task runs, widens to a minute once six polls in a row come
   back empty or the task finishes, and stops entirely while the tab is hidden.

The general rule this leaves: **a poll's cost is its cadence times its cheapest possible
answer, and "nothing to show" is the answer it will give most of the time.**

## The other half of the floor: our own sweeps

A browser poll needs a tab open. `notify-sweep` needs nothing — Cloud Scheduler posts to it
every two minutes, forever, and on 2026-09-12 it was **a third of an otherwise idle hour's
reads**: 34 active submissions re-derived 720 times a day, each derivation a pending-message
query plus a reconcile plus a status read, and 33 operator alerts re-emitted on top. The run
took 14 seconds of wall clock. Nothing in that work changed anything: the same 34 records had
been motionless for days, and all 33 alerts had been delivered long ago.

Two rules came out of it, and they generalise to any scheduled sweep here.

1. **A record's recheck interval is a function of how long it has been still.** `sweep-cadence.ts`
   holds a per-job next-due stamp: moving within the hour means every run, still for an hour
   means every ten minutes, still for a day means hourly. Two properties matter more than the
   numbers. A job this process has **never** derived is always due, so a cold start and every
   test derive everything — the cadence can only ever *defer a repeat*, never skip a first look.
   And **anything with a clock running on it stays hot**: an uncollected creator message, an
   observed transition, or a status that just changed all reset the record to every-run, because
   the alert those feed is the one thing a widened cadence could make late. A deferral is also
   **void the moment the record moves**: the stamp remembers the activity time it was granted
   against, and a newer one on the already-read record makes the job due again, so nothing that
   changed can sit unseen for an hour. The schedule is process-local on purpose: it is an
   optimisation, and losing it on a deploy costs one full run.

2. **An emit that is idempotent by id should stop asking.** Re-emitting an existing operator
   alert cost a document read *and* a transaction commit per alert per run, which is how ~908
   commits an hour sat behind ~1,157 document writes a day: read-only transactions, committing
   nothing. `notify-sweep-routes.ts` now remembers the ids it has seen already present and skips
   them (`alertsSkipped` in the response and the log), and `createNotification` inserts with
   `create()` — the atomic insert — instead of reading inside a transaction to decide.

The sweep's response carries `deferred` and `alertsSkipped` so the saving is observable from the
scheduler's own logs rather than inferred from a read count.

It also carries `stalledCauses`, which is not about cost. `feedback_undelivered` exists to say
"the relay failed", and on 2026-09-12 it was firing on six rounds of which only two fit that
description: two were parked on an operator's publish decision since August, one had received a
message fourteen hours after its agent ended, and one had never had an agent connect. An alert
that cannot distinguish those is a true statement nobody can act on. The kind still fires — a
permanent false alarm is bad, silence is worse — but every stalled job now reports *why* nothing
collected it (`uncollected-feedback.ts`), which is the difference between re-dispatching a round,
publishing it, and closing it. `agentEndedAt` alone does **not** mean the agent left — it is also
set when an agent submits without calling `end`, and `isAgentSessionEnded` (platform/) is the one
place that rule lives, shared with `shouldSteerFeedbackViaInbox` so the two cannot drift. The
cause goes in the log and the response rather than the notification body, because notifications
are create-only: adding `{{detail}}` to the body would render an empty slot in every alert
already emitted.

## Measuring

```bash
infra/read-cost-report.sh        # trailing day, split by type
infra/read-cost-report.sh 7d     # a full working week
```

### Per request, from the service's own logs

The type split says *which half of this document* a regression belongs in. It does not say
which route or which collection, and until 2026-09-12 that attribution was archaeology:
correlate a per-minute read count against a request log and guess. `store/read-meter.ts`
removes the guessing. It patches the Firestore client's read entry points once
(`DocumentReference.get`, `Query.get`, `AggregateQuery.get`, `Firestore.getAll`,
`Transaction.get`/`getAll`, `WriteBatch.commit`, `runTransaction`) and tallies them into an
`AsyncLocalStorage` scope opened per request, so every response that touched Firestore logs
one line:

```
{"msg":"firestore reads","route":"/api/review/status","fsReads":4,"fsMissing":1,
 "fsCalls":3,"fsCommits":0,"fsTransactions":0,"fsPaths":{"users/*":2,"submissions":2}}
```

`fsPaths` keys are **shapes, not paths** — document ids are masked to `*`, a collection-group
query is `group:<id>`, an aggregate is `count:<shape>` — so one key aggregates every read of
that shape.

**It counts what Firestore bills, not what came back**, and the three rules there are the
whole reason the tally can be trusted as a cost attribution:

- an **absent document** counts in both `fsReads` and `fsMissing`;
- a **query that matched nothing** still counts one read — the minimum charge. This is not a
  rounding detail: `listPendingCreatorMessages` returns empty on nearly every sweep run, so
  counting it as zero would have hidden 34 reads a run in exactly the job being investigated;
- an **aggregate** counts one read per 1000 index entries matched, minimum one, so a `count()`
  over 2,500 rows is three reads rather than one.

A read that *throws* is not tallied — the meter records after the await. So a swallowed
`PERMISSION_DENIED` (about 850/day as of 2026-09-12, logged nowhere, cost nothing) stays
invisible here; it shows only in `api/request_count` split by `response_code`.

The two questions this answers that nothing else did:

```bash
# Which route is the floor? Sum reads per route over an idle hour.
gcloud logging read 'resource.labels.service_name=gamedev-app
  AND jsonPayload.msg="firestore reads"' --project gamedevpl --freshness=1h \
  --format='value(jsonPayload.route,jsonPayload.fsReads)' |
  awk '{r[$1]+=$2} END {for (k in r) print r[k], k}' | sort -rn

# What does one poll cost, per shape?
gcloud logging read 'jsonPayload.msg="firestore reads"
  AND jsonPayload.route="/api/review/status"' --project gamedevpl --limit 5 \
  --format='value(jsonPayload.fsReads,jsonPayload.fsPaths)'
```


The split by `metric.label.type` (QUERY / LOOKUP / NOT_FOUND) is the whole point, and it
decides which half of this document the next fix belongs in. QUERY is a collection scan —
a cache window is missing or a window got dropped. LOOKUP is per-document fan-out on a
request path: the session read, or a route fetching documents by id. A flat per-minute
count with no cadence means browser tabs, not Cloud Scheduler — check the request log for
the route before going looking for a job.

## Alerting

### The floor as measured on 2026-09-12

Before the sweep fixes above, a full idle hour (09-11 13:00-19:00Z, no traffic) sat at a flat
**12.4-12.9K reads/hour** — about 300K/day with nobody using the site, six times the free tier
from nothing. The split of one such hour: QUERY ~9,300, LOOKUP ~2,390, NOT_FOUND ~780, from
~6,160 Firestore calls against ~500 HTTP requests, on a single instance. Two reads per call and
a dozen calls per request: the bill was never one fat scan, it was thousands of tiny gets.

Reading the same hour per minute shows a clean two-minute sawtooth — odd minutes ~72
`BatchGetDocuments` / 47 `RunQuery` / 22 `Commit`, even minutes ~35 / 22 / 8 — which is how
`notify-sweep` was identified as a third of the floor without reading any code. Whole days over
the same week ran 445K-835K reads, and writes 1.1K-28K (2026-09-07 hit 22.6K creates, over the
20K/day free write quota for that day alone).

One spike is not a regression: the nightly scorecard sweep adds **~22K QUERY in the 04:00Z
hour** (31.7K against a 9.4K baseline), almost all of it one shape —
`COLLECTION /telemetry/*/playEvents LIMIT 5000`, 28 executions for a 28-day window, 23,472
reads. That is the one scan on this list whose reads buy something durable: the scorecards the
whole agent loop reasons about. It is 3% of the day and is left alone deliberately.

`infra/setup-monitoring.sh` defines **A30**, read rate sustained over ten minutes, as the
twin of A29 for writes. It is a ceiling over the floor the caches leave, calibrated to
sit well above the intended state and well below an incident. **Recalibrate it whenever
this table changes** — an alert calibrated against an old floor is an alert that no longer
fires for a regression the size of the one it was written for.

Rate alone is not enough. A30 evaluates a rate in two windows (ten minutes for a spike,
three hours for drift), and both are blind to the shape that actually produced the 2026-09
bill: a regression that adds a couple of reads a second, never peaks, and never stops. So
`setup-monitoring.sh` also defines **A31**, the _daily total_ — `ALIGN_DELTA` over 86400s
with `REDUCE_SUM`, firing above **600K reads in the trailing day**, roughly 1.6× the
~364K/day pace measured on 2026-09-08 and well under the ~800K/day the incident billed. It
is the slowest signal in the file on purpose: if it fires while A30 stayed quiet, nothing
spiked — something got permanently more expensive per request, so compare the day against
the previous week to find the step change and match it to a deploy. Both thresholds are
calibrated against a floor the badge fix above removes; **re-derive them together** from a
full working week of post-fix numbers rather than from an estimate — `read-cost-report.sh`
is what that measurement looks like, and the type split belongs in the PR that moves a
threshold.

**The deploy gate has no voice of its own.** `Deploy to Cloud Run` triggers on `workflow_run`
of CI and is gated on that run concluding success, so a red master skips every deploy while
each merged pull request still reads green. On 2026-09-12 master was red from a direct push
and two merges deployed nothing; production served the previous revision for over an hour with
nothing reporting it. `infra/check-deploy-freshness.mjs` (run every half hour by
`.github/workflows/deploy-watchdog.yml`) now asks whether master's newest settled commit has a
*successful* deploy run, and opens one issue when it does not. Verified against that incident's
own data: pointed at the red window it names `25703195c` and `5b5518841` exactly.

**Owed after the sweep fixes land.** A30 and A31 are calibrated against the pre-fix floor
described above. Give the change a full working week in production, then re-derive both from
`infra/read-cost-report.sh 7d` and the per-route sums from the read meter, and put the type
split in the PR that moves either threshold. Do not move them from the estimate.
