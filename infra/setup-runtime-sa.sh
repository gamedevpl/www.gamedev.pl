#!/usr/bin/env bash
#
# Dedicated runtime identities for the three Cloud Run services, so none of them runs as
# the project's default compute service account.
# OWNER-RUN: creating service accounts and binding IAM on secrets needs project write
# access that the CI deployer deliberately does not have.
#
# Why this exists: every service used to run as
# <project-number>-compute@developer.gserviceaccount.com, which holds project-level
# roles/editor — granted at project creation, never removed. Editor makes every narrow
# control in this directory cosmetic: the store bucket's create-only scoping, the staging
# CEL condition, the snapshot bucket's read-only split, the actAs boundary on gate-runner
# and the per-secret accessor grants are all bypassable by an identity that can already
# write any bucket, read any secret and submit any build. The relay terminates untrusted
# websocket traffic and the API runs gate builds on creator-submitted code, so a compromise
# of either was project-wide write access.
#
# What this script does, per service:
#
#   gamedev-app       Firestore, Vertex, Discovery Engine, Cloud Build (gate submits),
#                     actAs gate-runner only, signBlob on itself (V4 signed URLs), the
#                     games-store and games-snapshot buckets, every secret in
#                     infra/env-manifest.json.
#   gamedev-world     Firestore (zone snapshots), session-secret, github-token.
#   gamedev-mp-relay  session-secret. Nothing else — it reads no games, files no
#                     submissions and holds no sessions.
#
# The role set was inventoried from the code, not guessed: grep the API for
# google-auth-library and @google-cloud/* and each hit maps to one grant below. Two
# things the brief expected turned out unnecessary and are deliberately absent:
# roles/logging.logWriter (the services log to stdout, which Cloud Run ships without the
# runtime identity's involvement; no code path calls the Logging API) and
# roles/run.invoker (every service is --allow-unauthenticated; the app-to-app calls —
# seed dispatch, the relay's create route — are verified by the callee's own OIDC check,
# not by Cloud Run IAM).
#
# Resource-level grants (buckets, secrets, service-account IAM) are APPLIED here, and are
# additive: re-running reconciles them. Project-level bindings need
# resourcemanager.projectIamAdmin and are PRINTED as ready-to-run commands unless
# APPLY_PROJECT_BINDINGS=1, so that the project policy only changes as a deliberate act.
#
# Rollout order (docs/deployment.md "Runtime identities"):
#   1. run this; run the printed project-level commands
#   2. merge the deploy change that pins --service-account; every service moves over
#      while the default account still holds editor, so nothing can break at this step
#   3. soak through one cycle of every sweep (the weekly digest is the longest)
#   4. PRUNE_DEFAULT_COMPUTE=1 ./infra/setup-runtime-sa.sh — removes the default account
#      from every resource this script manages and prints the editor removal plus its
#      one-line rollback
#
# Usage:
#   ./infra/setup-runtime-sa.sh
#   APPLY_PROJECT_BINDINGS=1 ./infra/setup-runtime-sa.sh
#   PRUNE_DEFAULT_COMPUTE=1 ./infra/setup-runtime-sa.sh
#
# Override via env: PROJECT_ID, GAMES_STORE_BUCKET, GAMES_SNAPSHOT_BUCKET, APP_SA_NAME,
# WORLD_SA_NAME, RELAY_SA_NAME, GATE_SA_NAME.
set -euo pipefail

export CLOUDSDK_CORE_DISABLE_PROMPTS=1

