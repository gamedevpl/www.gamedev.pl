#!/usr/bin/env bash
#
# The alerting floor: an uptime check and the four alert policies that decide whether a
# night of 5xx is discovered by monitoring or by a user.
# OWNER-RUN: needs `gcloud` authenticated against the project.
#
# Usage:
#   ALERT_EMAIL=you@example.com ./infra/setup-monitoring.sh
#
# Override via env: PROJECT_ID, REGION, SERVICE, HOST, ALERT_EMAIL, BACKUP_BUCKET.
#
# What this deliberately is and is not:
#
#   It is GCP-native and email-only. One operator, no rotation, no PagerDuty — the
#   response-time expectation is hours, not minutes, and the SLO is written to match.
#   Adding a vendor here would cost a bill and a DPA to tell us the same things.
#
#   The bar for a policy living in this file: would the operator act on it within a day?
#   Anything else belongs on a dashboard, not in an inbox. An alert nobody acts on
#   trains the operator to ignore the channel, which is worse than not having it.
#
# Idempotent: policies are matched by display name and updated rather than duplicated.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-gamedevpl}"
REGION="${REGION:-europe-west1}"
SERVICE="${SERVICE:-gamedev-app}"
HOST="${HOST:-www.gamedev.pl}"
BACKUP_BUCKET="${BACKUP_BUCKET:-${PROJECT_ID}-firestore-backups}"
: "${ALERT_EMAIL:?set ALERT_EMAIL to the address that should receive alerts}"

echo "==> 1/4 Enabling the Monitoring API"
gcloud services enable monitoring.googleapis.com --project "$PROJECT_ID"

echo "==> 2/4 Ensuring the email notification channel"
CHANNEL_NAME="$(gcloud beta monitoring channels list \
  --project "$PROJECT_ID" \
  --filter="type=email AND labels.email_address=${ALERT_EMAIL}" \
  --format='value(name)' 2>/dev/null | head -n 1)"
if [ -z "$CHANNEL_NAME" ]; then
  CHANNEL_NAME="$(gcloud beta monitoring channels create \
    --project "$PROJECT_ID" \
    --display-name="Ops email" \
    --type=email \
    --channel-labels="email_address=${ALERT_EMAIL}" \
    --format='value(name)')"
  echo "    Created channel ${CHANNEL_NAME}."
else
  echo "    Channel already exists."
fi

echo "==> 3/4 Ensuring the uptime check on https://${HOST}/api/health"
# /api/health is the right probe target precisely because it is not walled: it answers
# 200 without a session, so a failure means the service is genuinely unreachable rather
# than that the beta gate did its job. Checking a walled route would alert on 401 or,
# worse, teach us to ignore the alert that fires every time.
UPTIME_NAME="$(gcloud monitoring uptime list-configs \
  --project "$PROJECT_ID" \
  --filter="displayName='gamedev-app health'" \
  --format='value(name)' 2>/dev/null | head -n 1)"
if [ -z "$UPTIME_NAME" ]; then
  gcloud monitoring uptime create 'gamedev-app health' \
    --project "$PROJECT_ID" \
    --resource-type=uptime-url \
    --resource-labels="host=${HOST},project_id=${PROJECT_ID}" \
    --path='/api/health' \
    --port=443 \
    --protocol=https \
    --period=5 \
    --timeout=10 \
    >/dev/null
  echo "    Created (5-minute cadence from multiple regions)."
else
  echo "    Uptime check already exists."
fi

echo "==> 4/4 Ensuring alert policies"
POLICY_DIR="$(mktemp -d)"
trap 'rm -rf "$POLICY_DIR"' EXIT

# A1 — the site is down. Multi-region agreement is what separates "Cloud Run is gone"
# from "one prober had a bad minute", which is why the uptime check fans out and this
# policy waits for 300s of sustained failure before it speaks.
cat > "${POLICY_DIR}/a1.json" <<EOF
{
  "displayName": "A1 site down (uptime check failing)",
  "combiner": "OR",
  "conditions": [{
    "displayName": "uptime check failing for 5 minutes",
    "conditionThreshold": {
      "filter": "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND resource.type=\"uptime_url\"",
      "aggregations": [{
        "alignmentPeriod": "300s",
        "perSeriesAligner": "ALIGN_FRACTION_TRUE",
        "crossSeriesReducer": "REDUCE_MEAN"
      }],
      "comparison": "COMPARISON_LT",
      "thresholdValue": 0.4,
      "duration": "300s",
      "trigger": { "count": 1 }
    }
  }],
  "alertStrategy": { "autoClose": "86400s" },
  "documentation": {
    "content": "https://${HOST}/api/health is failing from most probers. Triage: docs/runbooks/site-down-triage.md",
    "mimeType": "text/markdown"
  }
}
EOF

