// Finds or creates the creator's memory store; failure skips memory.

import { createHash } from 'node:crypto';
import type { CreatorMemoryStore, Store } from '../platform/store.js';
import { erasedIncarnation } from '../store/records/game-access.js';
import type { ManagedAgentProvider } from './managed-agent.js';

export type CreatorMemoryIndex = Pick<
  CreatorMemoryStore,
  'getCreatorMemory' | 'claimCreatorMemory' | 'deleteCreatorMemory'
> &
  Pick<Store, 'getAccountErasure' | 'getUser'>;

// The vendor and the agent see this label, never the uid.
export function creatorMemoryLabel(ownerUid: string): string {
  return createHash('sha256').update(ownerUid).digest('hex').slice(0, 16);
}

export async function resolveCreatorMemory(
  provider: Pick<ManagedAgentProvider, 'vendor' | 'createMemoryStore' | 'deleteMemoryStore'>,
  index: CreatorMemoryIndex | undefined,
  ownerUid: string | undefined,
  log?: { warn: (context: object, message: string) => void },
  now: () => Date = () => new Date(),
): Promise<string | undefined> {
  if (!index || !ownerUid || !provider.createMemoryStore) return undefined;
  // A same-uid signup after erasure is a new, unfenced incarnation.
  const erased = async () => erasedIncarnation(await index.getUser(ownerUid), await index.getAccountErasure(ownerUid));
  let unclaimed: string | undefined;
  try {
    if (await erased()) return undefined;
    const existing = await index.getCreatorMemory(ownerUid, provider.vendor);
    if (existing) return existing.storeId;
    const storeId = await provider.createMemoryStore(creatorMemoryLabel(ownerUid));
    unclaimed = storeId;
    const held = await index.claimCreatorMemory({
      ownerUid,
      vendor: provider.vendor,
      storeId,
      createdAt: now().toISOString(),
    });
    unclaimed = undefined;
    // A concurrent round claimed the slot first; ours would be orphaned.
    if (held.storeId !== storeId) void provider.deleteMemoryStore?.(storeId).catch(() => undefined);
    // Erasure fences, then lists; a claim after its list must undo itself.
    if (await erased()) {
      await provider.deleteMemoryStore?.(held.storeId);
      await index.deleteCreatorMemory(ownerUid, provider.vendor);
      return undefined;
    }
    return held.storeId;
  } catch (error) {
    // A store the index never recorded would leak on every retry.
    if (unclaimed) void provider.deleteMemoryStore?.(unclaimed).catch(() => undefined);
    log?.warn({ err: error }, 'creator memory store unavailable; starting the round without it');
    return undefined;
  }
}
