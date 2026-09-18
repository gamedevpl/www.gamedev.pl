import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FirestoreStore } from '../platform/store.js';
import { fakeFirestore } from './fake-firestore.js';
import {
  CREATOR_UID,
  POLLED_ROUTES,
  measurePolledRoute,
  measurePolledRouteReads,
  seedReadCostFixture,
} from './firestore-read-cost.fixture.js';

const BASELINE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../eslint-rules/firestore-read-cost-baseline.json',
);

function loadBaseline(): { routes: Record<string, number> } {
  return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) as { routes: Record<string, number> };
}

describe('fakeFirestore billed reads', () => {
  it('counts a document get as 1 whether or not it exists', async () => {
    const fake = fakeFirestore();
    await fake.db.collection('users').doc('missing').get();
    expect(fake.billedReads()).toBe(1);
    await fake.db.collection('users').doc('ada').set({ uid: 'ada' });
    fake.resetBilledReads();
    await fake.db.collection('users').doc('ada').get();
    expect(fake.billedReads()).toBe(1);
  });

  it('counts a query that returns nothing as 1', async () => {
    const fake = fakeFirestore();
    const snap = await fake.db.collection('submissions').where('ownerUid', '==', 'nobody').get();
    expect(snap.empty).toBe(true);
    expect(fake.billedReads()).toBe(1);
  });

  it('counts a query as one read per returned document', async () => {
    const fake = fakeFirestore();
    await fake.db.collection('submissions').doc('1').set({ ownerUid: 'a' });
    await fake.db.collection('submissions').doc('2').set({ ownerUid: 'a' });
    await fake.db.collection('submissions').doc('3').set({ ownerUid: 'b' });
    fake.resetBilledReads();
    const snap = await fake.db.collection('submissions').where('ownerUid', '==', 'a').get();
    expect(snap.docs).toHaveLength(2);
    expect(fake.billedReads()).toBe(2);
  });

  it('counts count() as 1, not the number of rows it counted', async () => {
    const fake = fakeFirestore();
    await fake.db.collection('submissions').doc('1').set({ ownerUid: 'a' });
    await fake.db.collection('submissions').doc('2').set({ ownerUid: 'a' });
    fake.resetBilledReads();
    const snap = await fake.db.collection('submissions').count().get();
    expect(snap.data().count).toBe(2);
    expect(fake.billedReads()).toBe(1);
  });

  it('counts getAll once per requested reference', async () => {
    const fake = fakeFirestore();
    const a = fake.db.collection('users').doc('a');
    const b = fake.db.collection('users').doc('b');
    await a.set({ uid: 'a' });
    fake.resetBilledReads();
    const snaps = await fake.db.getAll(a, b);
    expect(snaps).toHaveLength(2);
    expect(fake.billedReads()).toBe(2);
  });
});

describe('read-cost fixture', () => {
  it('an unbounded submissions scan costs more than the owner query', async () => {
    const fake = fakeFirestore();
    const store = new FirestoreStore(fake.db);
    await seedReadCostFixture(store);
    fake.resetBilledReads();
    await store.listSubmissionsByOwner(CREATOR_UID);
    const bounded = fake.billedReads();
    fake.resetBilledReads();
    await fake.db.collection('submissions').get();
    expect(fake.billedReads()).toBeGreaterThan(bounded);
  });
});

describe('polled route read baseline', () => {
  it('each polled route stays at or under its recorded billed reads', async () => {
    const baseline = loadBaseline();
    const measured = await measurePolledRouteReads();
    for (const route of POLLED_ROUTES) {
      const allowed = baseline.routes[route];
      expect(allowed, `${route} is missing from the baseline`).toEqual(expect.any(Number));
      expect(measured[route], route).toBeLessThanOrEqual(allowed);
    }
  });

  it('GET /api/submissions/mine answers 200 so the count is a real poll', async () => {
    const row = await measurePolledRoute('GET /api/submissions/mine');
    expect(row.statusCode).toBe(200);
    expect(row.reads).toBeGreaterThan(0);
  });
});
