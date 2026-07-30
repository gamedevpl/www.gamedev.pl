#!/usr/bin/env bash
#
# Firestore backups: point-in-time recovery plus a daily export to Cloud Storage.
# OWNER-RUN: needs `gcloud` authenticated against a project with billing.
#
# Usage:
#   ./infra/setup-backups.sh
#
# Override via env: PROJECT_ID, FIRESTORE_REGION, BACKUP_BUCKET, EXPORT_SCHEDULE,
# EXPORT_RETENTION_DAYS, EXPORT_SA_NAME.
#
# PITR's window is deliberately absent from that list: Firestore fixes it at 7 days and
# `databases update` takes no retention argument, so a knob here could only ever print a
# number the database does not honour — a false statement about the recovery window, in
# the one script where that is least acceptable. Longer horizons come from the exports.
#
# Why both mechanisms, when either alone sounds sufficient:
#
#   PITR rewinds the *live* database to any microsecond in its retention window. It is
#   the right tool for the likely accident — a bad script, a wrong-collection delete —
#   and it needs no storage plan of its own. What it cannot survive is the database
#   itself going away: delete the database (or lose the project) and its recovery
#   window goes with it.
#
#   Exports are dumb files in a different service, under a different failure domain.
#   They are slower to restore and only as fresh as the last run, but they survive the
#   thing PITR does not. Neither is a backup strategy on its own; together they cover
#   both the fat-finger and the catastrophe.
#
# This script is idempotent — safe to re-run after changing any of the knobs above.
set -euo pipefail

# Every gcloud call here is GA, so none should prompt — but the existence checks below
# discard both streams, so any prompt that did appear would be invisible and the script
# would wait on stdin forever. setup-monitoring.sh hung exactly that way. Prompts off.
export CLOUDSDK_CORE_DISABLE_PROMPTS=1

PROJECT_ID="${PROJECT_ID:-gamedevpl}"
# The bucket must live where the database lives: Firestore refuses to export across
# locations, and this database is in europe-central2 (the app is in europe-west1 —
# see docs/deployment.md; that split is deliberate and predates the domain mapping).
FIRESTORE_REGION="${FIRESTORE_REGION:-europe-central2}"
BACKUP_BUCKET="${BACKUP_BUCKET:-${PROJECT_ID}-firestore-backups}"
EXPORT_SCHEDULE="${EXPORT_SCHEDULE:-17 3 * * *}"
EXPORT_RETENTION_DAYS="${EXPORT_RETENTION_DAYS:-30}"
EXPORT_SA_NAME="${EXPORT_SA_NAME:-firestore-export}"
EXPORT_SA="${EXPORT_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "==> 1/6 Enabling required APIs"
gcloud services enable firestore.googleapis.com storage.googleapis.com \
  cloudscheduler.googleapis.com \
  --project "$PROJECT_ID"

echo "==> 2/6 Enabling point-in-time recovery (7-day window, fixed by Firestore)"
# PITR is a database-level flag, not a per-collection one, so this covers every
# collection including ones added later. Enabling it on a database that already has it
# is a no-op that still exits 0.
gcloud firestore databases update \
  --database='(default)' \
  --enable-pitr \
  --project "$PROJECT_ID" \
  >/dev/null
echo "    PITR enabled."

echo "==> 3/6 Ensuring the backup bucket gs://${BACKUP_BUCKET} exists"
if gcloud storage buckets describe "gs://${BACKUP_BUCKET}" --project "$PROJECT_ID" >/dev/null 2>&1; then
  echo "    Bucket already exists."
else
  # Uniform access, and deliberately NOT public by any path: these objects are a full
  # copy of every user record in the system. The only readers are the export job and
  # an operator performing a restore.
  gcloud storage buckets create "gs://${BACKUP_BUCKET}" \
    --location="$FIRESTORE_REGION" \
    --uniform-bucket-level-access \
    --project="$PROJECT_ID"
  echo "    Created in ${FIRESTORE_REGION} (must match the database's location)."
fi

# Retention costs pennies at this data volume, and the window is what decides whether a
# corruption discovered late is recoverable. 30 days is well past the point where anyone
# would notice; shorten it only if the bill ever argues otherwise.
LIFECYCLE_FILE="$(mktemp)"
cat > "$LIFECYCLE_FILE" <<EOF
{
  "lifecycle": {
    "rule": [
      {
        "action": { "type": "Delete" },
        "condition": { "age": ${EXPORT_RETENTION_DAYS} }
      }
    ]
  }
}
EOF
gcloud storage buckets update "gs://${BACKUP_BUCKET}" \
  --lifecycle-file="$LIFECYCLE_FILE" \
  --project="$PROJECT_ID" \
  >/dev/null
rm -f "$LIFECYCLE_FILE"
echo "    ${EXPORT_RETENTION_DAYS}-day lifecycle applied."

