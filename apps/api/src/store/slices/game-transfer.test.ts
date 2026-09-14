import { describe, expect, it } from 'vitest';
import { InMemoryStore } from '../../platform/store.js';

const AT = '2026-01-01T00:00:00.000Z';
const LATER = '2026-01-02T00:00:00.000Z';
const AFTER_EXPIRY = '2026-01-09T00:00:00.000Z';

describe('game transfer store slice', () => {
  it('creates a pending invitation and reports it active', async () => {
    const store = new InMemoryStore();
    const invite = await store.createGameTransferInvitation('sky', 'g:ada', 'g:grace', 1, AT);
    expect(invite).not.toBe('busy');
    if (invite === 'busy') throw new Error('unreachable');
    expect(invite.status).toBe('pending');

    const active = await store.getActiveGameTransfer('sky', LATER);
    expect(active?.status).toBe('pending');
    expect(active?.recipientUid).toBe('g:grace');
  });

  it('refuses a second invitation while one is pending', async () => {
    const store = new InMemoryStore();
    await store.createGameTransferInvitation('sky', 'g:ada', 'g:grace', 1, AT);
    const second = await store.createGameTransferInvitation('sky', 'g:ada', 'g:someone-else', 1, LATER);
    expect(second).toBe('busy');
  });

  it('allows a new invitation once the pending one has expired', async () => {
    const store = new InMemoryStore();
    await store.createGameTransferInvitation('sky', 'g:ada', 'g:grace', 1, AT);
    const second = await store.createGameTransferInvitation('sky', 'g:ada', 'g:someone-else', 1, AFTER_EXPIRY);
    expect(second).not.toBe('busy');
  });

  it('cancel only works for the sender, and frees the slug for a new invitation', async () => {
    const store = new InMemoryStore();
    await store.createGameTransferInvitation('sky', 'g:ada', 'g:grace', 1, AT);

    expect(await store.cancelGameTransferInvitation('sky', 'g:grace', LATER)).toBeNull();
    const cancelled = await store.cancelGameTransferInvitation('sky', 'g:ada', LATER);
    expect(cancelled?.status).toBe('cancelled');

    const reinvite = await store.createGameTransferInvitation('sky', 'g:ada', 'g:someone-else', 1, LATER);
    expect(reinvite).not.toBe('busy');
  });

  it('reject only works for the recipient', async () => {
    const store = new InMemoryStore();
    await store.createGameTransferInvitation('sky', 'g:ada', 'g:grace', 1, AT);

    expect(await store.rejectGameTransferInvitation('sky', 'g:ada', LATER)).toBeNull();
    const rejected = await store.rejectGameTransferInvitation('sky', 'g:grace', LATER);
    expect(rejected?.status).toBe('rejected');
  });

  it('lists only what is still pending for a recipient', async () => {
    const store = new InMemoryStore();
    await store.createGameTransferInvitation('sky', 'g:ada', 'g:grace', 1, AT);
    await store.createGameTransferInvitation('lake', 'g:bob', 'g:grace', 1, AT);
    await store.rejectGameTransferInvitation('lake', 'g:grace', LATER);

    const pending = await store.listPendingGameTransfersForRecipient('g:grace', LATER);
    expect(pending.map((t) => t.slug)).toEqual(['sky']);
  });

  it('nothing is active for a slug with no invitation', async () => {
    const store = new InMemoryStore();
    expect(await store.getActiveGameTransfer('nowhere', AT)).toBeNull();
  });

  it('refuses to create an invitation naming an already-erased sender or recipient', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:ada' });
    await store.upsertUser({ uid: 'g:grace' });
    await store.upsertUser({ uid: 'g:mallory' });
    await store.deleteAccountIdentity('g:ada', AT);

    expect(await store.createGameTransferInvitation('sky', 'g:ada', 'g:grace', 1, LATER)).toBe('ineligible');
    expect(await store.createGameTransferInvitation('lake', 'g:mallory', 'g:ada', 1, LATER)).toBe('ineligible');
  });

  it('account erasure scrubs every invitation naming the erased uid', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:ada' });
    await store.upsertUser({ uid: 'g:grace' });
    await store.createGameTransferInvitation('sky', 'g:ada', 'g:grace', 1, AT);

    await store.deleteAccountIdentity('g:grace', LATER);

    expect(await store.getActiveGameTransfer('sky', LATER)).toBeNull();
    expect(await store.listPendingGameTransfersForRecipient('g:grace', LATER)).toEqual([]);
  });
});
