#!/usr/bin/env bash
#
# Refuses to let an owner-run setup script run from a working tree that is behind master.
# Source it; do not execute it.
#
#   source "$(dirname "${BASH_SOURCE[0]}")/require-current-checkout.sh"
#
# Why this exists: these scripts write their whole object wholesale — an alert policy, a
# notification channel, an IAM binding — so running an old copy does not fail, it quietly
# reverts whatever the newer copy was written to fix. That is not hypothetical. On
# 2026-09-08 the spend brake's Pub/Sub channel and its `lanes` labels were restored at
# 00:29Z and stripped again at 08:02Z by a setup-monitoring.sh run from a tree that had
# not been pulled since the fix (#1227) landed eight hours earlier. The policies stayed
# enabled and kept emailing, so nothing looked wrong; the brake's fast half was dead for
# twelve hours. Every run after that faithfully merged the already-empty state forward,
# which made the fix look broken when it was not.
#
# The check is deliberately narrow: only a tree that does not contain origin/master is
# refused, and only when the running script actually differs there. Editing the script
# and running it is the normal way to develop one, so a tree that is ahead or dirty gets
# a warning and proceeds. ALLOW_STALE_CHECKOUT=1 overrides everything, for the case where
# the remote is unreachable and the run cannot wait.

# Captured here, at source time, and not inside the function: within a function call
# BASH_SOURCE[1] is wherever the call was written, which is this file. Reading it there
# checked this helper against master instead of the script that sourced it, and so passed
# a stale caller through whenever the helper itself happened to be current.
_RCC_CALLER="${BASH_SOURCE[1]:-}"

_require_current_checkout() {
  local script="${_RCC_CALLER}"
  [ -n "$script" ] || return 0

  if [ "${ALLOW_STALE_CHECKOUT:-}" = "1" ]; then
    echo "    ALLOW_STALE_CHECKOUT=1 — skipping the staleness check." >&2
    return 0
  fi

  local dir root
  dir="$(cd "$(dirname "$script")" && pwd)"
  root="$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null || true)"
  # Not a checkout at all — a copy on a bastion, say. Nothing to compare against.
  [ -n "$root" ] || return 0

  local rel
  rel="$(git -C "$root" ls-files --full-name --error-unmatch -- "$script" 2>/dev/null || true)"
  # Untracked or outside the repo: there is no upstream version of this file to be behind.
  [ -n "$rel" ] || return 0

  # Best effort. A missing network should slow a run down, not stop it, so a failed fetch
  # falls through to whatever origin/master this tree already knows about — which is the
  # stale case the check is for, and is still worth comparing against.
  local fetched=yes
  GIT_TERMINAL_PROMPT=0 git -C "$root" fetch --quiet origin master 2>/dev/null || fetched=no

  local upstream
  upstream="$(git -C "$root" rev-parse --verify --quiet origin/master 2>/dev/null || true)"
  if [ -z "$upstream" ]; then
    echo "    Note: no origin/master to compare against; staleness unchecked." >&2
    return 0
  fi

  local live want
  live="$(git -C "$root" hash-object -- "$script" 2>/dev/null || true)"
  want="$(git -C "$root" rev-parse --verify --quiet "origin/master:${rel}" 2>/dev/null || true)"
  # Same bytes as master: nothing to say, whatever the branch is doing.
  [ -n "$want" ] && [ "$live" = "$want" ] && return 0

  # Different bytes, but this tree already contains master — the difference is the
  # operator's own work, which is how these scripts get changed in the first place.
  if git -C "$root" merge-base --is-ancestor "$upstream" HEAD 2>/dev/null; then
    echo "    Note: ${rel} differs from origin/master, and this tree contains it." >&2
    echo "    Running your version." >&2
    return 0
  fi

  echo "" >&2
  echo "Refusing to run: ${rel} is not the version on master, and this tree is behind it." >&2
  echo "" >&2
  echo "  tree HEAD:      $(git -C "$root" rev-parse --short HEAD)" >&2
  echo "  origin/master:  $(git -C "$root" rev-parse --short "$upstream")" >&2
  [ "$fetched" = yes ] || echo "  (could not reach origin; comparing against the last fetch)" >&2
  echo "" >&2
  echo "These scripts write whole objects, so an old copy does not fail -- it reverts" >&2
  echo "whatever the newer copy fixed, silently and with everything still enabled." >&2
  echo "" >&2
  echo "  cd $(printf '%q' "$root") && git pull" >&2
  echo "" >&2
  echo "If the remote is unreachable and this cannot wait: ALLOW_STALE_CHECKOUT=1" >&2
  exit 1
}

_require_current_checkout
