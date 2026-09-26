import type { Store } from '../platform/store.js';

// Write under the authed generation; null when a bump moved it since.
export async function authedRoundGeneration(
  store: Pick<Store, 'ensureRoundGeneration'> | undefined,
  jobId: number,
  authedGeneration: number | undefined,
): Promise<number | null> {
  const current = store
    ? ((await store.ensureRoundGeneration(jobId)) ?? authedGeneration ?? 1)
    : (authedGeneration ?? 1);
  if (authedGeneration !== undefined && current !== authedGeneration) return null;
  return current;
}
