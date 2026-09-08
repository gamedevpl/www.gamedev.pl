import { expect, it } from 'vitest';
import Fastify from 'fastify';
import { InMemoryStore } from '../platform/store.js';
import { mintToken } from '../platform/submission-token.js';
import { registerLocalActivityRoutes } from './local-activity-routes.js';
it('keeps local activity owner-only, rejects stale runs and leaves delivery state alone', async () => {
  const store = new InMemoryStore();
  await store.createSubmission(1, 'owner', 'Game');
  const app = Fastify();
  app.addHook('preHandler', async (request) => {
    request.user = { uid: String(request.headers['x-user'] ?? '') } as typeof request.user;
  });
  await registerLocalActivityRoutes(app, store, 'secret');
  const url = `/api/me/studio/local-activity/${mintToken(1, 'secret')}`;
  const runId = '12345678-1234-4234-8234-123456789abc';
  const body = { runId, agent: 'agy', phase: 'preparing', start: true };
  expect((await app.inject({ method: 'POST', url, headers: { 'x-user': 'other' }, payload: body })).statusCode).toBe(
    404,
  );
  expect((await app.inject({ method: 'POST', url, headers: { 'x-user': 'owner' }, payload: body })).statusCode).toBe(
    200,
  );
  expect((await app.inject({ method: 'GET', url, headers: { 'x-user': 'owner' } })).json().activity.phase).toBe(
    'preparing',
  );
  expect(
    (
      await app.inject({
        method: 'POST',
        url,
        headers: { 'x-user': 'owner' },
        payload: { runId, agent: 'agy', phase: 'ready' },
      })
    ).statusCode,
  ).toBe(200);
  expect((await store.getSubmission(1))?.deliveredVersion).toBeUndefined();
  expect(
    (
      await app.inject({
        method: 'POST',
        url,
        headers: { 'x-user': 'owner' },
        payload: { runId: 'abcdefab-1234-4234-8234-123456789abc', agent: 'agy', phase: 'editing' },
      })
    ).statusCode,
  ).toBe(409);
  expect(
    (
      await app.inject({
        method: 'POST',
        url,
        headers: { 'x-user': 'owner' },
        payload: { ...body, prompt: 'must not store' },
      })
    ).statusCode,
  ).toBe(400);
  await app.close();
});
