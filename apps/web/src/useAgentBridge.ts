// Fetches the agent executor; the API serves it to reviewers only.

// The fetch result is the gate, never the session hint.

import { useEffect, useState } from 'react';
import { useAuth } from './AuthContext.js';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

// undefined while unknown, so the frame waits instead of reloading.
export type AgentBridgeState = string | null | undefined;

export function useAgentBridge(enabled: boolean): AgentBridgeState {
  const { user } = useAuth();
  // The hint spares others a certain 404; it grants nothing.
  const hinted = Boolean(user?.reviewer);
  const [source, setSource] = useState<AgentBridgeState>(undefined);

  useEffect(() => {
    if (!enabled || !hinted) {
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
  }, [enabled, hinted]);

  return source;
}
