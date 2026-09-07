#!/usr/bin/env bash
#
# Wires the spend alerts to the brake, so a runaway is bounded by a minute rather than
# by how quickly somebody reads their email.
# OWNER-RUN: needs `gcloud` authenticated against the project.
#
# The pieces already existed and were not connected. A24/A25/A26 detect Vertex and
# Discovery Engine runaways; the pause flags in `opsConfig/creationLimits` stop the
# lanes within the readers' TTL and need no deploy. Nothing published one to the other,
# so the 2026-08-04 leak ran for a day and was found in the billing console.
#
# What this creates:
#   1. a Pub/Sub topic the alert policies notify
#   2. a Monitoring notification channel pointing at that topic
#   3. a push subscription that POSTs each notification to /api/internal/spend-brake
#      with an OIDC token, audience-pinned to that URL
#   4. the channel attached to the policies named in POLICIES below
#
# What it deliberately does not do: un-pause anything, ever. Resuming is a human
# decision made in the admin console, because "the alert stopped firing" and "the cause
# is understood" are different statements.
#
# Usage:
#   ./infra/setup-spend-brake.sh
#   PROJECT_ID=… HOST=… ./infra/setup-spend-brake.sh
#
# After running it, set SPEND_BRAKE_AUDIENCE and SPEND_BRAKE_CALLER_SA on the service
# (both are in infra/env-manifest.json, so the deploy paths already thread them) and
# redeploy. The brake has its own caller variable on purpose: NOTIFY_SWEEP_SA is the
# scheduler identity every sweep authenticates against, and overwriting it here to make
# the brake work would quietly close the sweeps instead.
# Until the audience is set the endpoint answers 401 to everything, which is the right
# default for a route that can pause the product.

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-gamedevpl}"
HOST="${HOST:-www.gamedev.pl}"
TOPIC="${TOPIC:-spend-brake}"
SUBSCRIPTION="${SUBSCRIPTION:-spend-brake-push}"
CHANNEL_NAME="${CHANNEL_NAME:-Spend brake}"
# Its own identity: this caller is a Pub/Sub push subscription, and the one thing it can
# do is pause lanes. Nothing else should gain that by being a scheduler job.
INVOKER_SA="${INVOKER_SA:-spend-brake@${PROJECT_ID}.iam.gserviceaccount.com}"
BRAKE_URL="https://${HOST}/api/internal/spend-brake"

# Which policies pull which lanes. A policy pauses only what its own runaway can be
# spending — A26 is Discovery Engine, reached from the agent channel and the seeder, so
# pausing creation there would stop far more than the thing that is leaking.
#
#   policy display name (exact, as setup-monitoring.sh names it) | lanes
#
# Lanes are lowercase because a GCP label value cannot hold a capital letter; the
# brake matches them case-insensitively (`tabcomplete` pauses tabComplete).
POLICIES=(
  "A24 Vertex call volume abnormally high|creation,editing,chat,tabcomplete,search,seeding"
  "A25 Vertex output token rate abnormally high|creation,editing,chat,tabcomplete,search,seeding"
  "A26 knowledge_query daily volume abnormally high|creation"
)

echo "==> 1/4 Pub/Sub topic ${TOPIC}"
gcloud pubsub topics describe "$TOPIC" --project "$PROJECT_ID" >/dev/null 2>&1 ||
  gcloud pubsub topics create "$TOPIC" --project "$PROJECT_ID"

# Monitoring publishes as its own service agent; without this the channel is created
# and then silently never delivers. The agent does not exist until something asks for
# it, and the binding below fails on a missing member — so ask first (idempotent).
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
MONITORING_SA="service-${PROJECT_NUMBER}@gcp-sa-monitoring-notification.iam.gserviceaccount.com"
gcloud beta services identity create --service=monitoring.googleapis.com --project "$PROJECT_ID" >/dev/null
gcloud pubsub topics add-iam-policy-binding "$TOPIC" \
  --project "$PROJECT_ID" \
  --member="serviceAccount:${MONITORING_SA}" \
  --role='roles/pubsub.publisher' >/dev/null

# Billing budgets publish as one global agent. With this the monthly budget can name
# the same topic, and a 100% threshold — spent or forecast — pulls every lane.
gcloud pubsub topics add-iam-policy-binding "$TOPIC" \
  --project "$PROJECT_ID" \
  --member='serviceAccount:billing-budget-alert@system.gserviceaccount.com' \
  --role='roles/pubsub.publisher' >/dev/null

echo "==> 2/4 Notification channel"
CHANNEL_ID="$(gcloud beta monitoring channels list \
  --project "$PROJECT_ID" \
  --filter="displayName=\"${CHANNEL_NAME}\"" \
  --format='value(name)' | head -n1)"
