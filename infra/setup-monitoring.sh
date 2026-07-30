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

echo "==> 4/4 Ensuring alert policies"
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

# A3 — the notify sweep. It already runs every 2 minutes against auth, Firestore and the
# app in one request, which makes it a synthetic monitor we are getting for free; all
# that was missing was anyone listening. Its failure is also a real user-facing outage
# (creators stop being notified) even when every page still loads.
cat > "${POLICY_DIR}/a3.json" <<EOF
{
  "displayName": "A3 notify-sweep failing",
  "combiner": "OR",
  "conditions": [{
    "displayName": "scheduler job failing repeatedly",
    "conditionThreshold": {
      "filter": "metric.type=\"cloudscheduler.googleapis.com/job/attempt_count\" AND resource.type=\"cloud_scheduler_job\" AND metric.label.\"response_code\"!=\"200\"",
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
# Measured on the export job's own *successful* attempts, not on bucket activity: the
# GCS request_count metric counts reads too, so an operator running `gcloud storage ls`
# to check on backups would suppress the very alert that tells them backups stopped —
# and the restore runbook tells them to run exactly that. This also complements A3
# rather than duplicating it: A3 catches a job that runs and fails, while absence
# catches a job that is paused, deleted, or never scheduled, where there are no failed
# attempts to count because there are no attempts at all.
cat > "${POLICY_DIR}/a4.json" <<EOF
{
  "displayName": "A4 no successful Firestore export",
  "combiner": "OR",
  "conditions": [{
    "displayName": "export job has not succeeded in 36 hours",
    "conditionAbsent": {
      "filter": "metric.type=\"cloudscheduler.googleapis.com/job/attempt_count\" AND resource.type=\"cloud_scheduler_job\" AND resource.label.\"job_id\"=\"firestore-daily-export\" AND metric.label.\"response_code\"=\"200\"",
      "aggregations": [{
        "alignmentPeriod": "3600s",
        "perSeriesAligner": "ALIGN_SUM",
        "crossSeriesReducer": "REDUCE_SUM"
      }],
      "duration": "129600s",
      "trigger": { "count": 1 }
    }
  }],
  "notificationChannels": ["${CHANNEL_NAME}"],
  "alertStrategy": { "autoClose": "604800s" },
  "documentation": {
    "content": "The daily Firestore export has not succeeded for 36h — backups are stale or stopped. A 200 from the job means the export was *accepted*; that objects actually land is what the restore drill proves. Procedure: docs/runbooks/restore-firestore.md",
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

fi

for FILE in "${POLICY_DIR}"/*.json; do
  DISPLAY="$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['displayName'])" "$FILE")"
  EXISTING="$(gcloud alpha monitoring policies list \
    --project "$PROJECT_ID" \
    --filter="displayName='${DISPLAY}'" \
    --format='value(name)' | head -n 1)"
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
echo "    Then prove it works, because an untested alert is a decoration:"
echo "      gcloud scheduler jobs pause notify-sweep --location ${REGION} --project ${PROJECT_ID}"
echo "      # wait ~15 min for A3 to fire, confirm the email, then:"
echo "      gcloud scheduler jobs resume notify-sweep --location ${REGION} --project ${PROJECT_ID}"
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
