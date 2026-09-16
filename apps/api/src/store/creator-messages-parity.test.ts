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
});
