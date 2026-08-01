#!/usr/bin/env bash
#
# One-time GCP setup for READ-ONLY infrastructure access by coding agents
# (Claude Code, Cursor Cloud Agents, Copilot). Creates one service account that can
# investigate — read logs, metrics, service state, build history — and cannot change
# anything, cannot read Firestore, and cannot read secret payloads.
#
# OWNER-RUN. Idempotent: safe to re-run.
#
# Usage:
#   ./infra/setup-agent-readonly.sh              # roles + WIF binding, no key
#   ISSUE_KEY=1 ./infra/setup-agent-readonly.sh  # also mint a JSON key for cloud agents
#
# Override via env: PROJECT_ID, SA_NAME, POOL_NAME, REPO, KEY_OUT.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-gamedevpl}"
SA_NAME="${SA_NAME:-agent-investigator}"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
POOL_NAME="${POOL_NAME:-github-pool}"
REPO="${REPO:-gamedevpl/www.gamedev.pl}"
KEY_OUT="${KEY_OUT:-./agent-investigator-key.json}"
SNAPSHOT_BUCKET="${GAMES_SNAPSHOT_BUCKET:-${PROJECT_ID}-games-snapshots}"
STORE_BUCKET="${GAMES_STORE_BUCKET:-${PROJECT_ID}-games-store}"

echo "==> 1/6 Creating service account '${SA_NAME}'"
gcloud iam service-accounts create "$SA_NAME" \
  --display-name="Agent Investigator (read-only)" \
  --description="Read-only GCP access for coding agents. No write, no Firestore, no secret payloads." \
  --project="$PROJECT_ID" \
  || echo "    (already exists, continuing)"

echo "==> 2/6 Granting read-only project roles to ${SA_EMAIL}"
# Every role here is a *Viewer*. The security property this account is meant to have is
# that leaking it discloses operational state and cannot damage anything or expose a user.
#
# Deliberately NOT granted, and why:
#   roles/datastore.viewer     - Firestore IAM has no collection-level scope, so "read the
#                                schema" and "read every player's account" are the same
#                                grant. An investigation agent does not need it. (Same
#                                reasoning as the erase-verifier split in setup-wif.sh.)
#   roles/secretmanager.secretAccessor
#                              - reads secret *payloads*. secretmanager.viewer below gives
#                                names, versions and enable state, which is what actually
#                                diagnoses "is the secret set / is it the stale version".
#   roles/logging.privateLogViewer
#                              - would add Data Access logs, which carry per-user request
#                                detail. logging.viewer covers _Default and _Required.
#   roles/storage.objectViewer at project level
#                              - gs://${PROJECT_ID}-firestore-backups holds full Firestore
#                                exports. Bucket-scoped grants in step 3 instead.
#   roles/viewer (basic)       - the primitive role is a superset of all of the above
#                                exclusions; never use it here.
for ROLE in \
  roles/logging.viewer \
  roles/monitoring.viewer \
  roles/run.viewer \
  roles/cloudbuild.builds.viewer \
  roles/artifactregistry.reader \
  roles/errorreporting.viewer \
  roles/cloudscheduler.viewer \
  roles/workflows.viewer \
  roles/secretmanager.viewer \
  roles/serviceusage.serviceUsageViewer \
  ; do
  echo "    - ${ROLE}"
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="$ROLE" \
    --condition=None \
    >/dev/null
done

echo "==> 3/6 Granting object read on the two public-content buckets only"
# These hold published game snapshots and store artifacts — content that is already served
# publicly, so reading it discloses nothing. The backup bucket is pointedly absent.
for BUCKET in "$SNAPSHOT_BUCKET" "$STORE_BUCKET"; do
  if gcloud storage buckets describe "gs://${BUCKET}" --project "$PROJECT_ID" >/dev/null 2>&1; then
    echo "    - gs://${BUCKET}"
    gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
      --member="serviceAccount:${SA_EMAIL}" \
      --role="roles/storage.objectViewer" \
      >/dev/null
  else
    echo "    (gs://${BUCKET} not found, skipping)"
  fi
done

