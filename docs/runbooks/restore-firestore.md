# Runbook: restore Firestore

**Last drilled: 2026-07-30.** Export → import into a scratch database → read back →
teardown all worked as written below. Restored `users`, `submissions`, `waitlist`,
`games` and `accessTokens` doc counts matched the live database exactly, and all ten
root collections were present.

The drill also found the scheduled export broken — it had run exactly once and failed
every time since. That is fixed and verified end to end; see §5, which is worth reading
because the failure was invisible from every indicator that looked green.

Provisioned by [`infra/setup-backups.sh`](../../infra/setup-backups.sh): point-in-time
recovery with a 7-day window, plus a twice-daily export to
`gs://gamedevpl-firestore-backups` kept 30 days.

## 0. Which mechanism, and how to choose fast

| Situation | Use | Why |
| --- | --- | --- |
| Bad write, wrong-collection delete, a script that ran twice — **within 7 days** | **PITR** (§2) | Exact, to the microsecond, no staleness |
| Discovered later than 7 days | **Export** (§3) | Only copy that still exists |
| Database or project itself lost | **Export** (§3) | PITR died with the database |
| Not sure yet what broke | **Export a snapshot first** (§1), then investigate | Buys time without committing |

**The one irreversible move to avoid:** restoring *over* the live database before
capturing its current state. Whatever is wrong, the present is still evidence — and if
the diagnosis is wrong, it is also the only copy of anything written since the incident.
Always do §1 first.

## 1. Before anything: freeze the present

```bash
PROJECT_ID=gamedevpl
gcloud firestore export "gs://${PROJECT_ID}-firestore-backups/incident-$(date -u +%Y%m%dT%H%M%SZ)" \
  --project "$PROJECT_ID"
```

This runs against the live database and does not modify it. It takes minutes on this
data volume. Do it even when in a hurry — especially then.

## 2. PITR restore (within the 7-day window)

PITR restores into a **new database**; it cannot overwrite `(default)` in place. That is
a feature — it means the restore is inspectable before anything switches.

```bash
PROJECT_ID=gamedevpl
# Timestamps must be whole seconds, RFC3339, inside the window. Pick a moment
# comfortably BEFORE the bad event, not the instant of it.
RESTORE_AT="2026-07-29T14:00:00Z"

gcloud firestore databases restore \
  --source-database='(default)' \
  --snapshot-time="$RESTORE_AT" \
  --destination-database='restore-check' \
  --project "$PROJECT_ID"
```

Inspect before promoting — the point of restoring beside rather than over:

```bash
gcloud firestore export "gs://${PROJECT_ID}-firestore-backups/verify-restore" \
  --database='restore-check' --project "$PROJECT_ID"
# or read a few documents directly in the console against the restore-check database
```

Then choose:

- **Targeted repair (preferred).** If only one collection is damaged, copy those
  documents from `restore-check` into `(default)` and leave everything else alone. This
  loses nothing written since the incident.
- **Full cutover.** Only when the whole database is bad. The app reads `(default)` and
  has no database-name env var, so cutover means deleting `(default)` and renaming — a
  destructive step that also loses every write since `RESTORE_AT`. Think twice; §1's
  export is what makes that survivable.

Delete the scratch database when finished — it bills like any other:

```bash
gcloud firestore databases delete --database='restore-check' --project "$PROJECT_ID"
```

## 3. Export restore (older than 7 days, or database lost)

```bash
PROJECT_ID=gamedevpl
gcloud storage ls "gs://${PROJECT_ID}-firestore-backups/exports/"   # pick a run
EXPORT_PATH="gs://${PROJECT_ID}-firestore-backups/exports/drill-20260730T153238Z"

# Import into a scratch database first, for the same reason as above.
gcloud firestore databases create --database='restore-check' \
  --location=europe-central2 --type=firestore-native --project "$PROJECT_ID"

gcloud firestore import "$EXPORT_PATH" \
  --database='restore-check' --project "$PROJECT_ID"
```

**Pick `EXPORT_PATH` by eye, not with `| tail -1`.** The bucket listing interleaves run
directories with the stray `all_namespaces/` and `*.overall_export_metadata` entries left
by the broken job (§5), so the last line is frequently not a run. `EXPORT_PATH` is the
export's *prefix* — the directory containing `<name>.overall_export_metadata` — with no
trailing slash.

Confirm the run you picked is complete before importing a half-written export; a finished
run has ~30 objects, not one:

```bash
gcloud storage ls -l -r "$EXPORT_PATH/" | tail -1   # expect "TOTAL: 30 objects, ~6 MiB"
```

Import is **merge, not replace**: documents in the export overwrite same-id documents,
and anything not in the export is left untouched. Importing an old export straight over
a live database therefore resurrects deleted documents without removing new ones — a
specific and confusing kind of mess. Import to scratch, verify, then copy what is needed.

Single-collection restore, which is the common real case:

```bash
gcloud firestore import "$EXPORT_PATH" \
  --collection-ids='submissions' \
  --database='restore-check' --project "$PROJECT_ID"
```

## 4. The drill (re-run when the restore path changes)

The whole point of this runbook is that it has been executed at least once when nothing
was on fire. Done 2026-07-30; repeat it after any change to the export job, the bucket
layout, or the Firestore schema.

1. Produce an export and confirm it lands. Running the workflow directly is the closest
   thing to what the schedule does, and it does not return until the export has finished:
   ```bash
   gcloud workflows run firestore-export --location europe-central2 --project gamedevpl
   # prints the prefix it wrote, e.g. gs://…/exports/20260730T155640Z
   gcloud storage ls -l -r "gs://gamedevpl-firestore-backups/exports/<prefix>/" | tail -1
   ```
