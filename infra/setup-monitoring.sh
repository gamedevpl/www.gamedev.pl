#!/usr/bin/env bash
#
# The alerting floor: an uptime check and the alert policies that decide whether a night
# of 5xx — or a zone host quietly turning every player away — is discovered by monitoring
# or by a user.
# OWNER-RUN: needs `gcloud` authenticated against the project.
#
# Usage:
#   ALERT_EMAIL=you@example.com ./infra/setup-monitoring.sh                     # the app
#   ALERT_EMAIL=… SERVICE=gamedev-mp-relay ./infra/setup-monitoring.sh          # + a second service
#
# Override via env: PROJECT_ID, REGION, SERVICE, PRIMARY_SERVICE, WORLD_SERVICE, HOST,
# HEALTH_PATH, ALERT_EMAIL, BACKUP_BUCKET.
#
# **Run it once per service that answers HTTP requests.** A1 (uptime) and A2 (5xx) are
# per-service; a service nobody ran this for is unmonitored by construction, which is how
# the party relay would have gone live. Everything else — A3/A4 (scheduler jobs) and
# A6/A7 (the world service, which names itself through WORLD_SERVICE) — is project-wide
# and is written only on the PRIMARY_SERVICE run, so a second service does not get
# duplicate copies of them.
#
# The world service is the exception in the other direction: do NOT onboard it with
# SERVICE=, and see the guard below for why.
#
# What this deliberately is and is not:
#
#   It is GCP-native and email-only. One operator, no rotation, no PagerDuty — the
#   response-time expectation is hours, not minutes, and the SLO is written to match.
#   Adding a vendor here would cost a bill and a DPA to tell us the same things.
#
#   The bar for a policy living in this file: would the operator act on it within a day?
#   Anything else belongs on a dashboard, not in an inbox. An alert nobody acts on
#   trains the operator to ignore the channel, which is worse than not having it.
#
# Idempotent: policies are matched by display name and updated rather than duplicated.
# Every per-service display name carries the service, so a second service *adds* policies
# instead of overwriting the first service's — which is what matching on a
# service-agnostic name ("A1 site down …") would have done.
set -euo pipefail

# gcloud asks for confirmation on stderr — including "you do not have this command group
# installed, continue?" for alpha/beta. A script that redirects stderr then waits on stdin
# forever, showing nothing: this script hung on step 2 for exactly that reason. Prompts off
# means every gcloud call below either works or fails, and never waits.
export CLOUDSDK_CORE_DISABLE_PROMPTS=1

# Neither command group used here is GA — notification channels live in `gcloud beta`,
# alert policies in `gcloud alpha`. Probe both up front so a missing component is one clear
# line in the first second rather than a mystery several steps in. Probing beats parsing
# `gcloud components list`, which is disabled entirely on package-manager installs.
for GROUP in alpha beta; do
  if ! gcloud "$GROUP" monitoring --help >/dev/null 2>&1; then
    echo "Error: the gcloud '${GROUP}' component is required but not available." >&2
    echo "  gcloud components install alpha beta" >&2
    echo "If gcloud came from apt/yum, install its matching -alpha and -beta packages." >&2
    exit 1
  fi
done

PROJECT_ID="${PROJECT_ID:-gamedevpl}"
REGION="${REGION:-europe-west1}"
SERVICE="${SERVICE:-gamedev-app}"
# The service that owns the project-wide policies (A3/A4/A6/A7) and answers on the domain.
PRIMARY_SERVICE="${PRIMARY_SERVICE:-gamedev-app}"
WORLD_SERVICE="${WORLD_SERVICE:-gamedev-world}"
HEALTH_PATH="${HEALTH_PATH:-/api/health}"
BACKUP_BUCKET="${BACKUP_BUCKET:-${PROJECT_ID}-firestore-backups}"
: "${ALERT_EMAIL:?set ALERT_EMAIL to the address that should receive alerts}"

# The world service is watched by A6/A7 and deliberately has no uptime check: a probe
# every five minutes keeps a scale-to-zero service warm around the clock, which converts
# \$0 at rest into roughly \$65/month to learn whether something nobody is using is up
# (docs/p3-zone-host-infra.md). Running this per-service for it would quietly undo that
# decision *and* duplicate A7 under an A2 name, so it is refused rather than warned about.
if [ "$SERVICE" = "$WORLD_SERVICE" ]; then
  echo "Refusing to onboard '${SERVICE}' per-service: it is covered by A6/A7 from the" >&2
  echo "'${PRIMARY_SERVICE}' run, without an uptime check on purpose. See the note above." >&2
  exit 1
fi

# The primary service answers on the domain; anything else is probed on its own Cloud Run
# hostname, resolved here so adding a service is one variable rather than two.
if [ -z "${HOST:-}" ]; then
  if [ "$SERVICE" = "$PRIMARY_SERVICE" ]; then
    HOST="www.gamedev.pl"
  else
    HOST="$(gcloud run services describe "$SERVICE" \
      --region "$REGION" --project "$PROJECT_ID" \
      --format='value(status.url)' 2>/dev/null | sed -e 's#^https://##' -e 's#^http://##')"
    if [ -z "$HOST" ]; then
      echo "Could not resolve a URL for service '${SERVICE}' in ${REGION}. Set HOST= explicitly." >&2
      exit 1
    fi
  fi
fi

echo "==> Target: service '${SERVICE}' on https://${HOST}${HEALTH_PATH}"
if [ "$SERVICE" = "$PRIMARY_SERVICE" ]; then
  echo "    Primary service — the project-wide policies (A3, A4, A6, A7) are included."
else
  echo "    Secondary service — A1/A2 only; the rest belong to '${PRIMARY_SERVICE}'."
fi

echo "==> 1/4 Enabling the Monitoring API"
gcloud services enable monitoring.googleapis.com --project "$PROJECT_ID"

echo "==> 2/4 Ensuring the email notification channel"
# Both literals are quoted because this filter is evaluated by the Monitoring API, not by
# gcloud: an unquoted right-hand side there is a *field reference*, so `type=email` is
# rejected as an ambiguous field named "email" rather than read as the string. The two
# `displayName='…'` filters further down are client-side and were already quoted.
#
# This is the call the script's idempotence rests on — a filter that errors means it can
# no longer find the channel it created on the previous run — so it fails loudly rather
# than being wrapped in something that would let a broken filter look like "no channel".
CHANNEL_NAME="$(gcloud beta monitoring channels list \
  --project "$PROJECT_ID" \
  --filter="type=\"email\" AND labels.email_address=\"${ALERT_EMAIL}\"" \
  --format='value(name)' | head -n 1)"
