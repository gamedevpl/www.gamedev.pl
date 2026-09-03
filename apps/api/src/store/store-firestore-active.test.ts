import { describe, expect, it } from 'vitest';
import { fakeFirestore } from './fake-firestore.js';
import { FirestoreStore } from './firestore.js';

describe('FirestoreStore.listActiveSubmissions and sweepActive', () => {
  it('indexes active submissions and drops them on terminal states', async () => {
    const { db, docs, key } = fakeFirestore();
    const store = new FirestoreStore(db);

    const created = await store.createSubmission(101, 'uid-1', 'Active Game');
    expect(created.sweepActive).toBe(true);
    expect(docs.get(key('submissions', '101'))).toMatchObject({ sweepActive: true });

    let active = await store.listActiveSubmissions();
    expect(active.map((s) => s.jobId)).toEqual([101]);

    await db.collection('submissions').doc('999').set({
      jobId: 999,
      ownerUid: 'uid-old',
      title: 'Ancient Game',
      state: 'published',
      lastNotifiedStatus: 'published',
    });
    active = await store.listActiveSubmissions();
    expect(active.map((s) => s.jobId)).toEqual([101]);

    await store.recordJobTransition(101, {
      to: 'building',
      at: new Date().toISOString(),
      by: 'agent',
    });
    expect(docs.get(key('submissions', '101'))?.sweepActive).toBe(true);
    active = await store.listActiveSubmissions();
    expect(active.map((s) => s.jobId)).toEqual([101]);

    await store.setSubmissionNotifiedStatus(101, 'published');
    expect(docs.get(key('submissions', '101'))?.sweepActive).toBe(false);
    active = await store.listActiveSubmissions();
    expect(active).toEqual([]);

    await store.createSubmission(102, 'uid-2', 'Abandoned Game');
    expect(docs.get(key('submissions', '102'))?.sweepActive).toBe(true);
    await store.setSubmissionAbandoned(102, new Date().toISOString());
    expect(docs.get(key('submissions', '102'))?.sweepActive).toBe(false);
    active = await store.listActiveSubmissions();
    expect(active).toEqual([]);
  });
});
