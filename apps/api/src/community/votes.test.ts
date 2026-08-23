import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import { InMemoryStore } from '../platform/store.js';
import type { PublishedSlugGate } from '../catalog/published-slugs.js';

const sessionSecret = 'dev-session-secret-change-me';

function authHeaders(uid: string) {
  return { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}` };
}

function slugGate(published: string[]): PublishedSlugGate {
  const slugs = new Set(published);
  return { isPublished: async (slug: string) => slugs.has(slug) };
}

describe('vote routes', () => {
  let store: InMemoryStore;
  beforeEach(async () => {
    store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:alice' });
    await store.upsertUser({ uid: 'g:bob' });
  });

  it('casting and clearing a vote require a session; reading counts does not', async () => {
    const app = await buildApp({ store, sessionSecret, voteRoutes: { publishedSlugs: slugGate(['brick-storm']) } });

    const post = await app.inject({ method: 'POST', url: '/api/games/brick-storm/vote', payload: { value: 'up' } });
    expect(post.statusCode).toBe(401);

    const del = await app.inject({ method: 'DELETE', url: '/api/games/brick-storm/vote' });
    expect(del.statusCode).toBe(401);

    const get = await app.inject({ method: 'GET', url: '/api/games/brick-storm/votes' });
    expect(get.statusCode).toBe(200);
    expect(get.json()).toEqual({ up: 0, down: 0, mine: null });
    await app.close();
  });

  it('answers 404 for a slug that is not a published game, on every route', async () => {
    const app = await buildApp({ store, sessionSecret, voteRoutes: { publishedSlugs: slugGate([]) } });

    const post = await app.inject({
      method: 'POST',
      url: '/api/games/no-such-game/vote',
      headers: authHeaders('g:alice'),
      payload: { value: 'up' },
    });
    expect(post.statusCode).toBe(404);

    const get = await app.inject({ method: 'GET', url: '/api/games/no-such-game/votes' });
    expect(get.statusCode).toBe(404);

    const del = await app.inject({
      method: 'DELETE',
      url: '/api/games/no-such-game/vote',
      headers: authHeaders('g:alice'),
    });
    expect(del.statusCode).toBe(404);
    await app.close();
  });

  it('rejects a vote value outside the fixed vocabulary', async () => {
    const app = await buildApp({ store, sessionSecret, voteRoutes: { publishedSlugs: slugGate(['brick-storm']) } });
    const res = await app.inject({
      method: 'POST',
      url: '/api/games/brick-storm/vote',
      headers: authHeaders('g:alice'),
      payload: { value: 'sideways' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('casts a vote and reflects it in the aggregate and the caller’s own read', async () => {
    const app = await buildApp({ store, sessionSecret, voteRoutes: { publishedSlugs: slugGate(['brick-storm']) } });

    const post = await app.inject({
      method: 'POST',
      url: '/api/games/brick-storm/vote',
      headers: authHeaders('g:alice'),
      payload: { value: 'up' },
    });
    expect(post.statusCode).toBe(200);
    expect(post.json()).toEqual({ up: 1, down: 0, mine: 'up' });

    const get = await app.inject({
      method: 'GET',
      url: '/api/games/brick-storm/votes',
      headers: authHeaders('g:alice'),
    });
    expect(get.json()).toEqual({ up: 1, down: 0, mine: 'up' });
    await app.close();
  });

  it('changes a vote rather than adding a second ballot for the same uid', async () => {
    const app = await buildApp({ store, sessionSecret, voteRoutes: { publishedSlugs: slugGate(['brick-storm']) } });

    await app.inject({
      method: 'POST',
      url: '/api/games/brick-storm/vote',
      headers: authHeaders('g:alice'),
      payload: { value: 'up' },
    });
    const flipped = await app.inject({
      method: 'POST',
      url: '/api/games/brick-storm/vote',
      headers: authHeaders('g:alice'),
      payload: { value: 'down' },
    });
    expect(flipped.json()).toEqual({ up: 0, down: 1, mine: 'down' });
    await app.close();
  });

  it('repeating the same vote is a no-op, not a second count', async () => {
    const app = await buildApp({ store, sessionSecret, voteRoutes: { publishedSlugs: slugGate(['brick-storm']) } });

    for (let i = 0; i < 3; i += 1) {
      await app.inject({
        method: 'POST',
        url: '/api/games/brick-storm/vote',
        headers: authHeaders('g:alice'),
        payload: { value: 'up' },
      });
    }
    const get = await app.inject({ method: 'GET', url: '/api/games/brick-storm/votes' });
    expect(get.json()).toEqual({ up: 1, down: 0, mine: null });
    await app.close();
  });

  it('clears a vote and returns the vote to null', async () => {
    const app = await buildApp({ store, sessionSecret, voteRoutes: { publishedSlugs: slugGate(['brick-storm']) } });

    await app.inject({
      method: 'POST',
      url: '/api/games/brick-storm/vote',
      headers: authHeaders('g:alice'),
      payload: { value: 'up' },
    });
    const cleared = await app.inject({
      method: 'DELETE',
      url: '/api/games/brick-storm/vote',
      headers: authHeaders('g:alice'),
    });
    expect(cleared.json()).toEqual({ up: 0, down: 0, mine: null });
    await app.close();
  });

  it('clearing a vote that was never cast is a harmless no-op', async () => {
    const app = await buildApp({ store, sessionSecret, voteRoutes: { publishedSlugs: slugGate(['brick-storm']) } });
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/games/brick-storm/vote',
      headers: authHeaders('g:alice'),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ up: 0, down: 0, mine: null });
    await app.close();
  });

  it('keeps votes isolated per game', async () => {
    const app = await buildApp({
      store,
      sessionSecret,
      voteRoutes: { publishedSlugs: slugGate(['brick-storm', 'circus-cat']) },
    });

    await app.inject({
      method: 'POST',
      url: '/api/games/brick-storm/vote',
      headers: authHeaders('g:alice'),
      payload: { value: 'up' },
    });
    const other = await app.inject({ method: 'GET', url: '/api/games/circus-cat/votes' });
    expect(other.json()).toEqual({ up: 0, down: 0, mine: null });
    await app.close();
  });

  it('counts two different accounts as two votes', async () => {
    const app = await buildApp({ store, sessionSecret, voteRoutes: { publishedSlugs: slugGate(['brick-storm']) } });

    await app.inject({
      method: 'POST',
      url: '/api/games/brick-storm/vote',
      headers: authHeaders('g:alice'),
      payload: { value: 'up' },
    });
    await app.inject({
      method: 'POST',
      url: '/api/games/brick-storm/vote',
      headers: authHeaders('g:bob'),
      payload: { value: 'down' },
    });
    const get = await app.inject({ method: 'GET', url: '/api/games/brick-storm/votes' });
    expect(get.json()).toEqual({ up: 1, down: 1, mine: null });
    await app.close();
  });

  it('a signed-in caller sees their own vote as `mine` without affecting a stranger’s read', async () => {
    const app = await buildApp({ store, sessionSecret, voteRoutes: { publishedSlugs: slugGate(['brick-storm']) } });

    await app.inject({
      method: 'POST',
      url: '/api/games/brick-storm/vote',
      headers: authHeaders('g:alice'),
      payload: { value: 'up' },
    });

    const asBob = await app.inject({
      method: 'GET',
      url: '/api/games/brick-storm/votes',
      headers: authHeaders('g:bob'),
    });
    expect(asBob.json()).toEqual({ up: 1, down: 0, mine: null });

    const asAlice = await app.inject({
      method: 'GET',
      url: '/api/games/brick-storm/votes',
      headers: authHeaders('g:alice'),
    });
    expect(asAlice.json()).toEqual({ up: 1, down: 0, mine: 'up' });
    await app.close();
  });

  it('with no games repo configured, every slug answers 404', async () => {
    // Mirrors telemetry's behavior for the same condition: a secret-less deploy has
    // no way to know what is published, so it must not guess.
    const app = await buildApp({ store, sessionSecret, voteRoutes: {} });
    const res = await app.inject({ method: 'GET', url: '/api/games/brick-storm/votes' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('admits a store-published slug with no repo-catalog entry', async () => {
    // No voteRoutes.publishedSlugs override: exercises the combined gate wired in app.ts
    // (repo catalog is null under NODE_ENV=test; store publication must open the gate).
    await store.setPublication({
      slug: 'miniature-warfare-2d',
      state: 'published',
      currentVersion: 'v1',
      publishedAt: '2026-07-01T00:00:00.000Z',
    });
    const app = await buildApp({ store, sessionSecret });

    const get = await app.inject({ method: 'GET', url: '/api/games/miniature-warfare-2d/votes' });
    expect(get.statusCode).toBe(200);
    expect(get.json()).toEqual({ up: 0, down: 0, mine: null });

    const post = await app.inject({
      method: 'POST',
      url: '/api/games/miniature-warfare-2d/vote',
      headers: authHeaders('g:alice'),
      payload: { value: 'up' },
    });
    expect(post.statusCode).toBe(200);
    expect(post.json()).toEqual({ up: 1, down: 0, mine: 'up' });
    await app.close();
  });
});

describe('InMemoryStore votes', () => {
  let store: InMemoryStore;
  beforeEach(() => {
    store = new InMemoryStore();
  });

  it('reports no vote and zero counts for a game nobody has voted on', async () => {
    expect(await store.getVote('g', 'u1')).toBeNull();
    expect(await store.getVoteCounts('g')).toEqual({ up: 0, down: 0 });
  });

  it('changing a vote decrements the old bucket and increments the new one', async () => {
    await store.castVote('g', 'u1', 'up');
    await store.castVote('g', 'u1', 'down');
    expect(await store.getVoteCounts('g')).toEqual({ up: 0, down: 1 });
    expect(await store.getVote('g', 'u1')).toBe('down');
  });

  it('clearing a vote never drives a count negative', async () => {
    await store.clearVote('g', 'u1');
    expect(await store.getVoteCounts('g')).toEqual({ up: 0, down: 0 });
  });
});
