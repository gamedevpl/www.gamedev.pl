#!/usr/bin/env bash
#
# Deploy the gamedev-world zone host to Cloud Run (docs/p3-zone-host-infra.md).
# OWNER-RUN, and separate from deploy-api.sh on purpose: its own image, its own
# lifecycle, and its own origin.
#
# Prerequisites (both already exist for the app service):
#   - the `session-secret` secret: zone tickets are HMAC'd from it under a distinct
#     scope string, exactly as party room tokens are. No new secret.
#   - the `github-token` secret: the host reads each game's sim.ts and shared/sim-math.ts
#     from the games repo at the published ref.
#
# After the first deploy, point the API at it so admission starts handing out tickets:
#   gcloud run services update gamedev-app --region <region> \
#     --update-env-vars ZONE_HOST_URL=$(gcloud run services describe gamedev-world \
#       --region <region> --format 'value(status.url)')
# Until that variable is set, /api/games/:slug/zone/ticket 404s and every game plays on
# exactly as it did — which is the right default, not a broken state.
#
# Then run:
#   PROJECT_ID=my-proj ./infra/deploy-world.sh
set -euo pipefail

: "${PROJECT_ID:?set PROJECT_ID to your GCP project id}"
REGION="${REGION:-europe-west1}"
SERVICE="${SERVICE:-gamedev-world}"
REPO="${REPO:-gamedev}"
GAMES_REPO="${GAMES_REPO:-gamedevpl/www.gamedev.pl-games}"

IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/world:$(date +%Y%m%d-%H%M%S)"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Building image via Cloud Build: ${IMAGE}"
gcloud builds submit "$REPO_ROOT" --config "$REPO_ROOT/infra/cloudbuild-world.yaml" \
  --substitutions "_IMAGE=${IMAGE}" --project "$PROJECT_ID"

SECRET_MAPPINGS=()
for secret in session-secret github-token; do
  if ! gcloud secrets describe "$secret" --project "$PROJECT_ID" >/dev/null 2>&1; then
    echo "!! secret '${secret}' not found. The host cannot verify tickets or read sims without both." >&2
    exit 1
  fi
done
SECRET_MAPPINGS+=("SESSION_SECRET=session-secret:latest" "GITHUB_TOKEN=github-token:latest")
joined=$(IFS=,; echo "${SECRET_MAPPINGS[*]}")

echo "==> Deploying to Cloud Run (scale-to-zero)"
# --min-instances 0 is the whole cost model, and it is honest only because a zone with
# nobody in it hibernates: the last player leaving snapshots the world, drops the sim and
# closes the socket, so the instance drains with no further mechanism. See §4 of the doc.
#
# --max-instances 1 for the same reason mp.ts pins the app service: a zone lives in the
# memory of one process, and a second instance would mean two hosts believing they own
# the same world. Raising it needs the zone directory first (§5, "later, with named
# triggers") — the wire protocol already carries the host URL per zone, so the shell does
# not change when that lands.
#
# --timeout 3600 is Cloud Run's ceiling and it bounds a session, not a world: the client
# reconnects and the zone wakes where it stopped.
gcloud run deploy "$SERVICE" \
  --image "$IMAGE" \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --platform managed \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 1 \
  --cpu 1 \
  --memory 512Mi \
  --timeout 3600 \
  --port 8081 \
  --set-env-vars "GAMES_REPO=${GAMES_REPO}" \
  --set-secrets "$joined"

echo "==> Done. The zone host is live at:"
gcloud run services describe "$SERVICE" --region "$REGION" --project "$PROJECT_ID" \
  --format 'value(status.url)'
