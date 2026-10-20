import { erasePlayerSignals, type ErasePlayerSignalsResult } from './erase-player-signals.js';
import { DELETED_ACCOUNT_UID, type AccountIdentityDeletionResult, type Store } from './store.js';

export interface EraseAccountResult {
  signals: ErasePlayerSignalsResult;
  identity: AccountIdentityDeletionResult;
  // Vendor memory stores holding builder notes about this creator.
  creatorMemoryStores: number;
}

export class OperatorAccountDeletionError extends Error {
  constructor() {
    super('operator accounts must be demoted before deletion');
    this.name = 'OperatorAccountDeletionError';
  }
}

/**
 * Complete account erasure shared by self-service deletion and the operator CLI.
 *
 * Published games remain in the catalog under the platform owner. Unpublished jobs are
 * abandoned, and every submission is unlinked from the person's uid. The player-data
 * pass runs first because its indexed reads are deliberately ordered before writes;
 * both halves are idempotent so an interrupted operator run can be repeated safely.
 */
export async function eraseAccount(options: {
  store: Store;
  uid: string;
  dryRun?: boolean;
  at?: string;
  adminUids?: ReadonlySet<string>;
  eraseMemoryStore?: (vendor: string, storeId: string) => Promise<void>;
}): Promise<EraseAccountResult> {
  if (options.adminUids?.has(options.uid)) throw new OperatorAccountDeletionError();
  const dryRun = options.dryRun ?? false;
  const signals = await erasePlayerSignals({ store: options.store, uid: options.uid, dryRun });
  const creatorMemoryStores = await eraseCreatorMemory(options, dryRun);
  const submissions = await options.store.listSubmissionsByOwner(options.uid);
  const preview: AccountIdentityDeletionResult = {
    publishedSlugs: submissions
      .filter((submission) => Boolean(submission.publishedAt && submission.slug))
      .map((submission) => submission.slug!)
      .sort(),
    unpublishedSlugs: submissions
      .filter((submission) => !submission.publishedAt && submission.slug)
      .map((submission) => submission.slug!)
      .sort(),
  };
  const identity = dryRun
    ? preview
    : await options.store.deleteAccountIdentity(options.uid, options.at ?? new Date().toISOString());
  if (!dryRun) await moveShelf(options.store, options.uid, identity);
  return { signals, identity, creatorMemoryStores };
}

// Before the identity goes, so a failure leaves the erasure due again.
async function eraseCreatorMemory(
  options: { store: Store; uid: string; eraseMemoryStore?: (vendor: string, storeId: string) => Promise<void> },
  dryRun: boolean,
): Promise<number> {
  const records = await options.store.listCreatorMemory(options.uid);
  if (dryRun) return records.length;
  for (const record of records) {
    if (!options.eraseMemoryStore) throw new Error('creator memory exists but no eraser is configured');
    await options.eraseMemoryStore(record.vendor, record.storeId);
    // Index last: a remount must never find a deleted store.
    await options.store.deleteCreatorMemory(options.uid, record.vendor);
  }
  return records.length;
}

// Rounds moved owner, so both shelves are wrong.

// Tombstoned, not deleted: a delete resets seq and a stale rebuild wins.
async function moveShelf(store: Store, uid: string, identity: AccountIdentityDeletionResult): Promise<void> {
  const at = new Date().toISOString();
  // Each step alone: one cache failure skips nothing else.
  const attempt = async (step: () => Promise<unknown>): Promise<void> => {
    try {
      await step();
    } catch {
      // An erasure must never fail on a cache.
    }
  };

  await attempt(() => store.tombstoneShelf(uid, at));

  // Bulk rewrite, never through the mirror; members keep the old tip.
  for (const slug of new Set([...identity.publishedSlugs, ...identity.unpublishedSlugs])) {
    const access = await store.getGameAccess(slug).catch(() => null);
    if (!access) continue;
    for (const member of new Set([access.ownerUid, ...access.editorUids])) {
      if (member !== uid) await attempt(() => store.tombstoneShelf(member, at));
    }
  }
  await attempt(() => store.rebuildShelf(DELETED_ACCOUNT_UID));
}
