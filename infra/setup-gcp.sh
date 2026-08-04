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

echo "==> 1/8 Enabling required GCP APIs"
# storage.googleapis.com is needed by step 8 (the snapshot bucket) and by the Cloud
# Run runtime that reads it. It is already on in most projects, but not guaranteed
# on a fresh one — and without it step 8 fails after everything before it succeeded.
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com firestore.googleapis.com \
  aiplatform.googleapis.com storage.googleapis.com iamcredentials.googleapis.com \
  --project "$PROJECT_ID"

echo "==> 2/8 Provisioning Firestore (Native Mode) in ${REGION}"
if gcloud firestore databases describe --project "$PROJECT_ID" >/dev/null 2>&1; then
  echo "    Firestore database already exists."
else
  gcloud firestore databases create --location="$REGION" --type=firestore-native --project="$PROJECT_ID"
fi

echo "==> 3/8 Granting datastore.user role to Deployer SA (${DEPLOYER_SA})"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${DEPLOYER_SA}" \
  --role="roles/datastore.user" \
  --condition=None \
  >/dev/null

echo "==> 4/8 Ensuring Cloud Run runtime SA has datastore.user and aiplatform.user roles"
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

echo "==> 5/8 Ensuring session-secret exists in Secret Manager and granting secretAccessor"
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

# Telemetry is kept for 90 days (docs/improvement-loop-plan.md IL-1). Firestore enforces
# that with a TTL policy on the field the writer stamps — see TELEMETRY_TTL_FIELD,
# TELEMETRY_COLLECTION and VISIT_COLLECTION in apps/api/src/store.ts. The names must match
# those constants exactly: a policy pointed at the wrong field or collection group is a
# silent no-op that deletes nothing and reports no error.
#
# **One policy per collection group, and that is the whole reason this is a loop.** A TTL
# policy is scoped to a group rather than a path, so every new telemetry stream needs its
# own — `playEvents` did not cover `visitEvents` when that stream landed, and the rows
# accumulated with an `expiresAt` nothing acted on. Add the group here in the same change
# that adds the stream, or the retention promise silently stops covering it.
#
# The groups are deliberately not named `events`: `submissions/{n}/events` holds durable
# build history that must never expire.
#
# `ttls list` reports only fields that already have a policy, so a name match is the
# existence check. Verified against the live ACTIVE playEvents policy on 2026-07-25.
TELEMETRY_GROUPS="playEvents visitEvents"
echo "==> 6/8 Ensuring the 90-day TTL policy on each telemetry collection group"
EXISTING_TTLS="$(gcloud firestore fields ttls list --project="$PROJECT_ID" --format="value(name)" 2>/dev/null || true)"
for GROUP in $TELEMETRY_GROUPS; do
  if printf '%s\n' "$EXISTING_TTLS" | grep -q "collectionGroups/${GROUP}/fields/expiresAt"; then
    echo "    ${GROUP}.expiresAt: already present."
  else
    # --enable-ttl is required and is what makes the field the group's TTL field. No
    # --expiration-offset: `expiresAt` is already the absolute deadline, so a row expires
    # exactly at the value the writer computed.
    gcloud firestore fields ttls update expiresAt \
      --collection-group="$GROUP" \
      --enable-ttl \
      --project="$PROJECT_ID"
    echo "    ${GROUP}.expiresAt: created. It applies to documents carrying the field;"
    echo "    rows written before it existed are never expired by it."
  fi
done

