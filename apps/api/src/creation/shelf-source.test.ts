import { describe, expect, it, vi } from 'vitest';
import { FirestoreStore, InMemoryStore, type Store } from '../platform/store.js';
import { fakeFirestore } from '../store/fake-firestore.js';
import { buildShelfDocument, SHELF_VERSION } from '../store/records/shelf.js';
import { createShelfVerifySampler, documentAnswersAlone, ownerCountAgrees } from './shelf-source.js';
import { tombstoneShelf } from '../store/records/shelf.js';
import { readOwnerShelfRecords } from './studio-shelf-records.js';
import type { SubmissionRecord } from '../store/records/submission.js';

const AT = '2026-01-01T00:00:00.000Z';
const OWNED = 1;
const OWNER = 'g:owner';

const IMPLEMENTATIONS: Array<[string, () => Store]> = [
  ['InMemoryStore', () => new InMemoryStore()],
  ['FirestoreStore(fake)', () => new FirestoreStore(fakeFirestore().db)],
];

async function seedOwner(store: Store, rounds: number): Promise<void> {
  for (let i = 1; i <= rounds; i += 1) {
    await store.createSubmission(i, OWNER, `Round ${i}`);
    await store.setSubmissionSlug(i, `round-${i}`);
  }
}

describe('documentAnswersAlone', () => {
  const source = [{ jobId: 1, ownerUid: OWNER, createdAt: AT, title: 'One' } as SubmissionRecord];
  const shelf = buildShelfDocument(source, AT, OWNED);

  it('refuses anything it cannot check without reading source', () => {
    expect(documentAnswersAlone(shelf)).toBe(true);
    expect(documentAnswersAlone(null)).toBe(false);
    expect(documentAnswersAlone({ ...shelf, version: SHELF_VERSION + 1 })).toBe(false);
    expect(documentAnswersAlone({ ...shelf, truncated: true })).toBe(false);
    // Rounds and sourceCount disagreeing means the document dropped one.
    expect(documentAnswersAlone({ ...shelf, sourceCount: 9 })).toBe(false);
    // Built before the count was recorded: nothing cheap can check it.
    expect(documentAnswersAlone({ ...shelf, ownedCount: undefined })).toBe(false);
  });

  // A transferred-in owner also counts 0; only `stale` differs.
  it('refuses a tombstone, which agrees with itself on every other field', () => {
    const grave = tombstoneShelf(AT, 1);
    expect(grave.ownedCount).toBe(0);
    expect(grave.rounds.length).toBe(grave.sourceCount);
    expect(documentAnswersAlone(grave)).toBe(false);
  });

  it('checks the owner count the document was built from', () => {
    expect(ownerCountAgrees(shelf, 1)).toBe(true);
    expect(ownerCountAgrees(shelf, 2)).toBe(false);
  });
});

describe('createShelfVerifySampler', () => {
  it('verifies the first read, then one in every window', () => {
    const verify = createShelfVerifySampler(3);
    const reads = [verify(OWNER), verify(OWNER), verify(OWNER), verify(OWNER), verify(OWNER), verify(OWNER)];
    expect(reads).toEqual([true, false, false, true, false, false]);
  });

  it('counts each owner separately, so a heavy poller cannot starve a quiet one', () => {
    const verify = createShelfVerifySampler(3);
    // Heavy poller burns its own window, not the quiet owner's.
    expect([verify('g:heavy'), verify('g:heavy'), verify('g:heavy')]).toEqual([true, false, false]);
    expect(verify('g:quiet')).toBe(true);
    expect(verify('g:heavy')).toBe(true);
  });

  it('evicts the coldest owner once it is full, which only costs a source read', () => {
    const verify = createShelfVerifySampler(3, 2);
    expect(verify('g:a')).toBe(true);
    expect(verify('g:b')).toBe(true);
    expect(verify('g:a')).toBe(false);
    // 'b' is coldest, so 'c' evicts it and 'b' restarts.
    expect(verify('g:c')).toBe(true);
    expect(verify('g:b')).toBe(true);
  });

  it('verifies every read when the window is zero', () => {
    const verify = createShelfVerifySampler(0);
    expect([verify(OWNER), verify(OWNER)]).toEqual([true, true]);
  });
});

