#!/usr/bin/env bash
#
# Deploy the party relay to its own Cloud Run service (docs/multiplayer-plan.md §4.6,
# apps/api/src/mp-relay.ts). OWNER-RUN: creating a service and reading another service's
# configuration both need write access to the project.
#
# Why this service exists: party rooms are per-instance memory, so the app service is
# pinned at `--max-instances 1`. That pin is the ceiling on a public beta, and the relay
# is the only thing that needs it. Move the relay here, pin *this* service instead, and
# the app is free to scale out.
#
# THE SAME IMAGE RUNS BOTH ROLES. By default this script deploys whatever image the app
# service is currently running rather than building its own — so the two roles cannot
# drift, because there is only one artifact. A second Dockerfile would be a second thing
# to keep in step, and drift between the workspace layout and an image is what took every
# deploy down when `@gamedevpl/zone-core` landed.
#
# Usage — first deploy (creates the service):
#   PROJECT_ID=gamedevpl ./infra/deploy-relay.sh
#
# Then set MP_RELAY_URL in the platform repo's Actions variables to the URL printed at the
# end, and re-run the deploy workflow. That variable is what moves room creation here AND
# what lifts the app's instance pin — deliberately one switch, because lifting the pin
# while the app still serves rooms in-process is the exact bug this whole change removes.
#
# Override via env: PROJECT_ID, REGION, SERVICE, APP_SERVICE, IMAGE, MAX_INSTANCES.
#
# This script is idempotent — re-run it to move the relay onto a newer image.
set -euo pipefail

export CLOUDSDK_CORE_DISABLE_PROMPTS=1

: "${PROJECT_ID:?set PROJECT_ID to your GCP project id}"
REGION="${REGION:-europe-west1}"
SERVICE="${SERVICE:-gamedev-mp-relay}"
APP_SERVICE="${APP_SERVICE:-gamedev-app}"

if [ "$SERVICE" = "$APP_SERVICE" ]; then
  echo "Error: SERVICE and APP_SERVICE are both '${SERVICE}'." >&2
  echo "  Deploying the relay role over the app service would take the site down: the app" >&2
  echo "  would stop serving the web bundle and answer only the websocket." >&2
  exit 1
fi

echo "==> 1/6 Reading the app service's configuration"
# The relay follows the app's image by construction. Reading it here (rather than taking
# it as an argument) is what makes "the same image runs both roles" a fact instead of an
# instruction someone has to remember.
APP_IMAGE="$(gcloud run services describe "$APP_SERVICE" --region "$REGION" --project "$PROJECT_ID" \
  --format 'value(spec.template.spec.containers[0].image)' 2>/dev/null || true)"
IMAGE="${IMAGE:-$APP_IMAGE}"
if [ -z "$IMAGE" ]; then
  echo "Error: could not read an image from '${APP_SERVICE}' in ${REGION}." >&2
  echo "  Deploy the app first (infra/deploy-api.sh or the deploy workflow), or pass" >&2
  echo "  IMAGE=<artifact registry ref> explicitly." >&2
  exit 1
fi
echo "    Image: ${IMAGE}"

# The relay authenticates exactly one caller: the app service's runtime identity. Cloud Run
# reports an empty serviceAccountName when a service uses the project's default compute
# identity, which is what this project does — so resolve that rather than treating empty as
# "no caller", which would leave the relay's create route deny-all and every lobby broken.
CALLER_SA="$(gcloud run services describe "$APP_SERVICE" --region "$REGION" --project "$PROJECT_ID" \
  --format 'value(spec.template.spec.serviceAccountName)' 2>/dev/null || true)"
if [ -z "$CALLER_SA" ]; then
  PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format 'value(projectNumber)')"
  CALLER_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
  echo "    Caller: ${CALLER_SA} (the app service runs as the default compute identity)"
else
  echo "    Caller: ${CALLER_SA}"
fi

