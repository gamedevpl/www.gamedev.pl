# Runbook: the site is down

Entry point for alerts **A1** (uptime check failing) and **A2** (sustained 5xx).

Work top to bottom — the order is by descending likelihood, and each step is cheap.
Resist diagnosing before step 1: "what changed" answers this most of the time.

## 1. What changed in the last hour?

```bash
PROJECT_ID=gamedevpl; REGION=europe-west1; SERVICE=gamedev-app

# Did something deploy?
gcloud run revisions list --service "$SERVICE" --region "$REGION" --project "$PROJECT_ID" \
  --format='table(metadata.name, metadata.creationTimestamp)' \
  --sort-by=~metadata.creationTimestamp --limit 5
```

A revision created shortly before the alert makes this a deploy problem: go straight to
[`rollback-deploy.md`](./rollback-deploy.md), roll back first, and diagnose afterwards
from a healthy site. Rolling back is cheap and reversible; debugging a live outage is
neither.

## 2. What is the service actually saying?

```bash
gcloud logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=${SERVICE} AND severity>=ERROR" \
  --project "$PROJECT_ID" --limit 30 --format='value(timestamp, jsonPayload.msg, textPayload)'
```

Match the message against the table below.

| What you see | Cause | Action |
| --- | --- | --- |
| `snapshot catalog unavailable` / 503 from `/api/catalog` | The snapshot bucket is unreachable or `current.json` is missing | §3 |
| `failed to load game` with 502, specific slugs | A game is in the catalog but was never baked | Re-run the publish workflow (§3) |
| Firestore permission / deadline errors | Firestore or its IAM | §4 |
| Container fails to start, "cannot find module" | Bad image — a workspace package missing from the build | Roll back (§1). This has happened before |
| Nothing at ERROR, but 5xx in metrics | Look at the load balancer / instance count | §5 |

## 3. Published games are failing (snapshot path)

**This is now a hard dependency, not a fast path.** Published catalog and play are served
from `gs://gamedevpl-games-snapshots`; there is deliberately **no GitHub fallback** for
published games — unavailable maps to 503 and a missing baked object to 502. See
[`games-snapshot.md`](../games-snapshot.md).

```bash
# Is the pointer there and sane?
gcloud storage cat gs://gamedevpl-games-snapshots/current.json --project gamedevpl

# Can the runtime SA still read the bucket? (a broken IAM change looks exactly like an outage)
gcloud storage buckets get-iam-policy gs://gamedevpl-games-snapshots --project gamedevpl \
  | grep -A 3 objectViewer
```

- **Pointer missing or malformed** → re-bake: run the *Publish games snapshot* workflow
  (`workflow_dispatch`) in the platform repo. It writes a fresh snapshot and moves the
  pointer atomically.
- **Pointer fine, one game 502s** → that game failed its bake. Re-run the same workflow;
  if it fails again, the game itself is the problem — check the workflow log for its slug.
- **Rollback to an earlier snapshot**: snapshot prefixes are immutable, so rolling back
  means pointing `current.json` at an older `snapshots/<id>/`. Procedure in
  [`games-snapshot.md`](../games-snapshot.md).

## 4. Firestore

```bash
gcloud firestore databases describe --database='(default)' --project gamedevpl
```

Check the [status dashboard](https://status.cloud.google.com/) for europe-central2. A
regional Firestore outage is not something to fix — it is something to communicate.
Sign-in, submissions, quotas and notifications all fail; **published play keeps working**,
since it reads the snapshot bucket rather than the database. Say so, rather than saying
"the site is down".

## 5. Capacity / instances

```bash
gcloud run services describe "$SERVICE" --region "$REGION" --project "$PROJECT_ID" \
  --format='value(spec.template.metadata.annotations)'
```

While the app is pinned to a single instance, saturation shows up as queueing then 429/5xx
with no errors in the logs. Under a genuine traffic burst, degrade in this order — the
ladder exists so the decision is not improvised at 2am:

1. Pause creation (global cap / `SUBMISSIONS_PAUSED`).
2. Sample or drop telemetry writes — losing metrics beats losing play.
3. Refuse new party rooms with an honest message.
4. The play path goes down last.

## 6. When it is not us

Before concluding the platform is broken, check the dependencies that can fail
independently:

| Dependency | Affects | Check |
| --- | --- | --- |
| Cloud Storage (europe-west1) | Published catalog + play | [status.cloud.google.com](https://status.cloud.google.com/) |
| Firestore (europe-central2) | Everything requiring identity | as above |
| GitHub API | Creation, previews, drafts — **not** published play | [githubstatus.com](https://www.githubstatus.com/) |
| Resend | Invite + notification email only | Resend dashboard |
| Route 53 / DNS | Everything, including the uptime check | `dig www.gamedev.pl` |

## 7. Afterwards

Write down what happened while it is fresh — in the ops repo, not here. Two questions
worth answering every time, because they are what turn an incident into a system change:
**what would have caught this sooner**, and **what would have made the fix faster**. If
either answer is "an alert that does not exist", add it.
