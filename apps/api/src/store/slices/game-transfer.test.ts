import { describe, expect, it } from 'vitest';
import { InMemoryStore } from '../../platform/store.js';
import { MAX_REVOKED_ROUNDS_PER_TRANSFER } from './game-transfer.js';
import { revokedRoundGeneration } from '../../creation/job-state.js';

// A response names the offer it answers, so a test has to look the id up.
async function offerId(store: InMemoryStore, slug: string, at: string): Promise<string> {
  const invite = await store.getActiveGameTransfer(slug, at);
  return invite?.invitationId ?? 'no-open-offer';
}

const AT = '2026-01-01T00:00:00.000Z';
const LATER = '2026-01-02T00:00:00.000Z';
const AFTER_EXPIRY = '2026-01-09T00:00:00.000Z';

// A fresh GameAccess record starts at revision 1, matching the tests below.
async function ownedGame(store: InMemoryStore, slug: string, ownerUid: string) {
  await store.ensureGameAccess(slug, ownerUid, AT, AT);
}

describe('game transfer store slice', () => {
  it('creates a pending invitation and reports it active', async () => {
    const store = new InMemoryStore();
    await ownedGame(store, 'sky', 'g:ada');
    const invite = await store.createGameTransferInvitation('sky', 'g:ada', 'g:grace', 1, AT);
    expect(invite).not.toBe('busy');
    if (typeof invite === 'string') throw new Error('unreachable');
    expect(invite.status).toBe('pending');

    const active = await store.getActiveGameTransfer('sky', LATER);
    expect(active?.status).toBe('pending');
    expect(active?.recipientUid).toBe('g:grace');
  });

  it('refuses a second invitation while one is pending', async () => {
    const store = new InMemoryStore();
    await ownedGame(store, 'sky', 'g:ada');
    await store.createGameTransferInvitation('sky', 'g:ada', 'g:grace', 1, AT);
    const second = await store.createGameTransferInvitation('sky', 'g:ada', 'g:someone-else', 1, LATER);
    expect(second).toBe('busy');
  });

  it('allows a new invitation once the pending one has expired', async () => {
    const store = new InMemoryStore();
    await ownedGame(store, 'sky', 'g:ada');
    await store.createGameTransferInvitation('sky', 'g:ada', 'g:grace', 1, AT);
    const second = await store.createGameTransferInvitation('sky', 'g:ada', 'g:someone-else', 1, AFTER_EXPIRY);
    expect(second).not.toBe('busy');
  });

  it('cancel only works for the sender, and frees the slug for a new invitation', async () => {
    const store = new InMemoryStore();
    await ownedGame(store, 'sky', 'g:ada');
    await store.createGameTransferInvitation('sky', 'g:ada', 'g:grace', 1, AT);

    expect(
      await store.cancelGameTransferInvitation('sky', 'g:grace', LATER, await offerId(store, 'sky', LATER)),
    ).toBeNull();
    const cancelled = await store.cancelGameTransferInvitation(
      'sky',
      'g:ada',
      LATER,
      await offerId(store, 'sky', LATER),
    );
    expect(cancelled?.status).toBe('cancelled');

    const reinvite = await store.createGameTransferInvitation('sky', 'g:ada', 'g:someone-else', 1, LATER);
    expect(reinvite).not.toBe('busy');
  });

  it('reject only works for the recipient', async () => {
    const store = new InMemoryStore();
    await ownedGame(store, 'sky', 'g:ada');
    await store.createGameTransferInvitation('sky', 'g:ada', 'g:grace', 1, AT);

    expect(
      await store.rejectGameTransferInvitation('sky', 'g:ada', LATER, await offerId(store, 'sky', LATER)),
    ).toBeNull();
    const rejected = await store.rejectGameTransferInvitation(
      'sky',
      'g:grace',
      LATER,
      await offerId(store, 'sky', LATER),
    );
    expect(rejected?.status).toBe('rejected');
  });

  it('lists only what is still pending for a recipient', async () => {
    const store = new InMemoryStore();
    await ownedGame(store, 'sky', 'g:ada');
    await ownedGame(store, 'lake', 'g:bob');
    await store.createGameTransferInvitation('sky', 'g:ada', 'g:grace', 1, AT);
    await store.createGameTransferInvitation('lake', 'g:bob', 'g:grace', 1, AT);
    await store.rejectGameTransferInvitation('lake', 'g:grace', LATER, await offerId(store, 'lake', LATER));

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
    await ownedGame(store, 'sky', 'g:ada');
    await store.createGameTransferInvitation('sky', 'g:ada', 'g:grace', 1, AT);

    await store.deleteAccountIdentity('g:grace', LATER);

    expect(await store.getActiveGameTransfer('sky', LATER)).toBeNull();
    expect(await store.listPendingGameTransfersForRecipient('g:grace', LATER)).toEqual([]);
  });

  it('refuses to create when the sender is no longer the canonical owner', async () => {
    const store = new InMemoryStore();
    await ownedGame(store, 'sky', 'g:ada');
    // Someone else settles ownership between the caller's read and this call.
    await store.recordSettledOwner('sky', 'g:grace', 2, AT, LATER);

    const stale = await store.createGameTransferInvitation('sky', 'g:ada', 'g:mallory', 1, LATER);
    expect(stale).toBe('stale_owner');
  });

  it('refuses to create against a stale access revision, even for the current owner', async () => {
    const store = new InMemoryStore();
    await ownedGame(store, 'sky', 'g:ada');
    // Any authority change bumps the revision, e.g. a GO-03 editor.
    await store.recordSettledOwner('sky', 'g:ada', 2, AT, LATER);

    const stale = await store.createGameTransferInvitation('sky', 'g:ada', 'g:mallory', 1, LATER);
    expect(stale).toBe('stale_owner');
  });

  it('a game with no canonical record yet refuses every revision, including 0', async () => {
    const store = new InMemoryStore();
    expect(await store.createGameTransferInvitation('nowhere', 'g:ada', 'g:mallory', 1, AT)).toBe('stale_owner');
    expect(await store.createGameTransferInvitation('nowhere', 'g:ada', 'g:mallory', 0, AT)).toBe('stale_owner');
  });

  it('refuses to create when the recipient became blocked after the route looked them up', async () => {
    const store = new InMemoryStore();
    await ownedGame(store, 'sky', 'g:ada');
    await store.upsertUser({ uid: 'g:grace' });
    // A block lands between the route's lookup and this call.
    await store.upsertUser({ uid: 'g:grace', tier: 'blocked' });

    expect(await store.createGameTransferInvitation('sky', 'g:ada', 'g:grace', 1, AT)).toBe('ineligible');
  });

  it('refuses to create when the recipient became deletion-scheduled after the route looked them up', async () => {
    const store = new InMemoryStore();
    await ownedGame(store, 'sky', 'g:ada');
    await store.upsertUser({ uid: 'g:grace' });
    await store.scheduleAccountDeletion('g:grace', AT, LATER);

    expect(await store.createGameTransferInvitation('sky', 'g:ada', 'g:grace', 1, AT)).toBe('ineligible');
  });

  it('refuses to create when the recipient rotated the submitted code after it was looked up', async () => {
    const store = new InMemoryStore();
    await ownedGame(store, 'sky', 'g:ada');
    await store.upsertUser({ uid: 'g:grace' });
    const oldCode = (await store.ensureRecipientCode('g:grace', AT))!;
    // Rotation lands between the route's code lookup and this call.
    await store.rotateRecipientCode('g:grace', AT);

    expect(await store.createGameTransferInvitation('sky', 'g:ada', 'g:grace', 1, AT, oldCode)).toBe('ineligible');
  });

  it('accepts a code that still resolves to the recipient at commit time', async () => {
    const store = new InMemoryStore();
    await ownedGame(store, 'sky', 'g:ada');
    await store.upsertUser({ uid: 'g:grace' });
    const code = (await store.ensureRecipientCode('g:grace', AT))!;

    const result = await store.createGameTransferInvitation('sky', 'g:ada', 'g:grace', 1, AT, code);
    expect(result).not.toBe('ineligible');
  });

  it('a pending invitation from a superseded owner does not block the new owner', async () => {
    const store = new InMemoryStore();
    await ownedGame(store, 'sky', 'g:ada');
    await store.createGameTransferInvitation('sky', 'g:ada', 'g:mallory', 1, AT);

    // Ownership settles to grace before the old invitation would expire.
    await store.recordSettledOwner('sky', 'g:grace', 2, AT, LATER);

    const fresh = await store.createGameTransferInvitation('sky', 'g:grace', 'g:someone-else', 2, LATER);
    expect(fresh).not.toBe('busy');
    if (typeof fresh === 'string') throw new Error('unreachable');
    expect(fresh.senderUid).toBe('g:grace');
  });
});

