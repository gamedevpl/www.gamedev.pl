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
#   APPLE_SERVICES_ID=...      (Sign in with Apple Services ID; also baked into the web
#                               bundle so the button can render. Empty = button hidden)
#   APPLE_CLIENT_IDS=...       (comma-separated audiences the API will accept: the
#                               Services ID above, plus the iOS bundle ID once the M2
#                               store app exists. Empty = /api/auth/apple returns 503)
#   WEB_ORIGIN=...             (CORS allowed origins)
#   PRIVATE_BETA=true          (gate all data reads behind a session + allowlist)
#   PUBLIC_PLAY_SLUGS=...      (comma-separated published slugs playable from external links)
#   MCP_UI=...                 ("true" or "1", case-insensitive, opens MCP Apps views on
#                               /api/mcp — SEP-1865. Inert for any client that does not
#                               negotiate the extension; any other value keeps the
#                               pre-views contract)
#   BETA_ALLOWED_UIDS=...      (comma-separated g:<sub> values)
#   ADMIN_UIDS=...             (comma-separated g:<sub> values; operator telemetry view)
#   REVIEWER_UIDS=...          (comma-separated g:<sub> values; /review desk; admins count too)
#   BETA_ALLOWED_EMAILS=...    (comma-separated verified email addresses)
#   MAIL_FROM=...              (RFC 5322 sender; defaults to noreply@mail.gamedev.pl)
#   NOTIFY_SWEEP_AUDIENCE=...  (sweep endpoint URL; enables OIDC auth on /api/internal/notify-sweep)
#   NOTIFY_SWEEP_SA=...        (Cloud Scheduler SA email allowed to call the sweeps;
#                               defaults to notify-sweep@<project>.iam.gserviceaccount.com)
#   ACCOUNT_DELETION_SWEEP_AUDIENCE=... (delayed cleanup endpoint; defaults to this
#                               service's stable run.app URL)
#   DIGEST_SWEEP_AUDIENCE=...   (digest endpoint URL; enables OIDC auth on the
#                                weekly creator digest sweep)
#   SUGGESTION_SWEEP_AUDIENCE=... (suggestion endpoint URL; enables OIDC auth on the
#                                nightly IL-3 analyst run)
#   SCORECARD_SWEEP_AUDIENCE=... (scorecard endpoint URL; enables OIDC auth on
#                               /api/internal/scorecard-sweep. Separate from the notify
#                               audience because an OIDC audience is the endpoint's own
#                               URL — one sweep's token must not be replayable at the other.)
#   SUGGESTION_SWEEP_AUDIENCE=... (suggestion endpoint URL; enables OIDC auth on
#                               /api/internal/suggestion-sweep, the IL-3 router run over
#                               the scorecards. Its own audience for the same reason.)
#   HEALTH_SWEEP_AUDIENCE=...  (health endpoint URL; enables OIDC auth on
#                               /api/internal/health-sweep, the daily re-check of the
#                               published shelf against today's engine. Its own audience
#                               for the same reason.)
#   DISPATCH_REAPER_AUDIENCE=... (dispatch-reaper endpoint URL; enables OIDC auth on
#                               /api/internal/dispatch-reaper, the retry for a job whose
#                               dispatch died before it recorded a session. Its own
#                               audience for the same reason.)
#   HEALTH_SWEEP_BATCH=...     (how many health re-gates one sweep run may start;
#                               defaults to 3. Each one is a Cloud Build run, so this is
#                               the knob that decides what the loop costs per day. Set it
#                               to 0 to pause the spending without deleting the scheduler
#                               job: the sweep still runs and still reports every game it
#                               would have started, as `deferred` in its log line.)
#   MP_RELAY_URL=...           (gamedev-mp-relay's URL, from infra/deploy-relay.sh; moves
#                               party room creation to that service AND lifts this
#                               service's --max-instances pin. One switch for both on
#                               purpose — see the deploy block below. Unset keeps the relay
#                               in-process and the pin on, which is today's production.)
#   MAX_INSTANCES=...          (only honoured when MP_RELAY_URL is set; defaults to 4)
#   ZONE_HOST_URL=...          (gamedev-world's URL; enables authoritative zones. Unset
#                               means /api/games/:slug/zone/ticket 404s and games play on
#                               unchanged — the intended default. Must be passed on EVERY
#                               deploy: --set-env-vars replaces the whole map, so omitting
#                               it here silently switches zones off.)
#   KNOWLEDGE_SEARCH_ENGINE_ID=... (the games-repo knowledge_query Discovery Engine
#                               engine id, from infra/setup-gcp.sh's knowledge_query
#                               step — see knowledge-search.ts. Unset (the default until
#                               that step has been run and a corpus imported) leaves
#                               knowledge_query answering 503; every downstream caller
#                               degrades to a warning, nothing else changes.)
#   KNOWLEDGE_SEARCH_PROJECT_ID / KNOWLEDGE_SEARCH_LOCATION / KNOWLEDGE_SEARCH_COLLECTION /
#   KNOWLEDGE_SEARCH_SERVING_CONFIG / KNOWLEDGE_SEARCH_QUOTA_PROJECT=...
#                              (override the Discovery Engine resource path; each has a
#                               working default in knowledge-search.ts and is normally
#                               left unset)
#
# Then run:
#   PROJECT_ID=my-proj ./infra/deploy-api.sh
#
# Override any of these via env: REGION, SERVICE, REPO, GAMES_REPO, GAMES_SNAPSHOT_BUCKET.
set -euo pipefail