echo "==> 4/6 Ensuring the export service account exists"
if gcloud iam service-accounts describe "$EXPORT_SA" --project "$PROJECT_ID" >/dev/null 2>&1; then
  echo "    Service account already exists."
else
  gcloud iam service-accounts create "$EXPORT_SA_NAME" \
    --display-name="Firestore scheduled export" \
    --project="$PROJECT_ID"
  echo "    Created ${EXPORT_SA}."
  # A brand-new service account is not immediately usable in an IAM binding: the identity
  # propagates asynchronously, and add-iam-policy-binding answers "Service account … does
  # not exist" until it lands. That is exactly how the first real run of this script died,
  # one line after successfully creating the account.
  printf '    Waiting for the identity to propagate'
  for _ in $(seq 1 30); do
    if gcloud iam service-accounts describe "$EXPORT_SA" --project "$PROJECT_ID" >/dev/null 2>&1; then
      break
    fi
    printf '.'
    sleep 2
  done
  printf '\n'
fi

# Even once `describe` answers, the policy layer can still lag behind, so the grants below
# are retried rather than allowed to fail the whole run on a race that clears itself in
# seconds. The last attempt runs unsuppressed: a genuine permission problem has to be
# readable, not buried under retries.
grant_with_retry() {
  local attempt
  for attempt in 1 2 3 4; do
    if "$@" >/dev/null 2>&1; then
      return 0
    fi
    sleep $((attempt * 3))
  done
  "$@" >/dev/null
}

echo "==> 5/6 Granting the export SA exactly what it needs"
# datastore.importExportAdmin can start an export but cannot read document contents,
# and objectCreator can write new objects but cannot read or delete existing ones. So a
# compromise of this identity cannot exfiltrate the database and cannot destroy older
# backups — which is the property that makes a backup worth having during an incident.
grant_with_retry gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${EXPORT_SA}" \
  --role="roles/datastore.importExportAdmin" \
  --condition=None
grant_with_retry gcloud storage buckets add-iam-policy-binding "gs://${BACKUP_BUCKET}" \
  --member="serviceAccount:${EXPORT_SA}" \
  --role="roles/storage.objectCreator" \
  --project="$PROJECT_ID"
echo "    importExportAdmin + objectCreator granted (no read, no delete)."

echo "==> 6/6 Ensuring the daily export job"
# Scheduler calls the Firestore REST API directly with an OAuth token rather than going
# through a Cloud Function: fewer moving parts, nothing to deploy, and no second
# codebase that can rot.
#
# The prefix is fixed and Firestore creates a timestamped folder beneath it per run
# (Scheduler has no date templating of its own), so runs never overwrite each other and
# the lifecycle rule ages whole exports out together.
EXPORT_URI="https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default):exportDocuments"
EXPORT_BODY='{"outputUriPrefix":"gs://'"${BACKUP_BUCKET}"'/exports"}'

if gcloud scheduler jobs describe firestore-daily-export --location "$FIRESTORE_REGION" --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud scheduler jobs update http firestore-daily-export \
    --location "$FIRESTORE_REGION" \
    --project "$PROJECT_ID" \
    --schedule "$EXPORT_SCHEDULE" \
    --time-zone 'Etc/UTC' \
    --uri "$EXPORT_URI" \
    --http-method POST \
    --headers 'Content-Type=application/json' \
    --message-body "$EXPORT_BODY" \
    --oauth-service-account-email "$EXPORT_SA" \
    >/dev/null
  echo "    Updated existing job."
else
  gcloud scheduler jobs create http firestore-daily-export \
    --location "$FIRESTORE_REGION" \
    --project "$PROJECT_ID" \
    --schedule "$EXPORT_SCHEDULE" \
    --time-zone 'Etc/UTC' \
    --uri "$EXPORT_URI" \
    --http-method POST \
    --headers 'Content-Type=application/json' \
    --message-body "$EXPORT_BODY" \
    --oauth-service-account-email "$EXPORT_SA" \
    >/dev/null
  echo "    Created job (schedule: ${EXPORT_SCHEDULE} UTC)."
fi

echo ""
echo "==> Done. PITR (7 days) + daily export to gs://${BACKUP_BUCKET} (${EXPORT_RETENTION_DAYS}-day retention)."
echo ""
echo "    Verify now, rather than trusting this output:"
echo "      gcloud scheduler jobs run firestore-daily-export --location ${FIRESTORE_REGION} --project ${PROJECT_ID}"
echo "      # wait a minute or two, then:"
echo "      gcloud storage ls gs://${BACKUP_BUCKET}/exports/"
echo ""
echo "    A backup nobody has restored is a hypothesis. Run the drill in"
echo "    docs/runbooks/restore-firestore.md once, and record the date there."