if [ -z "$CHANNEL_NAME" ]; then
  CHANNEL_NAME="$(gcloud beta monitoring channels create \
    --project "$PROJECT_ID" \
    --display-name="Ops email" \
    --type=email \
    --channel-labels="email_address=${ALERT_EMAIL}" \
    --format='value(name)')"
  echo "    Created channel ${CHANNEL_NAME}."
else
  echo "    Channel already exists."
fi

echo "==> 3/4 Ensuring the uptime check on https://${HOST}${HEALTH_PATH}"
# /api/health is the right probe target precisely because it is not walled: it answers
# 200 without a session, so a failure means the service is genuinely unreachable rather
# than that the beta gate did its job. Checking a walled route would alert on 401 or,
# worse, teach us to ignore the alert that fires every time.
#
# The name carries the service: one check per service, and A1 below is scoped to this
# check's id so a second service's outage cannot be reported as the first one's.
UPTIME_DISPLAY="${SERVICE} health"
UPTIME_NAME="$(gcloud monitoring uptime list-configs \
  --project "$PROJECT_ID" \
  --filter="displayName='${UPTIME_DISPLAY}'" \
  --format='value(name)' | head -n 1)"
if [ -z "$UPTIME_NAME" ]; then
  gcloud monitoring uptime create "$UPTIME_DISPLAY" \
    --project "$PROJECT_ID" \
    --resource-type=uptime-url \
    --resource-labels="host=${HOST},project_id=${PROJECT_ID}" \
    --path="$HEALTH_PATH" \
    --port=443 \
    --protocol=https \
    --period=5 \
    --timeout=10 \
    >/dev/null
  echo "    Created (5-minute cadence from multiple regions)."
  UPTIME_NAME="$(gcloud monitoring uptime list-configs \
    --project "$PROJECT_ID" \
    --filter="displayName='${UPTIME_DISPLAY}'" \
    --format='value(name)' | head -n 1)"
else
  echo "    Uptime check already exists."
fi
# The check_id is the last segment of the config's resource name, and it is the only
# thing that ties a check_passed time series back to one service.
CHECK_ID="${UPTIME_NAME##*/}"
if [ -z "$CHECK_ID" ]; then
  echo "Could not resolve the uptime check id for '${UPTIME_DISPLAY}'." >&2
  exit 1
fi
echo "    check_id=${CHECK_ID}"

echo "==> 4/4 Ensuring log-based metrics and alert policies"
POLICY_DIR="$(mktemp -d)"
trap 'rm -rf "$POLICY_DIR"' EXIT

# A1 — the site is down. Multi-region agreement is what separates "Cloud Run is gone"
# from "one prober had a bad minute", which is why the uptime check fans out and this
# policy waits for 300s of sustained failure before it speaks.
#
# Scoped to this service's check_id. Without that the condition matches *every* uptime
# check in the project, so a second service's policy would fire on the first service's
# outage and both would say the same, wrong thing about which service is down.
cat > "${POLICY_DIR}/a1.json" <<EOF
{
  "displayName": "A1 ${SERVICE} site down (uptime check failing)",
  "combiner": "OR",
  "conditions": [{
    "displayName": "uptime check failing for 5 minutes",
    "conditionThreshold": {
      "filter": "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND resource.type=\"uptime_url\" AND metric.label.\"check_id\"=\"${CHECK_ID}\"",
      "aggregations": [{
        "alignmentPeriod": "300s",
        "perSeriesAligner": "ALIGN_FRACTION_TRUE",
        "crossSeriesReducer": "REDUCE_MEAN"
      }],
      "comparison": "COMPARISON_LT",
      "thresholdValue": 0.4,
      "duration": "300s",
      "trigger": { "count": 1 }
    }
  }],
  "notificationChannels": ["${CHANNEL_NAME}"],
  "alertStrategy": { "autoClose": "86400s" },
  "documentation": {
    "content": "https://${HOST}${HEALTH_PATH} (service ${SERVICE}) is failing from most probers. Triage: docs/runbooks/site-down-triage.md",
    "mimeType": "text/markdown"
  }
}
EOF

# A2 — 5xx rate. Scale-to-zero means low absolute traffic, where a *ratio* alone is
# noise: two errors out of three requests at 04:00 is 66% and means nothing. Hence a
# rate condition rather than a ratio, tuned to fire on a broken deploy (which errors
# continuously) and stay quiet for the occasional one-off.
cat > "${POLICY_DIR}/a2.json" <<EOF
{
  "displayName": "A2 ${SERVICE} Cloud Run 5xx rate elevated",
  "combiner": "OR",
  "conditions": [{
    "displayName": "5xx responses sustained over 10 minutes",
    "conditionThreshold": {
      "filter": "metric.type=\"run.googleapis.com/request_count\" AND resource.type=\"cloud_run_revision\" AND resource.label.\"service_name\"=\"${SERVICE}\" AND metric.label.\"response_code_class\"=\"5xx\"",
      "aggregations": [{
        "alignmentPeriod": "600s",
        "perSeriesAligner": "ALIGN_RATE",
        "crossSeriesReducer": "REDUCE_SUM"
      }],
      "comparison": "COMPARISON_GT",
      "thresholdValue": 0.03,
      "duration": "600s",
      "trigger": { "count": 1 }
    }
  }],
  "notificationChannels": ["${CHANNEL_NAME}"],
  "alertStrategy": { "autoClose": "86400s" },
  "documentation": {
    "content": "Sustained 5xx from ${SERVICE}. Most likely: a bad deploy, the snapshot bucket unreachable (published play now 503s rather than falling back), or Firestore. Triage: docs/runbooks/site-down-triage.md",
    "mimeType": "text/markdown"
  }
}
EOF

# A3, A4, A6 and A7 are project-wide: A3/A4 watch Cloud Scheduler jobs, and A6/A7 name
# the world service through WORLD_SERVICE rather than deriving it from SERVICE. All four
# are written only on the primary run. Duplicating them per service would mean N identical
# emails for one failed job, which is how an operator learns to filter the channel; their
# display names stay service-free for the same reason.
# (Heredoc bodies are left unindented: EOF must start the line.)
if [ "$SERVICE" = "$PRIMARY_SERVICE" ]; then