echo "==> 2/6 Checking the room-signing secret"
# Room tokens are HMAC'd from SESSION_SECRET (apps/api/src/mp.ts). The relay both mints and
# verifies them, so this is the one secret it needs — and the only one it gets. It reads no
# games, files no submissions and holds no session cookies.
if ! gcloud secrets describe session-secret --project "$PROJECT_ID" >/dev/null 2>&1; then
  echo "Error: secret 'session-secret' not found; the relay cannot sign room tokens." >&2
  exit 1
fi
echo "    Found."

echo "==> 3/6 Deploying ${SERVICE}"
# --allow-unauthenticated is required and is not a hole: a phone that scanned a party QR
# has no Google identity and never will, so the websocket must be reachable from the open
# internet. What protects the relay is app-level, not platform-level:
#
#   * /api/mp/ws is useless without a room token, verified in the first frame.
#   * /api/internal/mp/sessions — the route that *creates* rooms — verifies a Google-signed
#     OIDC token whose audience is this service's own URL and whose subject must be the app
#     service. Missing either MP_RELAY_AUDIENCE or MP_RELAY_CALLER_SA makes that verifier
#     deny-all (internal-auth.ts), so a half-configured relay refuses to open rooms rather
#     than opening them to anyone.
#   * PRIVATE_BETA=true with no allowlist walls every other route this image happens to
#     register. That is deliberate and needs no maintenance: the relay's whole job lives in
#     the two paths the wall exempts, so "closed to everyone" is the correct configuration
#     rather than a list that has to be kept in step with the app's.
#
# --timeout 3600 bounds a connection, not a party: Cloud Run counts an open websocket as a
# request, so the 300s default would drop every controller after five minutes and the
# client would spend a party reconnecting.
#
# --max-instances 1 is the pin, moved. It stays here for as long as a room lives in one
# process's memory; the app service is what gets to scale.
#
# Note the `^|^` prefix on --set-env-vars. gcloud's default separator is a comma, so
# without it the whole string is parsed as ONE variable named MP_RELAY_ONLY whose value
# happens to contain the other two. That does not fail — it deploys, and it deploys
# something much worse than a broken relay: MP_RELAY_ONLY would not equal "1", so the
# service would come up in *app* mode, and PRIVATE_BETA would be unset, so the beta wall
# would be off. The result is a second, fully public, unwalled copy of the entire site on
# a run.app URL. deploy-api.sh uses the same `^|^` idiom for the same reason.
MAX_INSTANCES="${MAX_INSTANCES:-1}"
if [ "$MAX_INSTANCES" != "1" ]; then
  echo "!! MAX_INSTANCES=${MAX_INSTANCES}: a guest routed to a second instance cannot see" >&2
  echo "   the host's room. Only raise this once room state is shared." >&2
fi

gcloud run deploy "$SERVICE" \
  --image "$IMAGE" \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --platform managed \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances "$MAX_INSTANCES" \
  --timeout 3600 \
  --port 8080 \
  --set-env-vars "^|^MP_RELAY_ONLY=1|PRIVATE_BETA=true|MP_RELAY_CALLER_SA=${CALLER_SA}" \
  --set-secrets "SESSION_SECRET=session-secret:latest"

echo "==> 4/6 Reading the service URL"
RELAY_URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --project "$PROJECT_ID" \
  --format 'value(status.url)')"
if [ -z "$RELAY_URL" ]; then
  echo "Error: the service deployed but reports no URL." >&2
  exit 1
fi
echo "    ${RELAY_URL}"

echo "==> 5/6 Pinning the OIDC audience to that URL"
# Chicken-and-egg, resolved by doing it in two passes: an OIDC audience is the callee's own
# URL, which does not exist until the service does. Between the two passes the relay is up
# with a deny-all create route — closed, not open, which is the right way round to fail.
#
# This value must match MP_RELAY_URL on the app byte for byte: the app mints its token for
# the URL it calls, and a token minted for a trailing-slash variant is a token for a
# different audience. Both sides derive from `status.url`, so they agree by construction.
gcloud run services update "$SERVICE" \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --update-env-vars "MP_RELAY_AUDIENCE=${RELAY_URL}" \
  >/dev/null
echo "    MP_RELAY_AUDIENCE=${RELAY_URL}"

