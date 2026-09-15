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
# It also reads the deployed policies back and says whether the measured window already
# crosses one. That question has no good answer from the derivation alone: a threshold
# derived from a window that already breached it is a threshold sized to the incident.
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
  *h)
    UNIT="hour"
    BSD_UNIT="H"
    ;;
  *d | *[0-9])
    UNIT="day"
    BSD_UNIT="d"
    ;;
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
    date -u -v"-${AMOUNT}${BSD_UNIT}" +%Y-%m-%dT%H:%M:%SZ
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
TMP_POLICIES="$(mktemp)"
trap 'rm -f "$TMP_ALL" "$TMP_ALL.stats" "$TMP_PAGE" "$TMP_POLICIES" "${TMP_A30:-}"' EXIT

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

# The deployed thresholds, so the numbers below are compared against what is actually
# alerting rather than against the last value someone wrote in git. Best effort: a token
# without monitoring.alertPolicies.list still gets the measurement, just not the guard.
# pageSize is generous because the project has tens of policies, not thousands.
fetch_policies() {
  local url="https://monitoring.googleapis.com/v3/projects/${PROJECT_ID}/alertPolicies?pageSize=1000"
  echo "{}" >"$TMP_POLICIES"
  curl -sS -H "Authorization: Bearer ${ACCESS_TOKEN}" "$url" -o "$TMP_POLICIES" || echo "{}" >"$TMP_POLICIES"
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
    const ranked = [...buckets.entries()].sort((a, b) => b[1] - a[1]);
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
    // When the max is what decides a threshold, the minute it landed in is what decides
    // whether it was a runaway or a cron -- and that is a log query away, not a guess.
    const worst = ranked.slice(0, 3).map(([when, value]) => `${when} ${fmt(value)}`);
    console.log(`  worst: ${worst.join("   ")}`);
    // Handed to the shell so the derivations below read one measurement, not two.
    // The series goes with them in time order: a condition with a duration is not
    // answered by any single statistic over the window.
    const ordered = [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    fs.writeFileSync(
      `${path}.stats`,
      JSON.stringify({ median: at(0.5), p95: at(0.95), max: totals.at(-1), series: ordered }),
    );
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
# The A30 series has to outlive A31's fetch, which overwrites the stats file.
TMP_A30="$(mktemp)"
cp "$TMP_ALL.stats" "$TMP_A30"
echo
echo "A31 -- document reads, ALIGN_DELTA/86400s (one bucket per day)"
fetch_series "firestore.googleapis.com/document/read_count" ALIGN_DELTA 86400s "metric.label.type"
summarize "type" "reads/day"
A31_MAX="$(stat max)"
echo

fetch_policies

# The rules these follow are in the ops repo's cost-controls-execution-plan.md, under the
# A29 and A30/A31 recalibration recipes. Kept here as arithmetic, not as prose.
node -e '
  const fs = require("fs");
  const [a29Max, a30Max, a30Median, a31Max] = process.argv.slice(1, 5).map(Number);
  const policiesPath = process.argv[5];
  const a30SeriesPath = process.argv[6];
  const ALIGNMENT_SECONDS = 600;

  // The A30 drift condition fires on three contiguous hours above its threshold, so a
  // median over the whole window answers a different question: a four-hour incident in
  // an otherwise quiet week leaves the median low while the live condition fires.
  const longestRunSeconds = (threshold) => {
    let series;
    try {
      series = JSON.parse(fs.readFileSync(a30SeriesPath, "utf8")).series ?? [];
    } catch {
      return null;
    }
    let best = 0;
    let run = 0;
    for (const [, value] of series) {
      run = Number(value) > threshold ? run + 1 : 0;
      if (run > best) best = run;
    }
    return best * ALIGNMENT_SECONDS;
  };

  const asHours = (seconds) => `${(seconds / 3600).toFixed(1)}h`;
  const round = (v, step) => Math.ceil(v / step) * step;
  const fmt = (v) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });

  // A condition is matched on the policy name and its own duration: A30 carries two,
  // and they answer different questions at the same threshold field.
  const deployed = (() => {
    let doc;
    try {
      doc = JSON.parse(fs.readFileSync(policiesPath, "utf8") || "{}");
    } catch {
      return null;
    }
    if (!Array.isArray(doc.alertPolicies)) return null;
    const rows = [];
    for (const policy of doc.alertPolicies) {
      for (const condition of policy.conditions ?? []) {
        const threshold = condition.conditionThreshold;
        if (!threshold) continue;
        rows.push({
          policy: policy.displayName ?? "",
          duration: threshold.duration ?? "",
          value: Number(threshold.thresholdValue ?? 0),
          enabled: policy.enabled !== false,
        });
      }
    }
    return rows;
  })();

  const find = (prefix, duration) =>
    (deployed ?? []).find((row) => row.policy.startsWith(prefix) && (!duration || row.duration === duration));

  const breaches = [];

  // Measured against deployed, not against derived: a window that already crosses a live
  // threshold means the policy fired, and a fired policy is a finding, not an input.
  const compare = (name, measured, unit, row, note) => {
    if (!row) {
      console.log(`  ${name.padEnd(20)} ${fmt(measured)} ${unit}   (no deployed condition found)`);
      return;
    }
    const share = row.value === 0 ? Infinity : measured / row.value;
    let verdict = `${Math.round(share * 100)}% of ${fmt(row.value)}`;
    if (measured >= row.value) {
      verdict = `BREACH -- deployed ${fmt(row.value)} crossed`;
      breaches.push(name);
    }
    const off = row.enabled ? "" : "  [policy disabled]";
    console.log(`  ${name.padEnd(20)} ${fmt(measured)} ${unit}   ${verdict}${off}${note ?? ""}`);
  };

  // Its own row: the threshold alone is not the condition, the duration is half of it.
  const driftRow = (row) => {
    if (!row) {
      console.log(`  ${"A30 drift".padEnd(20)} median ${fmt(a30Median)} /s   (no deployed condition found)`);
      return;
    }
    const needed = Number(String(row.duration).replace("s", "")) || 0;
    const run = longestRunSeconds(row.value);
    if (run === null) {
      console.log(`  ${"A30 drift".padEnd(20)} median ${fmt(a30Median)} /s   (series unavailable)`);
      return;
    }
    const shape = `${asHours(run)} above ${fmt(row.value)}, condition needs ${asHours(needed)}`;
    const verdict = run >= needed ? `BREACH -- ${shape}` : `longest run ${shape}`;
    if (run >= needed) breaches.push("A30 drift");
    console.log(`  ${"A30 drift".padEnd(20)} median ${fmt(a30Median)} /s   ${verdict}`);
  };

  if (deployed === null) {
    console.log("Deployed thresholds: could not be read (monitoring.alertPolicies.list).");
    console.log("The derivations below still hold; the regression guard is skipped.");
  } else {
    console.log("Measured against what is deployed right now:");
    console.log("");
    compare("A29 write rate", a29Max, "/s ", find("A29"));
    compare("A30 spike", a30Max, "/s ", find("A30", "600s"));
    driftRow(find("A30", "10800s"));
    compare("A31 daily total", a31Max, "   ", find("A31"));
  }
  console.log("");

  if (breaches.length > 0) {
    const verb = breaches.length === 1 ? "crosses" : "cross";
    console.log(`!! ${breaches.join(", ")} already ${verb} a deployed threshold in this window.`);
    console.log("   Find the writer before touching anything below. A threshold moved up to");
    console.log("   fit what it just measured is no longer a ceiling, and the next runaway");
    console.log("   passes under it silently.");
    console.log("");
  }

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

  // A derivation that only ever moves up is a ratchet in the wrong direction.
  const loosened = [];
  const slack = (name, derivedValue, row) => {
    if (row && derivedValue > row.value) loosened.push(`${name} ${fmt(row.value)} -> ${fmt(derivedValue)}`);
  };
  slack("A29", a29, find("A29"));
  slack("A30 spike", round(a30Max * 3, 1), find("A30", "600s"));
  slack("A30 drift", round(a30Median * 2, 1), find("A30", "10800s"));
  slack("A31", a31, find("A31"));
  if (loosened.length > 0) {
    console.log("");
    console.log(`  Looser than deployed: ${loosened.join("; ")}.`);
    console.log("  Each one buys quiet by watching less. Take it only with a reason you can");
    console.log("  write in the CALIBRATION comment.");
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
' "$A29_MAX" "$A30_MAX" "$A30_MEDIAN" "$A31_MAX" "$TMP_POLICIES" "$TMP_A30"