# A3 and A4 are built on log-based metrics, because **Cloud Scheduler emits no monitoring
# metrics in this project at all.** The first real run of this script died here on
# `cloudscheduler.googleapis.com/job/attempt_count`, and the cause was not the label the
# error named: a sweep of all 8,657 metric descriptors visible to the project found no
# `cloudscheduler.googleapis.com/*` metric whatsoever, so no condition over that metric
# could ever have fired. The pre-existing A3/A4 were unarmed by construction.
#
# What Cloud Scheduler does emit is logs, on `resource.type="cloud_scheduler_job"`: an
# AttemptStarted and an AttemptFinished per run, with the outcome in `httpRequest.status`
# and failures at severity ERROR. Both filters below were checked against this project's
# real log history — the ERROR one matches the notify-sweep 401 storm of 2026-07-24, and
# the success one matches notify-sweep's current 200s.
#
# Counting metrics rather than log-match conditions, deliberately: a log-match alert fires
# on the *first* entry, and A3's whole design is that one failed attempt of a job that runs
# every two minutes is not an email. A counter keeps the "more than two in fifteen minutes"
# threshold that made it worth having.
ensure_log_metric() {
  local NAME="$1" DESC="$2" FILTER="$3"
  # A probe, so this redirect is the same shape as the alpha/beta check above rather than
  # the kind #345 removed: a NOT_FOUND here is the answer, not a hidden failure.
  if gcloud logging metrics describe "$NAME" --project "$PROJECT_ID" >/dev/null 2>&1; then
    gcloud logging metrics update "$NAME" \
      --project "$PROJECT_ID" \
      --description="$DESC" \
      --log-filter="$FILTER" \
      >/dev/null
    echo "    Updated log metric: ${NAME}"
  else
    gcloud logging metrics create "$NAME" \
      --project "$PROJECT_ID" \
      --description="$DESC" \
      --log-filter="$FILTER" \
      >/dev/null
    echo "    Created log metric: ${NAME}"
  fi
}

ensure_log_metric scheduler_job_errors \
  'Failed Cloud Scheduler attempts, any job. Backs alert A3.' \
  'resource.type="cloud_scheduler_job" AND severity>=ERROR'

# Counted on the *workflow execution*, not on Cloud Scheduler's HTTP status. Scheduler
# now only asks for an execution to start, so its 200 arrives long before the export does
# and would be returned even by a run that then failed — an A4 built on it would be green
# by construction. The workflow polls the export to a terminal state and fails the
# execution if the operation carries an error, so SUCCEEDED here means the export finished.
ensure_log_metric firestore_export_succeeded \
  'Completed Firestore export workflow executions. Backs alert A4.' \
  'resource.type="workflows.googleapis.com/Workflow" AND resource.labels.workflow_id="firestore-export" AND jsonPayload.state="SUCCEEDED"'

# Moderation rejections (docs/content-safety-plan.md slice 2). Every content-safety layer was
# built and then never observed: a rejection returned a 422 and evaporated, so nobody could
# tell a deny-list that was working from one that had stopped being called.
#
# Scoped to the app service, not the project. The relay and the zone host run the same image
# and moderate nothing, but a project-wide filter would include them by default — and a
# filter whose scope is wider than its meaning is how a metric quietly starts counting
# something else.
#
# The message string is the contract with apps/api/src/moderation-metrics.ts, asserted from
# both sides by moderation-metrics.test.ts. A filter that matches nothing yields a metric
# that is always zero, which reads exactly like "no abuse" — the one wrong answer this whole
# metric exists to avoid giving.
ensure_log_metric moderation_rejections \
  'Content rejected by moderation, any surface. Backs alert A14.' \
  "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${PRIMARY_SERVICE}\" AND jsonPayload.msg=\"moderation rejected\""

# knowledge_query calls (KQ-10). The message string is the contract with
# apps/api/src/knowledge-metrics.ts, asserted from both sides by knowledge-metrics.test.ts.
# Backs A26 below: a cost-runaway guard on the SEARCH_ADD_ON_LLM generative add-on, which is
# billed per :answer call and is not covered by the platform's free 10k/month allotment.
ensure_log_metric knowledge_query_calls \
  'knowledge_query calls, any mode. Backs alert A26.' \
  "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${PRIMARY_SERVICE}\" AND jsonPayload.msg=\"knowledge_query answered\""

# The in-process tsc preflight (typecheck-preflight.ts) abandons a check that ran past its
# soft wall and accepts the delivery unvalidated rather than blocking the agent — the same
# fail-open shape as everywhere else in this pipeline. One skip is a heavy round (a big
# GameKit surface, a slow instance); a *pattern* of skips means the budget itself is wrong
# for what real games need, and nobody would otherwise notice, because a skip looks exactly
# like a pass from the delivery's own response. Backs A27.
ensure_log_metric typecheck_preflight_skipped \
  'Typecheck preflight abandoned past its time budget (delivered unvalidated). Backs alert A27.' \
  "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${PRIMARY_SERVICE}\" AND jsonPayload.msg=\"typecheck preflight skipped: budget exceeded\""

# Our own gate build died before writing any verdict, found by reading the build back
# (apps/api/src/gate-crash.ts). Deliberately NOT keyed on Cloud Build failure: a red gate
# also exits non-zero, so that signal fires on every legitimately failing game and would
# be ignored within a day. This only counts builds that produced no verdict at all, which
# is always our fault and never the creator's. Backs A28.
ensure_log_metric gate_build_crashed \
  'Gate build finished with no verdict written (platform fault). Backs alert A28.' \
  "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${PRIMARY_SERVICE}\" AND jsonPayload.msg=\"delivery gate crashed\""

