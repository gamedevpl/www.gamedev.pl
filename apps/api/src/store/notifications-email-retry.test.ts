import { describe, expect, it } from 'vitest';
import { FirestoreStore, InMemoryStore, type Store } from '../platform/store.js';
import { fakeFirestore } from './fake-firestore.js';

const IMPLEMENTATIONS: Array<[string, () => Store]> = [
  ['InMemoryStore', () => new InMemoryStore()],
  ['FirestoreStore(fake)', () => new FirestoreStore(fakeFirestore().db)],
];

describe('notification email retry query', () => {
  for (const [name, makeStore] of IMPLEMENTATIONS) {
    it(`lists only unsent notifications newer than the age bound (${name})`, async () => {
      const store = makeStore();
      await store.createNotification('g:recent', {
        id: 'recent-unsent',
        type: 'transfer.offered',
        createdAt: '2026-09-10T00:00:00.000Z',
        titleKey: 'notifications.transfer.offered.title',
        bodyKey: 'notifications.transfer.offered.body',
        params: { title: 'Recent', slug: 'recent' },
        link: '/studio',
      });
      await store.createNotification('g:old', {
        id: 'old-unsent',
        type: 'transfer.offered',
        createdAt: '2026-08-01T00:00:00.000Z',
        titleKey: 'notifications.transfer.offered.title',
        bodyKey: 'notifications.transfer.offered.body',
        params: { title: 'Old', slug: 'old' },
        link: '/studio',
      });
      await store.createNotification('g:emailed', {
        id: 'already-emailed',
        type: 'transfer.offered',
        createdAt: '2026-09-10T01:00:00.000Z',
        titleKey: 'notifications.transfer.offered.title',
        bodyKey: 'notifications.transfer.offered.body',
        params: { title: 'Done', slug: 'done' },
        link: '/studio',
      });
      await store.markNotificationEmailed('g:emailed', 'already-emailed', '2026-09-10T01:01:00.000Z');

      const rows = await store.listPendingEmailNotifications({
        createdAfter: '2026-09-01T00:00:00.000Z',
        limit: 10,
      });

      expect(rows).toEqual([
        expect.objectContaining({
          uid: 'g:recent',
          notification: expect.objectContaining({ id: 'recent-unsent', emailedAt: null }),
        }),
      ]);
    });
  }
});
