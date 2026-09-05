import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../platform/app.js';
import { InMemoryStore } from '../platform/store.js';

const sessionSecret = 'dev-session-secret-change-me';

describe('catalog search route', () => {
  const apps: Array<{ close: () => Promise<void> }> = [];
  afterEach(async () => {
    while (apps.length) await apps.pop()!.close();
  });

  it('returns null match for short or empty query', async () => {
    const store = new InMemoryStore();
    const app = await buildApp({
      store,
      sessionSecret,
    });
    apps.push(app);

    const resEmpty = await app.inject({
      method: 'GET',
      url: '/api/catalog/search?q=',
    });
    expect(resEmpty.statusCode).toBe(200);
    expect(resEmpty.json()).toEqual({ match: null, score: 0 });

    const resShort = await app.inject({
      method: 'GET',
      url: '/api/catalog/search?q=a',
    });
    expect(resShort.statusCode).toBe(200);
    expect(resShort.json()).toEqual({ match: null, score: 0 });
  });

  it('refuses without embedding once the global cap is spent', async () => {
    const store = new InMemoryStore();
    await store.setCreationLimits({ globalDailySearchEmbeddingCap: 1 }, 'test');
    const app = await buildApp({ store, sessionSecret });
    apps.push(app);

    const first = await app.inject({ method: 'GET', url: '/api/catalog/search?q=arcade+football' });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({ method: 'GET', url: '/api/catalog/search?q=arcade+football' });
    // A refusal looks exactly like a miss.
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual({ match: null, score: 0 });

    // And it spent no second slot trying.
    expect(await store.getGlobalSearchEmbeddingCount(new Date().toISOString().slice(0, 10))).toBe(1);
  });

  it('spends nothing at all while search is paused', async () => {
    const store = new InMemoryStore();
    await store.setCreationLimits({ searchPaused: true }, 'test');
    const app = await buildApp({ store, sessionSecret });
    apps.push(app);

    const res = await app.inject({ method: 'GET', url: '/api/catalog/search?q=arcade+football' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ match: null, score: 0 });
    expect(await store.getGlobalSearchEmbeddingCount(new Date().toISOString().slice(0, 10))).toBe(0);
  });

  it('counts an anonymous query against the global ceiling', async () => {
    const store = new InMemoryStore();
    const app = await buildApp({ store, sessionSecret });
    apps.push(app);

    // No session, and after the beta wall none is required.
    const res = await app.inject({ method: 'GET', url: '/api/catalog/search?q=arcade+football' });
    expect(res.statusCode).toBe(200);
    expect(await store.getGlobalSearchEmbeddingCount(new Date().toISOString().slice(0, 10))).toBe(1);
  });

  it('does not count a query too short to search', async () => {
    const store = new InMemoryStore();
    const app = await buildApp({ store, sessionSecret });
    apps.push(app);

    await app.inject({ method: 'GET', url: '/api/catalog/search?q=a' });
    expect(await store.getGlobalSearchEmbeddingCount(new Date().toISOString().slice(0, 10))).toBe(0);
  });

  it('handles search queries without errors when unconfigured', async () => {
    const store = new InMemoryStore();
    const app = await buildApp({
      store,
      sessionSecret,
    });
    apps.push(app);

    const res = await app.inject({
      method: 'GET',
      url: '/api/catalog/search?q=arcade+football',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ match: null, score: 0 });
  });
});
