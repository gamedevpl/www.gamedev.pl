import { describe, expect, it } from 'vitest';
import { createCombinedPublishedSlugGate, createPublishedSlugGate } from './published-slugs.js';
import { InMemoryStore } from '../store.js';

type Entry = { slug: string; status: string };

function fakeClient(entries: Entry[]) {
  let calls = 0;
  let fail = false;
  return {
    get calls() {
      return calls;
    },
    breakIt() {
      fail = true;
    },
    client: {
      getCatalog: async () => {
        calls += 1;
        if (fail) throw new Error('secondary rate limit');
        return entries as never;
      },
    },
  };
}

describe('createPublishedSlugGate', () => {
  it('admits published slugs and refuses drafts and strangers', async () => {
    const fake = fakeClient([
      { slug: 'arena-tag', status: 'published' },
      { slug: 'wip-game', status: 'draft' },
    ]);
    const gate = createPublishedSlugGate({ client: fake.client });

    expect(await gate.isPublished('arena-tag')).toBe(true);
    expect(await gate.isPublished('wip-game')).toBe(false);
    expect(await gate.isPublished('never-existed')).toBe(false);
  });

  it('builds the catalog once and serves the rest from cache', async () => {
    const fake = fakeClient([{ slug: 'arena-tag', status: 'published' }]);
    const gate = createPublishedSlugGate({ client: fake.client });

    for (let i = 0; i < 20; i++) await gate.isPublished('arena-tag');
    expect(fake.calls).toBe(1);
  });

  it('rebuilds after the TTL expires', async () => {
    const fake = fakeClient([{ slug: 'arena-tag', status: 'published' }]);
    let clock = 1_000;
    const gate = createPublishedSlugGate({ client: fake.client, ttlMs: 500, now: () => clock });

    await gate.isPublished('arena-tag');
    clock += 499;
    await gate.isPublished('arena-tag');
    expect(fake.calls).toBe(1);

    clock += 2;
    await gate.isPublished('arena-tag');
    expect(fake.calls).toBe(2);
  });

  it('shares one in-flight build across a burst, so flushes cannot stampede GitHub', async () => {
    const fake = fakeClient([{ slug: 'arena-tag', status: 'published' }]);
    const gate = createPublishedSlugGate({ client: fake.client });

    const answers = await Promise.all(Array.from({ length: 10 }, () => gate.isPublished('arena-tag')));
    expect(answers.every(Boolean)).toBe(true);
    expect(fake.calls).toBe(1);
  });

  it('serves the stale answer when GitHub starts failing', async () => {
    const fake = fakeClient([{ slug: 'arena-tag', status: 'published' }]);
    let clock = 1_000;
    const gate = createPublishedSlugGate({ client: fake.client, ttlMs: 10, now: () => clock });

    expect(await gate.isPublished('arena-tag')).toBe(true);
    fake.breakIt();
    clock += 100;

    // A failed refresh must not reject a play session, and must not forget what it knew.
    expect(await gate.isPublished('arena-tag')).toBe(true);
    expect(await gate.isPublished('not-a-game')).toBe(false);
  });

  it('closes rather than opens when it has never had an answer', async () => {
    const fake = fakeClient([]);
    fake.breakIt();
    const gate = createPublishedSlugGate({ client: fake.client });

    // No cache to fall back on: dropping data beats letting any string become a key.
    expect(await gate.isPublished('arena-tag')).toBe(false);
  });
});

describe('createCombinedPublishedSlugGate', () => {
  async function storeWithPublication(
    slug: string,
    state: 'published' | 'archived' | 'disabled',
  ): Promise<InMemoryStore> {
    const store = new InMemoryStore();
    await store.setPublication({
      slug,
      state,
      currentVersion: 'v1',
      publishedAt: '2026-07-01T00:00:00.000Z',
    });
    return store;
  }

  it('admits a repo-catalog slug unchanged', async () => {
    const fake = fakeClient([{ slug: 'arena-tag', status: 'published' }]);
    const gate = createCombinedPublishedSlugGate({
      repoGate: createPublishedSlugGate({ client: fake.client }),
      store: new InMemoryStore(),
    });

    expect(await gate.isPublished('arena-tag')).toBe(true);
  });

  it('admits a store-published slug with no repo-catalog entry', async () => {
    const fake = fakeClient([]);
    const store = await storeWithPublication('miniature-warfare-2d', 'published');
    const gate = createCombinedPublishedSlugGate({
      repoGate: createPublishedSlugGate({ client: fake.client }),
      store,
    });

    expect(await gate.isPublished('miniature-warfare-2d')).toBe(true);
  });

  it('refuses a slug that is neither in the catalog nor store-published', async () => {
    const fake = fakeClient([{ slug: 'arena-tag', status: 'draft' }]);
    const gate = createCombinedPublishedSlugGate({
      repoGate: createPublishedSlugGate({ client: fake.client }),
      store: new InMemoryStore(),
    });

    expect(await gate.isPublished('arena-tag')).toBe(false);
    expect(await gate.isPublished('never-existed')).toBe(false);
  });

  it('refuses a store publication whose state is not published', async () => {
    const fake = fakeClient([]);
    for (const state of ['archived', 'disabled'] as const) {
      const store = await storeWithPublication('retired-game', state);
      const gate = createCombinedPublishedSlugGate({
        repoGate: createPublishedSlugGate({ client: fake.client }),
        store,
      });
      expect(await gate.isPublished('retired-game')).toBe(false);
    }
  });

  it('still admits store-published slugs when the repo gate is absent', async () => {
    const store = await storeWithPublication('self-build', 'published');
    const gate = createCombinedPublishedSlugGate({ repoGate: null, store });

    expect(await gate.isPublished('self-build')).toBe(true);
    expect(await gate.isPublished('stranger')).toBe(false);
  });

  it('fails closed when the store read throws', async () => {
    const gate = createCombinedPublishedSlugGate({
      repoGate: null,
      store: {
        getPublication: async () => {
          throw new Error('firestore unavailable');
        },
      },
    });

    expect(await gate.isPublished('anything')).toBe(false);
  });
});