# A3 — a scheduled job is failing. notify-sweep already runs every 2 minutes against auth,
# Firestore and the app in one request, which makes it a synthetic monitor we are getting
# for free; all that was missing was anyone listening. Its failure is also a real
# user-facing outage (creators stop being notified) even when every page still loads.
cat > "${POLICY_DIR}/a3.json" <<EOF
{
  "displayName": "A3 notify-sweep failing",
  "combiner": "OR",
  "conditions": [{
    "displayName": "scheduler job failing repeatedly",
    "conditionThreshold": {
      "filter": "metric.type=\"logging.googleapis.com/user/scheduler_job_errors\" AND resource.type=\"cloud_scheduler_job\"",
      "aggregations": [{
        "alignmentPeriod": "900s",
        "perSeriesAligner": "ALIGN_SUM",
        "crossSeriesReducer": "REDUCE_SUM",
        "groupByFields": ["resource.label.\"job_id\""]
      }],
      "comparison": "COMPARISON_GT",
      "thresholdValue": 2,
      "duration": "0s",
      "trigger": { "count": 1 }
    }
  }],
  "notificationChannels": ["${CHANNEL_NAME}"],
  "alertStrategy": { "autoClose": "86400s" },
  "documentation": {
    "content": "A scheduled job is failing. Covers notify-sweep (creator notifications) and firestore-daily-export (backups) — check which job_id fired.",
    "mimeType": "text/markdown"
  }
}
EOF

# A4 — the backup watching itself. A silently broken export is indistinguishable from a
# working one until the day it is needed, which is the worst possible day to find out.
#
# Measured on the export workflow's own *successful* executions, not on bucket activity:
# the GCS request_count metric counts reads too, so an operator running `gcloud storage ls`
# to check on backups would suppress the very alert that tells them backups stopped —
# and the restore runbook tells them to run exactly that. This also complements A3
# rather than duplicating it: A3 catches a job that runs and fails, while absence
# catches a job that is paused, deleted, or never scheduled, where there are no failed
# attempts to count because there are no attempts at all.
#
# **An absence condition needs a time series that once existed.** A log-based metric with
# no matching entries has no series at all, and absence over nothing does not fire — so
# this policy is inert until the export job succeeds once, and only becomes real
# protection after `setup-backups.sh` has run and one export has landed. That ordering is
# printed at the end of this script rather than left as folklore.
#
# The window is 23h30m rather than the 36h this asked for originally, because that is the
# API's hard ceiling ("Durations longer than 23h30m are not supported"). Which is why
# setup-backups.sh exports **twice** a day: against a single daily export, any window
# shorter than 24h elapses between two perfectly healthy runs and emails every morning.
# Two runs 12h apart mean 23h30m of silence takes two consecutive failures — the same
# "tolerate one hiccup" behaviour 36h was chosen for. The two files are coupled here; if
# the export goes back to daily, this fires after a single miss.
cat > "${POLICY_DIR}/a4.json" <<EOF
{
  "displayName": "A4 no successful Firestore export",
  "combiner": "OR",
  "conditions": [{
    "displayName": "export has not succeeded in 23h30m",
    "conditionAbsent": {
      "filter": "metric.type=\"logging.googleapis.com/user/firestore_export_succeeded\" AND resource.type=\"workflows.googleapis.com/Workflow\"",
      "aggregations": [{
        "alignmentPeriod": "3600s",
        "perSeriesAligner": "ALIGN_SUM",
        "crossSeriesReducer": "REDUCE_SUM"
      }],
      "duration": "84600s",
      "trigger": { "count": 1 }
    }
  }],
  "notificationChannels": ["${CHANNEL_NAME}"],
  "alertStrategy": { "autoClose": "604800s" },
  "documentation": {
    "content": "The Firestore export has not succeeded for 23h30m — backups are stale or stopped. The workflow waits for the export operation, so a SUCCEEDED execution means objects were written, not merely requested. Check: gcloud workflows executions list --workflow=firestore-export --location europe-central2. Procedure: docs/runbooks/restore-firestore.md",
    "mimeType": "text/markdown"
  }
}
EOF

# A6 — zones are dead while the site is fine.
#
# This is the alert the zone host actually needs, and it is not an uptime check. When
# admission fails the shell falls back to solo play without saying anything — which is
# the right thing for a player and the reason nobody finds out. The host keeps answering
# /health, every request is a 200, and each player gets a private world. Both faults on
# the service's first day looked exactly like this, and what found them was a human
# opening two browser windows.
#
# So the signal is the log line the host writes when it cannot start a zone
# (apps/world/src/app.ts): the wire reason is deliberately uninformative, so the cause
# goes to the log and this is the only thing watching it. One entry means one player was
# turned away and does not warrant an email; the rate limit below is what turns "a join
# failed" into "joins are failing", and a host that can start no zone at all will trip it
# on the first arrival after the hour turns over.
cat > "${POLICY_DIR}/a6.json" <<EOF
{
  "displayName": "A6 zone admission failing",
  "combiner": "OR",
  "conditions": [{
    "displayName": "the world service could not start a zone",
    "conditionMatchedLog": {
      "filter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${WORLD_SERVICE}\" AND jsonPayload.msg=\"zone admission failed\""
    }
  }],
  "notificationChannels": ["${CHANNEL_NAME}"],
  "alertStrategy": {
    "notificationRateLimit": { "period": "3600s" },
    "autoClose": "86400s"
  },
  "documentation": {
    "content": "${WORLD_SERVICE} refused a join it should have accepted. Players are silently playing alone and the site looks healthy. The logged error is the diagnosis — the wire reason never says. Triage: docs/runbooks/zones-down-triage.md",
    "mimeType": "text/markdown"
  }
}
EOF

# A7 — the world service is crash-looping.
#
# The complement to A6, and the reason A6 is not enough on its own: a host that dies
# before it can serve anything writes no admission failures either, and on a
# scale-to-zero service "no logs" is also what a quiet night looks like. Absence proves
# nothing here, so this watches for what a crash-loop does produce.
#
# Deliberately NOT an uptime check. Probing a scale-to-zero service every five minutes
# keeps an instance warm around the clock, which converts the whole cost model in
# docs/p3-zone-host-infra.md — \$0 at rest — into roughly \$65/month to find out whether
# something nobody is using is up. A probe is traffic, and this service bills for traffic.
cat > "${POLICY_DIR}/a7.json" <<EOF
{
  "displayName": "A7 world service 5xx rate elevated",
  "combiner": "OR",
  "conditions": [{
    "displayName": "5xx responses sustained over 10 minutes",
    "conditionThreshold": {
      "filter": "metric.type=\"run.googleapis.com/request_count\" AND resource.type=\"cloud_run_revision\" AND resource.label.\"service_name\"=\"${WORLD_SERVICE}\" AND metric.label.\"response_code_class\"=\"5xx\"",
      "aggregations": [{
        "alignmentPeriod": "600s",
        "perSeriesAligner": "ALIGN_RATE",
        "crossSeriesReducer": "REDUCE_SUM"
      }],
      "comparison": "COMPARISON_GT",
      "thresholdValue": 0.03,
      "duration": "600s",
      "trigger": { "count": 1 }
    }
  }],
  "notificationChannels": ["${CHANNEL_NAME}"],
  "alertStrategy": { "autoClose": "86400s" },
  "documentation": {
    "content": "Sustained 5xx from ${WORLD_SERVICE}. Most likely a bad image or a refusal to start — the host exits rather than downgrade when the isolate cage is unavailable, which is intended. Triage: docs/runbooks/zones-down-triage.md",
    "mimeType": "text/markdown"
  }
}
EOF