# Two reads run COLLECTION GROUP queries over a single field, and Firestore auto-indexes
# single fields only at COLLECTION scope, never COLLECTION_GROUP. Without these the query
# fails with `9 FAILED_PRECONDITION` — not a slow query, a hard error:
#
#   scorecard.computedAt (DESC)  listScorecards, apps/api/src/store.ts
#     Backs GET /api/admin/scorecards and the /health scorecards panel. All four operator
#     reads share one Promise.all and one error state, so this one missing index blanks
#     the game-health table too, not just the panel that needs it.
#
#   playerFeedback.uid (ASC)     deletePlayerFeedbackByUid, apps/api/src/store.ts
#     Backs `npm run player:erase` — the executable half of the privacy notice's promise
#     to remove a person's votes and feedback on account deletion. This one fails at the
#     worst possible moment: an operator running a deletion request they have already
#     accepted, with no other way to carry it out. Equality needs only ASCENDING.
#
# These are SINGLE-FIELD indexes, which Firestore requires be configured through single-field
# controls: `gcloud firestore indexes composite create` rejects them ("not necessary, configure
# using single field index controls"), and `gcloud firestore indexes fields update` cannot set
# `query-scope` in this CLI. So they are applied through the Firestore Admin REST field
# override, the only interface that expresses a COLLECTION_GROUP single-field index here.
#
# These are INDEXES, not TTL policies — they must NEVER be added to the TTL loop above.
# Scorecards are the durable aggregate meant to outlive the raw play rows a TTL expires, and
# feedback is a person's own words; a TTL on either would delete what we meant to keep.
echo "==> 7/8 Ensuring the COLLECTION_GROUP indexes the operator reads need"
FIELD_ACCESS_TOKEN="$(gcloud auth print-access-token --project="$PROJECT_ID")"
# group:field:order — one line per COLLECTION_GROUP single-field index.
CG_INDEXES="scorecard:computedAt:DESCENDING playerFeedback:uid:ASCENDING worldEntries:ownerUid:ASCENDING"
for ENTRY in $CG_INDEXES; do
  CG_GROUP="${ENTRY%%:*}"
  CG_REST="${ENTRY#*:}"
  CG_FIELD="${CG_REST%%:*}"
  CG_ORDER="${CG_REST#*:}"
  FIELD_URL="https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/collectionGroups/${CG_GROUP}/fields/${CG_FIELD}"
  if curl -s -H "Authorization: Bearer ${FIELD_ACCESS_TOKEN}" "$FIELD_URL" \
    | grep -q '"COLLECTION_GROUP"'; then
    echo "    ${CG_GROUP}.${CG_FIELD} COLLECTION_GROUP index: already present."
    continue
  fi
  # The COLLECTION (asc/desc) entries reassert Firestore's default single-field indexing,
  # which setting an explicit indexConfig would otherwise drop; the COLLECTION_GROUP entry
  # is the one the query needs. Builds asynchronously (seconds for a handful of rows).
  curl -s -X PATCH "${FIELD_URL}?updateMask=indexConfig" \
    -H "Authorization: Bearer ${FIELD_ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"indexConfig\":{\"indexes\":[
      {\"queryScope\":\"COLLECTION\",\"fields\":[{\"fieldPath\":\"${CG_FIELD}\",\"order\":\"ASCENDING\"}]},
      {\"queryScope\":\"COLLECTION\",\"fields\":[{\"fieldPath\":\"${CG_FIELD}\",\"order\":\"DESCENDING\"}]},
      {\"queryScope\":\"COLLECTION_GROUP\",\"fields\":[{\"fieldPath\":\"${CG_FIELD}\",\"order\":\"${CG_ORDER}\"}]}
    ]}}" >/dev/null
  echo "    ${CG_GROUP}.${CG_FIELD} COLLECTION_GROUP index: creating (builds asynchronously)."
done

# Pre-assembled published games (apps/api/src/game-snapshot.ts). The bucket sits in
# the Cloud Run region, not the Firestore one: it is read on the play path, and a
# cross-region read would put the latency back that baking was meant to remove.
SNAPSHOT_BUCKET="${GAMES_SNAPSHOT_BUCKET:-${PROJECT_ID}-games-snapshots}"
SNAPSHOT_BUCKET_REGION="${SNAPSHOT_BUCKET_REGION:-europe-west1}"
echo "==> 8/9 Ensuring the games snapshot bucket gs://${SNAPSHOT_BUCKET} exists"
if gcloud storage buckets describe "gs://${SNAPSHOT_BUCKET}" --project "$PROJECT_ID" >/dev/null 2>&1; then
  echo "    Bucket already exists."