describe('acceptGameTransferInvitation', () => {
  it('commits ownership and bumps the access revision when idle', async () => {
    const store = new InMemoryStore();
    await ownedGame(store, 'sky', 'g:ada');
    await store.upsertUser({ uid: 'g:grace' });
    await store.createGameTransferInvitation('sky', 'g:ada', 'g:grace', 1, AT);

    const result = await store.acceptGameTransferInvitation(
      'sky',
      'g:grace',
      LATER,
      await offerId(store, 'sky', LATER),
    );
    if (typeof result === 'string' || result === null) throw new Error('unreachable');
    expect(result.status).toBe('accepted');

    const access = await store.getGameAccess('sky');
    expect(access).toMatchObject({ ownerUid: 'g:grace', accessRevision: 2 });
  });

  it('retires the sender’s agent key lock so the recipient can open self-build rounds', async () => {
    const store = new InMemoryStore();
    await ownedGame(store, 'sky', 'g:ada');
    await store.upsertUser({ uid: 'g:grace' });
    await store.ensureGameAgentKey('sky', 'g:ada', AT);
    await store.createGameTransferInvitation('sky', 'g:ada', 'g:grace', 1, AT);

    await store.acceptGameTransferInvitation('sky', 'g:grace', LATER, await offerId(store, 'sky', LATER));

    expect(await store.getGameAgentKey('sky')).toBeNull();
    // The next open_round issues a fresh key instead of being locked out.
    expect(await store.ensureGameAgentKey('sky', 'g:grace', LATER)).toMatchObject({ ownerUid: 'g:grace' });
  });

  it('resets autonomy consent so the recipient inherits no standing consent', async () => {
    const store = new InMemoryStore();
    await ownedGame(store, 'sky', 'g:ada');
    await store.upsertUser({ uid: 'g:grace' });
    await store.setGameAutonomy('sky', 'auto-fix-defects');
    await store.createGameTransferInvitation('sky', 'g:ada', 'g:grace', 1, AT);

    await store.acceptGameTransferInvitation('sky', 'g:grace', LATER, await offerId(store, 'sky', LATER));

    expect(await store.getGameAutonomy('sky')).toBeNull();
  });

  it('revokes the sender’s round capabilities, terminal receipt included', async () => {
    // Those tokens carry a generation, checked against the job.
    const store = new InMemoryStore();
    await ownedGame(store, 'sky', 'g:ada');
    await store.upsertUser({ uid: 'g:grace' });
    await store.createSubmission(4242, 'g:ada', 'Sky');
    await store.setSubmissionSlug(4242, 'sky');
    const before = (await store.bumpRoundGeneration(4242)) ?? 0;
    await store.createGameTransferInvitation('sky', 'g:ada', 'g:grace', 1, AT);

    await store.acceptGameTransferInvitation('sky', 'g:grace', LATER, await offerId(store, 'sky', LATER));

    const after = (await store.getSubmission(4242))?.roundGeneration ?? 0;
    // Two ahead: one would still leave the sender a terminal receipt.
    expect(after).toBe(before + 2);
  });

  it('bounds how many rounds it re-generations, newest first', async () => {
    // One transaction, and Firestore caps its writes; these keys expire anyway.
    const store = new InMemoryStore();
    await ownedGame(store, 'sky', 'g:ada');
    await store.upsertUser({ uid: 'g:grace' });
    const total = MAX_REVOKED_ROUNDS_PER_TRANSFER + 5;
    for (let i = 0; i < total; i += 1) {
      await store.createSubmission(5000 + i, 'g:ada', 'Sky');
      await store.setSubmissionSlug(5000 + i, 'sky');
    }
    await store.createGameTransferInvitation('sky', 'g:ada', 'g:grace', 1, AT);
    const newestBefore = (await store.getSubmission(5000 + total - 1))?.roundGeneration;
    const oldestBefore = (await store.getSubmission(5000))?.roundGeneration;

    await store.acceptGameTransferInvitation('sky', 'g:grace', LATER, await offerId(store, 'sky', LATER));

    // Newest re-generationed; the oldest, past the bound, is left.
    expect((await store.getSubmission(5000 + total - 1))?.roundGeneration).toBe(revokedRoundGeneration(newestBefore));
    expect((await store.getSubmission(5000))?.roundGeneration).toBe(oldestBefore);
  });

  it('is idempotent: accepting twice returns the same accepted invitation', async () => {
    const store = new InMemoryStore();
    await ownedGame(store, 'sky', 'g:ada');
    await store.upsertUser({ uid: 'g:grace' });
    await store.createGameTransferInvitation('sky', 'g:ada', 'g:grace', 1, AT);
    await store.acceptGameTransferInvitation('sky', 'g:grace', LATER, await offerId(store, 'sky', LATER));

    const again = await store.acceptGameTransferInvitation('sky', 'g:grace', LATER, await offerId(store, 'sky', LATER));
    if (typeof again === 'string' || again === null) throw new Error('unreachable');
    expect(again.status).toBe('accepted');
    expect((await store.getGameAccess('sky'))?.accessRevision).toBe(2);
  });

  it('refuses when someone other than the recipient tries to accept', async () => {
    const store = new InMemoryStore();
    await ownedGame(store, 'sky', 'g:ada');
    await store.upsertUser({ uid: 'g:grace' });
    await store.createGameTransferInvitation('sky', 'g:ada', 'g:grace', 1, AT);

    expect(
      await store.acceptGameTransferInvitation('sky', 'g:mallory', LATER, await offerId(store, 'sky', LATER)),
    ).toBeNull();
  });

  it('leaves ownership unchanged when a build round is active', async () => {
    const store = new InMemoryStore();
    await ownedGame(store, 'sky', 'g:ada');
    await store.upsertUser({ uid: 'g:grace' });
    await store.createGameTransferInvitation('sky', 'g:ada', 'g:grace', 1, AT);
    await store.createSubmission(1, 'g:ada', 'Sky');
    await store.setSubmissionSlug(1, 'sky');
    await store.recordJobTransition(1, { to: 'building', at: LATER, by: 'creator' });

    expect(await store.acceptGameTransferInvitation('sky', 'g:grace', LATER, await offerId(store, 'sky', LATER))).toBe(
      'busy',
    );
    expect((await store.getGameAccess('sky'))?.ownerUid).toBe('g:ada');
  });

  it('refuses when canonical ownership moved since the invitation was created', async () => {
    const store = new InMemoryStore();
    await ownedGame(store, 'sky', 'g:ada');
    await store.upsertUser({ uid: 'g:grace' });
    await store.createGameTransferInvitation('sky', 'g:ada', 'g:grace', 1, AT);

    // Ownership settles to someone else before acceptance.
    await store.recordSettledOwner('sky', 'g:mallory', 2, AT, LATER);

    expect(await store.acceptGameTransferInvitation('sky', 'g:grace', LATER, await offerId(store, 'sky', LATER))).toBe(
      'stale_owner',
    );
  });

  it('refuses when the recipient became ineligible after the invitation was created', async () => {
    const store = new InMemoryStore();
    await ownedGame(store, 'sky', 'g:ada');
    await store.upsertUser({ uid: 'g:grace' });
    await store.createGameTransferInvitation('sky', 'g:ada', 'g:grace', 1, AT);
    await store.upsertUser({ uid: 'g:grace', tier: 'blocked' });

    expect(await store.acceptGameTransferInvitation('sky', 'g:grace', LATER, await offerId(store, 'sky', LATER))).toBe(
      'ineligible',
    );
  });

  it('refuses to accept once the invitation has expired', async () => {
    const store = new InMemoryStore();
    await ownedGame(store, 'sky', 'g:ada');
    await store.upsertUser({ uid: 'g:grace' });
    await store.createGameTransferInvitation('sky', 'g:ada', 'g:grace', 1, AT);

    expect(
      await store.acceptGameTransferInvitation(
        'sky',
        'g:grace',
        AFTER_EXPIRY,
        await offerId(store, 'sky', AFTER_EXPIRY),
      ),
    ).toBeNull();
  });

  it('leaves ownership unchanged while a round is still opening (no submission yet)', async () => {
    const store = new InMemoryStore();
    await ownedGame(store, 'sky', 'g:ada');
    await store.upsertUser({ uid: 'g:grace' });
    await store.createGameTransferInvitation('sky', 'g:ada', 'g:grace', 1, AT);
    // The sender holds the round-opening lease with no submission yet.
    await store.beginCheckoutRecovery('sky', 'nonce-1', Date.parse(LATER));

    expect(await store.acceptGameTransferInvitation('sky', 'g:grace', LATER, await offerId(store, 'sky', LATER))).toBe(
      'busy',
    );
    expect((await store.getGameAccess('sky'))?.ownerUid).toBe('g:ada');

    // Once the lease is released, acceptance succeeds.
    await store.finishCheckoutRecovery('sky', 'nonce-1');
    const result = await store.acceptGameTransferInvitation(
      'sky',
      'g:grace',
      LATER,
      await offerId(store, 'sky', LATER),
    );
    if (typeof result === 'string' || result === null) throw new Error('unreachable');
    expect(result.status).toBe('accepted');
    expect((await store.getGameAccess('sky'))?.ownerUid).toBe('g:grace');
  });
});