# A2 — 5xx rate. Scale-to-zero means low absolute traffic, where a *ratio* alone is
# noise: two errors out of three requests at 04:00 is 66% and means nothing. Hence a
# rate condition rather than a ratio, tuned to fire on a broken deploy (which errors
# continuously) and stay quiet for the occasional one-off.
cat > "${POLICY_DIR}/a2.json" <<EOF
{
  "displayName": "A2 Cloud Run 5xx rate elevated",
  "combiner": "OR",
  "conditions": [{
    "displayName": "5xx responses sustained over 10 minutes",
    "conditionThreshold": {
      "filter": "metric.type=\"run.googleapis.com/request_count\" AND resource.type=\"cloud_run_revision\" AND resource.label.\"service_name\"=\"${SERVICE}\" AND metric.label.\"response_code_class\"=\"5xx\"",
      "aggregations": [{
        "alignmentPeriod": "600s",
        "perSeriesAligner": "ALIGN_RATE",
        "crossSeriesReducer": "REDUCE_SUM"
      }],
      "comparison": "COMPARISON_GT",
      "thresholdValue": 0.03,
      "duration": "600s",
      "trigger": { "count": 1 }
    }
  }],
  "alertStrategy": { "autoClose": "86400s" },
  "documentation": {
    "content": "Sustained 5xx from ${SERVICE}. Most likely: a bad deploy, the snapshot bucket unreachable (published play now 503s rather than falling back), or Firestore. Triage: docs/runbooks/site-down-triage.md",
    "mimeType": "text/markdown"
  }
}
EOF

# A3 — the notify sweep. It already runs every 2 minutes against auth, Firestore and the
# app in one request, which makes it a synthetic monitor we are getting for free; all
# that was missing was anyone listening. Its failure is also a real user-facing outage
# (creators stop being notified) even when every page still loads.
cat > "${POLICY_DIR}/a3.json" <<EOF
{
  "displayName": "A3 notify-sweep failing",
  "combiner": "OR",
  "conditions": [{
    "displayName": "scheduler job failing repeatedly",
    "conditionThreshold": {
      "filter": "metric.type=\"cloudscheduler.googleapis.com/job/attempt_count\" AND resource.type=\"cloud_scheduler_job\" AND metric.label.\"response_code\"!=\"200\"",
      "aggregations": [{
        "alignmentPeriod": "900s",
        "perSeriesAligner": "ALIGN_SUM",
        "crossSeriesReducer": "REDUCE_SUM",
        "groupByFields": ["resource.label.\"job_id\""]
      }],
      "comparison": "COMPARISON_GT",
      "thresholdValue": 2,
      "duration": "0s",
      "trigger": { "count": 1 }
    }
  }],
  "alertStrategy": { "autoClose": "86400s" },
  "documentation": {
    "content": "A scheduled job is failing. Covers notify-sweep (creator notifications) and firestore-daily-export (backups) — check which job_id fired.",
    "mimeType": "text/markdown"
  }
}
EOF

# A4 — the backup watching itself. A silently broken export is indistinguishable from a
# working one until the day it is needed, which is the worst possible day to find out.
# Absence of data is the signal here, so this alerts on the *metric going missing*.
cat > "${POLICY_DIR}/a4.json" <<EOF
{
  "displayName": "A4 no fresh Firestore export",
  "combiner": "OR",
  "conditions": [{
    "displayName": "backup bucket has taken no writes in 36 hours",
    "conditionAbsent": {
      "filter": "metric.type=\"storage.googleapis.com/api/request_count\" AND resource.type=\"gcs_bucket\" AND resource.label.\"bucket_name\"=\"${BACKUP_BUCKET}\"",
      "aggregations": [{
        "alignmentPeriod": "3600s",
        "perSeriesAligner": "ALIGN_SUM",
        "crossSeriesReducer": "REDUCE_SUM"
      }],
      "duration": "129600s",
      "trigger": { "count": 1 }
    }
  }],
  "alertStrategy": { "autoClose": "604800s" },
  "documentation": {
    "content": "No write activity on gs://${BACKUP_BUCKET} for 36h — the daily export is not running. Restore procedure and job details: docs/runbooks/restore-firestore.md",
    "mimeType": "text/markdown"
  }
}
EOF

for FILE in "${POLICY_DIR}"/*.json; do
  DISPLAY="$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['displayName'])" "$FILE")"
  EXISTING="$(gcloud alpha monitoring policies list \
    --project "$PROJECT_ID" \
    --filter="displayName='${DISPLAY}'" \
    --format='value(name)' 2>/dev/null | head -n 1)"
  if [ -n "$EXISTING" ]; then
    gcloud alpha monitoring policies update "$EXISTING" \
      --project "$PROJECT_ID" \
      --policy-from-file="$FILE" \
      >/dev/null
    echo "    Updated: ${DISPLAY}"
  else
    gcloud alpha monitoring policies create \
      --project "$PROJECT_ID" \
      --policy-from-file="$FILE" \
      --notification-channels="$CHANNEL_NAME" \
      >/dev/null
    echo "    Created: ${DISPLAY}"
  fi
done

echo ""
echo "==> Done. Uptime check + A1-A4 wired to ${ALERT_EMAIL}."
echo ""
echo "    A5 (billing budget) is NOT here: budgets live on the billing account, not the"
echo "    project, and need roles this script does not assume. Create it once by hand:"
echo "      Console → Billing → Budgets & alerts → Create budget"
echo "      Scope: project ${PROJECT_ID}; thresholds 50/90/100%; email ${ALERT_EMAIL}"
echo ""
echo "    Then prove it works, because an untested alert is a decoration:"
echo "      gcloud scheduler jobs pause notify-sweep --location ${REGION} --project ${PROJECT_ID}"
echo "      # wait ~15 min for A3 to fire, confirm the email, then:"
echo "      gcloud scheduler jobs resume notify-sweep --location ${REGION} --project ${PROJECT_ID}"
