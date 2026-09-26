import { expect, it } from 'vitest';
import { buildApp } from '../platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import { InMemoryStore } from '../platform/store.js';

it('rejects vote changes from a blocked account with an unexpired session', async () => {
  const store = new InMemoryStore();
  await store.upsertUser({ uid: 'g:alice' });
  await store.castVote('brick-storm', 'g:alice', 'up');
  await store.upsertUser({ uid: 'g:alice', tier: 'blocked' });
  const app = await buildApp({
    store,
    sessionSecret: 'dev-session-secret-change-me',
    voteRoutes: { publishedSlugs: { isPublished: async () => true } },
  });
  const headers = {
    cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken('g:alice', 'dev-session-secret-change-me')}`,
  };

  const post = await app.inject({
    method: 'POST',
    url: '/api/games/brick-storm/vote',
    headers,
    payload: { value: 'down' },
  });
  expect(post.statusCode).toBe(403);
  expect(post.json()).toEqual({ error: 'account is blocked' });

  const del = await app.inject({ method: 'DELETE', url: '/api/games/brick-storm/vote', headers });
  expect(del.statusCode).toBe(403);
  expect(del.json()).toEqual({ error: 'account is blocked' });
  expect(await store.getVote('brick-storm', 'g:alice')).toBe('up');
  expect(await store.getVoteCounts('brick-storm')).toEqual({ up: 1, down: 0 });
  await app.close();
});
