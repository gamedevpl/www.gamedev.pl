#!/usr/bin/env bash
#
# Deploy the gamedev.pl app (static web + submission API, one same-origin service)
# to Cloud Run (scale-to-zero). This never touches the live www.gamedev.pl Pages site.
# OWNER-RUN: needs a GCP project with billing, and `gcloud` authenticated
# (`gcloud auth login` + `gcloud config set project <id>`).
#
# One-time secret setup (values never live in this repo):
#   printf '%s' "<fine-grained PAT: Issues rw + PRs r + Contents r on the games repo>" \
#     | gcloud secrets create github-token --data-file=- --replication-policy=automatic
#   openssl rand -hex 32 \
#     | gcloud secrets create submission-token-secret --data-file=- --replication-policy=automatic
# (To rotate later: `gcloud secrets versions add <name> --data-file=-`.)
# The API boots without these; submission routes just return 503 until they exist,
# so browsing/playing works on a secret-less first deploy.
#
# Optional access lock (make the whole app private "for now"):
#   printf '%s' "myuser:mypassword" \
#     | gcloud secrets create site-basic-auth --data-file=- --replication-policy=automatic
# When present, every request needs those HTTP Basic Auth credentials. Remove the lock
# by deleting the secret (`gcloud secrets delete site-basic-auth`) and redeploying.
#
# Then run:
#   PROJECT_ID=my-proj ./infra/deploy-api.sh
#
# Override any of these via env: REGION, SERVICE, REPO, GAMES_REPO, CATALOG_URL.
set -euo pipefail

: "${PROJECT_ID:?set PROJECT_ID to your GCP project id}"
REGION="${REGION:-europe-central2}"
SERVICE="${SERVICE:-gamedev-app}"
REPO="${REPO:-gamedev}"
GAMES_REPO="${GAMES_REPO:-gamedevpl/www.gamedev.pl-games}"
CATALOG_URL="${CATALOG_URL:-https://gamedevpl.github.io/www.gamedev.pl-games/catalog.json}"

IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/app:$(date +%Y%m%d-%H%M%S)"
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

# Wire whichever secrets exist into one --set-secrets list (multiple --set-secrets
# flags overwrite each other, so mappings must be joined). Submissions need BOTH
# github-token and submission-token-secret; without them the app is browse/play-only
# (submission routes return 503). site-basic-auth is optional and locks the whole app
# (web + API) behind HTTP Basic Auth ("user:password").
SECRET_MAPPINGS=()
if gcloud secrets describe github-token --project "$PROJECT_ID" >/dev/null 2>&1 \
   && gcloud secrets describe submission-token-secret --project "$PROJECT_ID" >/dev/null 2>&1; then
  SECRET_MAPPINGS+=("GITHUB_TOKEN=github-token:latest" "SUBMISSION_TOKEN_SECRET=submission-token-secret:latest")
  echo "==> Submission secrets found; submissions will be enabled."
else
  echo "==> Submission secrets not found; deploying browse/play-only (submissions return 503)."
fi

if gcloud secrets describe site-basic-auth --project "$PROJECT_ID" >/dev/null 2>&1; then
  SECRET_MAPPINGS+=("SITE_BASIC_AUTH=site-basic-auth:latest")
  echo "==> site-basic-auth found; the app will be locked behind HTTP Basic Auth."
else
  echo "==> site-basic-auth not found; the app will be publicly reachable."
fi

SECRET_FLAGS=()
if [ ${#SECRET_MAPPINGS[@]} -gt 0 ]; then
  joined=$(IFS=,; echo "${SECRET_MAPPINGS[*]}")
  SECRET_FLAGS=(--set-secrets "$joined")
fi

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
  --set-env-vars "GAMES_REPO=${GAMES_REPO},CATALOG_URL=${CATALOG_URL}" \
  ${SECRET_FLAGS[@]+"${SECRET_FLAGS[@]}"}

echo "==> Done. The app (web + API) is live at:"
gcloud run services describe "$SERVICE" --region "$REGION" --project "$PROJECT_ID" \
  --format 'value(status.url)'
