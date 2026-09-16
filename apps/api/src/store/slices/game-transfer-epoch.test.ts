// The revocation epoch: which rounds keep their keys across a handover.

import { describe, expect, it } from 'vitest';
import { InMemoryStore } from '../../platform/store.js';
import { resolveGameAccess, roundAuthorityCurrent } from '../../platform/game-access-resolve.js';

const AT = '2026-01-01T00:00:00.000Z';
const LATER = '2026-01-02T00:00:00.000Z';

// The store-level handover, for cases the routes cannot reach.
async function handOverThroughStore(
  store: InMemoryStore,
  slug: string,
  from: string,
  to: string,
  at: string,
): Promise<void> {
  const code = (await store.ensureRecipientCode(to, at))!;
  const revision = (await store.getGameAccess(slug))!.accessRevision;
  await store.createGameTransferInvitation(slug, from, to, revision, at, code);
  const invite = (await store.getActiveGameTransfer(slug, at))!;
  await store.acceptGameTransferInvitation(slug, to, at, invite.invitationId);
}

describe('round authority across a handover', () => {
  it('fences a round that never recorded an epoch once the game changes hands', async () => {
    // The deployed population: rounds opened before accessEpoch existed.
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:ada' });
    await store.upsertUser({ uid: 'g:grace' });
    const jobId = await store.allocateJobId();
    await store.createSubmission(jobId, 'g:ada', 'Sky');
    await store.setSubmissionSlug(jobId, 'sky');
    await store.ensureGameAccess('sky', 'g:ada', AT, AT);
    expect((await store.getSubmission(jobId))?.accessEpoch).toBeUndefined();

    await handOverThroughStore(store, 'sky', 'g:ada', 'g:grace', AT);
    await handOverThroughStore(store, 'sky', 'g:grace', 'g:ada', LATER);

    // Owned by ada again, but this round's keys stay revoked.
    const record = (await store.getSubmission(jobId))!;
    expect(roundAuthorityCurrent(record, await resolveGameAccess(store, 'sky'))).toBe(false);
  });

  it('lets a cancel that lands mid-accept win, rather than being overwritten', async () => {
    let release: (idle: boolean) => void = () => {};
    const recovery = new Promise<boolean>((resolve) => {
      release = resolve;
    });
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:ada' });
    await store.upsertUser({ uid: 'g:grace' });
    await store.ensureGameAccess('sky', 'g:ada', AT, AT);
    const code = (await store.ensureRecipientCode('g:grace', AT))!;
    await store.createGameTransferInvitation('sky', 'g:ada', 'g:grace', 1, AT, code);
    const invite = (await store.getActiveGameTransfer('sky', AT))!;
    (
      store as unknown as { submissionStore: { hasActiveCheckoutRecovery: unknown } }
    ).submissionStore.hasActiveCheckoutRecovery = () => recovery;

    const accepting = store.acceptGameTransferInvitation('sky', 'g:grace', AT, invite.invitationId);
    await Promise.resolve();
    const cancelled = await store.cancelGameTransferInvitation('sky', 'g:ada', AT, invite.invitationId);
    release(false);

    expect(cancelled?.status).toBe('cancelled');
    expect(await accepting).toBeNull();
    expect((await store.getGameAccess('sky'))?.ownerUid).toBe('g:ada');
  });

  it('lets the new owner open a round on the game they were handed', async () => {
    // Fail-closed must not lock the recipient out of their own game.
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:ada' });
    await store.upsertUser({ uid: 'g:grace' });
    const first = await store.allocateJobId();
    await store.createSubmission(first, 'g:ada', 'Sky');
    await store.setSubmissionSlug(first, 'sky');
    await store.ensureGameAccess('sky', 'g:ada', AT, AT);
    await handOverThroughStore(store, 'sky', 'g:ada', 'g:grace', AT);

    const fresh = await store.allocateJobId();
    await store.createSubmission(fresh, 'g:grace', 'Sky improve');
    await store.setSubmissionSlug(fresh, 'sky');
    await store.ensureRoundGeneration(fresh);

    const record = (await store.getSubmission(fresh))!;
    expect(roundAuthorityCurrent(record, await resolveGameAccess(store, 'sky'))).toBe(true);
  });

  it('does not let a previous owner round pick up the epoch that way', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:ada' });
    await store.upsertUser({ uid: 'g:grace' });
    const first = await store.allocateJobId();
    await store.createSubmission(first, 'g:ada', 'Sky');
    await store.setSubmissionSlug(first, 'sky');
    await store.ensureGameAccess('sky', 'g:ada', AT, AT);
    await handOverThroughStore(store, 'sky', 'g:ada', 'g:grace', AT);

    await store.ensureRoundGeneration(first);

    const stale = (await store.getSubmission(first))!;
    expect(stale.accessEpoch).toBeUndefined();
    expect(roundAuthorityCurrent(stale, await resolveGameAccess(store, 'sky'))).toBe(false);
  });
});
