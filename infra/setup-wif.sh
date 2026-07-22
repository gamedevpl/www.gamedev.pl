#!/usr/bin/env bash
#
# One-time GCP setup for keyless CD from GitHub Actions (.github/workflows/deploy.yml).
# OWNER-RUN: creates a service account, grants it deploy-scoped IAM roles, and sets up
# Workload Identity Federation so GitHub Actions can authenticate without a long-lived key.
#
# Idempotent: safe to re-run if a step already exists (gcloud will just report "already
# exists" for that step and this script continues).
#
# Usage:
#   ./infra/setup-wif.sh
#
# Override any of these via env if needed: PROJECT_ID, POOL_NAME, PROVIDER_NAME, REPO, SA_NAME.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-gamedevpl}"
POOL_NAME="${POOL_NAME:-github-pool}"
PROVIDER_NAME="${PROVIDER_NAME:-github-provider}"
REPO="${REPO:-gamedevpl/www.gamedev.pl}"
SA_NAME="${SA_NAME:-github-actions-deployer}"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "==> 1/5 Creating service account '${SA_NAME}'"
gcloud iam service-accounts create "$SA_NAME" \
  --display-name="GitHub Actions Deployer" \
  --project="$PROJECT_ID" \
  || echo "    (already exists, continuing)"

echo "==> 2/5 Granting IAM roles to ${SA_EMAIL}"
for ROLE in roles/run.admin roles/cloudbuild.builds.editor roles/artifactregistry.writer roles/secretmanager.secretAccessor roles/iam.serviceAccountUser roles/serviceusage.serviceUsageConsumer roles/storage.admin; do
  echo "    - ${ROLE}"
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="$ROLE" \
    --condition=None \
    >/dev/null
done

echo "==> 3/5 Creating Workload Identity Pool '${POOL_NAME}'"
gcloud iam workload-identity-pools create "$POOL_NAME" \
  --location="global" \
  --display-name="GitHub Actions Pool" \
  --project="$PROJECT_ID" \
  || echo "    (already exists, continuing)"

POOL_ID=$(gcloud iam workload-identity-pools describe "$POOL_NAME" \
  --location="global" \
  --format="value(name)" \
  --project="$PROJECT_ID")

echo "==> 4/5 Creating Workload Identity Provider '${PROVIDER_NAME}' (locked to repo: ${REPO})"
gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_NAME" \
  --location="global" \
  --workload-identity-pool="$POOL_NAME" \
  --display-name="GitHub Actions Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository == '${REPO}'" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --project="$PROJECT_ID" \
  || echo "    (already exists, continuing)"

echo "==> 5/5 Binding repository '${REPO}' to service account"
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/${POOL_ID}/attribute.repository/${REPO}" \
  --project="$PROJECT_ID" \
  >/dev/null

echo ""
echo "==> Done. deploy.yml should now authenticate as:"
echo "    workload_identity_provider: ${POOL_ID}/providers/${PROVIDER_NAME}"
echo "    service_account: ${SA_EMAIL}"
echo ""
echo "These already match the values hardcoded in .github/workflows/deploy.yml."
