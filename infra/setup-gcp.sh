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

echo "==> 1/5 Enabling required GCP APIs"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com firestore.googleapis.com \
  aiplatform.googleapis.com \
  --project "$PROJECT_ID"

echo "==> 2/5 Provisioning Firestore (Native Mode) in ${REGION}"
if gcloud firestore databases describe --project "$PROJECT_ID" >/dev/null 2>&1; then
  echo "    Firestore database already exists."
else
  gcloud firestore databases create --location="$REGION" --type=firestore-native --project="$PROJECT_ID"
fi

echo "==> 3/5 Granting datastore.user role to Deployer SA (${DEPLOYER_SA})"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${DEPLOYER_SA}" \
  --role="roles/datastore.user" \
  --condition=None \
  >/dev/null

echo "==> 4/5 Ensuring Cloud Run runtime SA has datastore.user and aiplatform.user roles"
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

echo "==> 5/5 Ensuring session-secret exists in Secret Manager and granting secretAccessor"
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

echo ""
echo "==> Done. Firestore database, IAM roles (datastore.user, aiplatform.user), and session-secret configured for project ${PROJECT_ID}."
