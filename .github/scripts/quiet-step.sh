#!/usr/bin/env bash
# Runs one games-repo command and keeps its output out of the public log.
#
# This repo is public, so every Actions log is readable by anyone. The catalog
# gate checks out the private games repo, and the tools it runs print file
# paths, test names and, on failure, fragments of game source. This wrapper
# prints only the label, the exit code and the elapsed time. To see the details,
# rerun the same command locally in the games repo at the gated SHA.
#
# Usage: quiet-step.sh <command> [args...]
set -uo pipefail

label="$*"

started=$SECONDS

out_file=$(mktemp)

"$@" >"$out_file" 2>&1 &
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
  rm -f "$out_file"
else
  echo "FAIL ${label} (exit ${code}, ${elapsed}s)"
  echo "::error title=${label} failed::Exit ${code}."
  # Print high-level error and failure summaries (e.g. FAIL, error, cost regressions, diffs)
  grep -E '(^FAIL |^  - |regressed from|looks like padding|rose to .* baseline|Check .* failed|the game rendered|raw diff lines)' "$out_file" | head -n 100 || true
  rm -f "$out_file"
fi
exit "$code"