# A14 — somebody is probing the content walls.
#
# The threshold is set for a burst, not a baseline. Rejections are a normal part of a working
# system: a creator phrases something clumsily, the deny-list catches it, they rephrase. An
# alert on any rejection would be an alert on the feature succeeding, and would train the
# operator to delete these emails — which is how the previous alert catalog became worthless.
#
# What is not normal is volume. Sixty rejections in ten minutes is nobody's afternoon; it is
# one person walking a list, or an automated attempt. The number is deliberately far above
# organic traffic rather than tuned to it: at this scale a tight threshold would fire on a
# single frustrated creator, and the cost of missing the first ten minutes of a probe is
# nothing compared to the cost of an alert nobody reads.
#
# The service is named here as well as on the metric, which looks redundant and is not: the
# two can drift. A metric is editable in the Console, and the next person to widen its filter
# — chasing a log line the relay or the zone host emits, say — would silently turn this into
# a project-wide alert without touching this file. A2 and A7 already carry the same
# constraint on their own metrics for the same reason. Belt and braces cost one clause.
#
# The uid is on every log entry but is not a label here. Concentration is a *diagnosis* step,
# not a threshold: "is this one uid or forty" is the first question after the email arrives,
# and it is one Logs Explorer query (printed at the end of this script) rather than a metric
# label whose cardinality would grow with the user base.
cat > "${POLICY_DIR}/a14.json" <<EOF
{
  "displayName": "A14 moderation rejection burst",
  "combiner": "OR",
  "conditions": [{
    "displayName": "many rejections in a short window",
    "conditionThreshold": {
      "filter": "metric.type=\"logging.googleapis.com/user/moderation_rejections\" AND resource.type=\"cloud_run_revision\" AND resource.label.\"service_name\"=\"${PRIMARY_SERVICE}\"",
      "aggregations": [{
        "alignmentPeriod": "600s",
        "perSeriesAligner": "ALIGN_SUM",
        "crossSeriesReducer": "REDUCE_SUM"
      }],
      "comparison": "COMPARISON_GT",
      "thresholdValue": 60,
      "duration": "0s",
      "trigger": { "count": 1 }
    }
  }],
  "notificationChannels": ["${CHANNEL_NAME}"],
  "alertStrategy": { "autoClose": "86400s" },
  "documentation": {
    "content": "Content moderation is rejecting far more than organic traffic explains — someone is probing the walls, or a checker regression is rejecting valid input. Both matter and they look identical from here, so check which: Logs Explorer, jsonPayload.msg=\"moderation rejected\", group by jsonPayload.moderation.uid and .category. One uid across many categories is a person testing limits; many uids in one category is a false-positive regression in the deny-list. Triage: docs/runbooks/moderation-burst.md",
    "mimeType": "text/markdown"
  }
}
EOF

# A24 — something is calling Vertex in a loop.
#
# Written after a build-log translator on the status endpoint billed ~9,250 requests in a
# day (2026-08-04) and was found only because somebody opened the billing console. Every
# call returned 200 and was discarded client-side at a 4s timeout, so no error rate moved,
# no latency moved, and no existing policy could have fired. The only signal that ever
# distinguished that day from a quiet one was the *call count itself*, which is why this
# watches volume rather than failures.
#
# The rate is per second because that is the unit the metric aligns to, which makes the
# threshold look deceptively small: the incident ran at a flat 0.40/s for six hours.
#
# CALIBRATION, measured rather than guessed (ALIGN_RATE/600s, the same shape this
# condition evaluates):
#   Jul 28 - Aug 4 13:00, 264 windows: max 0.158/s
#   Aug 4 15:00-21:00 (incident),  41 windows: ~0.40/s sustained
# The first draft of this used 0.1/s on an hourly-average estimate, and checking it
# against the real distribution showed three consecutive windows on the morning of Aug 3
# at 0.111/0.158/0.113 — enough to satisfy duration=600s and page somebody for normal
# traffic. 0.25/s sits ~1.6x above the busiest real window and ~1.6x below the incident.
# An alert that cries wolf gets filtered, and a filtered channel is worth nothing, which
# is the same argument A23's threshold makes.
#
# This is tuned to closed-beta volume. Real growth will cross it, and that is intentional
# — the first crossing should be read, not silenced. Raise it deliberately when it
# reflects more creators, never to quiet a leak.
cat > "${POLICY_DIR}/a24.json" <<EOF
{
  "displayName": "A24 Vertex call volume abnormally high",
  "combiner": "OR",
  "conditions": [{
    "displayName": "model invocations sustained over 10 minutes",
    "conditionThreshold": {
      "filter": "metric.type=\"aiplatform.googleapis.com/publisher/online_serving/model_invocation_count\" AND resource.type=\"aiplatform.googleapis.com/PublisherModel\"",
      "aggregations": [{
        "alignmentPeriod": "600s",
        "perSeriesAligner": "ALIGN_RATE",
        "crossSeriesReducer": "REDUCE_SUM"
      }],
      "comparison": "COMPARISON_GT",
      "thresholdValue": 0.25,
      "duration": "600s",
      "trigger": { "count": 1 }
    }
  }],
  "notificationChannels": ["${CHANNEL_NAME}"],
  "alertStrategy": { "autoClose": "86400s" },
  "documentation": {
    "content": "Something is calling Vertex far more often than this project's traffic explains — most likely a model call on a polled read path, retried because a failure cached nothing. Note the calls may all be succeeding: the 2026-08-04 incident was 100% HTTP 200 and 100% discarded. Triage: identify the call site from the token-size labels on aiplatform.googleapis.com/publisher/online_serving/model_invocation_count (input_token_size / output_token_size), since every call site shares one model and location and nothing else separates them. Then find the write or read path that fires at that shape. Call sites: moderation.ts, refine.ts, game-seed.ts, code-lane.ts, editor-assist.ts, feedback-themes.ts, translate.ts.",
    "mimeType": "text/markdown"
  }
}
EOF

