#!/usr/bin/env bash
#
# Provision the delayed account-deletion cleanup job.
# OWNER-RUN: needs `gcloud` authenticated against the target project.
#
# Usage:
#   ./infra/setup-account-deletion.sh
#
# Override via env: PROJECT_ID, REGION, SERVICE, JOB_NAME, SWEEP_SA_NAME,
# SCHEDULE, TIME_ZONE, SERVICE_URL.
#
# This script is idempotent. Re-running it reconciles the job's endpoint, schedule,
# time zone, and OIDC identity without changing whether an operator has paused it.
set -euo pipefail

export CLOUDSDK_CORE_DISABLE_PROMPTS=1

PROJECT_ID="${PROJECT_ID:-gamedevpl}"
REGION="${REGION:-europe-west1}"
SERVICE="${SERVICE:-gamedev-app}"
JOB_NAME="${JOB_NAME:-account-deletion-sweep}"
SWEEP_SA_NAME="${SWEEP_SA_NAME:-notify-sweep}"
SCHEDULE="${SCHEDULE:-17 3 * * *}"
TIME_ZONE="${TIME_ZONE:-Europe/Warsaw}"

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
SERVICE_URL="${SERVICE_URL:-https://${SERVICE}-${PROJECT_NUMBER}.${REGION}.run.app}"
SWEEP_URL="${SERVICE_URL%/}/api/internal/account-deletion-sweep"
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

  # A newly created identity may be visible to IAM before Scheduler can use it.
  printf '    Waiting for the identity to propagate'
  for _ in $(seq 1 30); do
    if gcloud iam service-accounts describe "$SWEEP_SA" --project "$PROJECT_ID" >/dev/null 2>&1; then
      break
    fi
    printf '.'
    sleep 2
  done
  printf '\n'
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

if gcloud scheduler jobs describe "$JOB_NAME" \
  --location "$REGION" \
  --project "$PROJECT_ID" \
  >/dev/null 2>&1; then
  gcloud scheduler jobs update http "$JOB_NAME" "${COMMON_FLAGS[@]}" >/dev/null
  echo "    Updated existing job."
else
  gcloud scheduler jobs create http "$JOB_NAME" "${COMMON_FLAGS[@]}" >/dev/null
  echo "    Created job."
fi

echo ""
echo "==> Done. ${JOB_NAME} calls:"
echo "    ${SWEEP_URL}"
echo "    schedule: ${SCHEDULE} (${TIME_ZONE})"
echo "    OIDC service account: ${SWEEP_SA}"
