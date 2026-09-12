import { describe, expect, it, vi } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import { createReviewQueueCache } from './review-queue-cache.js';
import type { ReviewCatalogEntry } from './review-queue-cache.js';

const emptyCatalog: ReviewCatalogEntry[] = [];

async function storeWithDrafts(drafts: Array<{ jobId: number; slug: string; ownerUid: string }>) {
  const store = new InMemoryStore();
  const at = new Date().toISOString();
  for (const draft of drafts) {
    await store.upsertUser({ uid: draft.ownerUid });
    await store.claimHandle(draft.ownerUid, draft.ownerUid.replace('g:', ''), at);
    await store.createSubmission(draft.jobId, draft.ownerUid, `Game ${draft.jobId}`);
    await store.setSubmissionSlug(draft.jobId, draft.slug);
    await store.setSubmissionDeliveredVersion(draft.jobId, 'v1');
    await store.setDraftShared(draft.jobId, at);
  }
  return store;
}

describe('creator handles on the review queue', () => {
  it('reads one user per distinct creator, not one per queued draft', async () => {
    const store = await storeWithDrafts([
      { jobId: 1, slug: 'one', ownerUid: 'g:ada' },
      { jobId: 2, slug: 'two', ownerUid: 'g:ada' },
      { jobId: 3, slug: 'three', ownerUid: 'g:ada' },
      { jobId: 4, slug: 'four', ownerUid: 'g:pixel' },
    ]);
    const getUser = vi.spyOn(store, 'getUser');
    const cache = createReviewQueueCache({ store, listCatalog: async () => emptyCatalog, now: () => Date.now() });

    const items = await cache.collectPool('creator');

    expect(items.map((item) => item.slug).sort()).toEqual(['four', 'one', 'three', 'two']);
    expect(items.find((item) => item.slug === 'two')?.creatorHandle).toBe('ada');
    expect(items.find((item) => item.slug === 'four')?.creatorHandle).toBe('pixel');
    expect(getUser).toHaveBeenCalledTimes(2);
  });

  it('answers a later pool from the handle window instead of reading again', async () => {
    let clock = 1_700_000_000_000;
    const store = await storeWithDrafts([{ jobId: 1, slug: 'one', ownerUid: 'g:ada' }]);
    const getUser = vi.spyOn(store, 'getUser');
    const cache = createReviewQueueCache({ store, listCatalog: async () => emptyCatalog, now: () => clock });

    await cache.collectPool('creator');
    clock += 60_000;
    await cache.collectPool('creator', { fresh: true });
    expect(getUser).toHaveBeenCalledTimes(1);

    clock += 10 * 60_000;
    await cache.collectPool('creator', { fresh: true });
    expect(getUser).toHaveBeenCalledTimes(2);
  });

  it('leaves the handle null when the user read fails', async () => {
    const store = await storeWithDrafts([{ jobId: 1, slug: 'one', ownerUid: 'g:ada' }]);
    vi.spyOn(store, 'getUser').mockRejectedValue(new Error('firestore is down'));
    const cache = createReviewQueueCache({ store, listCatalog: async () => emptyCatalog, now: () => Date.now() });

    const items = await cache.collectPool('creator');
    expect(items).toHaveLength(1);
    expect(items[0].creatorHandle).toBeNull();
  });
});
