// What an incoming-transfer poll costs, and whose window it is.

import { describe, expect, it, vi } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import { invalidateTransferInboxCache, readIncomingTransfersCached } from './transfer-inbox-cache.js';

const AT = '2026-01-01T00:00:00.000Z';

async function pendingInvite(store: InMemoryStore, slug: string, senderUid: string, recipientUid: string) {
  await store.ensureGameAccess(slug, senderUid, AT, AT);
  await store.createGameTransferInvitation(slug, senderUid, recipientUid, 1, AT);
}

describe('incoming-transfer read window', () => {
  it('reads once across a window of polls', async () => {
    const store = new InMemoryStore();
    await pendingInvite(store, 'sky', 'g:ada', 'g:grace');
    const spy = vi.spyOn(store, 'listPendingGameTransfersForRecipient');
    let clock = 1_700_000_000_000;

    for (let i = 0; i < 5; i += 1) {
      const rows = await readIncomingTransfersCached(store, 'g:grace', AT, () => clock);
      expect(rows.map((r) => r.slug)).toEqual(['sky']);
      clock += 60_000;
    }

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('re-reads once the window is over', async () => {
    const store = new InMemoryStore();
    await pendingInvite(store, 'sky', 'g:ada', 'g:grace');
    const spy = vi.spyOn(store, 'listPendingGameTransfersForRecipient');
    let clock = 1_700_000_000_000;

    await readIncomingTransfersCached(store, 'g:grace', AT, () => clock);
    clock += 6 * 60_000;
    await readIncomingTransfersCached(store, 'g:grace', AT, () => clock);

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('drops the window when asked, so a fresh invite shows on the next poll', async () => {
    const store = new InMemoryStore();
    await pendingInvite(store, 'sky', 'g:ada', 'g:grace');
    const clock = () => 1_700_000_000_000;
    await readIncomingTransfersCached(store, 'g:grace', AT, clock);

    await pendingInvite(store, 'lake', 'g:bob', 'g:grace');
    expect((await readIncomingTransfersCached(store, 'g:grace', AT, clock)).map((r) => r.slug)).toEqual(['sky']);

    invalidateTransferInboxCache(store, 'g:grace');
    expect((await readIncomingTransfersCached(store, 'g:grace', AT, clock)).map((r) => r.slug).sort()).toEqual([
      'lake',
      'sky',
    ]);
  });

  it('re-filters a cache hit against the request time, not the cached one', async () => {
    const store = new InMemoryStore();
    await pendingInvite(store, 'sky', 'g:ada', 'g:grace');
    const clock = () => 1_700_000_000_000;
    // Populates the window while the invite is still pending.
    expect(await readIncomingTransfersCached(store, 'g:grace', AT, clock)).toHaveLength(1);

    // Still inside the window, but past the invite's own expiry.
    const afterExpiry = '2026-01-09T00:00:00.000Z';
    expect(await readIncomingTransfersCached(store, 'g:grace', afterExpiry, clock)).toEqual([]);
  });
});