PROJECT_ID="${PROJECT_ID:-gamedevpl}"
GAMES_STORE_BUCKET="${GAMES_STORE_BUCKET:-${PROJECT_ID}-games-store}"
GAMES_SNAPSHOT_BUCKET="${GAMES_SNAPSHOT_BUCKET:-${PROJECT_ID}-games-snapshots}"
# Named after the services they run, so `gcloud run services describe` and the IAM policy
# read the same way. Both deploy paths derive the email from the service name the same way
# (infra/deploy-api.sh, .github/workflows/deploy.yml), which is what pins them together.
APP_SA_NAME="${APP_SA_NAME:-gamedev-app}"
WORLD_SA_NAME="${WORLD_SA_NAME:-gamedev-world}"
RELAY_SA_NAME="${RELAY_SA_NAME:-gamedev-mp-relay}"
GATE_SA_NAME="${GATE_SA_NAME:-gate-runner}"
APPLY_PROJECT_BINDINGS="${APPLY_PROJECT_BINDINGS:-0}"
PRUNE_DEFAULT_COMPUTE="${PRUNE_DEFAULT_COMPUTE:-0}"

SA_DOMAIN="${PROJECT_ID}.iam.gserviceaccount.com"
APP_SA="${APP_SA_NAME}@${SA_DOMAIN}"
WORLD_SA="${WORLD_SA_NAME}@${SA_DOMAIN}"
RELAY_SA="${RELAY_SA_NAME}@${SA_DOMAIN}"
GATE_SA="${GATE_SA_NAME}@${SA_DOMAIN}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
DEFAULT_COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# The secret list is the manifest's, not a copy of it: a secret added to the manifest
# without a grant here would deploy and then fail at revision start with a permission
# error on --set-secrets, which is exactly the drift a second list invites.
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node is required to read infra/env-manifest.json" >&2
  exit 1
fi
APP_SECRETS="$(node -p "Object.values(require('${SCRIPT_DIR}/env-manifest.json').secrets).sort().filter((s,i,a)=>a.indexOf(s)===i).join(' ')")"
WORLD_SECRETS="session-secret github-token"
RELAY_SECRETS="session-secret"

CHANGED=0
note() { echo "    $*"; }
changed() { CHANGED=$((CHANGED + 1)); echo "    + $*"; }

# gcloud's add-iam-policy-binding is idempotent but prints the whole policy; comparing
# the policy before and after is how "changed" is reported honestly.
binding_present() {
  # $1 = policy JSON, $2 = role, $3 = member, $4 = condition title ('' for none)
  node -e '
    const [policy, role, member, title] = process.argv.slice(1);
    const p = JSON.parse(policy);
    const hit = (p.bindings || []).some(b => b.role === role && (b.members || []).includes(member)
      && ((b.condition && b.condition.title) || "") === title);
    process.exit(hit ? 0 : 1);
  ' "$1" "$2" "$3" "$4"
}

ensure_sa() {
  local name="$1" display="$2" email="${1}@${SA_DOMAIN}"
  if gcloud iam service-accounts describe "$email" --project "$PROJECT_ID" >/dev/null 2>&1; then
    note "${email} exists."
    return 0
  fi
  gcloud iam service-accounts create "$name" --display-name="$display" --project "$PROJECT_ID" >/dev/null
  changed "created ${email}"
  # A brand-new account is not immediately bindable — setup-gcp.sh hit exactly this race
  # on gate-runner, dying one line after a successful create.
  printf '    Waiting for the identity to propagate'
  local _i
  for _i in $(seq 1 30); do
    if gcloud iam service-accounts describe "$email" --project "$PROJECT_ID" >/dev/null 2>&1; then
      break
    fi
    printf '.'
    sleep 2
  done
  printf '\n'
}

# Grants below retry: the policy layer can lag a fresh identity by seconds.
with_retry() {
  local attempt
  for attempt in 1 2 3 4; do
    if "$@" >/dev/null 2>&1; then
      return 0
    fi
    sleep $((attempt * 3))
  done
  "$@" >/dev/null
}

