import { describe, expect, it } from 'vitest';
import { FirestoreStore, InMemoryStore, type Store } from '../platform/store.js';
import { fakeFirestore } from './fake-firestore.js';

// Split out: store-parity.test.ts is at its size ceiling.

const IMPLEMENTATIONS: Array<[string, () => Store]> = [
  ['InMemoryStore', () => new InMemoryStore()],
  ['FirestoreStore(fake)', () => new FirestoreStore(fakeFirestore().db)],
];

describe.each(IMPLEMENTATIONS)('setPublicationHealthCheck parity: %s', (_name, makeStore) => {
  it('a fresh re-request fully replaces a prior resolved verdict, not just merges over it', async () => {
    const store = makeStore();
    await store.setPublication({
      slug: 'sky-dodge',
      state: 'published',
      currentVersion: 'v1',
      publishedAt: '2026-07-01T00:00:00.000Z',
    });

    // A resolved, notified red check -- what the sweep leaves behind after paging.
    await store.setPublicationHealthCheck('sky-dodge', {
      version: 'v1',
      requestedAt: '2026-07-01T00:00:00.000Z',
      green: false,
      verdictAt: '2026-07-01T00:20:00.000Z',
      notifiedAt: '2026-07-01T00:21:00.000Z',
    });

    // A fresh re-request: only version/requestedAt/unhealthySinceAt this time.
    await store.setPublicationHealthCheck('sky-dodge', {
      version: 'v1',
      requestedAt: '2026-07-16T00:00:00.000Z',
      unhealthySinceAt: '2026-07-01T00:20:00.000Z',
    });

    const healthCheck = (await store.getPublication('sky-dodge'))?.healthCheck;
    expect(healthCheck).toEqual({
      version: 'v1',
      requestedAt: '2026-07-16T00:00:00.000Z',
      unhealthySinceAt: '2026-07-01T00:20:00.000Z',
    });
  });
});
