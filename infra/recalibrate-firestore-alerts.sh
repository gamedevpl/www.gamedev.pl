#!/usr/bin/env bash
#
# Re-derives the A29/A30/A31 thresholds from measurement, in the shape the alert
# conditions themselves evaluate. Read-only: it lists time series and prints numbers.
# OWNER-RUN: needs `gcloud` authenticated against the project.
#
#   infra/recalibrate-firestore-alerts.sh              # the trailing week
#   infra/recalibrate-firestore-alerts.sh 14d
#   PROJECT_ID=other infra/recalibrate-firestore-alerts.sh
#
# Why this exists as a script. The three policies are calibrated against a floor that
# keeps moving -- caches land, poll cadences change -- so each recalibration is the same
# arithmetic over a fresh window, and doing it by eye in Metrics Explorer gets the shape
# wrong. A30 is a *rate* over 600s and A31 a *delta* over 86400s: reading one number off
# a chart drawn at some other alignment answers a different question than the condition
# asks. Every query below therefore carries the condition's own aligner and period.
#
# Its companion is infra/read-cost-report.sh, which answers "what kind of reads are
# these" (LOOKUP fan-out on a request path vs QUERY scans on a sweep). Run that when a
# number here looks wrong and you need to know which writer to go after; run this when
# the numbers are believable and the thresholds need to follow them.
#
# What it deliberately does not do: edit setup-monitoring.sh. It prints what each
# threshold would become; a human decides, records the measurement in the CALIBRATION
# comment above the policy, and re-runs setup-monitoring.sh. Two reasons, both learned
# here: A30's first threshold was set from a prediction and was wrong by four times, and
# a threshold quietly raised to fit what it measured would stop being a ceiling at all.
set -euo pipefail

WINDOW="${1:-7d}"
AMOUNT="${WINDOW%[dh]}"
UNIT="day"
case "$WINDOW" in
  *h) UNIT="hour" ;;
  *d | *[0-9]) UNIT="day" ;;
  *)
    echo "Window must look like 7d, 14d or 12h" >&2
    exit 1
    ;;
esac
if ! [ "$AMOUNT" -gt 0 ] 2>/dev/null; then
  echo "Window must look like 7d, 14d or 12h" >&2
  exit 1
fi

# GNU date rejects "-1d"; BSD date rejects "1 day ago". Hand each the form it knows.
started_at() {
  date -u -d "$AMOUNT $UNIT ago" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null ||
    date -u -v"-${AMOUNT}${UNIT:0:1}" +%Y-%m-%dT%H:%M:%SZ
}

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "(unset)" ]; then
  echo "Set PROJECT_ID, or run: gcloud config set project <id>" >&2
  exit 1
fi

ACCESS_TOKEN="$(gcloud auth print-access-token)"
END_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
START_TIME="$(started_at)"

TMP_ALL="$(mktemp)"
TMP_PAGE="$(mktemp)"
trap 'rm -f "$TMP_ALL" "$TMP_PAGE"' EXIT

urlencode() {
  node -e 'console.log(encodeURIComponent(process.argv[1]))' "$1"
}

# $1 metric type, $2 aligner, $3 alignment period, $4 label to group by. Pages land in a
# file, never in argv: a long window at a short alignment is megabytes, and passing that
# as an argument exits with "Argument list too long" before node starts.
fetch_series() {
  local metric="$1" aligner="$2" period="$3" group_by="$4"
  local page_token="" url base
  base="https://monitoring.googleapis.com/v3/projects/${PROJECT_ID}/timeSeries"
  base+="?filter=$(urlencode "metric.type=\"${metric}\" AND resource.type=\"firestore_instance\"")"
  base+="&interval.startTime=${START_TIME}&interval.endTime=${END_TIME}"
  base+="&aggregation.perSeriesAligner=${aligner}"
  base+="&aggregation.alignmentPeriod=${period}"
  base+="&aggregation.crossSeriesReducer=REDUCE_SUM"
  base+="&aggregation.groupByFields=$(urlencode "$group_by")"

  echo "[]" >"$TMP_ALL"
  while :; do
    url="$base"
    if [ -n "$page_token" ]; then
      url+="&pageToken=${page_token}"
    fi
    curl -sS -H "Authorization: Bearer ${ACCESS_TOKEN}" "$url" -o "$TMP_PAGE"
    if ! node -e '
      const page = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8") || "{}");
      if (page.error) {
        console.error(JSON.stringify(page.error));
        process.exit(1);
      }
    ' "$TMP_PAGE"; then
      echo "Monitoring API error (see above)" >&2
      exit 1
    fi
    node -e '
      const fs = require("fs");
      const [allPath, pagePath] = [process.argv[1], process.argv[2]];
      const all = JSON.parse(fs.readFileSync(allPath, "utf8"));
      const page = JSON.parse(fs.readFileSync(pagePath, "utf8") || "{}");
      fs.writeFileSync(allPath, JSON.stringify(all.concat(page.timeSeries ?? [])));
    ' "$TMP_ALL" "$TMP_PAGE"
    page_token="$(node -e '
      console.log(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8") || "{}").nextPageToken ?? "");
    ' "$TMP_PAGE")"
    [ -n "$page_token" ] || break
  done
}