grant_secret() {
  local secret="$1" member="$2"
  if ! gcloud secrets describe "$secret" --project "$PROJECT_ID" >/dev/null 2>&1; then
    note "WARN secret ${secret} does not exist; skipping (create it, then re-run)."
    return 0
  fi
  local policy
  policy="$(gcloud secrets get-iam-policy "$secret" --project "$PROJECT_ID" --format=json)"
  if binding_present "$policy" roles/secretmanager.secretAccessor "serviceAccount:${member}" ''; then
    note "${secret}: ${member} already secretAccessor."
    return 0
  fi
  with_retry gcloud secrets add-iam-policy-binding "$secret" \
    --member="serviceAccount:${member}" \
    --role=roles/secretmanager.secretAccessor \
    --project "$PROJECT_ID"
  changed "${secret}: secretAccessor -> ${member}"
}

revoke_secret() {
  local secret="$1" member="$2"
  gcloud secrets describe "$secret" --project "$PROJECT_ID" >/dev/null 2>&1 || return 0
  local policy
  policy="$(gcloud secrets get-iam-policy "$secret" --project "$PROJECT_ID" --format=json)"
  binding_present "$policy" roles/secretmanager.secretAccessor "serviceAccount:${member}" '' || return 0
  gcloud secrets remove-iam-policy-binding "$secret" \
    --member="serviceAccount:${member}" \
    --role=roles/secretmanager.secretAccessor \
    --project "$PROJECT_ID" >/dev/null
  changed "${secret}: removed secretAccessor from ${member}"
}

grant_bucket() {
  # $1 = bucket, $2 = member, $3 = role, $4 = condition ('' for none), $5 = condition title
  local bucket="$1" member="$2" role="$3" condition="${4:-}" title="${5:-}"
  local policy
  policy="$(gcloud storage buckets get-iam-policy "gs://${bucket}" --project "$PROJECT_ID" --format=json)"
  if binding_present "$policy" "$role" "serviceAccount:${member}" "$title"; then
    note "gs://${bucket}: ${member} already ${role}${title:+ (${title})}."
    return 0
  fi
  if [ -n "$condition" ]; then
    with_retry gcloud storage buckets add-iam-policy-binding "gs://${bucket}" \
      --member="serviceAccount:${member}" --role="$role" \
      --condition="$condition" --project "$PROJECT_ID"
  else
    with_retry gcloud storage buckets add-iam-policy-binding "gs://${bucket}" \
      --member="serviceAccount:${member}" --role="$role" \
      --condition=None --project "$PROJECT_ID"
  fi
  changed "gs://${bucket}: ${role}${title:+ (${title})} -> ${member}"
}

revoke_bucket() {
  local bucket="$1" member="$2" role="$3" title="${4:-}"
  local policy
  policy="$(gcloud storage buckets get-iam-policy "gs://${bucket}" --project "$PROJECT_ID" --format=json)"
  binding_present "$policy" "$role" "serviceAccount:${member}" "$title" || return 0
  if [ -n "$title" ]; then
    # remove-iam-policy-binding matches a conditional binding only when told the condition.
    local expr
    expr="$(node -e '
      const [policy, role, title] = process.argv.slice(1);
      const b = JSON.parse(policy).bindings.find(b => b.role === role && b.condition && b.condition.title === title);
      process.stdout.write(b.condition.expression);
    ' "$policy" "$role" "$title")"
    gcloud storage buckets remove-iam-policy-binding "gs://${bucket}" \
      --member="serviceAccount:${member}" --role="$role" \
      --condition="expression=${expr},title=${title}" --project "$PROJECT_ID" >/dev/null
  else
    gcloud storage buckets remove-iam-policy-binding "gs://${bucket}" \
      --member="serviceAccount:${member}" --role="$role" \
      --condition=None --project "$PROJECT_ID" >/dev/null
  fi
  changed "gs://${bucket}: removed ${role}${title:+ (${title})} from ${member}"
}