# A25 — Vertex output tokens are being generated at a rate nothing here justifies.
#
# The complement to A24, for the failure it cannot see: a handful of calls that each emit
# an enormous response. Two call sites ask for up to 65,536 output tokens (game-seed,
# code-lane), so a loop there would cost a fortune while barely moving the call count.
#
# Output rather than input because output is what costs: the 2026-08-04 billing lines came
# to ~28.6 PLN per million output tokens against ~5.7 for input, and output was 8.79M of
# that day's 15.9M tokens but the large majority of its price.
#
# CALIBRATION, measured the same way as A24 (ALIGN_RATE/600s):
#   Jul 28 - Aug 4 13:00, 259 windows: max 164.4/s (next: 137, 107, 104, 93, 78)
#   Aug 4 15:00-21:00 (incident),  36 windows: ~455-466/s sustained
# 300/s (~1.08M tokens an hour) sits 1.8x above the busiest real window and 1.5x below
# the incident. The headroom is deliberately wider than A24's because a single 65k-token
# generation is a legitimate spike that must not page anyone — those are what the 164/s
# and 137/s baseline peaks are.
cat > "${POLICY_DIR}/a25.json" <<EOF
{
  "displayName": "A25 Vertex output token rate abnormally high",
  "combiner": "OR",
  "conditions": [{
    "displayName": "output tokens sustained over 10 minutes",
    "conditionThreshold": {
      "filter": "metric.type=\"aiplatform.googleapis.com/publisher/online_serving/token_count\" AND resource.type=\"aiplatform.googleapis.com/PublisherModel\" AND metric.label.\"type\"=\"output\"",
      "aggregations": [{
        "alignmentPeriod": "600s",
        "perSeriesAligner": "ALIGN_RATE",
        "crossSeriesReducer": "REDUCE_SUM"
      }],
      "comparison": "COMPARISON_GT",
      "thresholdValue": 300,
      "duration": "600s",
      "trigger": { "count": 1 }
    }
  }],
  "notificationChannels": ["${CHANNEL_NAME}"],
  "alertStrategy": { "autoClose": "86400s" },
  "documentation": {
    "content": "Vertex is emitting output tokens far faster than this project's traffic explains. Output tokens are the dominant cost (~5x input per token), so this is the closest thing to a live spend alarm. If A24 is also firing, it is a call loop — start there. If A24 is quiet, it is a small number of very large generations: look at game-seed.ts and code-lane.ts, which both request up to 65,536 output tokens. Confirm the size distribution from the output_token_size label on model_invocation_count before changing any maxOutputTokens.",
    "mimeType": "text/markdown"
  }
}
EOF

# A26 — knowledge_query volume, a cost-runaway guard on Discovery Engine's Agent Search
# add-on (KQ-10). SEARCH_ADD_ON_LLM (the :answer generative synthesis) is billed per call
# and is NOT covered by the platform's free 10k-query/month allotment the way plain
# :search chunk retrieval is, so an unexpected surge in call volume is a real bill, the
# same shape of risk A24/A25 watch for Vertex.
#
# No production traffic exists for this feature yet, so — unlike A23/A24/A25 — this
# threshold is NOT calibrated against a real distribution. 200/day is a conservative
# placeholder (the per-round soft caps in agent-channel.ts bound one round to at most
# 15 answer + 30 chunk calls, so 200/day assumes roughly 4-5 rounds calling it hard).
# Recalibrate against real usage once knowledge_query is visible (KQ-09) and revisit this
# comment rather than trusting the number.
cat > "${POLICY_DIR}/a26.json" <<EOF
{
  "displayName": "A26 knowledge_query daily volume abnormally high",
  "combiner": "OR",
  "conditions": [{
    "displayName": "knowledge_query calls sustained over a day",
    "conditionThreshold": {
      "filter": "metric.type=\"logging.googleapis.com/user/knowledge_query_calls\" AND resource.type=\"cloud_run_revision\" AND resource.label.\"service_name\"=\"${PRIMARY_SERVICE}\"",
      "aggregations": [{
        "alignmentPeriod": "86400s",
        "perSeriesAligner": "ALIGN_SUM",
        "crossSeriesReducer": "REDUCE_SUM"
      }],
      "comparison": "COMPARISON_GT",
      "thresholdValue": 200,
      "duration": "0s",
      "trigger": { "count": 1 }
    }
  }],
  "notificationChannels": ["${CHANNEL_NAME}"],
  "alertStrategy": { "autoClose": "86400s" },
  "documentation": {
    "content": "knowledge_query is being called far more than expected in a day. This protects against cost runaway on Discovery Engine's SEARCH_ADD_ON_LLM (:answer), which is billed per call unlike plain chunk retrieval. Triage: Logs Explorer, jsonPayload.msg=\"knowledge_query answered\", group by jsonPayload.knowledgeQuery.mode (answer costs ~3.7x chunks) and .jobId (one round looping vs many rounds using it normally). The per-round soft caps live in apps/api/src/agent-surface/agent-channel.ts (maxKnowledgeAnswersPerWindow / maxKnowledgeChunksPerWindow); a single round cannot exceed them, so sustained volume above this threshold means many rounds, not one runaway loop.",
    "mimeType": "text/markdown"
  }
}
EOF

