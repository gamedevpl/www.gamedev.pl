import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../auth.js';
import { InMemoryStore, MAX_GAME_SAVE_BYTES } from '../store.js';
import type { PublishedSlugGate } from '../catalog/published-slugs.js';

const sessionSecret = 'dev-session-secret-change-me';

function authHeaders(uid: string) {
  return { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}` };
}

function slugGate(published: string[]): PublishedSlugGate {
  const slugs = new Set(published);
  return { isPublished: async (slug: string) => slugs.has(slug) };
}

async function appWith(store: InMemoryStore, published = ['crypt-delver']) {
  return buildApp({ store, sessionSecret, gameSaveRoutes: { publishedSlugs: slugGate(published) } });
}

describe('game save routes', () => {
  let store: InMemoryStore;
  beforeEach(async () => {
    store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:alice' });
    await store.upsertUser({ uid: 'g:bob' });
  });

  it('needs a session on every method — a save belongs to somebody or it is not kept', async () => {
    const app = await appWith(store);

    for (const [method, url] of [
      ['GET', '/api/games/crypt-delver/save'],
      ['PUT', '/api/games/crypt-delver/save'],
      ['DELETE', '/api/games/crypt-delver/save'],
    ] as const) {
      const response = await app.inject({ method, url, payload: { data: '{"level":1}' } });
      expect(response.statusCode, `${method} must require a session`).toBe(401);
    }
    await app.close();
  });

  it('reports no save rather than 404 for a first-time player', async () => {
    const app = await appWith(store);
    const response = await app.inject({
      method: 'GET',
      url: '/api/games/crypt-delver/save',
      headers: authHeaders('g:alice'),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: null, version: 0, updatedAt: null });
    await app.close();
  });

  it('round-trips a save, opaquely', async () => {
    const app = await appWith(store);
    // Nested arrays are the case that decided the storage shape: Firestore rejects them
    // outright, so a parsed-object schema would fail on a game saving a grid.
    const data = JSON.stringify({
      level: 3,
      grid: [
        [1, 2],
        [3, 4],
      ],
      name: 'Ada',
    });

    const put = await app.inject({
      method: 'PUT',
      url: '/api/games/crypt-delver/save',
      headers: authHeaders('g:alice'),
      payload: { data, version: 2 },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().version).toBe(2);

    const get = await app.inject({
      method: 'GET',
      url: '/api/games/crypt-delver/save',
      headers: authHeaders('g:alice'),
    });
    expect(get.json().data).toBe(data);
    expect(get.json().version).toBe(2);
    await app.close();
  });

  it('keeps one player’s save away from another’s', async () => {
    const app = await appWith(store);
    await app.inject({
      method: 'PUT',
      url: '/api/games/crypt-delver/save',
      headers: authHeaders('g:alice'),
      payload: { data: '{"level":9}' },
    });

    const bob = await app.inject({
      method: 'GET',
      url: '/api/games/crypt-delver/save',
      headers: authHeaders('g:bob'),
    });
    expect(bob.json().data).toBeNull();
    await app.close();
  });

  it('a later write replaces the earlier one whole', async () => {
    const app = await appWith(store);
    for (const data of ['{"level":1,"gold":5}', '{"level":2}']) {
      await app.inject({
        method: 'PUT',
        url: '/api/games/crypt-delver/save',
        headers: authHeaders('g:alice'),
        payload: { data },
      });
    }

    const get = await app.inject({
      method: 'GET',
      url: '/api/games/crypt-delver/save',
      headers: authHeaders('g:alice'),
    });
    // Not a merge: `gold` must be gone, not resurrected beside the newer shape.
    expect(get.json().data).toBe('{"level":2}');
    await app.close();
  });

  it('refuses a save over the byte budget', async () => {
    const app = await appWith(store);
    const data = JSON.stringify({ blob: 'x'.repeat(MAX_GAME_SAVE_BYTES) });

    const response = await app.inject({
      method: 'PUT',
      url: '/api/games/crypt-delver/save',
      headers: authHeaders('g:alice'),
      payload: { data },
    });
    expect(response.statusCode).toBe(413);
    await app.close();
  });

  it('measures the budget in bytes, not characters', async () => {
    const app = await appWith(store);
    // Just under the cap by `length`, well over it in UTF-8 — the reading that matters,
    // because bytes are what gets stored.
    const data = JSON.stringify({ blob: 'ł'.repeat(MAX_GAME_SAVE_BYTES - 200) });
    expect(data.length).toBeLessThan(MAX_GAME_SAVE_BYTES);

    const response = await app.inject({
      method: 'PUT',
      url: '/api/games/crypt-delver/save',
      headers: authHeaders('g:alice'),
      payload: { data },
    });
    expect(response.statusCode).toBe(413);
    await app.close();
  });

  it('refuses a payload that is not JSON, so a slot cannot hold something unreadable', async () => {
    const app = await appWith(store);
    const response = await app.inject({
      method: 'PUT',
      url: '/api/games/crypt-delver/save',
      headers: authHeaders('g:alice'),
      payload: { data: 'not json{' },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('answers 404 for reads and writes against a slug that is not a published game', async () => {
    const app = await appWith(store, []);

    const get = await app.inject({
      method: 'GET',
      url: '/api/games/some-draft/save',
      headers: authHeaders('g:alice'),
    });
    expect(get.statusCode).toBe(404);

    const put = await app.inject({
      method: 'PUT',
      url: '/api/games/some-draft/save',
      headers: authHeaders('g:alice'),
      payload: { data: '{"level":1}' },
    });
    expect(put.statusCode).toBe(404);
    await app.close();
  });

  it('lets a player delete progress in a game that has left the catalog', async () => {
    // Written while the game was published, deleted after it was withdrawn. The data is
    // the player's, so "delete my progress" must not depend on the game still existing.
    await store.putGameSave('g:alice', 'gone-game', '{"level":4}', 1);
    const app = await appWith(store, []);

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/games/gone-game/save',
      headers: authHeaders('g:alice'),
    });
    expect(response.statusCode).toBe(200);
    expect(await store.getGameSave('g:alice', 'gone-game')).toBeNull();
    await app.close();
  });

  it('rejects a blocked account’s writes but still answers its reads', async () => {
    await store.upsertUser({ uid: 'g:banned', tier: 'blocked' });
    const app = await appWith(store);

    const put = await app.inject({
      method: 'PUT',
      url: '/api/games/crypt-delver/save',
      headers: authHeaders('g:banned'),
      payload: { data: '{"level":1}' },
    });
    expect(put.statusCode).toBe(403);

    const get = await app.inject({
      method: 'GET',
      url: '/api/games/crypt-delver/save',
      headers: authHeaders('g:banned'),
    });
    expect(get.statusCode).toBe(200);
    await app.close();
  });

  it('rejects a slug shaped like a path traversal', async () => {
    const app = await appWith(store);
    const response = await app.inject({
      method: 'GET',
      url: '/api/games/..%2F..%2Fetc/save',
      headers: authHeaders('g:alice'),
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    await app.close();
  });
});
