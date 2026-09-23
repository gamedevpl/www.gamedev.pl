import { describe, expect, it } from 'vitest';
import { FirestoreStore, InMemoryStore, type Store } from '../../platform/store.js';
import { fakeFirestore } from '../fake-firestore.js';

const input = {
  slug: 'sky-dodge',
  source: 'player' as const,
  reason: 'hate' as const,
  note: 'a slur on the title screen',
  raisedByUid: 'dev:alice',
  gameVersion: null,
  createdAt: '2026-09-23T00:00:00.000Z',
};

const implementations: Array<[string, () => Store]> = [
  ['memory', () => new InMemoryStore()],
  ['firestore', () => new FirestoreStore(fakeFirestore().db)],
];
for (const [name, make] of implementations)
  describe(name, () => {
    it('reports a reopen only when the write itself replaced a resolved flag', async () => {
      const store = make();
      expect((await store.raiseModerationFlag(input)).reopened).toBe(false);
      expect((await store.raiseModerationFlag(input)).reopened).toBe(false);

      await store.resolveModerationFlag('sky-dodge:dev:alice', {
        action: 'dismissed',
        resolvedByUid: 'dev:boss',
        resolvedAt: '2026-09-23T00:01:00.000Z',
      });
      const raised = await store.raiseModerationFlag(input);
      expect(raised.reopened).toBe(true);
      expect(raised.flag.status).toBe('open');
      expect((await store.getModerationFlag('sky-dodge:dev:alice'))?.status).toBe('open');
    });
  });
