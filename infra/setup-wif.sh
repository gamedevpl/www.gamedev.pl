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
# provider — but as its own kit-publisher account since 2026-09-08, not the deployer. It
# is NOT granted the erase-verifier account below either.
GAMES_REPO="${GAMES_REPO:-gamedevpl/www.gamedev.pl-games}"
SA_NAME="${SA_NAME:-github-actions-deployer}"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
# The nightly erasure proof (.github/workflows/verify-erase.yml) needs Firestore, which
# the deployer deliberately does not have. Kept as a second account rather than a role on
# the first: a deploy credential that can also read every player's data is a much worse
# thing to leak, and this one can be revoked without stopping deploys.
VERIFIER_SA_NAME="${VERIFIER_SA_NAME:-erase-verifier}"
VERIFIER_SA_EMAIL="${VERIFIER_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
# The games repo publishes the Creator Kit, the workspace scaffold, the example games and
# the knowledge corpus. That is four object prefixes in one bucket — not a deploy — so it
# gets its own account rather than the deployer's. See step 5b.
PUBLISHER_SA_NAME="${PUBLISHER_SA_NAME:-kit-publisher}"
PUBLISHER_SA_EMAIL="${PUBLISHER_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
STORE_BUCKET="${GAMES_STORE_BUCKET:-${PROJECT_ID}-games-store}"

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

# Which repositories may mint a token against this provider at all, and from which ref.
# Everything downstream is a subset of this list: passing the condition only gets a
# workflow to the point where a per-account principalSet binding decides what, if
# anything, it may impersonate.
#
# The ref half is what keeps a pull request — from a fork or from a branch anyone with
# write access can push — from minting deployer credentials. Every workflow that uses
# this provider runs off the default branch: deploy.yml and publish-games.yml on
# workflow_run / schedule / dispatch (the token's ref is the default branch for all
# three), verify-erase.yml on schedule, and the games repo's three publish workflows on
# push to main. Nothing authenticates from a pull_request event, so no PR workflow loses
# anything here. Each repo is pinned to its own default branch rather than allowing either
# name for both, because the website has no `main` and the games repo has no `master`.
ATTR_CONDITION="(assertion.repository == '${REPO}' && assertion.ref == 'refs/heads/master') || (assertion.repository == '${GAMES_REPO}' && assertion.ref == 'refs/heads/main')"

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

echo "==> 5/8 Binding '${REPO}' to ${SA_NAME}, and taking '${GAMES_REPO}' off it"
# ${REPO} only. The games repo used to share this account to publish the Creator Kit,
# which meant the kit publisher also held run.admin, storage.admin, project-wide Secret
# Manager and the rest of step 2 — the tighten the games repo's own docs/kit-publish.md
# asked for. It now has ${PUBLISHER_SA_NAME} below, which can write four object prefixes
# and nothing else.
#
# Ordering matters on an existing project: this step REMOVES the games repo's binding, so
# re-run this script only after that repo's workflows already name the publisher account.
# Run early, the next kit publish fails to authenticate; the fix is to re-run, not to put
# the binding back.
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/${POOL_ID}/attribute.repository/${REPO}" \
  --project="$PROJECT_ID" \
  >/dev/null
# Not `|| true`: a transient IAM failure here would leave the games repo able to assume
# the deployer — the whole point of this change — while the script reported success. So
# the removal may fail, and then the *absence* is verified; only that answer is accepted.
gcloud iam service-accounts remove-iam-policy-binding "$SA_EMAIL" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/${POOL_ID}/attribute.repository/${GAMES_REPO}" \
  --project="$PROJECT_ID" \
  >/dev/null 2>&1 || true
# Read first, check second: piping into grep would make an unreadable policy — expired
# credentials, a permission gap, a transient error — look exactly like "the binding is
# gone", which is the one answer that must be earned rather than assumed.
if ! DEPLOYER_POLICY="$(gcloud iam service-accounts get-iam-policy "$SA_EMAIL" \
  --project="$PROJECT_ID" --format=json)"; then
  echo "Error: could not read ${SA_NAME}'s IAM policy to confirm the removal." >&2
  echo "Re-run once IAM is reachable; do not treat this as done." >&2
  exit 1
fi
if printf '%s' "$DEPLOYER_POLICY" | grep -q "attribute.repository/${GAMES_REPO}"; then
  echo "Error: ${GAMES_REPO} can still assume ${SA_NAME}." >&2
  echo "The removal did not take effect. Re-run once IAM is reachable; do not treat this as done." >&2
  exit 1
