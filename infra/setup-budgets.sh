#!/usr/bin/env bash
#
# Declares the billing budgets that pull the spend brake.
# OWNER-RUN: needs `gcloud` authenticated as someone with billing.budgets.* on the
# billing account. The deploy identity has project roles, not billing-account roles,
# so this cannot join a workflow the way the sweeps did.
#
# Separate from setup-spend-brake.sh because the resources live somewhere else: that
# script owns everything under the *project* (topic, subscription, service accounts,
# alert policies), while a budget belongs to the *billing account* and outlives any
# project in it. Both are needed for the brake to work; neither implies the other.
#
# Why a script rather than the console: the budgets configured by hand on 2026-09-07
# existed nowhere in the repo, so nothing recorded which display name pulls which lane
# — and the display name is load-bearing. `lanes=` in the name is how a per-service
# budget tells the brake what to pause (apps/api/src/platform/spend-brake.ts), and it
# reaches the admin console as `updatedBy`. A name edited in the console silently
# changes what an overrun stops.
#
# What a budget without `lanes=` does instead: the brake grades it by how far over the
# budget is — forecast past 100% stops the platform agent, spent past 100% adds round-0
# seeding and the gate, spent past 150% stops everything. That is the shape for a total
# budget; a per-service budget should name its lanes.
#
# Usage:
#   set -a; . ../www.gamedev.pl-ops/infra/budgets.env; set +a
#   ./infra/setup-budgets.sh
#
# That file holds BILLING_ACCOUNT and one BUDGET_* amount per budget below. It is in the
# ops repo because it is a statement about money, not about how the system works.
#
# Idempotent: a budget is matched by display name, then created or updated in place.

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-gamedevpl}"
# No default: the account id and the amounts are commercial facts, and this repo is
# public. Both live in the ops repo; see infra/README.md.
BILLING_ACCOUNT="${BILLING_ACCOUNT:?set BILLING_ACCOUNT (see the ops repo)}"
TOPIC="${TOPIC:-spend-brake}"
TOPIC_PATH="projects/${PROJECT_ID}/topics/${TOPIC}"
# A budget filter names the project by number; the id is rejected.
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"

# Billing service ids, from `gcloud billing services list`. They are stable per service
# and unrelated to the API names, so they are pinned here rather than looked up.
SVC_VERTEX='services/C7E2-9256-1C43'
SVC_GEMINI='services/AEFD-7695-64FA'
SVC_CLOUD_BUILD='services/8B5D-EF7D-EB12'
SVC_CLOUD_RUN='services/152E-C115-5142'
SVC_HOSTING='services/2662-232A-AC11'

# display name | amount env var | services (empty = whole account) | brake (yes/no) | thresholds
#
# The amounts are read from the environment rather than written here: what the business
# is willing to spend per service is not a fact this public repo should carry. The
# structure is — which budget pauses which lane is engineering, and belongs next to the
# brake that reads it.
#
# An empty services column means the whole billing account, project filter included:
# that is what a total is. The rest are scoped to this project and those services.
#
# `Cloud Run` and `Firebase Hosting egress` deliberately do NOT notify the brake.
# Pausing creation lanes cannot reduce the cost of serving traffic that is already
# arriving, and a budget with no `lanes=` in its name would be graded by the ladder —
# stopping the agent because egress went up would be the wrong lever entirely.
BUDGETS=(
  "Total monthly|BUDGET_TOTAL||yes|percent=0.5 percent=0.9 percent=1.0 percent=1.5 percent=1.0,basis=forecasted-spend"
  "Vertex + Gemini lanes=seeding_managed|BUDGET_MODEL|${SVC_VERTEX},${SVC_GEMINI}|yes|percent=1.0 percent=1.0,basis=forecasted-spend"
  "Cloud Build lanes=gate|BUDGET_GATE|${SVC_CLOUD_BUILD}|yes|percent=1.0 percent=1.0,basis=forecasted-spend"
  "Cloud Run|BUDGET_RUN|${SVC_CLOUD_RUN}|no|percent=0.9 percent=1.0"
  "Firebase Hosting egress|BUDGET_HOSTING|${SVC_HOSTING}|no|percent=0.5 percent=0.9 percent=1.0"
)

for entry in "${BUDGETS[@]}"; do
  IFS='|' read -r display amount_var services brake thresholds <<<"$entry"
  # Indirect expansion: the entry names the variable, the environment holds the value.
  amount="${!amount_var:?set ${amount_var} (amount with currency, e.g. 100PLN)}"

  common=(--billing-account="$BILLING_ACCOUNT")
  if [[ -n "$services" ]]; then
    common+=(--filter-projects="projects/${PROJECT_NUMBER}" --filter-services="$services")
  fi
  [[ "$brake" == 'yes' ]] && common+=(--notifications-rule-pubsub-topic="$TOPIC_PATH")

  # `--format=value(name)` returns the full resource path; the id is its last segment.
  existing="$(gcloud billing budgets list \
    --billing-account="$BILLING_ACCOUNT" \
    --filter="displayName=\"${display}\"" \
    --format='value(name)' 2>/dev/null | head -n1)"

  if [[ -n "$existing" ]]; then
    # `update` names these differently from `create`, and takes no currency: the
    # currency is fixed when the budget is made and cannot be changed afterwards.
    # `--clear-threshold-rules` rides in the same call as the adds, so the budget is
    # never briefly left with no thresholds at all.
    args=("${common[@]}" --budget-amount="${amount%%[A-Z][A-Z][A-Z]}" --clear-threshold-rules)
    for rule in $thresholds; do args+=(--add-threshold-rule="$rule"); done
    gcloud billing budgets update "${existing##*/}" "${args[@]}" >/dev/null
    echo "    updated  ${display}"
  else
    args=("${common[@]}" --display-name="$display" --budget-amount="$amount")
    for rule in $thresholds; do args+=(--threshold-rule="$rule"); done
    gcloud billing budgets create "${args[@]}" >/dev/null
    echo "    created  ${display}"
  fi
done

cat <<EOF

Done. The brake reads a budget's display name, so renaming one in the console changes
what its overrun pauses. Edit BUDGETS above instead.

A budget notifies the brake only once per billing period per threshold: the handled ids
(name, interval, basis, ratio) are kept on opsConfig/creationLimits. Resuming a lane in
the admin console therefore stands for the rest of the month.
EOF