grant_on_sa() {
  # $1 = target SA, $2 = member, $3 = role
  local target="$1" member="$2" role="$3"
  local policy
  policy="$(gcloud iam service-accounts get-iam-policy "$target" --project "$PROJECT_ID" --format=json)"
  if binding_present "$policy" "$role" "serviceAccount:${member}" ''; then
    note "${target}: ${member} already ${role}."
    return 0
  fi
  with_retry gcloud iam service-accounts add-iam-policy-binding "$target" \
    --member="serviceAccount:${member}" --role="$role" --project "$PROJECT_ID"
  changed "${target}: ${role} -> ${member}"
}

revoke_on_sa() {
  local target="$1" member="$2" role="$3"
  local policy
  policy="$(gcloud iam service-accounts get-iam-policy "$target" --project "$PROJECT_ID" --format=json)"
  binding_present "$policy" "$role" "serviceAccount:${member}" '' || return 0
  gcloud iam service-accounts remove-iam-policy-binding "$target" \
    --member="serviceAccount:${member}" --role="$role" --project "$PROJECT_ID" >/dev/null
  changed "${target}: removed ${role} from ${member}"
}

# Project-level bindings: printed (default) or applied (APPLY_PROJECT_BINDINGS=1).
PROJECT_POLICY="$(gcloud projects get-iam-policy "$PROJECT_ID" --format=json)"
PROJECT_CMDS=()
project_binding() {
  # $1 = member, $2 = role
  local member="$1" role="$2"
  if binding_present "$PROJECT_POLICY" "$role" "serviceAccount:${member}" ''; then
    note "project: ${member} already ${role}."
    return 0
  fi
  local cmd="gcloud projects add-iam-policy-binding ${PROJECT_ID} --member=\"serviceAccount:${member}\" --role=\"${role}\" --condition=None"
  if [ "$APPLY_PROJECT_BINDINGS" = "1" ]; then
    with_retry gcloud projects add-iam-policy-binding "$PROJECT_ID" \
      --member="serviceAccount:${member}" --role="$role" --condition=None
    changed "project: ${role} -> ${member}"
  else
    note "project: ${member} needs ${role} (printed below)."
    PROJECT_CMDS+=("$cmd")
  fi
}

echo "==> 1/6 Service accounts"
ensure_sa "$APP_SA_NAME" "Cloud Run runtime: gamedev-app"
ensure_sa "$WORLD_SA_NAME" "Cloud Run runtime: gamedev-world (zone host)"
ensure_sa "$RELAY_SA_NAME" "Cloud Run runtime: gamedev-mp-relay (party relay)"
if ! gcloud iam service-accounts describe "$GATE_SA" --project "$PROJECT_ID" >/dev/null 2>&1; then
  echo "ERROR: ${GATE_SA} does not exist. Run infra/setup-gcp.sh first; the API must be" >&2
  echo "       able to actAs it, and there is nothing to bind that to yet." >&2
  exit 1
fi

echo "==> 2/6 Secret Manager accessors (per secret, never project-wide)"
for s in $APP_SECRETS; do grant_secret "$s" "$APP_SA"; done
for s in $WORLD_SECRETS; do grant_secret "$s" "$WORLD_SA"; done
for s in $RELAY_SECRETS; do grant_secret "$s" "$RELAY_SA"; done

echo "==> 3/6 Buckets (the app only; the world and the relay read no objects)"
# Exactly the shape setup-gcp.sh gives the runtime: read + create bucket-wide, and
# overwrite/delete only under games/*/staging/ for MCP file-by-file staging. The
# CEL is the same expression, for the same reason (IAM allows only startsWith /
# endsWith / extract on resource.name).
if gcloud storage buckets describe "gs://${GAMES_STORE_BUCKET}" --project "$PROJECT_ID" >/dev/null 2>&1; then
  grant_bucket "$GAMES_STORE_BUCKET" "$APP_SA" roles/storage.objectViewer
  grant_bucket "$GAMES_STORE_BUCKET" "$APP_SA" roles/storage.objectCreator
  STAGING_TITLE="games-store-staging-mutate"
  STAGING_CONDITION="expression=resource.type == 'storage.googleapis.com/Object' && resource.name.extract('projects/_/buckets/${GAMES_STORE_BUCKET}/objects/games/{slug}/staging/') != '',title=${STAGING_TITLE},description=Overwrite/delete only under games/*/staging/ for MCP file-by-file staging"
  grant_bucket "$GAMES_STORE_BUCKET" "$APP_SA" roles/storage.objectAdmin "$STAGING_CONDITION" "$STAGING_TITLE"