else
  # Uniform access: the objects are reached through the API, which applies the
  # catalog allowlist and the beta gate. Per-object ACLs would be a second,
  # weaker access model for the same bytes.
  gcloud storage buckets create "gs://${SNAPSHOT_BUCKET}" \
    --location="$SNAPSHOT_BUCKET_REGION" \
    --uniform-bucket-level-access \
    --project="$PROJECT_ID"
  echo "    Created bucket in ${SNAPSHOT_BUCKET_REGION}."
fi

# The publish job (github-actions-deployer via WIF) writes; Cloud Run only reads.
# Splitting the two means a compromised runtime cannot rewrite what it serves.
gcloud storage buckets add-iam-policy-binding "gs://${SNAPSHOT_BUCKET}" \
  --member="serviceAccount:${DEPLOYER_SA}" \
  --role="roles/storage.objectAdmin" \
  --project="$PROJECT_ID" \
  >/dev/null

gcloud storage buckets add-iam-policy-binding "gs://${SNAPSHOT_BUCKET}" \
  --member="serviceAccount:${RUN_SA}" \
  --role="roles/storage.objectViewer" \
  --project="$PROJECT_ID" \
  >/dev/null

# Old snapshots are dead weight once the pointer moves past them, but they are
# also the rollback path, so they are kept for a quarter rather than a day. If the
# games repo ever goes 90 days without a merge the live snapshot ages out and
# published serving returns 503 until a fresh bake restores current.json — the
# lifecycle rule is a cost control, not a soft degrade to GitHub.
LIFECYCLE_FILE="$(mktemp)"
cat > "$LIFECYCLE_FILE" <<'EOF'
{
  "lifecycle": {
    "rule": [
      {
        "action": { "type": "Delete" },
        "condition": { "age": 90, "matchesPrefix": ["snapshots/"] }
      }
    ]
  }
}
EOF
gcloud storage buckets update "gs://${SNAPSHOT_BUCKET}" \
  --lifecycle-file="$LIFECYCLE_FILE" \
  --project="$PROJECT_ID" \
  >/dev/null
rm -f "$LIFECYCLE_FILE"
echo "    IAM (deployer: write, Cloud Run: read) and 90-day lifecycle applied."

# The games store (apps/api/src/games-store.ts) — the system of record for creator
# game content, as opposed to the snapshot, which is a rebuildable projection of it.
# Same region as the snapshot bucket and for the same reason: it is read while baking
# and while serving previews.
STORE_BUCKET="${GAMES_STORE_BUCKET:-${PROJECT_ID}-games-store}"
echo "==> 9/9 Ensuring the games store bucket gs://${STORE_BUCKET} exists"
if gcloud storage buckets describe "gs://${STORE_BUCKET}" --project "$PROJECT_ID" >/dev/null 2>&1; then
  echo "    Bucket already exists."
else
  # Public access prevention is not belt-and-braces here, it is a promise we published:
  # the privacy policy says a submitted spec does not become public by being submitted,
  # and creator sources live in this bucket. A world-readable object would make that
  # sentence false.
  gcloud storage buckets create "gs://${STORE_BUCKET}" \
    --location="$SNAPSHOT_BUCKET_REGION" \
    --uniform-bucket-level-access \
    --public-access-prevention \
    --project="$PROJECT_ID"
  echo "    Created bucket in ${SNAPSHOT_BUCKET_REGION}."
fi

# Unlike the snapshot bucket, Cloud Run must *write* here: a delivery arrives over the
# build channel, which is served by the API, so the runtime is what stores a candidate
# version. It gets objectCreator + objectViewer rather than objectAdmin — create and read
# but never delete on published/candidate versions — so a compromised runtime cannot
# destroy stored games, and the immutable version ids mean it has no existing path worth
# overwriting anyway. MCP file-by-file staging (games/*/staging/**) is the exception:
# it rewrites a per-job manifest and clears buffers, so a *conditional* objectAdmin on
# that prefix alone is granted below. The deployer keeps full objectAdmin for the bake;
# the gate writes through its own SA (further below).
gcloud storage buckets add-iam-policy-binding "gs://${STORE_BUCKET}" \
  --member="serviceAccount:${DEPLOYER_SA}" \
  --role="roles/storage.objectAdmin" \
  --project="$PROJECT_ID" \
  >/dev/null

