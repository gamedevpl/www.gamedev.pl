import type { GamesStore } from './games-store.js';
import { GATE_ARTIFACT_URL_PATH } from './gate-artifact-routes.js';
import { retryStorageWrite } from './storage-write-retry.js';

export interface GateVerdictClientOptions {
  endpoint: string;
  token: string;
  // Defaults to the verdict endpoint's origin.
  artifactEndpoint?: string;
  fetchImpl?: typeof fetch;
}

type VerdictKind = 'gate' | 'preview' | 'health' | 'progress';

// Verdicts to the API; artifacts via URLs the API signs.
export function withRemoteVerdicts(store: GamesStore, options: GateVerdictClientOptions): GamesStore {
  const fetchImpl = options.fetchImpl ?? fetch;
  const artifactEndpoint = options.artifactEndpoint ?? new URL(GATE_ARTIFACT_URL_PATH, options.endpoint).toString();
  let artifactRouteMissing = false;

  async function putArtifact(slug: string, version: string, name: string, body: Buffer, contentType: string) {
    // 404: an API predating signed uploads, for builds queued across a deploy.
    if (artifactRouteMissing) return store.putDerivedArtifact(slug, version, name, body, contentType);
    const minted = await fetchImpl(artifactEndpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${options.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ slug, version, name }),
    });
    if (minted.status === 404) {
      artifactRouteMissing = true;
      return store.putDerivedArtifact(slug, version, name, body, contentType);
    }
    if (!minted.ok) {
      const detail = await minted.text().catch(() => '');
      throw new Error(`gate artifact ${name} refused: ${minted.status} ${detail.slice(0, 200)}`);
    }
    // Sent verbatim: the signature covers these headers.
    const { url, headers } = (await minted.json()) as { url: string; headers: Record<string, string> };
    const upload = await retryStorageWrite(() =>
      fetchImpl(url, { method: 'PUT', headers, body: new Uint8Array(body) }),
    );
    if (!upload.ok) {
      const detail = await upload.text().catch(() => '');
      throw new Error(`gate artifact ${name} upload failed: ${upload.status} ${detail.slice(0, 200)}`);
    }
  }

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
    putDerivedArtifact: putArtifact,
  };
}
