import { DocumentReference, Firestore } from '@google-cloud/firestore';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { beginReadTally, currentReadTally, installReadMeter, runWithReadTally } from './read-meter.js';

// The real client's get() is getAll(this) underneath; both are patched.

// Stubbed at getAll: no RPC, real delegation.
const fakeSnapshot = (ref: DocumentReference) => ({ ref, exists: true, data: () => ({}) });

describe('read meter: a document get counts once', () => {
  const originalGetAll = Firestore.prototype.getAll;
  beforeAll(() => {
    (Firestore.prototype as unknown as { getAll: unknown }).getAll = async function stubbedGetAll(
      this: Firestore,
      ...refs: DocumentReference[]
    ) {
      return refs.map(fakeSnapshot);
    };
    installReadMeter();
  });
  afterAll(() => {
    (Firestore.prototype as unknown as { getAll: unknown }).getAll = originalGetAll;
  });

  it('records one read for doc.get(), not one for get and one for its getAll', async () => {
    const db = new Firestore({ projectId: 'read-meter-test' });
    await runWithReadTally(beginReadTally(), async () => {
      await db.collection('shelves').doc('g:owner').get();
      expect(currentReadTally()?.reads).toBe(1);
    });
  });

  // Per async context; a module flag would leak across requests.
  it('keeps an overlapping direct getAll counted while a get is in flight', async () => {
    const db = new Firestore({ projectId: 'read-meter-test' });
    await runWithReadTally(beginReadTally(), async () => {
      await Promise.all([db.collection('shelves').doc('g:owner').get(), db.getAll(db.doc('shelves/a'), db.doc('shelves/b'))]);
      expect(currentReadTally()?.reads).toBe(3);
    });
  });

  it('still records one read per reference for a direct getAll', async () => {
    const db = new Firestore({ projectId: 'read-meter-test' });
    await runWithReadTally(beginReadTally(), async () => {
      await db.getAll(db.doc('shelves/a'), db.doc('shelves/b'), db.doc('shelves/c'));
      expect(currentReadTally()?.reads).toBe(3);
    });
  });
});
