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
