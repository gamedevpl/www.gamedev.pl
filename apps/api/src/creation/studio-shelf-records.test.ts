import { describe, expect, it } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import { mintToken } from '../platform/submission-token.js';
import { loadShelfRecords } from './studio-shelf-records.js';

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

    const recipientShelf = await loadShelfRecords(store, 'g:recipient', undefined, mint);
    expect(recipientShelf.map((row) => row.slug)).toContain('sky-dodge');
  });
});
