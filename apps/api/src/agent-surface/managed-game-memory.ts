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
  try {
    const existing = await index.getGameMemory(slug, provider.vendor);
    if (existing) return existing.storeId;
    const storeId = await provider.createMemoryStore(slug);
    const held = await index.claimGameMemory({
      slug,
      vendor: provider.vendor,
      storeId,
      createdAt: now().toISOString(),
    });
    // A concurrent round claimed the slot first; ours would be orphaned.
    if (held.storeId !== storeId) void provider.deleteMemoryStore?.(storeId).catch(() => undefined);
    return held.storeId;
  } catch (error) {
    log?.warn({ err: error, slug }, 'game memory store unavailable; starting the round without it');
    return undefined;
  }
}
