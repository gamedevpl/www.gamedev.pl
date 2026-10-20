// Deletes a creator's vendor memory store when their account is erased.

import { MEMORY_BETA_HEADER } from './managed-anthropic-memory.js';
import { API_VERSION, DEFAULT_BASE_URL } from './managed-provider-anthropic.js';

export type CreatorMemoryEraser = (vendor: string, storeId: string) => Promise<void>;

export function createCreatorMemoryEraser(config: {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}): CreatorMemoryEraser {
  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  const fetchImpl = config.fetchImpl ?? fetch;
  return async (vendor, storeId) => {
    // A record names a vendor we cannot reach; erasing must not pretend.
    if (vendor !== 'anthropic') throw new Error(`no memory store eraser for vendor ${vendor}`);
    const response = await fetchImpl(`${baseUrl}/v1/memory_stores/${encodeURIComponent(storeId)}`, {
      method: 'DELETE',
      headers: { 'x-api-key': config.apiKey, 'anthropic-version': API_VERSION, 'anthropic-beta': MEMORY_BETA_HEADER },
      signal: AbortSignal.timeout(30_000),
    });
    // Already gone is the outcome erasure wants.
    if (!response.ok && response.status !== 404) {
      throw new Error(`anthropic memory store delete failed: ${response.status}`);
    }
  };
}

export function createCreatorMemoryEraserFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): CreatorMemoryEraser | undefined {
  const apiKey = env.MANAGED_AGENT_API_KEY?.trim();
  const baseUrl = env.MANAGED_AGENT_BASE_URL?.trim();
  return apiKey ? createCreatorMemoryEraser({ apiKey, ...(baseUrl ? { baseUrl } : {}) }) : undefined;
}