: "${PROJECT_ID:?set PROJECT_ID to your GCP project id}"
# europe-west1 (not europe-central2): Cloud Run native domain mapping for
# www.gamedev.pl requires a supported region (docs/closed-beta-launch-plan.md).
REGION="${REGION:-europe-west1}"
SERVICE="${SERVICE:-gamedev-app}"
REPO="${REPO:-gamedev}"
GAMES_REPO="${GAMES_REPO:-gamedevpl/www.gamedev.pl-games}"
# Pre-assembled published games, baked by .github/workflows/publish-games.yml.
# Set GAMES_SNAPSHOT_BUCKET='' to serve every game from GitHub the way the site
# did before. Note the `-` rather than `:-`: an explicit empty value has to survive
# for that opt-out to work at all, and it is what makes the `-n` guard below mean
# something instead of being always true.
GAMES_SNAPSHOT_BUCKET="${GAMES_SNAPSHOT_BUCKET-${PROJECT_ID}-games-snapshots}"
# The games store — where delivered game sources live. Unset means agents can build but
# cannot deliver: the upload route answers 503 rather than accepting work and dropping it.
GAMES_STORE_BUCKET="${GAMES_STORE_BUCKET-${PROJECT_ID}-games-store}"
GOOGLE_OAUTH_CLIENT_ID="${GOOGLE_OAUTH_CLIENT_ID:-334141807880-t8qsj5n6p3g9imbs3jfut82cecvr87pu.apps.googleusercontent.com}"
# Both default to empty: Sign in with Apple stays off until the owner creates a Services
# ID, and off means an honest 503 plus a hidden button rather than a half-wired one.
APPLE_SERVICES_ID="${APPLE_SERVICES_ID:-}"
# Defaults to the Services ID, which is the whole audience list until an iOS build exists.
APPLE_CLIENT_IDS="${APPLE_CLIENT_IDS:-$APPLE_SERVICES_ID}"
WEB_ORIGIN="${WEB_ORIGIN:-https://gamedev-app-334141807880.europe-west1.run.app,https://www.gamedev.pl,https://gamedev.pl}"
# Apex → www 301 canonicalization (app-side; Cloud Run mappings can't redirect).
CANONICAL_HOST="${CANONICAL_HOST:-www.gamedev.pl}"
PRIVATE_BETA="${PRIVATE_BETA:-true}"
PUBLIC_PLAY_SLUGS="${PUBLIC_PLAY_SLUGS:-}"
EDITORKIT_V2="${EDITORKIT_V2:-true}"
BETA_ALLOWED_UIDS="${BETA_ALLOWED_UIDS:-}"
BETA_ALLOWED_EMAILS="${BETA_ALLOWED_EMAILS:-}"
MAIL_FROM="${MAIL_FROM:-}"
NOTIFY_SWEEP_AUDIENCE="${NOTIFY_SWEEP_AUDIENCE:-}"
NOTIFY_SWEEP_SA="${NOTIFY_SWEEP_SA:-}"
SCORECARD_SWEEP_AUDIENCE="${SCORECARD_SWEEP_AUDIENCE:-}"
DIGEST_SWEEP_AUDIENCE="${DIGEST_SWEEP_AUDIENCE:-}"
SUGGESTION_SWEEP_AUDIENCE="${SUGGESTION_SWEEP_AUDIENCE:-}"
HEALTH_SWEEP_AUDIENCE="${HEALTH_SWEEP_AUDIENCE:-}"
ACCOUNT_DELETION_SWEEP_AUDIENCE="${ACCOUNT_DELETION_SWEEP_AUDIENCE:-}"
DISPATCH_REAPER_AUDIENCE="${DISPATCH_REAPER_AUDIENCE:-}"
# Arms the alert-pulled spend brake; unset leaves the endpoint refusing everything.
SPEND_BRAKE_AUDIENCE="${SPEND_BRAKE_AUDIENCE:-}"
HEALTH_SWEEP_BATCH="${HEALTH_SWEEP_BATCH:-}"
# Web Push (docs/notifications-plan.md M2). Public key is public by design (env var);
# the private key is a Secret Manager secret wired in below. Push is off without them.
VAPID_PUBLIC_KEY="${VAPID_PUBLIC_KEY:-}"
VAPID_SUBJECT="${VAPID_SUBJECT:-}"
ZONE_HOST_URL="${ZONE_HOST_URL:-}"
# Party relay split (apps/api/src/mp-relay.ts). Empty = the relay runs in this process,
# which is what local dev, the tests and today's production all do.
MP_RELAY_URL="${MP_RELAY_URL:-}"

IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/app:$(date +%Y%m%d-%H%M%S)"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
SERVICE_URL="https://${SERVICE}-${PROJECT_NUMBER}.${REGION}.run.app"
NOTIFY_SWEEP_SA="${NOTIFY_SWEEP_SA:-notify-sweep@${PROJECT_ID}.iam.gserviceaccount.com}"
ACCOUNT_DELETION_SWEEP_AUDIENCE="${ACCOUNT_DELETION_SWEEP_AUDIENCE:-${SERVICE_URL}/api/internal/account-deletion-sweep}"

echo "==> Enabling required services"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com firestore.googleapis.com --project "$PROJECT_ID"

echo "==> Ensuring Artifact Registry repo '${REPO}' exists in ${REGION}"
gcloud artifacts repositories describe "$REPO" --location "$REGION" --project "$PROJECT_ID" >/dev/null 2>&1 \
  || gcloud artifacts repositories create "$REPO" --repository-format=docker \
       --location "$REGION" --project "$PROJECT_ID" --description "gamedev.pl images"

echo "==> Building image via Cloud Build: ${IMAGE}"
# MP_RELAY_URL goes to the *build* as well as the service env below. The socket URL is
# inlined into the bundle at build time, so a service that knows about the relay while its
# bundle does not is the worst of both: room creation forwards correctly and every client
# then dials an origin that no longer serves /api/mp/ws.
gcloud builds submit "$REPO_ROOT" --config "$REPO_ROOT/infra/cloudbuild.yaml" \
  --substitutions "_IMAGE=${IMAGE},_GOOGLE_OAUTH_CLIENT_ID=${GOOGLE_OAUTH_CLIENT_ID},_APPLE_SERVICES_ID=${APPLE_SERVICES_ID},_MP_RELAY_URL=${MP_RELAY_URL}" \
  --project "$PROJECT_ID"

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

# Dispatch credential for GitHub's agent tasks API. Deliberately a secret of its own
# rather than a reuse of github-token: the tasks API needs a user-to-server token, and
# separating them means dispatch and serving fail independently — a dispatch PAT expiring
# must not take the catalog down with it. Absent means builds are never handed to an
# agent; submissions are still accepted and sit queued, visibly, in the operator queue.
# Necessary but not sufficient since MP-04: MANAGED_AGENT_VENDOR=copilot (below) still
# has to select it, or this token dispatches nothing.
if gcloud secrets describe agent-tasks-token --project "$PROJECT_ID" >/dev/null 2>&1; then
  SECRET_MAPPINGS+=("AGENT_TASKS_TOKEN=agent-tasks-token:latest")
  echo "==> agent-tasks-token found; enables Copilot dispatch once MANAGED_AGENT_VENDOR=copilot is set."
