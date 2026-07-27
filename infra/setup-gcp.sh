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

echo "==> 1/7 Enabling required GCP APIs"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com firestore.googleapis.com \
  aiplatform.googleapis.com \
  --project "$PROJECT_ID"

echo "==> 2/7 Provisioning Firestore (Native Mode) in ${REGION}"
if gcloud firestore databases describe --project "$PROJECT_ID" >/dev/null 2>&1; then
  echo "    Firestore database already exists."
else
  gcloud firestore databases create --location="$REGION" --type=firestore-native --project="$PROJECT_ID"
fi

echo "==> 3/7 Granting datastore.user role to Deployer SA (${DEPLOYER_SA})"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${DEPLOYER_SA}" \
  --role="roles/datastore.user" \
  --condition=None \
  >/dev/null

echo "==> 4/7 Ensuring Cloud Run runtime SA has datastore.user and aiplatform.user roles"
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

echo "==> 5/7 Ensuring session-secret exists in Secret Manager and granting secretAccessor"
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
echo "==> 6/7 Ensuring the 90-day TTL policy on each telemetry collection group"
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

# Pre-assembled published games (apps/api/src/game-snapshot.ts). The bucket sits in
# the Cloud Run region, not the Firestore one: it is read on the play path, and a
# cross-region read would put the latency back that baking was meant to remove.
SNAPSHOT_BUCKET="${GAMES_SNAPSHOT_BUCKET:-${PROJECT_ID}-games-snapshots}"
SNAPSHOT_BUCKET_REGION="${SNAPSHOT_BUCKET_REGION:-europe-west1}"
echo "==> 7/7 Ensuring the games snapshot bucket gs://${SNAPSHOT_BUCKET} exists"
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
# serving falls back to GitHub — degraded, not broken, which is the right way for
# a cost control to fail.
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

echo ""
echo "==> Done. Firestore database, snapshot bucket, IAM roles (datastore.user, aiplatform.user), session-secret, and telemetry TTL configured for project ${PROJECT_ID}."
