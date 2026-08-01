#!/usr/bin/env bash
#
# One-time GCP setup for keyless CD from GitHub Actions (.github/workflows/deploy.yml).
# OWNER-RUN: creates a service account, grants it deploy-scoped IAM roles, and sets up
# Workload Identity Federation so GitHub Actions can authenticate without a long-lived key.
#
# Idempotent: safe to re-run if a step already exists (gcloud will just report "already
# exists" for that step and this script continues). The one exception is the provider's
# attribute condition — see step 4, which reconciles it rather than skipping it.
#
# Usage:
#   ./infra/setup-wif.sh
#
# Override any of these via env if needed: PROJECT_ID, POOL_NAME, PROVIDER_NAME, REPO,
# GAMES_REPO, SA_NAME.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-gamedevpl}"
POOL_NAME="${POOL_NAME:-github-pool}"
PROVIDER_NAME="${PROVIDER_NAME:-github-provider}"
REPO="${REPO:-gamedevpl/www.gamedev.pl}"
# The games repo publishes the Creator Kit to the games-store bucket
# (.github/workflows/publish-kit.yml there) and authenticates through this same pool and
# provider, as the same deployer SA. It is NOT granted the erase-verifier account below.
GAMES_REPO="${GAMES_REPO:-gamedevpl/www.gamedev.pl-games}"
SA_NAME="${SA_NAME:-github-actions-deployer}"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
# The nightly erasure proof (.github/workflows/verify-erase.yml) needs Firestore, which
# the deployer deliberately does not have. Kept as a second account rather than a role on
# the first: a deploy credential that can also read every player's data is a much worse
# thing to leak, and this one can be revoked without stopping deploys.
VERIFIER_SA_NAME="${VERIFIER_SA_NAME:-erase-verifier}"
VERIFIER_SA_EMAIL="${VERIFIER_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "==> 1/8 Creating service account '${SA_NAME}'"
gcloud iam service-accounts create "$SA_NAME" \
  --display-name="GitHub Actions Deployer" \
  --project="$PROJECT_ID" \
  || echo "    (already exists, continuing)"

echo "==> 2/8 Granting IAM roles to ${SA_EMAIL}"
for ROLE in roles/run.admin roles/cloudbuild.builds.editor roles/artifactregistry.writer roles/secretmanager.secretAccessor roles/iam.serviceAccountUser roles/serviceusage.serviceUsageConsumer roles/storage.admin; do
  echo "    - ${ROLE}"
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="$ROLE" \
    --condition=None \
    >/dev/null
done

echo "==> 3/8 Creating Workload Identity Pool '${POOL_NAME}'"
gcloud iam workload-identity-pools create "$POOL_NAME" \
  --location="global" \
  --display-name="GitHub Actions Pool" \
  --project="$PROJECT_ID" \
  || echo "    (already exists, continuing)"

POOL_ID=$(gcloud iam workload-identity-pools describe "$POOL_NAME" \
  --location="global" \
  --format="value(name)" \
  --project="$PROJECT_ID")

# Which repositories may mint a token against this provider at all. Everything downstream
# is a subset of this list: passing the condition only gets a workflow to the point where
# a per-account principalSet binding decides what, if anything, it may impersonate.
ATTR_CONDITION="assertion.repository in ['${REPO}', '${GAMES_REPO}']"

echo "==> 4/8 Reconciling Workload Identity Provider '${PROVIDER_NAME}' (repos: ${REPO}, ${GAMES_REPO})"
# create-oidc on an existing provider fails with "already exists" and changes nothing — so a
# plain re-run can never correct a condition that has drifted, and the script would go on
# claiming a set of repos that is not what GCP enforces. Create it if absent, update it if
# present, so the condition in this file is the condition in the project.
if gcloud iam workload-identity-pools providers describe "$PROVIDER_NAME" \
  --location="global" \
  --workload-identity-pool="$POOL_NAME" \
  --project="$PROJECT_ID" \
  >/dev/null 2>&1; then
  echo "    (exists — updating attribute condition)"
  gcloud iam workload-identity-pools providers update-oidc "$PROVIDER_NAME" \
    --location="global" \
    --workload-identity-pool="$POOL_NAME" \
    --attribute-condition="$ATTR_CONDITION" \
    --project="$PROJECT_ID" \
    >/dev/null
else
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_NAME" \
    --location="global" \
    --workload-identity-pool="$POOL_NAME" \
    --display-name="GitHub Actions Provider" \
    --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
    --attribute-condition="$ATTR_CONDITION" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --project="$PROJECT_ID"
fi

echo "==> 5/8 Binding repositories to ${SA_NAME}"
# Both repositories deploy-or-publish as this account: www.gamedev.pl ships the service,
# and the games repo writes the Creator Kit into the games-store bucket. Sharing one SA
# means the kit publisher also holds the deploy roles granted in step 2 — the narrower
# alternative is a second account with only the bucket, which is the tighten described in
# the games repo's docs/kit-publish.md.
for BOUND_REPO in "$REPO" "$GAMES_REPO"; do
  echo "    - ${BOUND_REPO}"
  gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
    --role="roles/iam.workloadIdentityUser" \
    --member="principalSet://iam.googleapis.com/${POOL_ID}/attribute.repository/${BOUND_REPO}" \
    --project="$PROJECT_ID" \
    >/dev/null
done

echo "==> 6/8 Creating service account '${VERIFIER_SA_NAME}' (nightly erasure proof)"
gcloud iam service-accounts create "$VERIFIER_SA_NAME" \
  --display-name="Erasure Verifier" \
  --project="$PROJECT_ID" \
  || echo "    (already exists, continuing)"

echo "==> 7/8 Granting Firestore access to ${VERIFIER_SA_EMAIL}"
# datastore.user and nothing else. Worth being plain about what this does and does not
# bound: Firestore IAM has no collection-level scope, so this account can read and write
# every document in the database, not merely the fixtures it plants. What the separate
# account buys is that the *deploy* credential still cannot, that this one can be revoked
# on its own, and that anything it does is attributable to it rather than to CI at large.
# The narrowing IAM cannot express is expressed in the command instead: `verify:erase`
# takes no uid argument and can only address its own synthetic namespace.
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${VERIFIER_SA_EMAIL}" \
  --role="roles/datastore.user" \
  --condition=None \
  >/dev/null

echo "==> 8/8 Binding repository '${REPO}' to ${VERIFIER_SA_NAME}"
# ${REPO} only — deliberately NOT ${GAMES_REPO}. Since step 4 the games repo can mint a
# token this provider accepts, so the sole thing keeping the kit publisher away from every
# document in Firestore is the absence of a binding here. Do not add it to the step 5 loop.
# Within this repository the grant is still workflow-wide: any workflow here can assume the
# account, which is the pool's granularity rather than a decision made here — tightening it
# means mapping a workflow attribute on the provider and re-binding both accounts.
gcloud iam service-accounts add-iam-policy-binding "$VERIFIER_SA_EMAIL" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/${POOL_ID}/attribute.repository/${REPO}" \
  --project="$PROJECT_ID" \
  >/dev/null

echo ""
echo "==> Done. deploy.yml should now authenticate as:"
echo "    workload_identity_provider: ${POOL_ID}/providers/${PROVIDER_NAME}"
echo "    service_account: ${SA_EMAIL}"
echo ""
echo "and verify-erase.yml as:"
echo "    service_account: ${VERIFIER_SA_EMAIL}"
echo ""
echo "These already match the values hardcoded in .github/workflows/."
