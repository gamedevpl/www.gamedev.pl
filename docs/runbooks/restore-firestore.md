# Runbook: restore Firestore

**Last drilled: never.** ⚠️ Until a date appears here, this document is a hypothesis, not
a procedure — and the backups it describes are unproven. Drill it once (§4), then record
the date and anything that turned out to be wrong.

Provisioned by [`infra/setup-backups.sh`](../../infra/setup-backups.sh): point-in-time
recovery with a 7-day window, plus a daily export to `gs://gamedevpl-firestore-backups`
kept 30 days.

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
EXPORT_PATH="gs://${PROJECT_ID}-firestore-backups/exports/2026-07-29T03:17:00_12345"

# Import into a scratch database first, for the same reason as above.
gcloud firestore databases create --database='restore-check' \
  --location=europe-central2 --type=firestore-native --project "$PROJECT_ID"

gcloud firestore import "$EXPORT_PATH" \
  --database='restore-check' --project "$PROJECT_ID"
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

## 4. The drill (do this once, now — not during an incident)

The whole point of this runbook is that it has been executed at least once when nothing
was on fire.

1. Run the export job on demand and confirm an object lands:
   ```bash
   gcloud scheduler jobs run firestore-daily-export --location europe-central2 --project gamedevpl
   gcloud storage ls gs://gamedevpl-firestore-backups/exports/
   ```
2. Import it into a `restore-check` database (§3).
3. Read back one known document — a `users` doc or a `submissions` doc you can identify.
4. Delete the scratch database.
5. **Record the date at the top of this file**, along with anything that did not work as
   written. Fix the text while it is fresh; a runbook that lies is worse than none.

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