echo "==> 6/6 Verifying the deployed configuration"
# Read the env back rather than trusting that the flags above were parsed as intended.
#
# This exists because of a real defect in the first version of this script: the separator
# prefix was missing, which gcloud accepts silently and collapses three variables into one.
# Nothing downstream would have said so plainly — the service starts, health returns 200,
# and the *symptom* would have been the create-route probe below failing with a 404 that
# reads like an auth problem. Meanwhile the relay would have been serving the whole site
# with no beta wall. So: assert the three names exist as three separate variables, which is
# exactly the property a separator bug destroys.
#
# Whitespace is squeezed out first because JSON formatting is not a stable contract.
ENV_JSON="$(gcloud run services describe "$SERVICE" --region "$REGION" --project "$PROJECT_ID" \
  --format=json | tr -d ' \n')"
for VAR in MP_RELAY_ONLY PRIVATE_BETA MP_RELAY_CALLER_SA MP_RELAY_AUDIENCE; do
  if ! printf '%s' "$ENV_JSON" | grep -q "\"name\":\"${VAR}\""; then
    echo "Error: ${VAR} is not set on ${SERVICE}." >&2
    echo "  If several are missing at once, suspect the --set-env-vars separator: gcloud" >&2
    echo "  splits on commas unless the value starts with ^|^, and silently folds the rest" >&2
    echo "  into the first variable's value." >&2
    echo "  This service may currently be serving the site unwalled. Fix or delete it now:" >&2
    echo "    gcloud run services delete ${SERVICE} --region ${REGION} --project ${PROJECT_ID}" >&2
    exit 1
  fi
done
echo "    MP_RELAY_ONLY, PRIVATE_BETA, MP_RELAY_CALLER_SA, MP_RELAY_AUDIENCE all present."

echo "==> Verifying the relay is serving"
# Health is public on every role. A 200 here proves the image booted in relay mode; it does
# not prove the create route works, which is what the smoke step below is for.
STATUS_CODE="$(curl -s -o /dev/null -w '%{http_code}' "${RELAY_URL}/api/health" || true)"
if [ "$STATUS_CODE" != "200" ]; then
  echo "Error: ${RELAY_URL}/api/health returned ${STATUS_CODE}." >&2
  exit 1
fi
echo "    /api/health 200."

# An unauthenticated call to the create route must be refused. This is the one property
# worth checking on every deploy, because the failure it catches is silent: a relay whose
# verifier fell back to deny-all looks identical to a healthy one until a host opens a
# lobby, and a relay that accepted anonymous creates would look identical too — until
# someone found it.
CREATE_CODE="$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H 'content-type: application/json' -d '{"slug":"probe","ownerUid":"probe"}' \
  "${RELAY_URL}/api/internal/mp/sessions" || true)"
case "$CREATE_CODE" in
  401 | 403)
    echo "    Anonymous room creation refused (${CREATE_CODE}). Correct."
    ;;
  *)
    echo "!! /api/internal/mp/sessions answered ${CREATE_CODE} to an unauthenticated POST." >&2
    echo "   Expected 401/403. Do NOT set MP_RELAY_URL until this is understood." >&2
    exit 1
    ;;
esac

echo ""
echo "==> Done. The relay is live and closed to everyone except ${APP_SERVICE}."
echo ""
echo "    Two things left, and the first one is what actually switches this on:"
echo ""
echo "    1. Set the Actions variable in gamedevpl/www.gamedev.pl:"
echo "         MP_RELAY_URL=${RELAY_URL}"
echo "       then re-run the deploy workflow. The app starts forwarding room creation here,"
echo "       stops serving the socket itself, and loses its --max-instances pin — all three"
echo "       from that one variable, so the pin cannot come off while rooms are still local."
echo ""
echo "    2. Give this service its own monitoring, or it is unmonitored by construction:"
echo "         ALERT_EMAIL=you@example.com SERVICE=${SERVICE} ./infra/setup-monitoring.sh"
echo ""
echo "    Then prove a party works end to end: open a lobby, join from a phone, and confirm"
echo "    the controller moves something. A relay that health-checks green can still be"
echo "    unreachable to guests, and no alert covers 'the QR code goes nowhere'."
