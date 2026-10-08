import { useCallback, useEffect, useState } from 'react';
import { fetchSharedTune } from './remixApi.js';
import type { EditorParamValue } from './studioApi.js';

// Server-vouched params from a signed ?remix= code; refused links play normally.
export function useSharedTune(slug: string, enabled: boolean): [Record<string, EditorParamValue> | null, () => void] {
  const [code] = useState(() => new URLSearchParams(window.location.search).get('remix'));
  const [params, setParams] = useState<Record<string, EditorParamValue> | null>(null);

  useEffect(() => {
    if (!enabled || !code) return;
    let cancelled = false;
    void fetchSharedTune(slug, code).then((tune) => {
      if (!cancelled && tune && Object.keys(tune).length > 0) setParams(tune);
    });
    return () => {
      cancelled = true;
    };
  }, [slug, code, enabled]);

  const clear = useCallback(() => setParams(null), []);
  return [params, clear];
}