# Sums the per-label series back into one value per bucket, keeps the split visible, and
# prints nearest-rank percentiles over the buckets -- the same arithmetic for all three.
summarize() {
  local label="$1" unit="$2"
  node -e '
    const fs = require("fs");
    const [path, label, unit] = [process.argv[1], process.argv[2], process.argv[3]];
    const series = JSON.parse(fs.readFileSync(path, "utf8"));
    const buckets = new Map();
    const perLabel = new Map();
    for (const row of series) {
      const labels = row.metric?.labels ?? {};
      const name = labels.type ?? labels.op ?? "(all)";
      for (const point of row.points ?? []) {
        const at = point.interval?.endTime;
        const value = Number(point.value?.doubleValue ?? point.value?.int64Value ?? 0);
        buckets.set(at, (buckets.get(at) ?? 0) + value);
        perLabel.set(name, (perLabel.get(name) ?? 0) + value);
      }
    }
    const totals = [...buckets.values()].sort((a, b) => a - b);
    if (totals.length === 0) {
      console.log(`  no data in the window`);
      process.exit(0);
    }
    const at = (p) => totals[Math.min(totals.length - 1, Math.round(p * (totals.length - 1)))];
    const fmt = (v) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });
    console.log(`  buckets ${totals.length}  median ${fmt(at(0.5))}  p95 ${fmt(at(0.95))}  max ${fmt(totals.at(-1))}  (${unit})`);
    const split = [...perLabel.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${fmt(v)}`);
    console.log(`  by ${label}: ${split.join("  ")}`);
    // Handed to the shell so the derivations below read one measurement, not two.
    fs.writeFileSync(`${path}.stats`, JSON.stringify({ median: at(0.5), p95: at(0.95), max: totals.at(-1) }));
  ' "$TMP_ALL" "$label" "$unit"
}

stat() {
  node -e '
    const s = JSON.parse(require("fs").readFileSync(process.argv[1] + ".stats", "utf8"));
    console.log(s[process.argv[2]]);
  ' "$TMP_ALL" "$1"
}

echo "Firestore alert recalibration, project $PROJECT_ID"
echo "Window $START_TIME .. $END_TIME"
echo

echo "A29 -- document writes, ALIGN_RATE/600s (the condition's own shape)"
fetch_series "firestore.googleapis.com/document/write_count" ALIGN_RATE 600s "metric.label.op"
summarize "op" "writes/s"
A29_MAX="$(stat max)"
echo
echo "A30 -- document reads, ALIGN_RATE/600s"
fetch_series "firestore.googleapis.com/document/read_count" ALIGN_RATE 600s "metric.label.type"
summarize "type" "reads/s"
A30_MAX="$(stat max)"
A30_MEDIAN="$(stat median)"
echo
echo "A31 -- document reads, ALIGN_DELTA/86400s (one bucket per day)"
fetch_series "firestore.googleapis.com/document/read_count" ALIGN_DELTA 86400s "metric.label.type"
summarize "type" "reads/day"
A31_MAX="$(stat max)"
echo

# The rules these follow are in the ops repo's cost-controls-execution-plan.md, under the
# A29 and A30/A31 recalibration recipes. Kept here as arithmetic, not as prose.
node -e '
  const [a29Max, a30Max, a30Median, a31Max] = process.argv.slice(1).map(Number);
  const round = (v, step) => Math.ceil(v / step) * step;
  const fmt = (v) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });

  console.log("Derived thresholds -- review, do not paste blindly:");
  console.log("");

  const a29 = Math.max(10, round(a29Max * 3, 1));
  console.log(`  A29 write rate      ${a29}/s        (3x max ${fmt(a29Max)}, floor 10)`);
  if (a29Max > 25) {
    console.log("     ^ max is above 25/s: find the writer, do not raise the threshold.");
  }

  console.log(`  A30 spike           ${round(a30Max * 3, 1)}/s over 600s   (3x max ${fmt(a30Max)})`);
  console.log(`  A30 drift           ${round(a30Median * 2, 1)}/s over 10800s (2x median ${fmt(a30Median)})`);

  const a31 = round(a31Max * 2, 10000);
  console.log(`  A31 daily total     ${fmt(a31)}/day  (2x busiest day ${fmt(a31Max)})`);
  if (a31 > 200000 && a31Max < 100000) {
    console.log("     ^ well above the 50K/day free tier while the week sits under it:");
    console.log("       size it nearer 150-200K so the free tier stays a visible target.");
  }

  console.log("");
  console.log("If the week came back near the old numbers despite a fix that should have");
  console.log("moved them, the fan-out is somewhere else: infra/read-cost-report.sh splits");
  console.log("reads by type, then Logs Explorer by route. A bigger number in the policy is");
  console.log("not the answer.");
  console.log("");
  console.log("Then: edit the CALIBRATION comments and thresholdValue in");
  console.log("infra/setup-monitoring.sh (A29, A30, A31), carrying the measured figures");
  console.log("above, and re-run that script. Record the numbers in the PR.");
' "$A29_MAX" "$A30_MAX" "$A30_MEDIAN" "$A31_MAX"