2. Import it into a `restore-check` database (§3).
3. Read back real data and compare it against the live database. The console works, but
   counting documents in both is stronger and takes a minute:
   ```bash
   TOKEN=$(gcloud auth print-access-token)
   for DB in "(default)" "restore-check"; do
     echo "--- $DB"
     for C in users submissions waitlist games accessTokens; do
       printf '  %s: ' "$C"
       curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
         -d "{\"structuredAggregationQuery\":{\"structuredQuery\":{\"from\":[{\"collectionId\":\"$C\"}]},\"aggregations\":[{\"count\":{},\"alias\":\"c\"}]}}" \
         "https://firestore.googleapis.com/v1/projects/gamedevpl/databases/${DB}/documents:runAggregationQuery" \
         | python3 -c 'import sys,json;print(json.load(sys.stdin)[0]["result"]["aggregateFields"]["c"]["integerValue"])'
     done
   done
   ```
4. Delete the scratch database — `--quiet`, or it prompts and hangs:
   ```bash
   gcloud firestore databases delete --database=restore-check --project gamedevpl --quiet
   gcloud firestore databases list --project gamedevpl --format='value(name)'  # only (default)
   ```
5. **Record the date at the top of this file**, along with anything that did not work as
   written. Fix the text while it is fresh; a runbook that lies is worse than none.

Timings observed on 2026-07-30, at ~6.5 MiB of data: export ~10s, database create ~30s,
import ~3 min, delete ~20s. The 20-minute estimate is mostly slack.

### What the 2026-07-30 drill proved

- All ten root collections restored: `accessTokens`, `counters`, `games`, `globalUsage`,
  `submissions`, `telemetry`, `usage`, `users`, `waitlist`, `zones`.
- Document counts matched the live database exactly — `users` 10, `submissions` 18,
  `waitlist` 5, `games` 1, `accessTokens` 4.
- Documents came back with their fields intact, including a real Apple-ID `users` doc
  (`email`, `tier`, `createdAt`, `lastLoginAt`) and `submissions` docs with their
  `state`/`transitions` history.
- `usage/{uid}` parents list no documents in either database — those are *implicit*
  parents holding only a `counters` subcollection. Not a restore defect; do not chase it.

## 5. The export the drill found broken (fixed 2026-07-30)

Worth keeping, because the failure mode is the one this runbook exists to catch and it
was invisible from every green-looking indicator.

Scheduler used to POST straight at `:exportDocuments` with a static body carrying a
**fixed** prefix, `gs://gamedevpl-firestore-backups/exports`. The script's comment claimed
Firestore "creates a timestamped folder beneath it per run". It does not — it writes
straight into the prefix given. So the first run succeeded and every run afterwards was
rejected:

```
Path already exists: /gamedevpl-firestore-backups/exports/exports.overall_export_metadata
```

One export, on 2026-07-30 at 08:51, then 400s at 15:17 and 15:30. The stray
`exports/all_namespaces/` and `exports/exports.overall_export_metadata` in the bucket are
that first run; they are a valid export and are being left to age out on the lifecycle
rule rather than deleted.

The fix put a Cloud Workflow (`infra/firestore-export-workflow.yaml`) between Scheduler
and Firestore to compute `exports/<timestamp>`, since Scheduler has no date templating of
its own. Bucket, lifecycle rule, service account and everything in §3 are unchanged.

Two things learned that are easy to hit again:

- **The workflow waits for the export operation on purpose.** Alert A4 counts successful
  runs; if the workflow returned as soon as Firestore accepted the request, "success"
  would mean "the API took it", which stays true for a run that then fails. A4's log
  metric was moved off Cloud Scheduler's HTTP status onto the workflow's `SUCCEEDED`
  state for the same reason — Scheduler now gets its 200 the moment an execution starts.
- **A workflow does not simply have its `--service-account` identity.** The Workflows
  service agent mints a token for it on every `auth: OAuth2` call, which needs
  `roles/iam.serviceAccountTokenCreator` on that SA. Without it the run fails with
  `IAM permission denied for service account firestore-export@…` — which reads like the
  export role is wrong when it is fine.

**Checking it is alive.** A green `state: ENABLED` on the Scheduler job says nothing;
`status.code` is the tell, and it should be empty:

```bash
gcloud scheduler jobs describe firestore-daily-export --location europe-central2 \
  --project gamedevpl --format='value(state,status.code,lastAttemptTime)'
gcloud workflows executions list firestore-export --location europe-central2 \
  --project gamedevpl --limit 5 --format='value(state,startTime)'
```

## Data being restored, and why some of it is irreplaceable

| Collection | Replaceable? |
| --- | --- |
| `users` (+ `notifications`, `pushSubscriptions`) | ❌ Identity, consent, push endpoints |
| `waitlist` | ❌ The beta access list |
| `submissions` (+ `events`, `messages`, `shots`) | ❌ Creator history and attribution |
| `usage/{uid}/counters` | ❌ Quota state (restoring stale counters grants free quota) |
| `games/{slug}/votes` | ❌ |
| `accessTokens` | ⚠️ Revocable and re-mintable; prefer re-minting over restoring |
| `telemetry/{date}/…` | ⚠️ History only; losing it hurts the improvement loop, breaks nothing |

Published game content is **not** in Firestore — it lives in the games repo and the
snapshot bucket. See [`games-snapshot.md`](../games-snapshot.md) for rolling that back,
which is a pointer rewrite, not a database restore.