for (const [implName, makeStore] of IMPLEMENTATIONS) {
  describe(`readOwnerShelfRecords: ${implName}`, () => {
    it('answers from the document without reading source', async () => {
      const store = makeStore();
      await seedOwner(store, 3);
      const listed = vi.spyOn(store, 'listSubmissionsByOwner');

      const records = await readOwnerShelfRecords(store, OWNER, undefined, {
        fromDocument: true,
        verify: () => false,
      });

      expect(records.map((record) => record.jobId).sort((a, b) => a - b)).toEqual([1, 2, 3]);
      expect(listed).not.toHaveBeenCalled();
    });

    // A revocation moves the document, never the count.
    it('reads the document after the count, not before it', async () => {
      const store = makeStore();
      await seedOwner(store, 3);
      const order: string[] = [];
      vi.spyOn(store, 'countSubmissionsByOwner').mockImplementation(async () => {
        order.push('count');
        return 3;
      });
      const realGetShelf = store.getShelf.bind(store);
      vi.spyOn(store, 'getShelf').mockImplementation(async (ownerUid: string) => {
        order.push('getShelf');
        return realGetShelf(ownerUid);
      });

      await readOwnerShelfRecords(store, OWNER, undefined, { fromDocument: true, verify: () => false });

      expect(order).toEqual(['count', 'getShelf']);
      vi.restoreAllMocks();
    });

    it('serves the same rounds either way', async () => {
      const store = makeStore();
      await seedOwner(store, 3);

      const fromDocument = await readOwnerShelfRecords(store, OWNER, undefined, {
        fromDocument: true,
        verify: () => false,
      });
      const fromSource = await readOwnerShelfRecords(store, OWNER, undefined, { fromDocument: false });

      expect(fromDocument.map((r) => r.jobId).sort()).toEqual(fromSource.map((r) => r.jobId).sort());
      expect(fromDocument.map((r) => r.slug).sort()).toEqual(fromSource.map((r) => r.slug).sort());
    });

    it('pays source on a sampled read, and judges the document against it', async () => {
      const store = makeStore();
      await seedOwner(store, 3);
      const listed = vi.spyOn(store, 'listSubmissionsByOwner');
      const observed: number[] = [];

      await readOwnerShelfRecords(
        store,
        OWNER,
        async (records) => {
          observed.push(records.length);
        },
        { fromDocument: true, verify: () => true },
      );

      expect(listed).toHaveBeenCalled();
      expect(observed).toEqual([3]);
    });

    it('reads source when the switch is off', async () => {
      const store = makeStore();
      await seedOwner(store, 2);
      const listed = vi.spyOn(store, 'listSubmissionsByOwner');

      await readOwnerShelfRecords(store, OWNER, undefined, { fromDocument: false });

      expect(listed).toHaveBeenCalled();
    });

    it('falls back to source when the document exists but cannot be trusted', async () => {
      const store = makeStore();
      await seedOwner(store, 3);
      const stale = (await store.getShelf(OWNER))!;
      // Same rounds, a sourceCount that says one is missing.
      await store.putShelf(OWNER, { ...stale, sourceCount: stale.sourceCount + 1 });
      const listed = vi.spyOn(store, 'listSubmissionsByOwner');

      const records = await readOwnerShelfRecords(store, OWNER, undefined, {
        fromDocument: true,
        verify: () => false,
      });

      expect(listed).toHaveBeenCalled();
      expect(records).toHaveLength(3);
    });

    it('catches a round added since the build, without sampling', async () => {
      const store = makeStore();
      await seedOwner(store, 2);
      const built = (await store.getShelf(OWNER))!;
      // A round the document does not know about yet.
      await store.createSubmission(99, OWNER, 'Newer');
      await store.putShelf(OWNER, built);
      const listed = vi.spyOn(store, 'listSubmissionsByOwner');

      const records = await readOwnerShelfRecords(store, OWNER, undefined, {
        fromDocument: true,
        verify: () => false,
      });

      expect(listed).toHaveBeenCalled();
      expect(records).toHaveLength(3);
    });

    it('never answers from a tombstone, whose whole purpose is to be unservable', async () => {
      const store = makeStore();
      await seedOwner(store, 2);
      await store.tombstoneShelf(OWNER, AT);
      const listed = vi.spyOn(store, 'listSubmissionsByOwner');

      const records = await readOwnerShelfRecords(store, OWNER, undefined, {
        fromDocument: true,
        verify: () => false,
      });

      expect(listed).toHaveBeenCalled();
      expect(records).toHaveLength(2);
    });

    it('falls back to source when no document can answer', async () => {
      const store = makeStore();
      await seedOwner(store, 2);
      await store.deleteShelf(OWNER);
      const listed = vi.spyOn(store, 'listSubmissionsByOwner');

      const records = await readOwnerShelfRecords(store, OWNER, undefined, {
        fromDocument: true,
        verify: () => false,
      });

      expect(listed).toHaveBeenCalled();
      expect(records).toHaveLength(2);
    });
  });
}
