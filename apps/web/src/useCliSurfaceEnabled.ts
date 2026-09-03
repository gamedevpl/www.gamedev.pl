import { useEffect, useState } from 'react';

function cliEnabledUrl(): string {
  const origin = typeof window !== 'undefined' ? window.location?.origin : '';
  return origin ? `${origin}/api/cli/enabled` : '/api/cli/enabled';
}

export function useCliSurfaceEnabled(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(cliEnabledUrl());
        const body = (await res.json().catch(() => null)) as { enabled?: boolean } | null;
        if (!cancelled) setOn(res.ok && body?.enabled === true);
      } catch {
        if (!cancelled) setOn(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return on;
}