else
  note "WARN gs://${GAMES_STORE_BUCKET} does not exist; skipping (setup-gcp.sh creates it)."
fi
if gcloud storage buckets describe "gs://${GAMES_SNAPSHOT_BUCKET}" --project "$PROJECT_ID" >/dev/null 2>&1; then
  grant_bucket "$GAMES_SNAPSHOT_BUCKET" "$APP_SA" roles/storage.objectViewer
else
  note "WARN gs://${GAMES_SNAPSHOT_BUCKET} does not exist; skipping (setup-gcp.sh creates it)."
fi

echo "==> 4/6 Service-account IAM"
# actAs gate-runner and nothing else: the runtime may start gate builds only as the gate
# identity (infra/gate-hardening.md). A project-wide serviceAccountUser would let it
# launch builds as any account, which is how the default compute account had it.
grant_on_sa "$GATE_SA" "$APP_SA" roles/iam.serviceAccountUser
# signBlob on itself: on Cloud Run the metadata credentials carry no private key, so
# GoogleAuth.sign() calls IAM Credentials as the runtime identity (gcs-sign.ts). This
# is the grant editor was silently covering; without it kit and example downloads 500.
grant_on_sa "$APP_SA" "$APP_SA" roles/iam.serviceAccountTokenCreator
gcloud services enable iamcredentials.googleapis.com --project "$PROJECT_ID" >/dev/null

echo "==> 5/6 Project-level roles"
# gamedev-app. builds.editor because there is no submit-only role; discoveryengine
# viewer for knowledge_query; serviceUsageConsumer because knowledge-search.ts sends
# X-Goog-User-Project, which needs serviceusage.services.use on the quota project —
# another thing editor covered without anyone writing it down.
project_binding "$APP_SA" roles/datastore.user
project_binding "$APP_SA" roles/aiplatform.user
project_binding "$APP_SA" roles/discoveryengine.viewer
project_binding "$APP_SA" roles/serviceusage.serviceUsageConsumer
project_binding "$APP_SA" roles/cloudbuild.builds.editor
# gamedev-world: one Firestore document per zone (apps/world/src/snapshot-store.ts).
project_binding "$WORLD_SA" roles/datastore.user
# gamedev-mp-relay: none. Rooms are process memory and the token is HMAC'd from the secret.

echo "==> 6/6 Default compute account"
if [ "$PRUNE_DEFAULT_COMPUTE" = "1" ]; then
  # Resource-level removals: everything this script manages for the new identities, taken
  # away from the old one. Reversible by re-running setup-gcp.sh, which still knows how
  # to grant them — but do not do that unless the soak found something.
  for s in $APP_SECRETS; do revoke_secret "$s" "$DEFAULT_COMPUTE_SA"; done
  if gcloud storage buckets describe "gs://${GAMES_STORE_BUCKET}" --project "$PROJECT_ID" >/dev/null 2>&1; then
    revoke_bucket "$GAMES_STORE_BUCKET" "$DEFAULT_COMPUTE_SA" roles/storage.objectAdmin "games-store-staging-mutate"
    revoke_bucket "$GAMES_STORE_BUCKET" "$DEFAULT_COMPUTE_SA" roles/storage.objectCreator
    revoke_bucket "$GAMES_STORE_BUCKET" "$DEFAULT_COMPUTE_SA" roles/storage.objectViewer
  fi
  if gcloud storage buckets describe "gs://${GAMES_SNAPSHOT_BUCKET}" --project "$PROJECT_ID" >/dev/null 2>&1; then
    revoke_bucket "$GAMES_SNAPSHOT_BUCKET" "$DEFAULT_COMPUTE_SA" roles/storage.objectViewer
  fi
  revoke_on_sa "$GATE_SA" "$DEFAULT_COMPUTE_SA" roles/iam.serviceAccountUser
  revoke_on_sa "$DEFAULT_COMPUTE_SA" "$DEFAULT_COMPUTE_SA" roles/iam.serviceAccountTokenCreator