if [[ -z "$CHANNEL_ID" ]]; then
  CHANNEL_ID="$(gcloud beta monitoring channels create \
    --project "$PROJECT_ID" \
    --display-name="$CHANNEL_NAME" \
    --type=pubsub \
    --channel-labels="topic=projects/${PROJECT_ID}/topics/${TOPIC}" \
    --format='value(name)')"
fi
echo "    ${CHANNEL_ID}"

echo "==> 3/4 Push subscription -> ${BRAKE_URL}"
# Created here rather than assumed: the subscription and the service must agree on one
# identity, and an SA that does not exist yet fails at push time, not at setup time.
INVOKER_ID="${INVOKER_SA%%@*}"
if [[ "$INVOKER_SA" == *"@${PROJECT_ID}.iam.gserviceaccount.com" ]]; then
  gcloud iam service-accounts describe "$INVOKER_SA" --project "$PROJECT_ID" >/dev/null 2>&1 ||
    gcloud iam service-accounts create "$INVOKER_ID" \
      --project "$PROJECT_ID" \
      --display-name="Spend brake push caller"
fi
# Pub/Sub mints the push token as its own service agent, which needs leave to act as
# the caller. Without this the subscription is created and every push fails quietly.
# Granted on this one account, not the project.
gcloud iam service-accounts add-iam-policy-binding "$INVOKER_SA" \
  --project "$PROJECT_ID" \
  --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-pubsub.iam.gserviceaccount.com" \
  --role='roles/iam.serviceAccountTokenCreator' >/dev/null
# The audience is the endpoint's own URL, so a token minted for this subscription
# cannot be replayed against any other internal route.
if gcloud pubsub subscriptions describe "$SUBSCRIPTION" --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud pubsub subscriptions update "$SUBSCRIPTION" \
    --project "$PROJECT_ID" \
    --push-endpoint="$BRAKE_URL" \
    --push-auth-service-account="$INVOKER_SA" \
    --push-auth-token-audience="$BRAKE_URL"
else
  gcloud pubsub subscriptions create "$SUBSCRIPTION" \
    --project "$PROJECT_ID" \
    --topic="$TOPIC" \
    --push-endpoint="$BRAKE_URL" \
    --push-auth-service-account="$INVOKER_SA" \
    --push-auth-token-audience="$BRAKE_URL" \
    --ack-deadline=30 \
    --min-retry-delay=10s \
    --max-retry-delay=600s
fi

echo "==> 4/4 Attaching the channel to the spend policies"
for entry in "${POLICIES[@]}"; do
  display="${entry%%|*}"
  lanes="${entry##*|}"
  policy="$(gcloud alpha monitoring policies list \
    --project "$PROJECT_ID" \
    --filter="displayName=\"${display}\"" \
    --format='value(name)' | head -n1)"
  if [[ -z "$policy" ]]; then
    echo "    SKIP ${display} — not found. Run infra/setup-monitoring.sh first."
    continue
  fi
  # The lanes ride as a user label so the brake reads intent from the policy rather
  # than parsing its display name. Changing what a policy pauses is an edit here.
  # Added, never set: these policies also email the operator, and the brake is a
  # second listener, not a replacement for the human one.
  gcloud alpha monitoring policies update "$policy" \
    --project "$PROJECT_ID" \
    --add-notification-channels="$CHANNEL_ID" \
    --update-user-labels="lanes=${lanes//,/_}" >/dev/null
  echo "    ${display} -> ${lanes}"
done

cat <<EOF

Done. Two things left, both on the service rather than here:

  SPEND_BRAKE_AUDIENCE=${BRAKE_URL}
  SPEND_BRAKE_CALLER_SA=${INVOKER_SA}

Until the audience is set the endpoint refuses everything, so the brake is armed only
after the next deploy. Verify by publishing a test notification:

  gcloud pubsub topics publish ${TOPIC} --project ${PROJECT_ID} \\
    --message='{"incident":{"state":"OPEN","incident_id":"test","policy_user_labels":{"lanes":"search"}}}'

then check searchPaused in the admin console and clear it there. Note the label
separator: gcloud user labels cannot hold commas, so the brake accepts '_' as well.

The monthly billing budget is the second publisher. Point it at the topic once
(billing is account-scoped, so this is not done here):

  gcloud billing budgets update BUDGET_ID --billing-account ACCOUNT_ID \\
    --notifications-rule-pubsub-topic=projects/${PROJECT_ID}/topics/${TOPIC}

Any threshold at 100% — spent or forecast — then pauses every lane; ticks under
that are acknowledged silently.
EOF
