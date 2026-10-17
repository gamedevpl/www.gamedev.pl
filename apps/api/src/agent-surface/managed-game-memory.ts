// Finds or creates the game's memory store; failure skips memory.

import type { GameMemoryStore } from '../platform/store.js';
import type { ManagedAgentProvider } from './managed-agent.js';

export type GameMemoryIndex = Pick<GameMemoryStore, 'getGameMemory' | 'claimGameMemory'>;

export async function resolveGameMemory(
  provider: Pick<ManagedAgentProvider, 'vendor' | 'createMemoryStore' | 'deleteMemoryStore'>,
  index: GameMemoryIndex | undefined,
  slug: string | undefined,
  log?: { warn: (context: object, message: string) => void },
  now: () => Date = () => new Date(),
): Promise<string | undefined> {
  if (!index || !slug || !provider.createMemoryStore) return undefined;
  let unclaimed: string | undefined;
  try {
    const existing = await index.getGameMemory(slug, provider.vendor);
    if (existing) return existing.storeId;
    const storeId = await provider.createMemoryStore(slug);
    unclaimed = storeId;
    const held = await index.claimGameMemory({
      slug,
      vendor: provider.vendor,
      storeId,
      createdAt: now().toISOString(),
    });
    unclaimed = undefined;
    // A concurrent round claimed the slot first; ours would be orphaned.
    if (held.storeId !== storeId) void provider.deleteMemoryStore?.(storeId).catch(() => undefined);
    return held.storeId;
  } catch (error) {
    // A store the index never recorded would leak on every retry.
    if (unclaimed) void provider.deleteMemoryStore?.(unclaimed).catch(() => undefined);
    log?.warn({ err: error, slug }, 'game memory store unavailable; starting the round without it');
    return undefined;
  }
}
