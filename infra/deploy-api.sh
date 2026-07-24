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
#   openssl rand -hex 32 \
#     | gcloud secrets create session-secret --data-file=- --replication-policy=automatic
#   printf '%s' "<Resend API key: re_...>" \
#     | gcloud secrets create resend-api-key --data-file=- --replication-policy=automatic
# (To rotate later: `gcloud secrets versions add <name> --data-file=-`.)
# The API boots without these; submission/auth routes return 503 until configured,
# so browsing/playing works on a secret-less first deploy.
#
# Optional env vars:
#   GOOGLE_OAUTH_CLIENT_ID=... (public client ID for Sign in with Google)
#   WEB_ORIGIN=...             (CORS allowed origins)
#   PRIVATE_BETA=true          (gate all data reads behind a session + allowlist)
#   BETA_ALLOWED_UIDS=...      (comma-separated g:<sub> values)
#   BETA_ALLOWED_EMAILS=...    (comma-separated verified email addresses)
#   MAIL_FROM=...              (RFC 5322 sender; defaults to noreply@mail.gamedev.pl)
#   INVITE_URL=...             (where invitees land; defaults to https://www.gamedev.pl)
#
# Then run:
#   PROJECT_ID=my-proj ./infra/deploy-api.sh
#
# Override any of these via env: REGION, SERVICE, REPO, GAMES_REPO.
set -euo pipefail

: "${PROJECT_ID:?set PROJECT_ID to your GCP project id}"
# europe-west1 (not europe-central2): Cloud Run native domain mapping for
# www.gamedev.pl requires a supported region (docs/closed-beta-launch-plan.md).
REGION="${REGION:-europe-west1}"
SERVICE="${SERVICE:-gamedev-app}"
REPO="${REPO:-gamedev}"
GAMES_REPO="${GAMES_REPO:-gamedevpl/www.gamedev.pl-games}"
GOOGLE_OAUTH_CLIENT_ID="${GOOGLE_OAUTH_CLIENT_ID:-334141807880-t8qsj5n6p3g9imbs3jfut82cecvr87pu.apps.googleusercontent.com}"
WEB_ORIGIN="${WEB_ORIGIN:-https://gamedev-app-334141807880.europe-west1.run.app,https://www.gamedev.pl,https://gamedev.pl}"
# Apex → www 301 canonicalization (app-side; Cloud Run mappings can't redirect).
CANONICAL_HOST="${CANONICAL_HOST:-www.gamedev.pl}"
PRIVATE_BETA="${PRIVATE_BETA:-true}"
BETA_ALLOWED_UIDS="${BETA_ALLOWED_UIDS:-}"
BETA_ALLOWED_EMAILS="${BETA_ALLOWED_EMAILS:-}"
MAIL_FROM="${MAIL_FROM:-}"
INVITE_URL="${INVITE_URL:-}"

IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/app:$(date +%Y%m%d-%H%M%S)"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Enabling required services"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com firestore.googleapis.com --project "$PROJECT_ID"

echo "==> Ensuring Artifact Registry repo '${REPO}' exists in ${REGION}"
gcloud artifacts repositories describe "$REPO" --location "$REGION" --project "$PROJECT_ID" >/dev/null 2>&1 \
  || gcloud artifacts repositories create "$REPO" --repository-format=docker \
       --location "$REGION" --project "$PROJECT_ID" --description "gamedev.pl images"

echo "==> Building image via Cloud Build: ${IMAGE}"
gcloud builds submit "$REPO_ROOT" --config "$REPO_ROOT/infra/cloudbuild.yaml" \
  --substitutions "_IMAGE=${IMAGE},_GOOGLE_OAUTH_CLIENT_ID=${GOOGLE_OAUTH_CLIENT_ID}" --project "$PROJECT_ID"

# Wire whichever secrets exist into one --set-secrets list (multiple --set-secrets
# flags overwrite each other, so mappings must be joined). Submissions need BOTH
# github-token and submission-token-secret; without them the app is browse/play-only
# (submission routes return 503).
SECRET_MAPPINGS=()
if gcloud secrets describe github-token --project "$PROJECT_ID" >/dev/null 2>&1 \
   && gcloud secrets describe submission-token-secret --project "$PROJECT_ID" >/dev/null 2>&1; then
  SECRET_MAPPINGS+=("GITHUB_TOKEN=github-token:latest" "SUBMISSION_TOKEN_SECRET=submission-token-secret:latest")
  echo "==> Submission secrets found; submissions will be enabled."
else
  echo "==> Submission secrets not found; deploying browse/play-only (submissions return 503)."
fi

if gcloud secrets describe session-secret --project "$PROJECT_ID" >/dev/null 2>&1; then
  SECRET_MAPPINGS+=("SESSION_SECRET=session-secret:latest")
  echo "==> session-secret found; session authentication enabled."
fi

# Resend API key for outbound email (beta invites now; notifications later). The
# mailer degrades to a no-op console logger when absent, so email is simply off
# until this secret exists — deploys stay green either way.
if gcloud secrets describe resend-api-key --project "$PROJECT_ID" >/dev/null 2>&1; then
  SECRET_MAPPINGS+=("RESEND_API_KEY=resend-api-key:latest")
  echo "==> resend-api-key found; outbound email enabled."
fi

SECRET_FLAGS=()
if [ ${#SECRET_MAPPINGS[@]} -gt 0 ]; then
  joined=$(IFS=,; echo "${SECRET_MAPPINGS[*]}")
  SECRET_FLAGS=(--set-secrets "$joined")
fi

# ^|^ switches gcloud's env-var separator to | (pipe) so values may contain
# commas (WEB_ORIGIN list) and @ signs (BETA_ALLOWED_EMAILS).
ENV_VARS="^|^GAMES_REPO=${GAMES_REPO}|WEB_ORIGIN=${WEB_ORIGIN}|PRIVATE_BETA=${PRIVATE_BETA}"
if [ -n "${CANONICAL_HOST:-}" ]; then
  ENV_VARS="${ENV_VARS}|CANONICAL_HOST=${CANONICAL_HOST}"
fi
if [ -n "$GOOGLE_OAUTH_CLIENT_ID" ]; then
  ENV_VARS="${ENV_VARS}|GOOGLE_OAUTH_CLIENT_ID=${GOOGLE_OAUTH_CLIENT_ID}"
fi
if [ -n "$BETA_ALLOWED_UIDS" ]; then
  ENV_VARS="${ENV_VARS}|BETA_ALLOWED_UIDS=${BETA_ALLOWED_UIDS}"
fi
if [ -n "$BETA_ALLOWED_EMAILS" ]; then
  ENV_VARS="${ENV_VARS}|BETA_ALLOWED_EMAILS=${BETA_ALLOWED_EMAILS}"
fi
if [ -n "$MAIL_FROM" ]; then
  ENV_VARS="${ENV_VARS}|MAIL_FROM=${MAIL_FROM}"
fi
if [ -n "$INVITE_URL" ]; then
  ENV_VARS="${ENV_VARS}|INVITE_URL=${INVITE_URL}"
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
  --set-env-vars "${ENV_VARS}" \
  ${SECRET_FLAGS[@]+"${SECRET_FLAGS[@]}"}

echo "==> Done. The app (web + API) is live at:"
gcloud run services describe "$SERVICE" --region "$REGION" --project "$PROJECT_ID" \
  --format 'value(status.url)'
