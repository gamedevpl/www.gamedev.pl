import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, expect, it } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import { registerModerationFlagRoutes } from './moderation-flags.js';

const apps: FastifyInstance[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});
const routes = ['/api/review/flags', '/api/games/sky-dodge/report'];
async function setup(notifyFlagRaised: () => Promise<void>) {
  const store = new InMemoryStore();
  await store.upsertUser({ uid: 'g:reviewer' });
  const app = Fastify();
  apps.push(app);
  app.addHook('onRequest', async (request) => {
    request.user = (await store.getUser('g:reviewer'))!;
    request.authMethod = 'session';
  });
  await registerModerationFlagRoutes(app, {
    store,
    notifyFlagRaised,
    reviewerUids: new Set(['g:reviewer']),
    now: () => Date.now(),
    invalidatePublishedGameCaches: () => {},
    isSlugPublished: async () => true,
  });
  return { app, store };
}
it.each(routes)('finishes notification attempts before responding: %s', async (url) => {
  let release!: () => void;
  let begin!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    begin = resolve;
  });
  const { app, store } = await setup(async () => {
    begin();
    await pending;
  });
  let replied = false;
  const response = app
    .inject({ method: 'POST', url, payload: { slug: 'sky-dodge', reason: 'hate', note: 'report evidence' } })
    .then((result) => {
      replied = true;
      return result;
    });
  await started;
  await new Promise<void>((resolve) => setImmediate(resolve));
  try {
    expect(replied).toBe(false);
    expect(await store.listModerationFlags()).toHaveLength(1);
  } finally {
    release();
  }
  expect((await response).statusCode).toBe(200);
});
it.each(routes)('keeps the report when notification fails: %s', async (url) => {
  const { app, store } = await setup(async () => {
    throw new Error('notification unavailable');
  });
  const response = await app.inject({
    method: 'POST',
    url,
    payload: { slug: 'sky-dodge', reason: 'hate', note: 'report evidence' },
  });
  expect(response.statusCode).toBe(200);
  expect(await store.listModerationFlags()).toHaveLength(1);
});
