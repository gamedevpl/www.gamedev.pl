// Fetches the agent executor; the API serves it to reviewers only.

// The fetch result is the gate, never the session hint.

import { useEffect, useState } from 'react';
import { agentModeRequested } from './agentPlay.js';
import { useAuth } from './AuthContext.js';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

// Settle timeout bounds hold without stalling regular play.
export const AUTH_HOLD_TIMEOUT_MS = 1500;

export const REVIEWER_HINT_STORAGE_KEY = 'gamedev_reviewer_hint';

export function readReviewerHint(): boolean {
  try {
    return window.localStorage.getItem(REVIEWER_HINT_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeReviewerHint(isReviewer: boolean): void {
  try {
    if (isReviewer) {
      window.localStorage.setItem(REVIEWER_HINT_STORAGE_KEY, '1');
    } else {
      window.localStorage.removeItem(REVIEWER_HINT_STORAGE_KEY);
    }
  } catch {
    // Ignore storage restrictions.
  }
}

// undefined while unknown, so the frame waits instead of reloading.
export type AgentBridgeState = string | null | undefined;

export function useAgentBridge(enabled: boolean): AgentBridgeState {
  const { user, loading } = useAuth();
  const authLoading = Boolean(loading);
  const hinted = Boolean(user?.reviewer);
  // Hold only when a reviewer is plausible, avoiding stalls for others.
  const plausible = hinted || agentModeRequested() || readReviewerHint();

  const [timedOut, setTimedOut] = useState(false);
  const [source, setSource] = useState<AgentBridgeState>(() =>
    !enabled || !plausible || (!authLoading && !hinted) ? null : undefined,
  );

  // Fallback timeout bounds the hold if auth hangs or is slow.
  useEffect(() => {
    if (!enabled || !plausible || !authLoading || timedOut) return;
    const timer = setTimeout(() => {
      setTimedOut(true);
      setSource(null);
    }, AUTH_HOLD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [enabled, plausible, authLoading, timedOut]);

  useEffect(() => {
    if (!enabled || !plausible) {
      setSource(null);
      return;
    }
    if (authLoading) {
      if (!timedOut) setSource(undefined);
      return;
    }
    writeReviewerHint(hinted);
    if (!hinted) {
      setSource(null);
      return;
    }
    let cancelled = false;
    const abort = new AbortController();
    setSource(undefined);

    fetch(`${API_BASE}/api/agent-play/bridge`, { credentials: 'include', signal: abort.signal })
      .then(async (response) => {
        if (!response.ok) return null;
        const body = (await response.json()) as { source?: unknown };
        return typeof body?.source === 'string' && body.source.length > 0 ? body.source : null;
      })
      .catch(() => null)
      .then((next) => {
        if (!cancelled) setSource(next);
      });

    return () => {
      cancelled = true;
      abort.abort();
    };
  }, [enabled, plausible, authLoading, hinted, timedOut]);

  return source;
}
