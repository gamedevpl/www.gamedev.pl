import { describe, expect, it } from 'vitest';
import { FirestoreStore, InMemoryStore, type Store } from '../platform/store.js';
import { fakeFirestore } from './fake-firestore.js';

// Verifies creator messages ordering and limit across store implementations.
const IMPLEMENTATIONS: Array<[string, () => Store]> = [
  ['InMemoryStore', () => new InMemoryStore()],
  ['FirestoreStore(fake)', () => new FirestoreStore(fakeFirestore().db)],
];

function describeStoreContract(sliceName: string, spec: (makeStore: () => Store) => void): void {
  describe(`store contract: ${sliceName}`, () => {
    for (const [implName, makeStore] of IMPLEMENTATIONS) {
      describe(implName, () => spec(makeStore));
    }
  });
}

const PROPOSAL = {
  sourceRef: 'shot-1',
  version: 'v1',
  options: [],
};

describeStoreContract('creator messages', (makeStore) => {
  it('returns the newest limit messages in oldest-first order', async () => {
    const store = makeStore();
    await store.createSubmission(12, 'g:owner', 'Messages Parity');
    for (let i = 1; i <= 5; i += 1) {
      await store.appendCreatorMessage(12, `msg ${i}`);
      // Distinct timestamps across milliseconds.
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    const messages = await store.listCreatorMessages(12, { limit: 3 });
    expect(messages.map((m) => m.text)).toEqual(['msg 3', 'msg 4', 'msg 5']);
  });

  // A proposal-heavy thread must not silently return fewer than `limit`.
  it('still returns the full limit when proposals crowd the newest window', async () => {
    const store = makeStore();
    await store.createSubmission(13, 'g:owner', 'Proposal Heavy');
    // Real messages are buried behind proposals; a single buffer misses them.
    for (let i = 1; i <= 5; i += 1) {
      await store.appendCreatorMessage(13, `real ${i}`);
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    for (let i = 1; i <= 40; i += 1) {
      await store.appendCreatorMessage(13, `proposal ${i}`, { proposal: PROPOSAL });
      await new Promise((resolve) => setTimeout(resolve, 2));
    }

    const messages = await store.listCreatorMessages(13, { limit: 5, excludeProposals: true });
    expect(messages.map((m) => m.text)).toEqual(['real 1', 'real 2', 'real 3', 'real 4', 'real 5']);
  });
});
