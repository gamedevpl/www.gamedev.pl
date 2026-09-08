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
| `/api/review/status` badge | 2 min | 10 min | the reviewer's own verdict; an operator's sweep change or requeue (`review-queue-cache.ts`) |
| `/api/notifications` bell  | 1 min | 5 min  | creating, reading or clearing a notification (`notification-cache.ts`)                      |

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

## Measuring

```bash
gcloud monitoring time-series list \
  --filter='metric.type="firestore.googleapis.com/document/read_count"' \
  --format=json
```

Split by `metric.label.type` (QUERY / LOOKUP / NOT_FOUND). QUERY is where polling shows
up; a flat per-minute count with no cadence means browser tabs, not Cloud Scheduler —
check the request log for the route before going looking for a job.

## Alerting

`infra/setup-monitoring.sh` defines **A30**, read rate sustained over ten minutes, as the
twin of A29 for writes. It is a ceiling over the floor the caches leave, calibrated to
sit well above the intended state and well below an incident. **Recalibrate it whenever
this table changes** — an alert calibrated against an old floor is an alert that no longer
fires for a regression the size of the one it was written for.

Rate alone is not enough. A30 evaluates a rate in two windows (ten minutes for a spike,
three hours for drift), and both are blind to the shape that actually produced the 2026-09
bill: a regression that adds a couple of reads a second, never peaks, and never stops. So
`setup-monitoring.sh` also defines **A31**, the *daily total* — `ALIGN_DELTA` over 86400s
with `REDUCE_SUM`, firing above **600K reads in the trailing day**, roughly 1.6× the
~364K/day pace measured on 2026-09-08 and well under the ~800K/day the incident billed. It
is the slowest signal in the file on purpose: if it fires while A30 stayed quiet, nothing
spiked — something got permanently more expensive per request, so compare the day against
the previous week to find the step change and match it to a deploy. Both thresholds are
calibrated against a floor the badge fix above removes; **re-derive them together** from a
full working week of post-fix numbers rather than from an estimate.
