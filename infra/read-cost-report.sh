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

WINDOW="${1:-1d}"
PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"

if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "(unset)" ]; then
  echo "Set PROJECT_ID, or run: gcloud config set project <id>" >&2
  exit 1
fi

echo "Firestore document reads, project $PROJECT_ID, trailing $WINDOW"
echo

# ALIGN_DELTA + REDUCE_SUM per type is the same shape A31 alerts on, so the number here
# and the number that fires are derived the same way.
gcloud monitoring time-series list \
  --project "$PROJECT_ID" \
  --filter='metric.type="firestore.googleapis.com/document/read_count"' \
  --interval-end-time="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --interval-start-time="$(date -u -d "-$WINDOW" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v"-$WINDOW" +%Y-%m-%dT%H:%M:%SZ)" \
  --format=json |
  node -e '
    let raw = "";
    process.stdin.on("data", (chunk) => (raw += chunk));
    process.stdin.on("end", () => {
      const series = JSON.parse(raw || "[]");
      const totals = new Map();
      for (const row of series) {
        const type = row.metric?.labels?.type ?? "UNKNOWN";
        const sum = (row.points ?? []).reduce((acc, point) => acc + Number(point.value?.int64Value ?? 0), 0);
        totals.set(type, (totals.get(type) ?? 0) + sum);
      }
      const all = [...totals.values()].reduce((acc, value) => acc + value, 0);
      if (all === 0) {
        console.log("No points in this window. Check the project and that the API is serving traffic.");
        return;
      }
      for (const [type, value] of [...totals].sort((a, b) => b[1] - a[1])) {
        console.log(`${type.padEnd(10)} ${String(value).padStart(12)}  ${Math.round((value / all) * 100)}%`);
      }
      console.log(`${"TOTAL".padEnd(10)} ${String(all).padStart(12)}`);
      console.log();
      console.log("LOOKUP is per-document fan-out on a request path (session reads, reads by id).");
      console.log("QUERY is a collection scan. The free tier is 50K reads/day.");
    });
  '
