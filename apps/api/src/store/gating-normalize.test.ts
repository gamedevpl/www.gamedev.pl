import { describe, expect, it } from 'vitest';
import { FirestoreStore } from '../platform/store.js';
import { fakeFirestore } from './fake-firestore.js';

// Regression coverage for the legacy-'gating' normalization.

// Added when that state was removed from JobState (item 4).

describe('FirestoreStore / legacy gating normalization', () => {
  it('reads a stored legacy gating record as submitted', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);
    await db.collection('submissions').doc('7').set({
      jobId: 7,
      createdAt: '2026-01-01T00:00:00Z',
      state: 'gating',
    });

    const record = await store.getSubmission(7);

    expect(record?.state).toBe('submitted');
  });

  it('does not throw when the document is gone by the time it is read', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);

    // No document written for this id: the account-deletion race that flagged this.
    await expect(store.setSubmissionPublishedAt(99, '2026-01-01T00:00:00Z')).resolves.toBeUndefined();
  });
});

// Regression coverage for the rollback-safety dual-write (item 5, jobId rename).

// A production rollback swaps traffic to the previous revision in seconds, no rebuild
// (docs/runbooks/rollback-deploy.md) — that revision's code only reads `issueNumber`.

describe('FirestoreStore / rollback-safety dual-write', () => {
  it('writes issueNumber alongside jobId on a new submission', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);

    await store.createSubmission(12, 'uid-1', 'A game');

    const snap = await db.collection('submissions').doc('12').get();
    expect(snap.data()).toMatchObject({ jobId: 12, issueNumber: 12 });
  });
});
