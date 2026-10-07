#!/usr/bin/env bash
# Runs one games-repo command and keeps its output out of the public log.
#
# This repo is public, so every Actions log is readable by anyone. The catalog
# gate checks out the private games repo, and the tools it runs print file
# paths, test names and, on failure, fragments of game source. This wrapper
# prints only the label, the exit code and the elapsed time, plus, on failure,
# the leading "FAIL <word> <slug>" token of each failure line and, when it is a
# known tool phrase (trace drift, cost regression, CDP timeout), its reason.
# Never free-form detail. Slugs are already public in the catalog. To see the details, rerun
# the same command locally in the games repo at the gated SHA.
#
# Usage: quiet-step.sh <command> [args...]
set -uo pipefail

label="$*"

log="$(mktemp)"
trap 'rm -f "$log"' EXIT
started=$SECONDS

"$@" >"$log" 2>&1 &
pid=$!
# A heartbeat, so a hung step is still visible as one.
next_beat=60
while kill -0 "$pid" 2>/dev/null; do
  sleep 1
  if [ $((SECONDS - started)) -ge "$next_beat" ] && kill -0 "$pid" 2>/dev/null; then
    echo "     ${label} still running ($((SECONDS - started))s)"
    next_beat=$((next_beat + 60))
  fi
done
wait "$pid"
code=$?

elapsed=$((SECONDS - started))
if [ "$code" -eq 0 ]; then
  echo "ok   ${label} (${elapsed}s)"
else
  echo "FAIL ${label} (exit ${code}, ${elapsed}s)"
  # Verdict word and slug, plus the reason only when it is a known safe phrase.
  # Free-form lines (field names, values, Check examples) can quote source.
  grep -E '^[[:space:]]*(FAIL|ERROR)[[:space:]]' "$log" \
    | sed -E 's/^[[:space:]]+//' \
    | sed -nE \
      -e 's/^((FAIL|ERROR)[[:space:]]+([a-z]+[[:space:]]+)?[a-z0-9]+(-[a-z0-9]+)*)[: ]+(behavior changed against the committed trace|cost regressed from [0-9]+ms to [0-9]+ms( \(>[0-9]+x baseline\))?|CDP timeout: [A-Za-z.]+).*/\1: \5/p' \
      -e 't' \
      -e 's/^((FAIL|ERROR)[[:space:]]+([a-z]+[[:space:]]+)?[a-z0-9]+(-[a-z0-9]+)*).*/\1/p' \
    | sort -u | head -n 40 | sed 's/^/       /' || true
  echo "::error title=${label} failed::Exit ${code}. Output is withheld from this public log; rerun it in the games repo at the gated SHA."
fi
exit "$code"
