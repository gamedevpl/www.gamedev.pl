# Runbook: roll back a bad deploy

**Last drilled: never.** ⚠️ Run §4 once against production while nothing is wrong, and
record the date and elapsed time here. A rollback path first attempted during an outage
is a rollback path that fails during an outage.

Rollback is **traffic reassignment, not a rebuild**: the previous image is still in
Artifact Registry and its revision still exists on the service. Nothing needs to
compile, and it does not depend on GitHub, CI, or this repo being in a good state —
which matters, because a bad deploy is exactly when those may not be available.

## 1. Find out what is actually serving

```bash
PROJECT_ID=gamedevpl; REGION=europe-west1; SERVICE=gamedev-app

gcloud run services describe "$SERVICE" --region "$REGION" --project "$PROJECT_ID" \
  --format='value(status.traffic[].revisionName, status.traffic[].percent)'

# Revisions newest-first, with their creation times:
gcloud run revisions list --service "$SERVICE" --region "$REGION" --project "$PROJECT_ID" \
  --format='table(metadata.name, metadata.creationTimestamp, status.conditions[0].status)' \
  --sort-by=~metadata.creationTimestamp --limit 10
```

## 2. Roll back

```bash
PREVIOUS=<revision-name-from-step-1>

gcloud run services update-traffic "$SERVICE" \
  --region "$REGION" --project "$PROJECT_ID" \
  --to-revisions "${PREVIOUS}=100"
```

Effective in seconds. Then confirm, rather than assuming:

```bash
curl -si https://www.gamedev.pl/api/health | head -n 1
gcloud run services describe "$SERVICE" --region "$REGION" --project "$PROJECT_ID" \
  --format='value(status.traffic[].revisionName)'
```

**Party rooms die on rollback**, as they do on any revision change — rooms are
per-instance memory. Nothing to do about it; just know that "the party broke" reports
after a rollback are expected and self-resolving (guests rejoin with the same code).

## 3. Then stop the pipeline from re-deploying the bad commit

Traffic is now on the old revision, but `master` still contains whatever broke it. The
next merge — or a re-run of the deploy workflow — will put it straight back.

Pick one, in preference order:

1. **Revert the commit on `master`** (`git revert <sha>`, push). The deploy that follows
   is green and the rollback becomes permanent by the normal path. Preferred: it leaves
   the repo honest.
2. **Fix forward** if the defect is understood and small.
3. **Disable the deploy workflow** in the Actions tab only if neither is possible right
   now and something else is on fire. Re-enable it the same day, and leave a note in the
   channel — a silently disabled deploy pipeline is its own future incident.

## 4. The drill

Do this once on a quiet afternoon:

1. Note the current revision.
2. Shift traffic to the previous revision (§2), timing how long the command takes to
   take effect at the edge.
3. Verify `/api/health` and load the site.
4. Shift back to latest: `gcloud run services update-traffic "$SERVICE" --to-latest
--region "$REGION" --project "$PROJECT_ID"`.
5. Record here: the date, and the wall-clock seconds from decision to healthy.

## Other services

The same procedure applies to every Cloud Run service; only `SERVICE` changes.

| Service         | Deploy path                                                                                                                  | Notes                                                                                                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gamedev-app`   | `.github/workflows/deploy.yml`, [`infra/deploy-api.sh`](../../infra/deploy-api.sh)                                           | The site                                                                                                                                                              |
| `gamedev-world` | `deploy.yml` (image only, when its inputs changed), [`infra/deploy-world.sh`](../../infra/deploy-world.sh) (env and secrets) | Zone host. Inert **only** while `ZONE_HOST_URL` is unset — once set it is serving, and its failures are silent (see [`zones-down-triage.md`](./zones-down-triage.md)) |
| party relay     | see [`multiplayer-plan.md`](../multiplayer-plan.md)                                                                          | Same image as the app, role chosen by env                                                                                                                             |

When more than one service is live, roll back **only the one that broke**, and check
whether the two are version-coupled before assuming they are independent: the relay and
the app ship from the same image, so a rollback of one can leave a protocol mismatch
with the other. If in doubt, roll both to the same previously-good image tag.