else
  note "left alone (PRUNE_DEFAULT_COMPUTE=1 removes its resource-level grants after the soak)."
fi

echo ""
echo "==> Done. ${CHANGED} change(s)."
echo "    gamedev-app       -> ${APP_SA}"
echo "    gamedev-world     -> ${WORLD_SA}"
echo "    gamedev-mp-relay  -> ${RELAY_SA}"

if [ ${#PROJECT_CMDS[@]} -gt 0 ]; then
  cat <<EOF

==> Project-level bindings still missing. These need resourcemanager.projectIamAdmin;
    run them (or re-run with APPLY_PROJECT_BINDINGS=1):

EOF
  for cmd in "${PROJECT_CMDS[@]}"; do echo "  ${cmd}"; done
fi

if [ "$PRUNE_DEFAULT_COMPUTE" = "1" ]; then
  cat <<EOF

==> Project-level removals from ${DEFAULT_COMPUTE_SA}. Owner-run, in this order, and
    ONLY after every service reports its own serviceAccountName and one full cycle of
    every sweep has run on it (docs/deployment.md "Runtime identities"):

  gcloud projects remove-iam-policy-binding ${PROJECT_ID} --member="serviceAccount:${DEFAULT_COMPUTE_SA}" --role="roles/editor" --condition=None
  gcloud projects remove-iam-policy-binding ${PROJECT_ID} --member="serviceAccount:${DEFAULT_COMPUTE_SA}" --role="roles/iam.serviceAccountUser" --condition=None
  gcloud projects remove-iam-policy-binding ${PROJECT_ID} --member="serviceAccount:${DEFAULT_COMPUTE_SA}" --role="roles/cloudbuild.builds.editor" --condition=None
  gcloud projects remove-iam-policy-binding ${PROJECT_ID} --member="serviceAccount:${DEFAULT_COMPUTE_SA}" --role="roles/aiplatform.user" --condition=None
  gcloud projects remove-iam-policy-binding ${PROJECT_ID} --member="serviceAccount:${DEFAULT_COMPUTE_SA}" --role="roles/discoveryengine.viewer" --condition=None
  gcloud projects remove-iam-policy-binding ${PROJECT_ID} --member="serviceAccount:${DEFAULT_COMPUTE_SA}" --role="roles/datastore.user" --condition=None

    Rollback, one line, restores everything the old identity could do:

  gcloud projects add-iam-policy-binding ${PROJECT_ID} --member="serviceAccount:${DEFAULT_COMPUTE_SA}" --role="roles/editor" --condition=None

    Never delete or disable ${DEFAULT_COMPUTE_SA} itself, and never touch
    ${PROJECT_NUMBER}@cloudservices.gserviceaccount.com (the Google APIs service agent).
EOF
fi

cat <<EOF

==> Verify:
  gcloud projects get-iam-policy ${PROJECT_ID} --flatten="bindings[].members" \\
    --format="table(bindings.role,bindings.members)" \\
    --filter="bindings.members:${APP_SA} OR bindings.members:${WORLD_SA} OR bindings.members:${RELAY_SA} OR bindings.members:${DEFAULT_COMPUTE_SA}"
  for s in gamedev-app gamedev-world gamedev-mp-relay; do
    gcloud run services describe \$s --region europe-west1 --project ${PROJECT_ID} --format='value(spec.template.spec.serviceAccountName)'
  done
EOF
