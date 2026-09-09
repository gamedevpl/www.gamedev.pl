#!/usr/bin/env bash
#
# Splits Firestore document reads by type, so a recalibration is done against measurement
# rather than an estimate. Read-only: it lists time series and prints totals.
#
#   infra/read-cost-report.sh                 # the trailing day, per type
#   infra/read-cost-report.sh 7d              # the trailing week
#   PROJECT_ID=other infra/read-cost-report.sh
#
# Why the split matters. docs/firestore-read-cost.md fixed QUERY reads: a collection scan
# on a polled path, once per request. What no per-window cache removes is the LOOKUP
# floor -- one users/{uid} read per authenticated request, plus whatever documents the
# route itself fetches by id. If the day is mostly LOOKUP, the next fix is the session
# read and the poll cadences, not another cache; if it is mostly QUERY, a scan came back.
#
# A30 (read rate) and A31 (daily total) in setup-monitoring.sh are both calibrated against
# a floor that the badge and poll fixes move. Run this over a full working week before
# re-deriving either, and record the numbers in the PR that changes them.
set -euo pipefail

# GNU date rejects "-1d"; BSD date rejects "1 day ago". Take a plain shorthand and
# hand each the form it understands.
WINDOW="${1:-1d}"
AMOUNT="${WINDOW%[dh]}"
UNIT="day"
case "$WINDOW" in
  *h) UNIT="hour" ;;
  *d | *[0-9]) UNIT="day" ;;
  *)
    echo "Window must look like 1d, 7d or 12h" >&2
    exit 1
    ;;
esac
if ! [ "$AMOUNT" -gt 0 ] 2>/dev/null; then
  echo "Window must look like 1d, 7d or 12h" >&2
  exit 1
fi

started_at() {
  date -u -d "$AMOUNT $UNIT ago" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null ||
    date -u -v"-${AMOUNT}${UNIT:0:1}" +%Y-%m-%dT%H:%M:%SZ
}
PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"

if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "(unset)" ]; then
  echo "Set PROJECT_ID, or run: gcloud config set project <id>" >&2
  exit 1
fi

echo "Firestore document reads, project $PROJECT_ID, trailing $WINDOW"
echo

# `gcloud monitoring time-series list` does not exist in current gcloud (no stable, alpha,
# or beta group provides it) -- hit the Monitoring REST API directly instead. Pagination
# matters: DELTA points at ~1/min over a multi-day window span several pages.
ACCESS_TOKEN="$(gcloud auth print-access-token)"
END_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
START_TIME="$(started_at)"

fetch_page() {
  local page_token="$1"
  local url="https://monitoring.googleapis.com/v3/projects/${PROJECT_ID}/timeSeries"
  url+="?filter=$(node -e 'console.log(encodeURIComponent(process.argv[1]))' 'metric.type="firestore.googleapis.com/document/read_count"')"
  url+="&interval.startTime=${START_TIME}&interval.endTime=${END_TIME}"
  if [ -n "$page_token" ]; then
    url+="&pageToken=${page_token}"
  fi
  curl -sS -H "Authorization: Bearer ${ACCESS_TOKEN}" "$url"
}

TMP_ALL="$(mktemp)"
trap 'rm -f "$TMP_ALL"' EXIT
echo "[]" >"$TMP_ALL"

page_token=""
while :; do
  page="$(fetch_page "$page_token")"
  if echo "$page" | node -e 'let r="";process.stdin.on("data",c=>r+=c);process.stdin.on("end",()=>{const j=JSON.parse(r);if(j.error){console.error(JSON.stringify(j.error));process.exit(1)}})'; then
    :
  else
    echo "Monitoring API error (see above)" >&2
    exit 1
  fi
  node -e '
    const fs = require("fs");
    const [prevPath, pageJson] = [process.argv[1], process.argv[2]];
    const prev = JSON.parse(fs.readFileSync(prevPath, "utf8"));
    const page = JSON.parse(pageJson || "{}");
    const merged = prev.concat(page.timeSeries ?? []);
    fs.writeFileSync(prevPath, JSON.stringify(merged));
  ' "$TMP_ALL" "$page"
  page_token="$(node -e 'console.log(JSON.parse(process.argv[1]).nextPageToken ?? "")' "$page")"
  if [ -z "$page_token" ]; then
    break
  fi
done

node -e '
  const fs = require("fs");
  const series = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const totals = new Map();
  for (const row of series) {
    const type = row.metric?.labels?.type ?? "UNKNOWN";
    const sum = (row.points ?? []).reduce((acc, point) => acc + Number(point.value?.int64Value ?? 0), 0);
    totals.set(type, (totals.get(type) ?? 0) + sum);
  }
  const all = [...totals.values()].reduce((acc, value) => acc + value, 0);
  if (all === 0) {
    console.log("No points in this window. Check the project and that the API is serving traffic.");
    process.exit(0);
  }
  for (const [type, value] of [...totals].sort((a, b) => b[1] - a[1])) {
    console.log(`${type.padEnd(10)} ${String(value).padStart(12)}  ${Math.round((value / all) * 100)}%`);
  }
  console.log(`${"TOTAL".padEnd(10)} ${String(all).padStart(12)}`);
  console.log();
  console.log("LOOKUP is per-document fan-out on a request path (session reads, reads by id).");
  console.log("QUERY is a collection scan. The free tier is 50K reads/day.");
' "$TMP_ALL"