# A27 — the typecheck preflight is chronically running out of time, same "isolated is fine,
# recurring is not" shape as A3: one slow round proves nothing (an instance was cold, a game
# has an unusually large module set), but a pattern means the budget itself is miscalibrated
# for real games rather than for whatever it was tuned against. Every occurrence already ships
# a round without validation, silently to the creator — this is the only thing that makes that
# accumulate into something an operator sees.
cat > "${POLICY_DIR}/a27.json" <<EOF
{
  "displayName": "A27 typecheck preflight budget chronically exceeded",
  "combiner": "OR",
  "conditions": [{
    "displayName": "preflight skipped past its time budget, repeatedly",
    "conditionThreshold": {
      "filter": "metric.type=\"logging.googleapis.com/user/typecheck_preflight_skipped\" AND resource.type=\"cloud_run_revision\" AND resource.label.\"service_name\"=\"${PRIMARY_SERVICE}\"",
      "aggregations": [{
        "alignmentPeriod": "1800s",
        "perSeriesAligner": "ALIGN_SUM",
        "crossSeriesReducer": "REDUCE_SUM"
      }],
      "comparison": "COMPARISON_GT",
      "thresholdValue": 2,
      "duration": "0s",
      "trigger": { "count": 1 }
    }
  }],
  "notificationChannels": ["${CHANNEL_NAME}"],
  "alertStrategy": { "autoClose": "86400s" },
  "documentation": {
    "content": "Deliveries are shipping without typecheck validation more than occasionally — apps/api/src/creation/typecheck-preflight.ts's in-process tsc run kept exceeding TYPECHECK_PREFLIGHT_BUDGET_MS (currently 20s) and got discarded even though it finished (the check cannot be preempted mid-run, so this is never wasted server time, only a wasted verdict). One skip is unremarkable; several in 30 minutes means the budget is wrong for real game sizes, not just a pathological one. Triage: Logs Explorer, jsonPayload.msg=\"typecheck preflight skipped: budget exceeded\", check jsonPayload.durationMs against the current budget and jsonPayload.slug for which games are large enough to trip it — then decide whether to raise the budget again or investigate why tsc itself got slower (shared GameKit surface grew, instance under CPU pressure).",
    "mimeType": "text/markdown"
  }
}
EOF

# A28 — a gate build that ran and died without ever writing a verdict. Unlike a red gate
# (normal, and also exits the build non-zero) this is always ours: the candidate is stored,
# the agent believes it delivered, and nothing will ever verify it. It went unnoticed for
# nearly nine hours on 2026-08-21 when an unbuilt workspace package killed every gate in the
# project at import — acceptance, preview and the nightly health sweep alike. Threshold is 0,
# not a rate: one crashed gate is already a creator staring at a page that cannot progress.
cat > "${POLICY_DIR}/a28.json" <<EOF
{
  "displayName": "A28 gate build died without a verdict",
  "combiner": "OR",
  "conditions": [{
    "displayName": "a delivery's gate build failed before writing any verdict",
    "conditionThreshold": {
      "filter": "metric.type=\"logging.googleapis.com/user/gate_build_crashed\" AND resource.type=\"cloud_run_revision\" AND resource.label.\"service_name\"=\"${PRIMARY_SERVICE}\"",
      "aggregations": [{
        "alignmentPeriod": "900s",
        "perSeriesAligner": "ALIGN_SUM",
        "crossSeriesReducer": "REDUCE_SUM"
      }],
      "comparison": "COMPARISON_GT",
      "thresholdValue": 0,
      "duration": "0s",
      "trigger": { "count": 1 }
    }
  }],
  "notificationChannels": ["${CHANNEL_NAME}"],
  "alertStrategy": { "autoClose": "86400s" },
  "documentation": {
    "content": "A gate Cloud Build finished without writing manifest.gate or manifest.previewGate, so the delivery can never be verified or published and the creator's page will sit on 'verification failed on our side'. This is a platform fault by construction — a game that merely fails its checks writes a red verdict and never reaches this metric. Triage: Logs Explorer, jsonPayload.msg=\"delivery gate crashed\", take jsonPayload.delivery.buildId and read it with 'gcloud builds log <id> --project=gamedevpl'. The usual cause is the gate container failing before it can run: a workspace package that npm ci symlinks but never builds (infra/cloudbuild-gate.yaml must run 'npm run build:packages' ahead of gate:run), a bad platform ref, or the gate-runner SA losing a permission. If several games trip this at once, treat it as a full gate outage — every delivery in flight is stuck and none of their creators are being told anything useful. Affected rounds stay open, so once the cause is fixed the agent only needs to deliver again.",
    "mimeType": "text/markdown"
  }
}
EOF

fi

for FILE in "${POLICY_DIR}"/*.json; do
  DISPLAY="$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['displayName'])" "$FILE")"
  MATCHES="$(gcloud alpha monitoring policies list \
    --project "$PROJECT_ID" \
    --filter="displayName='${DISPLAY}'" \
    --format='value(name)')"
  EXISTING="$(printf '%s\n' "$MATCHES" | head -n 1)"

  # A name can match more than once, and it did: the lookup and the create are not atomic,
  # so an interrupted run — or, as happened here, a second run started while the first was
  # still going — can have both decide the policy is absent and both create it. The result
  # is two identical policies and two emails per incident, which is how a channel stops
  # being read.
  #
  # "Idempotent: matched by display name" is only true if duplicates converge rather than
  # accumulate, so extras are deleted rather than reported. Safe because these are exact
  # display-name matches against the set this script owns, and the survivor is rewritten
  # from the file below anyway; loud because deleting a policy should never be silent.
  EXTRAS="$(printf '%s\n' "$MATCHES" | tail -n +2)"
  if [ -n "$EXTRAS" ]; then
    printf '%s\n' "$EXTRAS" | while IFS= read -r DUPLICATE; do
      [ -n "$DUPLICATE" ] || continue
      gcloud alpha monitoring policies delete "$DUPLICATE" --project "$PROJECT_ID" >/dev/null
      echo "    Removed duplicate of ${DISPLAY} (${DUPLICATE##*/})"
    done
  fi
  # update replaces the policy definition wholesale, so every field the policy needs has
  # to be in the file — including notificationChannels. Omitting it there would leave the
  # policies present and visibly "enabled" while silently emailing nobody, which is the
  # one failure mode worse than having no alerting at all.
  if [ -n "$EXISTING" ]; then
    gcloud alpha monitoring policies update "$EXISTING" \
      --project "$PROJECT_ID" \
      --policy-from-file="$FILE" \
      >/dev/null
    echo "    Updated: ${DISPLAY}"
  else
    gcloud alpha monitoring policies create \
      --project "$PROJECT_ID" \
      --policy-from-file="$FILE" \
      >/dev/null
    echo "    Created: ${DISPLAY}"
  fi
done

