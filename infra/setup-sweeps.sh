#!/usr/bin/env bash
#
# Provision the internal sweep Cloud Scheduler jobs.
# OWNER-RUN: needs `gcloud` authenticated against the target project.
#
# Usage:
#   ./infra/setup-sweeps.sh                    # reconcile every job below
#   ./infra/setup-sweeps.sh health-sweep       # reconcile one
#   ./infra/setup-sweeps.sh notify-sweep digest-sweep
#
# Override via env: PROJECT_ID, REGION, SERVICE, SWEEP_SA_NAME, TIME_ZONE, SERVICE_URL.
#
# Idempotent: re-running reconciles each job's endpoint, schedule, time zone and OIDC
# identity without changing whether an operator has paused it.
#
# These five jobs used to live only as copy-paste commands inside plan docs, which meant
# the deployment could not be reproduced from the repo — and health-sweep had no create
# command written down anywhere at all, despite HEALTH_SWEEP_AUDIENCE being threaded
# through both deploy paths as though the job existed.
#
# Each endpoint stays CLOSED until its matching *_AUDIENCE variable is set on the service:
# internal-auth.ts denies everything when the audience is unset, so creating a job before
# the redeploy is safe — the sweep 401s rather than running unauthenticated. Set the
# variable as a GitHub repo variable (both deploy paths thread it — see
# infra/env-manifest.json), redeploy, then run this.
#
# Every job deliberately gets its own audience, which is its own URL: one sweep's OIDC
# token must not be replayable against another sweep's endpoint.
set -euo pipefail

export CLOUDSDK_CORE_DISABLE_PROMPTS=1

PROJECT_ID="${PROJECT_ID:-gamedevpl}"
REGION="${REGION:-europe-west1}"
SERVICE="${SERVICE:-gamedev-app}"
SWEEP_SA_NAME="${SWEEP_SA_NAME:-notify-sweep}"
TIME_ZONE="${TIME_ZONE:-Europe/Warsaw}"

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
SERVICE_URL="${SERVICE_URL:-https://${SERVICE}-${PROJECT_NUMBER}.${REGION}.run.app}"
SWEEP_SA="${SWEEP_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

# name|path|schedule|why this cadence
#
# The 03:xx jobs are staggered rather than concurrent, and the order is load-bearing:
# suggestion-sweep reads what scorecard-sweep wrote, and health-sweep starts Cloud Build
# runs so it goes last, after the cheap reads are done.
JOBS=(
  "notify-sweep|/api/internal/notify-sweep|*/2 * * * *|no-ops fast when no submissions are open, so 2min keeps scale-to-zero economics"
  "scorecard-sweep|/api/internal/scorecard-sweep|20 3 * * *|nightly recompute of per-game scorecards"
  "suggestion-sweep|/api/internal/suggestion-sweep|30 3 * * *|IL-3 router over the scorecards; must follow scorecard-sweep"
  "digest-sweep|/api/internal/digest-sweep|0 9 * * 1|weekly creator digest, Monday morning"
  "health-sweep|/api/internal/health-sweep|50 3 * * *|daily re-check of the published shelf against today's engine (game-health.ts)"
)

selected=("$@")

is_selected() {
  [[ ${#selected[@]} -eq 0 ]] && return 0
  local candidate="$1" name
  for name in "${selected[@]}"; do
    [[ "$name" == "$candidate" ]] && return 0
  done
  return 1
}

# Validate any names given before touching the project, so a typo does not silently
# reconcile nothing and report success.
for name in "${selected[@]}"; do
  known=false
  for job in "${JOBS[@]}"; do
    [[ "${job%%|*}" == "$name" ]] && known=true
  done
  if [[ "$known" != true ]]; then
    echo "ERROR: unknown job '${name}'. Known jobs:" >&2
    for job in "${JOBS[@]}"; do echo "  ${job%%|*}" >&2; done
    exit 1
  fi
done

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

reconcile_scheduler_job() {
  local job_name="$1"
  shift
  local flags=("$@")
  if gcloud scheduler jobs describe "$job_name" \
    --location "$REGION" \
    --project "$PROJECT_ID" \
    >/dev/null 2>&1; then
    if gcloud scheduler jobs update http "$job_name" "${flags[@]}" >/dev/null; then
      SCHEDULER_ACTION="Updated existing job."
      return 0
    fi
  elif gcloud scheduler jobs create http "$job_name" "${flags[@]}" >/dev/null; then
    SCHEDULER_ACTION="Created job."
    return 0
  fi
  return 1
}

RECONCILED=()
for job in "${JOBS[@]}"; do
  IFS='|' read -r JOB_NAME JOB_PATH JOB_SCHEDULE JOB_WHY <<<"$job"
  is_selected "$JOB_NAME" || continue

  JOB_URL="${SERVICE_URL%/}${JOB_PATH}"
  echo ""
  echo "==> ${JOB_NAME} (${JOB_SCHEDULE})"
  echo "    ${JOB_WHY}"

  COMMON_FLAGS=(
    --location "$REGION"
    --project "$PROJECT_ID"
    --schedule "$JOB_SCHEDULE"
    --time-zone "$TIME_ZONE"
    --uri "$JOB_URL"
    --http-method POST
    --oidc-service-account-email "$SWEEP_SA"
    --oidc-token-audience "$JOB_URL"
    --attempt-deadline 180s
  )

  # Scheduler can reject a newly created service account briefly after IAM starts
  # returning it. Retry the operation that consumes the identity so a fresh bootstrap
  # does not require an operator to rerun the whole setup.
  printf '    Reconciling'
  SCHEDULER_READY=false
  for attempt in $(seq 1 30); do
    if reconcile_scheduler_job "$JOB_NAME" "${COMMON_FLAGS[@]}"; then
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
  echo "    ${SCHEDULER_ACTION} -> ${JOB_URL}"
  RECONCILED+=("$JOB_NAME")
done

echo ""
echo "==> Done. Reconciled ${#RECONCILED[@]} job(s): ${RECONCILED[*]}"
echo "    OIDC service account: ${SWEEP_SA}"
echo "    time zone: ${TIME_ZONE}"
echo ""
echo "    Each endpoint stays closed until its *_AUDIENCE variable is set on the service."
echo "    Check what the service currently has:"
echo "      gcloud run services describe ${SERVICE} --region ${REGION} --project ${PROJECT_ID} \\"
echo "        --format='value(spec.template.spec.containers[0].env)' | tr ',' '\\n' | grep AUDIENCE"
