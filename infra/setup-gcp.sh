#!/usr/bin/env bash
#
# One-time GCP provisioning for Firestore Native database, IAM permissions, Vertex AI, and session secret.
# OWNER-RUN: needs a GCP project with billing, and `gcloud` authenticated.
#
# Usage:
#   ./infra/setup-gcp.sh
#
# Override any of these via env if needed: PROJECT_ID, REGION, SA_NAME.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-gamedevpl}"
REGION="${REGION:-europe-central2}"
DEPLOYER_SA="${SA_NAME:-github-actions-deployer}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "==> 1/6 Enabling required GCP APIs"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com firestore.googleapis.com \
  aiplatform.googleapis.com \
  --project "$PROJECT_ID"

echo "==> 2/6 Provisioning Firestore (Native Mode) in ${REGION}"
if gcloud firestore databases describe --project "$PROJECT_ID" >/dev/null 2>&1; then
  echo "    Firestore database already exists."
else
  gcloud firestore databases create --location="$REGION" --type=firestore-native --project="$PROJECT_ID"
fi

echo "==> 3/6 Granting datastore.user role to Deployer SA (${DEPLOYER_SA})"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${DEPLOYER_SA}" \
  --role="roles/datastore.user" \
  --condition=None \
  >/dev/null

echo "==> 4/6 Ensuring Cloud Run runtime SA has datastore.user and aiplatform.user roles"
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")
RUN_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${RUN_SA}" \
  --role="roles/datastore.user" \
  --condition=None \
  >/dev/null

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${RUN_SA}" \
  --role="roles/aiplatform.user" \
  --condition=None \
  >/dev/null

echo "==> 5/6 Ensuring session-secret exists in Secret Manager and granting secretAccessor"
if gcloud secrets describe session-secret --project "$PROJECT_ID" >/dev/null 2>&1; then
  echo "    Secret 'session-secret' already exists."
else
  openssl rand -hex 32 | gcloud secrets create session-secret --data-file=- --replication-policy=automatic --project="$PROJECT_ID"
  echo "    Created secret 'session-secret'."
fi

gcloud secrets add-iam-policy-binding session-secret \
  --member="serviceAccount:${RUN_SA}" \
  --role="roles/secretmanager.secretAccessor" \
  --project="$PROJECT_ID" \
  >/dev/null

# Raw play telemetry is kept for 90 days (docs/improvement-loop-plan.md IL-1). Firestore
# enforces that with a TTL policy on the field the writer stamps — see
# TELEMETRY_TTL_FIELD / TELEMETRY_COLLECTION in apps/api/src/store.ts. The policy names
# must match those constants exactly: a policy pointed at the wrong field or collection
# group is a silent no-op that deletes nothing and reports no error.
#
# The collection group is `playEvents`, deliberately not `events` — a TTL policy applies
# to a collection group rather than a path, and `submissions/{n}/events` holds durable
# build history that must never expire.
# `ttls list` reports only fields that already have a policy, so a name match is the
# existence check. Matched with grep rather than `--filter`, whose `:` operator does not
# match a slash-separated path reliably.
echo "==> 6/6 Ensuring the 90-day TTL policy on telemetry playEvents.expiresAt"
if gcloud firestore fields ttls list --project="$PROJECT_ID" --format="value(name)" 2>/dev/null |
  grep -q "collectionGroups/playEvents/fields/expiresAt"; then
  echo "    TTL policy already present."
else
  # --enable-ttl is required and is what makes the field the collection group's TTL
  # field. No --expiration-offset: `expiresAt` is already the absolute deadline, so the
  # row expires exactly at the value the writer computed.
  gcloud firestore fields ttls update expiresAt \
    --collection-group=playEvents \
    --enable-ttl \
    --project="$PROJECT_ID"
  echo "    TTL policy created. It applies to documents carrying the field; rows written"
  echo "    before it existed are never expired by it."
fi

echo ""
echo "==> Done. Firestore database, IAM roles (datastore.user, aiplatform.user), session-secret, and telemetry TTL configured for project ${PROJECT_ID}."
