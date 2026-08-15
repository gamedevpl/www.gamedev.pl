#!/usr/bin/env bash
#
# Provision the dispatch-reaper Cloud Scheduler job.
# OWNER-RUN: needs `gcloud` authenticated against the target project.
#
# Usage:
#   ./infra/setup-dispatch-reaper.sh
#
# Override via env: PROJECT_ID, REGION, SERVICE, JOB_NAME, SWEEP_SA_NAME,
# SCHEDULE, TIME_ZONE, SERVICE_URL.
#
# This script is idempotent. Re-running it reconciles the job's endpoint, schedule,
# time zone, and OIDC identity without changing whether an operator has paused it.
#
# Runs every 15 minutes rather than nightly like the other sweeps: the point is
# catching a job stuck `queued` within roughly the same order of magnitude as the
# 10-minute not-dispatched threshold (job-state.ts DEFAULT_STALL_THRESHOLDS), not
# a day later. 4 calls/hour stays well under the endpoint's own 24/hour rate cap.
set -euo pipefail

export CLOUDSDK_CORE_DISABLE_PROMPTS=1

PROJECT_ID="${PROJECT_ID:-gamedevpl}"
REGION="${REGION:-europe-west1}"
SERVICE="${SERVICE:-gamedev-app}"
JOB_NAME="${JOB_NAME:-dispatch-reaper}"
SWEEP_SA_NAME="${SWEEP_SA_NAME:-notify-sweep}"
SCHEDULE="${SCHEDULE:-*/15 * * * *}"
TIME_ZONE="${TIME_ZONE:-Etc/UTC}"

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
SERVICE_URL="${SERVICE_URL:-https://${SERVICE}-${PROJECT_NUMBER}.${REGION}.run.app}"
SWEEP_URL="${SERVICE_URL%/}/api/internal/dispatch-reaper"
SWEEP_SA="${SWEEP_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "==> Enabling Cloud Scheduler API"
gcloud services enable cloudscheduler.googleapis.com --project "$PROJECT_ID" >/dev/null

echo "==> Ensuring sweep service account ${SWEEP_SA}"
if gcloud iam service-accounts describe "$SWEEP_SA" --project "$PROJECT_ID" >/dev/null 2>&1; then
  echo "    Service account already exists."
else
  gcloud iam service-accounts create "$SWEEP_SA_NAME" \
    --display-name="Internal sweep caller" \
    --project "$PROJECT_ID" \
    >/dev/null
  echo "    Created ${SWEEP_SA}."
fi

echo "==> Ensuring Cloud Scheduler job ${JOB_NAME}"
COMMON_FLAGS=(
  --location "$REGION"
  --project "$PROJECT_ID"
  --schedule "$SCHEDULE"
  --time-zone "$TIME_ZONE"
  --uri "$SWEEP_URL"
  --http-method POST
  --oidc-service-account-email "$SWEEP_SA"
  --oidc-token-audience "$SWEEP_URL"
  --attempt-deadline 180s
)

reconcile_scheduler_job() {
  if gcloud scheduler jobs describe "$JOB_NAME" \
    --location "$REGION" \
    --project "$PROJECT_ID" \
    >/dev/null 2>&1; then
    if gcloud scheduler jobs update http "$JOB_NAME" "${COMMON_FLAGS[@]}" >/dev/null; then
      SCHEDULER_ACTION="Updated existing job."
      return 0
    fi
  elif gcloud scheduler jobs create http "$JOB_NAME" "${COMMON_FLAGS[@]}" >/dev/null; then
    SCHEDULER_ACTION="Created job."
    return 0
  fi

  return 1
}

# Scheduler can reject a newly created service account briefly after IAM starts
# returning it. Retry the operation that consumes the identity so a fresh
# bootstrap does not require an operator to rerun the whole setup.
printf '    Reconciling job'
SCHEDULER_READY=false
for attempt in $(seq 1 30); do
  if reconcile_scheduler_job; then
    SCHEDULER_READY=true
    break
  fi
  if [[ "$attempt" -lt 30 ]]; then
    printf '.'
    sleep 2
  fi
done
printf '\n'

if [[ "$SCHEDULER_READY" != true ]]; then
  echo "ERROR: Could not reconcile ${JOB_NAME} after 30 attempts." >&2
  exit 1
fi
echo "    ${SCHEDULER_ACTION}"

echo ""
echo "==> Done. ${JOB_NAME} calls:"
echo "    ${SWEEP_URL}"
echo "    schedule: ${SCHEDULE} (${TIME_ZONE})"
echo "    OIDC service account: ${SWEEP_SA}"
echo ""
echo "==> Also needed (one-time, done separately):"
echo "    gh variable set DISPATCH_REAPER_AUDIENCE --body \"${SWEEP_URL}\""
echo "    Then redeploy so the service picks it up — the endpoint denies every"
echo "    caller until DISPATCH_REAPER_AUDIENCE is set in the running revision."