echo ""
if [ "$SERVICE" = "$PRIMARY_SERVICE" ]; then
  echo "==> Done. '${SERVICE}' uptime check + A1/A2, and the project-wide A3/A4 and A6/A7,"
  echo "    wired to ${ALERT_EMAIL}."
  echo ""
  echo "    Every other service answering requests needs its own run, or it is unmonitored:"
  echo "      ALERT_EMAIL=${ALERT_EMAIL} SERVICE=<service> ./infra/setup-monitoring.sh"
  echo "    ('${WORLD_SERVICE}' is the exception — A6/A7 above already cover it, without a"
  echo "    probe that would keep a scale-to-zero service warm.)"
else
  echo "==> Done. '${SERVICE}' uptime check + A1/A2 wired to ${ALERT_EMAIL}."
  echo "    A3/A4 and A6/A7 were skipped — they are project-wide and belong to the"
  echo "    '${PRIMARY_SERVICE}' run."
fi
echo ""
echo "    A5 (billing budget) is NOT here: budgets live on the billing account, not the"
echo "    project, and need roles this script does not assume. Create it once by hand:"
echo "      Console → Billing → Budgets & alerts → Create budget"
echo "      Scope: project ${PROJECT_ID}; thresholds 50/90/100%; email ${ALERT_EMAIL}"
echo ""
echo "    Then prove A3 works, because an untested alert is a decoration. Note that"
echo "    *pausing* notify-sweep does NOT test it: a paused job makes no attempts, so it"
echo "    logs no failures and A3 has nothing to count. Make it fail instead, and put it"
echo "    back — 4xx from a wrong path is enough, and a few minutes without the sweep is"
echo "    harmless (status polls detect the same transitions):"
echo "      # Read the job's own URI rather than typing one. This block used to print a"
echo "      # literal https://www.gamedev.pl/... while the deployed job targets the"
echo "      # run.app host, so following it verbatim REWROTE the job instead of restoring"
echo "      # it — a drill that quietly reconfigures the thing it is drilling."
echo "      URI=\$(gcloud scheduler jobs describe notify-sweep --location ${REGION} \\"
echo "        --project ${PROJECT_ID} --format='value(httpTarget.uri)')"
echo "      echo \"will restore to: \${URI}\"   # confirm this looks right before breaking it"
echo "      gcloud scheduler jobs update http notify-sweep --location ${REGION} \\"
echo "        --project ${PROJECT_ID} --uri \"\${URI}-nope\""
echo "      # wait ~8 min (>2 failed attempts in a 15-minute window), expect the email"
echo "      gcloud scheduler jobs update http notify-sweep --location ${REGION} \\"
echo "        --project ${PROJECT_ID} --uri \"\${URI}\""
echo "      # then confirm it came back, because a failed revert looks like nothing:"
echo "      gcloud scheduler jobs describe notify-sweep --location ${REGION} \\"
echo "        --project ${PROJECT_ID} --format='value(httpTarget.uri,state)'"
echo ""
echo "    A4 cannot be tested yet, and is inert rather than armed: an absence condition"
echo "    needs a time series that once existed, and firestore_export_succeeded has no"
echo "    data until the export workflow completes once. Run ./infra/setup-backups.sh, then"
echo "    force a run and wait for it to finish:"
echo "      gcloud workflows run firestore-export --location europe-central2 --project ${PROJECT_ID}"
echo "    A4 starts protecting you from that point on."
echo ""
echo "    A6 matches a log field rather than a metric, so confirm the field path is what"
echo "    this project's logs actually carry — a filter that matches nothing creates a"
echo "    policy that looks armed and never fires, which is the failure this file exists"
echo "    to avoid. One query settles it:"
echo "      gcloud logging read \\"
echo "        'resource.labels.service_name=\"${WORLD_SERVICE}\" AND jsonPayload.msg=\"zone admission failed\"' \\"
echo "        --project ${PROJECT_ID} --limit 5 --freshness 30d"
echo "      # No rows and no known incident is inconclusive; drop the jsonPayload.msg"
echo "      # clause and look at how a real log line from that service is shaped."
echo ""
echo "    A14 (moderation) is the same shape and worth the same check — and unlike A6 you"
echo "    can generate a matching entry on demand: submit a spec that trips the deny-list"
echo "    and expect a 422, then look for it."
echo "      gcloud logging read \\"
echo "        'resource.labels.service_name=\"${PRIMARY_SERVICE}\" AND jsonPayload.msg=\"moderation rejected\"' \\"
echo "        --project ${PROJECT_ID} --limit 20 --freshness 7d"
echo ""
echo "    That same query is the standing answer to 'is anyone probing us'. Group by"
echo "    jsonPayload.moderation.uid and .category: one uid across many categories is a"
echo "    person testing the walls; many uids in one category is the deny-list rejecting"
echo "    something legitimate, which is the more expensive of the two to leave alone."
echo ""
echo "    A24/A25 (Vertex volume) watch Google-published metrics rather than our logs, so"
echo "    there is no filter to typo — but there is a threshold to calibrate, and a"
echo "    threshold set above real traffic is the same silent failure. Check what the last"
echo "    week actually looked like before trusting either number, and re-check after the"
echo "    beta grows. gcloud cannot read time series, so this goes through the API:"
echo "      TOKEN=\$(gcloud auth print-access-token)"
echo "      curl -s -H \"Authorization: Bearer \$TOKEN\" --get \\"
echo "        'https://monitoring.googleapis.com/v3/projects/${PROJECT_ID}/timeSeries' \\"
echo "        --data-urlencode 'filter=metric.type=\"aiplatform.googleapis.com/publisher/online_serving/model_invocation_count\"' \\"
echo "        --data-urlencode \"interval.startTime=\$(date -u -v-7d +%Y-%m-%dT%H:%M:%SZ)\" \\"
echo "        --data-urlencode \"interval.endTime=\$(date -u +%Y-%m-%dT%H:%M:%SZ)\" \\"
echo "        --data-urlencode 'aggregation.alignmentPeriod=3600s' \\"
echo "        --data-urlencode 'aggregation.perSeriesAligner=ALIGN_SUM' \\"
echo "        --data-urlencode 'aggregation.crossSeriesReducer=REDUCE_SUM'"
echo "      # Divide the busiest hour by 3600 to compare against A24's 0.25/s."
echo "      # Swap the metric for .../token_count with metric.label.type=output for A25 (300/s)."
echo "      # For reference, the numbers these were calibrated against on 2026-08-04:"
echo "      #   A24  normal max 0.158/s   leak ~0.40/s"
echo "      #   A25  normal max 164/s     leak ~460/s"
