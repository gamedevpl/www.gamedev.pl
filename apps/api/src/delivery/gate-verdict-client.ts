import type { GamesStore } from './games-store.js';

export interface GateVerdictClientOptions {
  endpoint: string;
  token: string;
  fetchImpl?: typeof fetch;
}

type VerdictKind = 'gate' | 'preview' | 'health' | 'progress';

// Manifest writers go to the API; the rest stay on the bucket.
export function withRemoteVerdicts(store: GamesStore, options: GateVerdictClientOptions): GamesStore {
  const fetchImpl = options.fetchImpl ?? fetch;

  async function post(kind: VerdictKind, slug: string, version: string, result: unknown): Promise<void> {
    const response = await fetchImpl(options.endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${options.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ slug, version, kind, result }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`gate verdict ${kind} refused: ${response.status} ${detail.slice(0, 200)}`);
    }
  }

  return {
    ...store,
    putGateResult: (slug, version, result) => post('gate', slug, version, result),
    putPreviewGateResult: (slug, version, result) => post('preview', slug, version, result),
    putHealthResult: (slug, version, result) => post('health', slug, version, result),
    putGateProgress: (slug, version, progress) => post('progress', slug, version, progress),
  };
}