else
  echo "==> agent-tasks-token not found; submissions will queue without being dispatched."
fi

if gcloud secrets describe copilot-mcp-connector --project "$PROJECT_ID" >/dev/null 2>&1; then
  SECRET_MAPPINGS+=("COPILOT_MCP_CONNECTOR_SECRET=copilot-mcp-connector:latest")
  echo "==> Copilot MCP connector configured."
fi

if gcloud secrets describe anthropic-api-key --project "$PROJECT_ID" >/dev/null 2>&1; then
  SECRET_MAPPINGS+=("MANAGED_AGENT_API_KEY=anthropic-api-key:latest")
  echo "==> anthropic-api-key found; managed agent API access enabled."
fi

if gcloud secrets describe gemini-api-key --project "$PROJECT_ID" >/dev/null 2>&1; then
  SECRET_MAPPINGS+=("GEMINI_API_KEY=gemini-api-key:latest")
  echo "==> gemini-api-key found; Gemini managed agent access enabled."
fi

if gcloud secrets describe openai-api-key --project "$PROJECT_ID" >/dev/null 2>&1; then
  SECRET_MAPPINGS+=("OPENAI_API_KEY=openai-api-key:latest")
  echo "==> openai-api-key found; OpenAI managed agent access enabled."
fi

# Round-0 seed providers (ops: seed-provider-selection-plan.md). Reuses the managed-agent
# secrets where a vendor's credential already exists — same account, a narrower ask —
# rather than provisioning a second copy. Vertex needs none of this; it is unconditional.
if gcloud secrets describe anthropic-api-key --project "$PROJECT_ID" >/dev/null 2>&1; then
  SECRET_MAPPINGS+=("SEED_ANTHROPIC_API_KEY=anthropic-api-key:latest")
  echo "==> anthropic-api-key found; selectable as a seed provider once SEED_ANTHROPIC_MODEL is also set."
fi
if gcloud secrets describe openai-api-key --project "$PROJECT_ID" >/dev/null 2>&1; then
  SECRET_MAPPINGS+=("SEED_OPENAI_API_KEY=openai-api-key:latest")
  echo "==> openai-api-key found; selectable as a seed provider once SEED_OPENAI_MODEL is also set."
fi
if gcloud secrets describe meta-api-key --project "$PROJECT_ID" >/dev/null 2>&1; then
  SECRET_MAPPINGS+=("SEED_META_API_KEY=meta-api-key:latest")
  echo "==> meta-api-key found; selectable as a seed provider once SEED_META_MODEL is also set."
fi
# describe only proves the secret container exists, not that it has a version
# — a container created without a version passes describe but makes
# --set-secrets fail deploy with "...versions/latest was not found"
# (2026-08-21 incident). Check for an accessible version instead.
if gcloud secrets versions access latest --secret=openrouter-api-key --project "$PROJECT_ID" >/dev/null 2>&1; then
  SECRET_MAPPINGS+=("SEED_OPENROUTER_API_KEY=openrouter-api-key:latest")
  echo "==> openrouter-api-key found; selectable as a seed provider once SEED_OPENROUTER_MODEL is also set."
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

# VAPID private key for Web Push. Public key travels as an env var (public by
# design); only this private key is a secret. Push degrades to off when absent.
if gcloud secrets describe vapid-private-key --project "$PROJECT_ID" >/dev/null 2>&1; then
  SECRET_MAPPINGS+=("VAPID_PRIVATE_KEY=vapid-private-key:latest")
  echo "==> vapid-private-key found; Web Push enabled."
fi