echo "==> 4/6 Allowing your own account to impersonate ${SA_NAME}"
# This is how local Claude Code should reach GCP: no key at all, just
#   gcloud auth print-access-token --impersonate-service-account=${SA_EMAIL}
# which yields a 1-hour token that expires on its own.
CALLER="$(gcloud config get-value account 2>/dev/null)"
if [[ -n "$CALLER" && "$CALLER" != "(unset)" ]]; then
  gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
    --role="roles/iam.serviceAccountTokenCreator" \
    --member="user:${CALLER}" \
    --project="$PROJECT_ID" \
    >/dev/null
  echo "    granted to ${CALLER}"
else
  echo "    (no active gcloud account; skipping — grant serviceAccountTokenCreator by hand)"
fi

echo "==> 5/6 Binding repository '${REPO}' to ${SA_NAME} via Workload Identity"
# Reuses the pool created by setup-wif.sh, so GitHub Actions (and Copilot agent runs that
# execute in Actions) can assume this account keylessly, exactly like the deployer does.
if POOL_ID=$(gcloud iam workload-identity-pools describe "$POOL_NAME" \
    --location="global" --format="value(name)" --project="$PROJECT_ID" 2>/dev/null); then
  gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
    --role="roles/iam.workloadIdentityUser" \
    --member="principalSet://iam.googleapis.com/${POOL_ID}/attribute.repository/${REPO}" \
    --project="$PROJECT_ID" \
    >/dev/null
  echo "    bound to pool ${POOL_NAME}"
else
  echo "    (pool '${POOL_NAME}' not found — run ./infra/setup-wif.sh first if you want keyless CI access)"
fi

echo "==> 6/6 Service account key (only for sandboxes that cannot federate)"
# Cursor Cloud Agents and Claude Code web sessions have no OIDC identity Google will
# trust, so they need an injected credential. This key is long-lived; the thing that makes
# that acceptable is step 2 — it can only read. Rotate it by deleting the old key:
#   gcloud iam service-accounts keys list --iam-account=${SA_EMAIL}
#   gcloud iam service-accounts keys delete KEY_ID --iam-account=${SA_EMAIL}
if [[ "${ISSUE_KEY:-}" == "1" ]]; then
  gcloud iam service-accounts keys create "$KEY_OUT" \
    --iam-account="$SA_EMAIL" \
    --project="$PROJECT_ID"
  echo ""
  echo "    Key written to ${KEY_OUT} — this file is a credential. Do NOT commit it."
  echo ""
  echo "    Agent environments (Claude Code, Cursor) accept only single-line env vars, and"
  echo "    this JSON is multi-line — so ship it base64-encoded. Copy and verify:"
  echo "      base64 -i ${KEY_OUT} | tr -d '\\n' | pbcopy"
  echo "      pbpaste | base64 -d | head -c 40   # sanity-check before pasting"
  echo "      rm ${KEY_OUT}"
  echo ""
  echo "    Set it as GCP_READONLY_KEY_B64, then in the sandbox:"
  echo "      echo \"\$GCP_READONLY_KEY_B64\" | base64 -d > /tmp/gcp-key.json"
  echo "      gcloud auth activate-service-account --key-file=/tmp/gcp-key.json --project=${PROJECT_ID}"
  echo "      export GOOGLE_APPLICATION_CREDENTIALS=/tmp/gcp-key.json   # for SDKs"
else
  echo "    skipped (re-run with ISSUE_KEY=1 to mint one)"
fi

echo ""
echo "==> Done. ${SA_EMAIL}"
echo ""
echo "Local Claude Code (no key):"
echo "  gcloud auth print-access-token --impersonate-service-account=${SA_EMAIL}"
echo "  # or, for a whole session:"
echo "  gcloud config set auth/impersonate_service_account ${SA_EMAIL}"
echo ""
echo "GitHub Actions (no key):"
echo "  service_account: ${SA_EMAIL}"
echo ""
echo "Smoke test — should succeed:"
echo "  gcloud logging read 'resource.type=cloud_run_revision' --limit=1 --project=${PROJECT_ID}"
echo "Should FAIL with PERMISSION_DENIED (this is the point):"
echo "  gcloud firestore databases list --project=${PROJECT_ID}"
echo "  gcloud secrets versions access latest --secret=session-secret --project=${PROJECT_ID}"
