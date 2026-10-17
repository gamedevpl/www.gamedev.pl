import { describe, expect, it } from 'vitest';
import { FirestoreStore, InMemoryStore, type Store } from '../platform/store.js';
import { fakeFirestore } from './fake-firestore.js';

const IMPLEMENTATIONS: Array<[string, () => Store]> = [
  ['InMemoryStore', () => new InMemoryStore()],
  ['FirestoreStore(fake)', () => new FirestoreStore(fakeFirestore().db)],
];

for (const [name, makeStore] of IMPLEMENTATIONS) {
  describe(`reserveVisualTarget: ${name}`, () => {
    it('hands out max attempts per round, then refuses', async () => {
      const store = makeStore();
      await store.createSubmission(7, 'g:owner', 'Rocks');
      expect(await store.reserveVisualTarget(7, 1, 2)).toBe(1);
      expect(await store.reserveVisualTarget(7, 1, 2)).toBe(2);
      expect(await store.reserveVisualTarget(7, 1, 2)).toBeNull();
    });

    it('starts a new round from zero and refuses a stale round or unknown job', async () => {
      const store = makeStore();
      await store.createSubmission(7, 'g:owner', 'Rocks');
      await store.reserveVisualTarget(7, 1, 1);
      await store.bumpRoundGeneration(7);
      expect(await store.reserveVisualTarget(7, 2, 1)).toBe(1);
      await expect(store.reserveVisualTarget(7, 1, 1)).rejects.toThrow(/no longer current/);
      await expect(store.reserveVisualTarget(99, 1, 1)).rejects.toThrow(/no longer current/);
    });
  });
}