SECRET_FLAGS=()
if [ ${#SECRET_MAPPINGS[@]} -gt 0 ]; then
  joined=$(IFS=,; echo "${SECRET_MAPPINGS[*]}")
  SECRET_FLAGS=(--set-secrets "$joined")
fi

# ^|^ switches gcloud's env-var separator to | (pipe) so values may contain
# commas (WEB_ORIGIN list) and @ signs (BETA_ALLOWED_EMAILS).
ENV_VARS="^|^GAMES_REPO=${GAMES_REPO}|WEB_ORIGIN=${WEB_ORIGIN}|PRIVATE_BETA=${PRIVATE_BETA}|PUBLIC_PLAY_SLUGS=${PUBLIC_PLAY_SLUGS}|EDITORKIT_V2=${EDITORKIT_V2}"
if [ -n "${GAMES_SNAPSHOT_BUCKET:-}" ]; then
  ENV_VARS="${ENV_VARS}|GAMES_SNAPSHOT_BUCKET=${GAMES_SNAPSHOT_BUCKET}"
fi
if [ -n "${GAMES_STORE_BUCKET:-}" ]; then
  ENV_VARS="${ENV_VARS}|GAMES_STORE_BUCKET=${GAMES_STORE_BUCKET}"
  # Which project runs the gate when a game is delivered (gate-trigger.ts). Set
  # explicitly because Cloud Run does not populate GOOGLE_CLOUD_PROJECT the way App
  # Engine did, and an unset project means the gate silently never starts — deliveries
  # would pile up stored and unverified with nothing in the logs saying why.
  ENV_VARS="${ENV_VARS}|GATE_BUILD_PROJECT=${PROJECT_ID}"
fi
# The remix code-lane trace. Threaded here as well as in the Actions workflow,
# because --set-env-vars replaces the whole map: a deploy from this script would
# otherwise drop a flag the workflow had set, and the trace would stop with
# nothing to say why. Both supported paths carry it or neither should.
#
# Note this only opens the window. Closing it does not wait for either path —
# `remixTracePaused` on the creation-limits document stops emission within the
# breaker's TTL, because the interval between deciding to stop and stopping is
# spent writing players' own words to the log.
if [ -n "${REMIX_DEBUG:-}" ]; then
  ENV_VARS="${ENV_VARS}|REMIX_DEBUG=${REMIX_DEBUG}"
fi
ENV_VARS="${ENV_VARS}|TRUST_EDGE_CLIENT_IP=${TRUST_EDGE_CLIENT_IP:-false}"

if [ -n "${CANONICAL_HOST:-}" ]; then
  ENV_VARS="${ENV_VARS}|CANONICAL_HOST=${CANONICAL_HOST}"
fi
# The Vertex levers. Threaded here as well as in the Actions workflow, because
# --set-env-vars replaces the whole map and both supported paths must carry them or
# neither should. These are the variables the docs offer as the response to a Vertex
# incident without a code change: VERTEX_MODEL repoints the classifier when a model is
# retired (a retired model fails closed — a total creation outage), VERTEX_REGION moves
# off the global endpoint, TRANSLATE_BUILD_LOG stops build-log translation.
#
# None of them survived a deploy before this. On 2026-08-04 a TRANSLATE_BUILD_LOG=false
# set by hand fixed a spend leak, then vanished under an unrelated deploy ten minutes
# later and the leak resumed unnoticed. A lever that reverts itself is worse than none.
for VERTEX_VAR in VERTEX_MODEL VERTEX_REGION TRANSLATE_BUILD_LOG; do
  eval "VERTEX_VAL=\${${VERTEX_VAR}:-}"
  if [ -n "${VERTEX_VAL}" ]; then
    ENV_VARS="${ENV_VARS}|${VERTEX_VAR}=${VERTEX_VAL}"
  fi
done
# Same threading rule: knowledge_query's Discovery Engine client is off (503) until
# KNOWLEDGE_SEARCH_ENGINE_ID is both set here AND actually provisioned (setup-gcp.sh).
for KNOWLEDGE_VAR in KNOWLEDGE_SEARCH_ENGINE_ID KNOWLEDGE_SEARCH_PROJECT_ID KNOWLEDGE_SEARCH_LOCATION \
  KNOWLEDGE_SEARCH_COLLECTION KNOWLEDGE_SEARCH_SERVING_CONFIG KNOWLEDGE_SEARCH_QUOTA_PROJECT; do
  eval "KNOWLEDGE_VAL=\${${KNOWLEDGE_VAR}:-}"
  if [ -n "${KNOWLEDGE_VAL}" ]; then
    ENV_VARS="${ENV_VARS}|${KNOWLEDGE_VAR}=${KNOWLEDGE_VAL}"
  fi
done
# Feature flags the Actions workflow threads from repo variables but this script did not,
# found by auditing the two paths against each other after the 2026-08-04 incident. A
# deploy from here would silently drop them: the code lane and the editor assist would
# switch off, and MCP clients would lose their authorization-server list — each looking
# like a spontaneous regression with a deploy as the only clue.
#
# SEED_DISPATCH used to head this list; it is gone, round 0 is unconditional now.
# Its kill switch moved to the creation-limits document (seedingMode), not an env var —
# see ops: seed-provider-selection-plan.md.
#
# The rule this file already states for REMIX_DEBUG applies to every one of them: both
# supported paths carry a flag, or neither should.
for FLAG_VAR in CODE_LANE EDITOR_ASSIST MCP_AUTHORIZATION_SERVERS MCP_UI CODE_SURFACE TAB_COMPLETE CLI_SURFACE; do
  eval "FLAG_VAL=\${${FLAG_VAR}:-}"
  if [ -n "${FLAG_VAL}" ]; then
    ENV_VARS="${ENV_VARS}|${FLAG_VAR}=${FLAG_VAL}"
  fi
done
for MANAGED_VAR in \
  MANAGED_AGENT_VENDOR \
  MANAGED_AGENT_MODEL \
  MANAGED_AGENT_GEMINI_MODEL \
  MANAGED_AGENT_OPENAI_MODEL \
  MANAGED_AGENT_ID \
  MANAGED_AGENT_ENVIRONMENT_ID \
  MANAGED_AGENT_MAX_SECONDS \
  MANAGED_AGENT_MAX_LIST_COST_CENTS \
  MANAGED_AGENT_COPILOT_MAX_CREDITS \
  MANAGED_AGENT_MAX_TOTAL_TOKENS \
  MANAGED_AGENT_VAULT_IDS \
  MANAGED_AGENT_MCP_URL \
  MANAGED_AGENT_DELIVERY_MODE \
  MANAGED_AGENT_COPILOT_MCP_REPO \
  MANAGED_AGENT_COPILOT_MCP_BASE_REF \
  MANAGED_AGENT_COPILOT_MCP_CUSTOM_AGENT; do
  eval "MANAGED_VAL=\${${MANAGED_VAR}:-}"
  if [ -n "${MANAGED_VAL}" ]; then
    ENV_VARS="${ENV_VARS}|${MANAGED_VAR}=${MANAGED_VAL}"
  fi
done
# Round-0 seed providers. SEED_PROVIDER/SEED_MODEL tune the always-on Vertex default;
# the rest only matter once the matching secret above is also present.
for SEED_VAR in \
  SEED_PROVIDER \
  SEED_MODEL \
  SEED_ANTHROPIC_MODEL \
  SEED_OPENAI_MODEL \
  SEED_META_MODEL \
  SEED_META_BASE_URL \
  SEED_OPENROUTER_MODEL \
  SEED_OPENROUTER_BASE_URL \
  SEED_MAX_OUTPUT_TOKENS \
  SEED_ANTHROPIC_MAX_OUTPUT_TOKENS \
  SEED_OPENAI_MAX_OUTPUT_TOKENS \
  SEED_META_MAX_OUTPUT_TOKENS \
  SEED_OPENROUTER_MAX_OUTPUT_TOKENS \
  SEED_PICK_MAX_OUTPUT_TOKENS \
  SEED_ANTHROPIC_PICK_MAX_OUTPUT_TOKENS \
  SEED_OPENAI_PICK_MAX_OUTPUT_TOKENS \
  SEED_META_PICK_MAX_OUTPUT_TOKENS \
  SEED_OPENROUTER_PICK_MAX_OUTPUT_TOKENS; do
  eval "SEED_VAL=\${${SEED_VAR}:-}"
  if [ -n "${SEED_VAL}" ]; then
    ENV_VARS="${ENV_VARS}|${SEED_VAR}=${SEED_VAL}"
  fi
done
if [ -n "$GOOGLE_OAUTH_CLIENT_ID" ]; then
  ENV_VARS="${ENV_VARS}|GOOGLE_OAUTH_CLIENT_ID=${GOOGLE_OAUTH_CLIENT_ID}"
fi
if [ -n "$APPLE_CLIENT_IDS" ]; then
  ENV_VARS="${ENV_VARS}|APPLE_CLIENT_IDS=${APPLE_CLIENT_IDS}"
fi
if [ -n "$BETA_ALLOWED_UIDS" ]; then
  ENV_VARS="${ENV_VARS}|BETA_ALLOWED_UIDS=${BETA_ALLOWED_UIDS}"
fi
if [ -n "$BETA_ALLOWED_EMAILS" ]; then
  ENV_VARS="${ENV_VARS}|BETA_ALLOWED_EMAILS=${BETA_ALLOWED_EMAILS}"
fi
# Operator telemetry view. Separate from the beta allowlist on purpose: being admitted
# to the closed beta is not the same as being allowed to read every game's numbers.
# Unset means the route admits nobody, which is the correct default.
if [ -n "${ADMIN_UIDS:-}" ]; then
  ENV_VARS="${ENV_VARS}|ADMIN_UIDS=${ADMIN_UIDS}"
fi
# Reviewer assessment desk (/review). Same posture as ADMIN_UIDS — session-only, PATs
# never count. Admins are reviewers too, so this list is only for non-operator colleagues.
# Unset means nobody extra is a reviewer.
if [ -n "${REVIEWER_UIDS:-}" ]; then
  ENV_VARS="${ENV_VARS}|REVIEWER_UIDS=${REVIEWER_UIDS}"
fi
# OpenAI Apps domain-verification token (openai-apps-challenge.ts). Per-submission,
# not a secret, and rotates — a repo/shell variable, not Secret Manager. Unset means
# the route 404s, which is the correct default outside an active submission.
if [ -n "${OPENAI_APPS_CHALLENGE_TOKEN:-}" ]; then
  ENV_VARS="${ENV_VARS}|OPENAI_APPS_CHALLENGE_TOKEN=${OPENAI_APPS_CHALLENGE_TOKEN}"
fi
if [ -n "$MAIL_FROM" ]; then
  ENV_VARS="${ENV_VARS}|MAIL_FROM=${MAIL_FROM}"
fi
if [ -n "$NOTIFY_SWEEP_AUDIENCE" ]; then
  ENV_VARS="${ENV_VARS}|NOTIFY_SWEEP_AUDIENCE=${NOTIFY_SWEEP_AUDIENCE}"
fi
if [ -n "$NOTIFY_SWEEP_SA" ]; then
  ENV_VARS="${ENV_VARS}|NOTIFY_SWEEP_SA=${NOTIFY_SWEEP_SA}"
fi
if [ -n "$SCORECARD_SWEEP_AUDIENCE" ]; then
  ENV_VARS="${ENV_VARS}|SCORECARD_SWEEP_AUDIENCE=${SCORECARD_SWEEP_AUDIENCE}"
fi

if [ -n "$DIGEST_SWEEP_AUDIENCE" ]; then
  ENV_VARS="${ENV_VARS}|DIGEST_SWEEP_AUDIENCE=${DIGEST_SWEEP_AUDIENCE}"
fi
if [ -n "$HEALTH_SWEEP_AUDIENCE" ]; then
  ENV_VARS="${ENV_VARS}|HEALTH_SWEEP_AUDIENCE=${HEALTH_SWEEP_AUDIENCE}"
fi
if [ -n "$ACCOUNT_DELETION_SWEEP_AUDIENCE" ]; then
  ENV_VARS="${ENV_VARS}|ACCOUNT_DELETION_SWEEP_AUDIENCE=${ACCOUNT_DELETION_SWEEP_AUDIENCE}"
fi
if [ -n "$HEALTH_SWEEP_BATCH" ]; then
  ENV_VARS="${ENV_VARS}|HEALTH_SWEEP_BATCH=${HEALTH_SWEEP_BATCH}"
fi
if [ -n "$SUGGESTION_SWEEP_AUDIENCE" ]; then
  ENV_VARS="${ENV_VARS}|SUGGESTION_SWEEP_AUDIENCE=${SUGGESTION_SWEEP_AUDIENCE}"
fi
if [ -n "$DISPATCH_REAPER_AUDIENCE" ]; then
  ENV_VARS="${ENV_VARS}|DISPATCH_REAPER_AUDIENCE=${DISPATCH_REAPER_AUDIENCE}"
fi
if [ -n "$SPEND_BRAKE_AUDIENCE" ]; then
  ENV_VARS="${ENV_VARS}|SPEND_BRAKE_AUDIENCE=${SPEND_BRAKE_AUDIENCE}"
fi
if [ -n "$VAPID_PUBLIC_KEY" ]; then
  ENV_VARS="${ENV_VARS}|VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY}"
fi
if [ -n "$VAPID_SUBJECT" ]; then
  ENV_VARS="${ENV_VARS}|VAPID_SUBJECT=${VAPID_SUBJECT}"
fi
if [ -n "$ZONE_HOST_URL" ]; then
  ENV_VARS="${ENV_VARS}|ZONE_HOST_URL=${ZONE_HOST_URL}"
fi
if [ -n "$MP_RELAY_URL" ]; then
  ENV_VARS="${ENV_VARS}|MP_RELAY_URL=${MP_RELAY_URL}"
fi

# The instance ceiling is DERIVED FROM MP_RELAY_URL, never chosen by hand.
#
# Party rooms are per-instance in-memory state (apps/api/src/mp.ts): the host opens a room
# on whichever container served it, and a phone scanning the QR is load-balanced
# independently, so a second instance turns a valid room code into "no such room".
# Intermittent, and therefore blamed on the guest's wifi. Cookie-based --session-affinity
# does NOT help — it is per-client and cannot map a guest onto the host's instance.
#
# So the pin is not a warning comment anyone can override; it is a function of whether the
# rooms still live here. With MP_RELAY_URL set, this process forwards room creation to the
# relay service and never serves the socket, and scaling out is safe. Without it, the pin is
# 1 and MAX_INSTANCES is ignored — because a raised ceiling on a process that still owns
# rooms is precisely the outage this split exists to prevent, and it would look like a wifi
# problem for weeks. See docs/multiplayer-plan.md §4.6 and infra/deploy-relay.sh.
if [ -n "$MP_RELAY_URL" ]; then
  MAX_INSTANCES="${MAX_INSTANCES:-4}"
else
  if [ -n "${MAX_INSTANCES:-}" ] && [ "${MAX_INSTANCES}" != "1" ]; then
    echo "!! Ignoring MAX_INSTANCES=${MAX_INSTANCES}: MP_RELAY_URL is unset, so party rooms" >&2
    echo "   still live in this service's memory and a second instance would break them." >&2
    echo "   Deploy the relay first (infra/deploy-relay.sh), then set MP_RELAY_URL." >&2
  fi
  MAX_INSTANCES=1
fi

# --no-cpu-throttling (CPU always allocated) is load-bearing, not a performance tweak.
# Round-0 seeding is dispatched with `void dispatchBuild(...)`: it runs entirely after
# the creator's HTTP response has been sent, and it is the CPU-bound half — an esbuild
# bundle and a typecheck — that decides whether the draft compiles. Under the default
# (CPU throttled outside a request) that work crawls while the seeder's wall-clock
# timeouts keep running, and an instance reclaimed mid-seed kills the draft with no
# error and no record. Same threading rule as the flags above: both supported deploy
# paths carry it, or neither should.
echo "==> Deploying to Cloud Run (scale-to-zero, CPU always allocated, max ${MAX_INSTANCES} instance(s))"
gcloud run deploy "$SERVICE" \
  --image "$IMAGE" \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --platform managed \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances "$MAX_INSTANCES" \
  --no-cpu-throttling \
  --memory 1Gi \
  --port 8080 \
  --set-env-vars "${ENV_VARS}" \
  ${SECRET_FLAGS[@]+"${SECRET_FLAGS[@]}"}

echo "==> Done. The app (web + API) is live at:"
gcloud run services describe "$SERVICE" --region "$REGION" --project "$PROJECT_ID" \
  --format 'value(status.url)'
