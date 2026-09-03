import { describe, expect, it } from 'vitest';
import { FirestoreStore } from '../platform/store.js';
import { fakeFirestore } from './fake-firestore.js';
import { backfillOpenRound } from './open-round-backfill.js';

// Queries on openRound are blind to a document without it.

async function seedLegacyJobs(db: ReturnType<typeof fakeFirestore>['db']) {
  await db.collection('submissions').doc('1').set({
    jobId: 1,
    ownerUid: 'g:creator',
    createdAt: '2026-01-01T00:00:00Z',
    title: 'still building',
    lastStatus: 'building',
  });
  await db.collection('submissions').doc('2').set({
    jobId: 2,
    ownerUid: 'g:creator',
    createdAt: '2026-01-02T00:00:00Z',
    title: 'shipped',
    lastStatus: 'published',
    lastNotifiedStatus: 'published',
  });
}

describe('backfillOpenRound', () => {
  it('stamps documents written before the field existed', async () => {
    const { db } = fakeFirestore();
    await seedLegacyJobs(db);

    expect(await backfillOpenRound(db)).toBe(2);

    expect((await db.collection('submissions').doc('1').get()).data()?.openRound).toBe(true);
    expect((await db.collection('submissions').doc('2').get()).data()?.openRound).toBe(false);
  });

  it('runs once ever — the marker, not the container, decides', async () => {
    const { db } = fakeFirestore();
    await seedLegacyJobs(db);
    await backfillOpenRound(db);

    expect(await backfillOpenRound(db)).toBe(0);
  });

  it('makes a legacy in-flight job visible to the sweep again', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);
    await seedLegacyJobs(db);

    // The store runs the migration itself, so an unmigrated deploy still sweeps.
    const active = await store.listActiveSubmissions();

    expect(active.map((record) => record.jobId)).toEqual([1]);
  });
});