fi
echo "    - ${GAMES_REPO}: not bound to the deployer (verified)"

echo "==> 5b/8 Creating the kit publisher '${PUBLISHER_SA_NAME}' for ${GAMES_REPO}"
gcloud iam service-accounts create "$PUBLISHER_SA_NAME" \
  --display-name="Creator Kit Publisher" \
  --description="Writes kits/, workspaces/, examples/ and knowledge/ in the games-store bucket. No deploy, no secrets, no Firestore." \
  --project="$PROJECT_ID" \
  || echo "    (already exists, continuing)"

# One conditional binding per prefix the publishers actually write, rather than
# bucket-wide objectAdmin. objectAdmin (not objectCreator) because two of these are
# mutable by design: kits/current.json is the N/N-1 registry pointer, rewritten on every
# engine-affecting merge, and a re-run of the same corpus sha rewrites knowledge/<sha>/.
# GCS has no overwrite-without-delete role, so a mutable object needs delete.
#
# What the condition buys: versions/ and games/ — every stored and published game — are
# outside it, so a compromised publish job cannot touch a single player-visible game.
# IAM CEL on resource.name allows only startsWith/endsWith/extract, hence the disjunction.
PUBLISH_PREFIX_EXPR=""
for PREFIX in kits workspaces examples knowledge; do
  [ -n "$PUBLISH_PREFIX_EXPR" ] && PUBLISH_PREFIX_EXPR="${PUBLISH_PREFIX_EXPR} || "
  PUBLISH_PREFIX_EXPR="${PUBLISH_PREFIX_EXPR}resource.name.startsWith('projects/_/buckets/${STORE_BUCKET}/objects/${PREFIX}/')"
done
gcloud storage buckets add-iam-policy-binding "gs://${STORE_BUCKET}" \
  --member="serviceAccount:${PUBLISHER_SA_EMAIL}" \
  --role="roles/storage.objectAdmin" \
  --condition="expression=resource.type == 'storage.googleapis.com/Object' && (${PUBLISH_PREFIX_EXPR}),title=games-store-kit-publish,description=Only the kit workspace example and knowledge prefixes — never versions/ or games/" \
  --project="$PROJECT_ID" \
  >/dev/null

# The publishers also list the bucket to resolve current.json, which is a bucket-level
# permission a per-object condition cannot express.
gcloud storage buckets add-iam-policy-binding "gs://${STORE_BUCKET}" \
  --member="serviceAccount:${PUBLISHER_SA_EMAIL}" \
  --role="roles/storage.legacyBucketReader" \
  --condition=None \
  --project="$PROJECT_ID" \
  >/dev/null

# The one grant that is not narrowed: documents:import for the knowledge_query corpus.
# Discovery Engine's predefined roles are project-scoped, so this is editor on the
# project's data stores. It is the same role the deployer already held, not a widening,
# and it reaches no game data — the corpus is assembled from public repo files.
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${PUBLISHER_SA_EMAIL}" \
  --role="roles/discoveryengine.editor" \
  --condition=None \
  >/dev/null

# documents:import sends X-Goog-User-Project, and a quota-project request needs
# serviceusage.services.use on top of the API's own role — the same pairing setup-gcp.sh
# documents for the runtime. Without it the import 403s the moment the workflows switch
# identities, and the corpus silently stops being rebuilt.
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${PUBLISHER_SA_EMAIL}" \
  --role="roles/serviceusage.serviceUsageConsumer" \
  --condition=None \
  >/dev/null

echo "==> 5c/8 Binding '${GAMES_REPO}' to ${PUBLISHER_SA_NAME}"
gcloud iam service-accounts add-iam-policy-binding "$PUBLISHER_SA_EMAIL" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/${POOL_ID}/attribute.repository/${GAMES_REPO}" \
  --project="$PROJECT_ID" \
  >/dev/null

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
# document in Firestore is the absence of a binding here. Do not add it to step 5c.
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
echo ""
echo "The games repo's publish-kit / publish-examples / publish-knowledge must name:"
echo "    service_account: ${PUBLISHER_SA_EMAIL}"
echo "Step 5 has already taken that repo off ${SA_NAME}, so a workflow there still"
echo "naming the deployer will fail to authenticate until it is switched."
