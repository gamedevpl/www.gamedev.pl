import type { Store } from './store.js';
// Before the identity goes, so a failure leaves the erasure due again.
export async function eraseCreatorMemory(
  options: {
    store: Store;
    uid: string;
    at: string;
    eraseMemoryStore?: (vendor: string, storeId: string) => Promise<void>;
  },
  dryRun: boolean,
): Promise<number> {
  if (dryRun) return (await options.store.listCreatorMemory(options.uid)).length;
  // Fence before listing: a round racing us sees it and backs out.
  await options.store.beginAccountErasure(options.uid, options.at);
  await options.store.deletePlayJournalsByOwner(options.uid);
  const records = await options.store.listCreatorMemory(options.uid);
  // First, so no nudge or repair can remount what is deleted below.
  await options.store.clearMemoryOwner(options.uid);
  for (const record of records) {
    if (!options.eraseMemoryStore) throw new Error('creator memory exists but no eraser is configured');
    await options.eraseMemoryStore(record.vendor, record.storeId);
    // Index last: a remount must never find a deleted store.
    await options.store.deleteCreatorMemory(options.uid, record.vendor);
  }
  return records.length;
}