for role in roles/storage.objectViewer roles/storage.objectCreator; do
  gcloud storage buckets add-iam-policy-binding "gs://${STORE_BUCKET}" \
    --member="serviceAccount:${RUN_SA}" \
    --role="$role" \
    --project="$PROJECT_ID" \
    >/dev/null
done

# Staging buffers need overwrite + delete (manifest upsert, clear). Bound to the staging
# prefix only — versions/ and everything else stay create+read for the runtime.
# CEL: object resource names are projects/_/buckets/BUCKET/objects/OBJECT_PATH.
gcloud storage buckets add-iam-policy-binding "gs://${STORE_BUCKET}" \
  --member="serviceAccount:${RUN_SA}" \
  --role="roles/storage.objectAdmin" \
  --condition="expression=resource.name.startsWith('projects/_/buckets/${STORE_BUCKET}/objects/games/') && resource.name.contains('/staging/'),title=games-store-staging-mutate,description=Overwrite/delete only under games/*/staging/ for MCP file-by-file staging" \
  --project="$PROJECT_ID" \
  >/dev/null

# Live objects are never aged out — these are the originals, not a rebuildable
# projection. Object versioning + soft-delete are the BY-11 compensating controls
# for gate-runner's objectAdmin (overwrite/delete recovery); the lifecycle rule
# only deletes *noncurrent* versions so versioning does not grow unbounded.
# See infra/gate-hardening.md "Store IAM: why objectAdmin".
echo "    IAM applied (deployer: admin, Cloud Run: read+create, staging prefix: mutate)."
echo "    Ensuring object versioning, 30d soft-delete, and noncurrent-version prune…"
gcloud storage buckets update "gs://${STORE_BUCKET}" \
  --versioning \
  --soft-delete-duration=30d \
  --project="$PROJECT_ID" \
  >/dev/null
STORE_LIFECYCLE_FILE="$(mktemp)"
cat > "$STORE_LIFECYCLE_FILE" <<'EOF'
{
  "lifecycle": {
    "rule": [
      {
        "action": { "type": "Delete" },
        "condition": { "isLive": false, "daysSinceNoncurrentTime": 30 }
      }
    ]
  }
}
EOF
gcloud storage buckets update "gs://${STORE_BUCKET}" \
  --lifecycle-file="$STORE_LIFECYCLE_FILE" \
  --project="$PROJECT_ID" \
  >/dev/null
rm -f "$STORE_LIFECYCLE_FILE"
echo "    Versioning on; soft-delete 30d; noncurrent versions pruned after 30d."

# Dedicated identity for gate Cloud Build runs (cloudbuild-gate.yaml / gate-trigger.ts).
# Submitted sources are hostile: the build must not inherit the project default Cloud
# Build or Compute SA. Store write on this bucket + read of github-token + logWriter
# only — see infra/gate-hardening.md.
GATE_SA_NAME="${GATE_SA_NAME:-gate-runner}"
GATE_SA_EMAIL="${GATE_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
echo "==> Ensuring gate-runner service account ${GATE_SA_EMAIL}"
if gcloud iam service-accounts describe "$GATE_SA_EMAIL" --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo "    Service account already exists."
else
  gcloud iam service-accounts create "$GATE_SA_NAME" \
    --display-name="Games quality gate runner" \
    --project="$PROJECT_ID"
  echo "    Created ${GATE_SA_EMAIL}."
  # Same race as setup-backups.sh: a brand-new SA is not immediately usable in an IAM
  # binding — add-iam-policy-binding answers "Service account … does not exist" until
  # the identity propagates. That is exactly how the first post-BY-11 run of this
  # script died, one line after successfully creating gate-runner.
  printf '    Waiting for the identity to propagate'
  for _ in $(seq 1 30); do
    if gcloud iam service-accounts describe "$GATE_SA_EMAIL" --project="$PROJECT_ID" >/dev/null 2>&1; then
      break
    fi
    printf '.'
    sleep 2
  done
  printf '\n'
