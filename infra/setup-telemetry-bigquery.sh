#!/usr/bin/env bash
#
# BigQuery home for raw play and visit telemetry (TELEMETRY_BACKEND, see
# apps/api/src/store/slices/telemetry-bigquery.ts).
# OWNER-RUN: needs `gcloud` and `bq` authenticated against the project.
#
# Usage:
#   ./infra/setup-telemetry-bigquery.sh
#
# Override via env: PROJECT_ID, LOCATION, APP_SA_NAME.
#
# Why BigQuery: one Firestore document per event made every dashboard a scan billed per
# row, and the twice-daily backup export re-read all 90 days of it. Here a whole window
# is one query, and partition expiry keeps the 90-day retention promise that the
# Firestore TTL policy kept before.
#
# Idempotent: existing dataset and tables are left as they are.
set -euo pipefail

# An old copy of this script does not fail; it reverts what a newer copy fixed.
source "$(dirname "${BASH_SOURCE[0]}")/require-current-checkout.sh"

export CLOUDSDK_CORE_DISABLE_PROMPTS=1

PROJECT_ID="${PROJECT_ID:-gamedevpl}"
# Beside Firestore, so the backfill never moves data across regions. Must match
# TELEMETRY_BQ_LOCATION in telemetry-bigquery.ts.
LOCATION="${LOCATION:-europe-central2}"
APP_SA="${APP_SA_NAME:-gamedev-app}@${PROJECT_ID}.iam.gserviceaccount.com"
DATASET="telemetry"
# TELEMETRY_RETENTION_DAYS in store/records/telemetry.ts.
RETENTION_SECONDS=$((90 * 24 * 60 * 60))

echo "==> 1/4 Enabling the BigQuery API"
gcloud services enable bigquery.googleapis.com --project "$PROJECT_ID"

echo "==> 2/4 Ensuring dataset ${PROJECT_ID}:${DATASET} in ${LOCATION}"
if bq --project_id="$PROJECT_ID" show --format=none "${PROJECT_ID}:${DATASET}" >/dev/null 2>&1; then
  echo "    Dataset already exists."
else
  bq --project_id="$PROJECT_ID" --location="$LOCATION" mk --dataset \
    --description "Raw play and visit telemetry. Anonymous by construction; 90-day partitions." \
    "${PROJECT_ID}:${DATASET}"
fi

ensure_table() {
  local table="$1" schema="$2" clustering="$3"
  if bq --project_id="$PROJECT_ID" show --format=none "${PROJECT_ID}:${DATASET}.${table}" >/dev/null 2>&1; then
    echo "    ${table} already exists."
    return
  fi
  # `day` is the Firestore partition the event was filed under, so a day here and a
  # day there hold the same rows. Every query filters on it.
  bq --project_id="$PROJECT_ID" mk --table \
    --time_partitioning_field day \
    --time_partitioning_type DAY \
    --time_partitioning_expiration "$RETENTION_SECONDS" \
    --require_partition_filter=true \
    --clustering_fields "$clustering" \
    --schema "$schema" \
    "${PROJECT_ID}:${DATASET}.${table}"
}

echo "==> 3/4 Ensuring tables"
# The whole event rides in `event`, so new fields need no schema change; the other
# columns are the ones queries filter or group on.
ensure_table play_events \
  'day:DATE,event_id:STRING,at:TIMESTAMP,slug:STRING,type:STRING,session_id:STRING,reviewer:BOOLEAN,agent_mode:BOOLEAN,event:JSON' \
  'slug,type'
ensure_table visit_events \
  'day:DATE,event_id:STRING,at:TIMESTAMP,visit_id:STRING,type:STRING,reviewer:BOOLEAN,event:JSON' \
  'type,visit_id'

echo "==> 4/4 Granting ${APP_SA} write and query on these two tables only"
# dataEditor per table, not on the project: the service can touch telemetry and nothing
# else in BigQuery. jobUser is project-level because query jobs are.
for table in play_events visit_events; do
  bq --project_id="$PROJECT_ID" add-iam-policy-binding \
    --member="serviceAccount:${APP_SA}" \
    --role=roles/bigquery.dataEditor \
    "${PROJECT_ID}:${DATASET}.${table}" >/dev/null
done
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${APP_SA}" \
  --role=roles/bigquery.jobUser \
  --condition=None >/dev/null

echo
echo "Done. Next: set the GitHub repo variable TELEMETRY_BACKEND=dual and redeploy master,"
echo "then backfill history from the ops console (npm run telemetry:backfill)."
