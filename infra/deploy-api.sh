#!/usr/bin/env bash
#
# Deploy the gamedev.pl submission API to Cloud Run (scale-to-zero).
# OWNER-RUN: needs a GCP project with billing, and `gcloud` authenticated
# (`gcloud auth login` + `gcloud config set project <id>`).
#
# One-time secret setup (values never live in this repo):
#   printf '%s' "<fine-grained PAT: Issues rw + PRs r + Contents r on the games repo>" \
#     | gcloud secrets create github-token --data-file=- --replication-policy=automatic
#   openssl rand -hex 32 \
#     | gcloud secrets create submission-token-secret --data-file=- --replication-policy=automatic
# (To rotate later: `gcloud secrets versions add <name> --data-file=-`.)
#
# Then run:
#   PROJECT_ID=my-proj ./infra/deploy-api.sh
#
# Override any of these via env: REGION, SERVICE, REPO, GAMES_REPO, WEB_ORIGIN, CATALOG_URL.
set -euo pipefail

: "${PROJECT_ID:?set PROJECT_ID to your GCP project id}"
REGION="${REGION:-europe-central2}"
SERVICE="${SERVICE:-gamedev-api}"
REPO="${REPO:-gamedev}"
GAMES_REPO="${GAMES_REPO:-gamedevpl/www.gamedev.pl-games}"
CATALOG_URL="${CATALOG_URL:-https://gamedevpl.github.io/www.gamedev.pl-games/catalog.json}"
WEB_ORIGIN="${WEB_ORIGIN:-https://www.gamedev.pl}"

IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/api:$(date +%Y%m%d-%H%M%S)"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Enabling required services"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com --project "$PROJECT_ID"

echo "==> Ensuring Artifact Registry repo '${REPO}' exists in ${REGION}"
gcloud artifacts repositories describe "$REPO" --location "$REGION" --project "$PROJECT_ID" >/dev/null 2>&1 \
  || gcloud artifacts repositories create "$REPO" --repository-format=docker \
       --location "$REGION" --project "$PROJECT_ID" --description "gamedev.pl images"

echo "==> Building image via Cloud Build: ${IMAGE}"
gcloud builds submit "$REPO_ROOT" --config "$REPO_ROOT/infra/cloudbuild.yaml" \
  --substitutions "_IMAGE=${IMAGE}" --project "$PROJECT_ID"

echo "==> Deploying to Cloud Run (scale-to-zero)"
gcloud run deploy "$SERVICE" \
  --image "$IMAGE" \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --platform managed \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 4 \
  --port 8080 \
  --set-env-vars "GAMES_REPO=${GAMES_REPO},CATALOG_URL=${CATALOG_URL},WEB_ORIGIN=${WEB_ORIGIN}" \
  --set-secrets "GITHUB_TOKEN=github-token:latest,SUBMISSION_TOKEN_SECRET=submission-token-secret:latest"

echo "==> Done. Service URL:"
gcloud run services describe "$SERVICE" --region "$REGION" --project "$PROJECT_ID" \
  --format 'value(status.url)'
echo "Set VITE_API_BASE_URL to that URL for the web build (M5a), then rebuild the site."