fi

# Even once `describe` answers, the policy layer can still lag, so grants below retry
# rather than fail the whole run on a race that clears itself in seconds. Last attempt
# is unsuppressed so a real permission problem stays readable.
grant_gate_with_retry() {
  local attempt
  for attempt in 1 2 3 4; do
    if "$@" >/dev/null 2>&1; then
      return 0
    fi
    sleep $((attempt * 3))
  done
  "$@" >/dev/null
}

# objectAdmin (includes delete) is forced by in-place manifest updates — see
# infra/gate-hardening.md "Store IAM: why objectAdmin". Compensated above with
# versioning + soft-delete + noncurrent prune on this bucket.
grant_gate_with_retry gcloud storage buckets add-iam-policy-binding "gs://${STORE_BUCKET}" \
  --member="serviceAccount:${GATE_SA_EMAIL}" \
  --role="roles/storage.objectAdmin" \
  --project="$PROJECT_ID"

grant_gate_with_retry gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${GATE_SA_EMAIL}" \
  --role="roles/logging.logWriter" \
  --condition=None

# Narrow accessor on the one secret the gate may hold — not a project-wide secretAccessor.
if gcloud secrets describe github-token --project="$PROJECT_ID" >/dev/null 2>&1; then
  grant_gate_with_retry gcloud secrets add-iam-policy-binding github-token \
    --member="serviceAccount:${GATE_SA_EMAIL}" \
    --role="roles/secretmanager.secretAccessor" \
    --project="$PROJECT_ID"
  echo "    gate-runner may read secret github-token."
else
  echo "    WARN: secret github-token missing — create it before gate runs can clone the harness."
fi

# The runtime starts the gate itself when a game is delivered (gate-trigger.ts). Without
# this a candidate is stored and never verified, so it can never publish and the upload
# path ends in a queue nobody drains.
#
# builds.editor rather than a narrower role because submitting a build is what it does;
# there is no "submit only" role. actAs is scoped to gate-runner (not project-wide
# serviceAccountUser) so the runtime cannot launch builds as arbitrary identities.
echo "==> Letting the runtime start gate builds as ${GATE_SA_EMAIL}"
grant_gate_with_retry gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${RUN_SA}" \
  --role="roles/cloudbuild.builds.editor" \
  --condition=None
grant_gate_with_retry gcloud iam service-accounts add-iam-policy-binding "$GATE_SA_EMAIL" \
  --member="serviceAccount:${RUN_SA}" \
  --role="roles/iam.serviceAccountUser" \
  --project="$PROJECT_ID"
gcloud services enable cloudbuild.googleapis.com --project="$PROJECT_ID" >/dev/null
echo "    Cloud Run may submit gate builds as gate-runner."

# BY-04 signed kit/example URLs: on Cloud Run the metadata credentials have no private
# key, so GoogleAuth.sign() calls IAM Credentials signBlob as RUN_SA on itself. Without
# the API and TokenCreator, /api/agent/build/kit and /examples/:slug return 500.
echo "==> Letting the runtime sign V4 download URLs (iamcredentials signBlob)"
gcloud services enable iamcredentials.googleapis.com --project="$PROJECT_ID" >/dev/null
grant_gate_with_retry gcloud iam service-accounts add-iam-policy-binding "${RUN_SA}" \
  --member="serviceAccount:${RUN_SA}" \
  --role="roles/iam.serviceAccountTokenCreator" \
  --project="$PROJECT_ID"
echo "    Cloud Run may signBlob as itself for games-store signed URLs."

echo ""
echo "==> Done. Firestore database, snapshot bucket, IAM roles (datastore.user, aiplatform.user), session-secret, telemetry TTL, scorecards read index, and gate-runner SA configured for project ${PROJECT_ID}."
