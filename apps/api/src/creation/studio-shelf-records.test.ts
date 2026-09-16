import { describe, expect, it } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import { mintToken } from '../platform/submission-token.js';
import { loadShelfRecords, reconcileTransferredOwnership } from './studio-shelf-records.js';

const SECRET = 'shelf-test-secret';
const mint = (jobId: number) => mintToken(jobId, SECRET);

describe('loadShelfRecords', () => {
  it('fills in a game the owner query has not yet returned', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(10, 'g:creator', 'Sky Dodge');
    await store.setSubmissionSlug(10, 'sky-dodge');
    const realList = store.listSubmissionsByOwner.bind(store);
    store.listSubmissionsByOwner = async (uid, opts) =>
      (await realList(uid, opts)).filter((row) => row.slug !== 'sky-dodge');

    const records = await loadShelfRecords(store, 'g:creator', 'sky-dodge', mint);
    expect(records.map((row) => row.slug)).toContain('sky-dodge');
  });

  it('fills in a game when slug and owner queries both lag', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(10, 'g:creator', 'Sky Dodge');
    await store.setSubmissionSlug(10, 'sky-dodge');
    store.listSubmissionsByOwner = async () => [];
    store.getSubmissionBySlug = async () => null;

    const records = await loadShelfRecords(store, 'g:creator', mint(10), mint);
    expect(records.map((row) => row.jobId)).toEqual([10]);
  });

  it('does not surface someone else’s slug', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(10, 'g:other', 'Sky Dodge');
    await store.setSubmissionSlug(10, 'sky-dodge');
    const records = await loadShelfRecords(store, 'g:creator', 'sky-dodge', () => 'tok');
    expect(records).toEqual([]);
  });

  it('does not surface a forged token', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(10, 'g:creator', 'Sky Dodge');
    store.listSubmissionsByOwner = async () => [];
    store.getSubmissionBySlug = async () => null;
    const records = await loadShelfRecords(store, 'g:creator', 'not-a-token', mint);
    expect(records).toEqual([]);
  });

  it('shows a transferred-in game and hides one transferred away', async () => {
    const at = '2026-01-01T00:00:00.000Z';
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:sender' });
    await store.upsertUser({ uid: 'g:recipient' });

    // Transferred away: the submission still says g:sender, but access has moved.
    await store.createSubmission(10, 'g:sender', 'Sky Dodge');
    await store.setSubmissionSlug(10, 'sky-dodge');
    await store.ensureGameAccess('sky-dodge', 'g:sender', at, at);
    await store.recordSettledOwner('sky-dodge', 'g:recipient', 999, at, at);

    const senderShelf = await loadShelfRecords(store, 'g:sender', undefined, mint);
    expect(senderShelf.map((row) => row.slug)).not.toContain('sky-dodge');

    const senderShelfBySlug = await loadShelfRecords(store, 'g:sender', 'sky-dodge', mint);
    expect(senderShelfBySlug.map((row) => row.slug)).not.toContain('sky-dodge');

    const senderShelfByToken = await loadShelfRecords(store, 'g:sender', mint(10), mint);
    expect(senderShelfByToken.map((row) => row.slug)).not.toContain('sky-dodge');

    const recipientShelf = await loadShelfRecords(store, 'g:recipient', undefined, mint);
    expect(recipientShelf.map((row) => row.slug)).toContain('sky-dodge');

    const recipientShelfBySlug = await loadShelfRecords(store, 'g:recipient', 'sky-dodge', mint);
    expect(recipientShelfBySlug.map((row) => row.slug)).toContain('sky-dodge');

    const recipientShelfByToken = await loadShelfRecords(store, 'g:recipient', mint(10), mint);
    expect(recipientShelfByToken.map((row) => row.slug)).toContain('sky-dodge');
  });

  it('fills in a transferred game for the recipient when member queries lag', async () => {
    const at = '2026-01-01T00:00:00.000Z';
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:sender' });
    await store.upsertUser({ uid: 'g:recipient' });

    await store.createSubmission(10, 'g:sender', 'Sky Dodge');
    await store.setSubmissionSlug(10, 'sky-dodge');
    await store.ensureGameAccess('sky-dodge', 'g:sender', at, at);
    await store.recordSettledOwner('sky-dodge', 'g:recipient', 999, at, at);

    store.listGameAccessByMember = async () => [];

    const recipientShelfBySlug = await loadShelfRecords(store, 'g:recipient', 'sky-dodge', mint);
    expect(recipientShelfBySlug.map((row) => row.slug)).toContain('sky-dodge');

    const recipientShelfByToken = await loadShelfRecords(store, 'g:recipient', mint(10), mint);
    expect(recipientShelfByToken.map((row) => row.slug)).toContain('sky-dodge');
  });
});

// Shared by the health, scorecards, and /api/submissions/mine routes too.
describe('reconcileTransferredOwnership', () => {
  it('reconciles ownership the same way for every owner-scoped read', async () => {
    const at = '2026-01-01T00:00:00.000Z';
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:sender' });
    await store.upsertUser({ uid: 'g:recipient' });
    await store.createSubmission(10, 'g:sender', 'Sky Dodge');
    await store.setSubmissionSlug(10, 'sky-dodge');
    await store.ensureGameAccess('sky-dodge', 'g:sender', at, at);
    await store.recordSettledOwner('sky-dodge', 'g:recipient', 999, at, at);

    const senderOwned = await store.listSubmissionsByOwner('g:sender');
    const senderRecords = await reconcileTransferredOwnership(store, 'g:sender', senderOwned);
    expect(senderRecords.map((r) => r.slug)).not.toContain('sky-dodge');

    const recipientOwned = await store.listSubmissionsByOwner('g:recipient');
    const recipientRecords = await reconcileTransferredOwnership(store, 'g:recipient', recipientOwned);
    expect(recipientRecords.map((r) => r.slug)).toContain('sky-dodge');
  });

  it('shows the current tip after ownership boomerangs back (A -> B -> A)', async () => {
    const at = '2026-01-01T00:00:00.000Z';
    const later = '2026-01-02T00:00:00.000Z';
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:a' });
    await store.upsertUser({ uid: 'g:b' });
    // A's own pre-transfer round.
    await store.createSubmission(10, 'g:a', 'Sky Dodge');
    await store.setSubmissionSlug(10, 'sky-dodge');
    await store.ensureGameAccess('sky-dodge', 'g:a', at, at);

    // A -> B: B opens a newer round under their own uid.
    await store.createGameTransferInvitation('sky-dodge', 'g:a', 'g:b', 1, at);
    await store.acceptGameTransferInvitation('sky-dodge', 'g:b', at);
    await store.createSubmission(11, 'g:b', 'Sky Dodge (B)');
    await store.setSubmissionSlug(11, 'sky-dodge');

    // B -> A: ownership boomerangs back.
    await store.createGameTransferInvitation('sky-dodge', 'g:b', 'g:a', 2, later);
    await store.acceptGameTransferInvitation('sky-dodge', 'g:a', later);

    const owned = await store.listSubmissionsByOwner('g:a');
    const records = await reconcileTransferredOwnership(store, 'g:a', owned);
    const skyDodgeJobIds = records.filter((r) => r.slug === 'sky-dodge').map((r) => r.jobId);
    // B's round survives A's old job on the same slug.
    expect(skyDodgeJobIds).toContain(11);
    expect(skyDodgeJobIds).toContain(10);
  });
});
