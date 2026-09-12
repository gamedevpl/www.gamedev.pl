import { describe, expect, it } from 'vitest';
import { buildOAuthApp, enableCliSurface, mintCreatorTokens, seedSelfRound } from '../platform/oauth-cli-test-app.js';
import { buildApp } from '../platform/app.js';
import { InMemoryStore } from '../platform/store.js';
import { mintAgentToken } from '../platform/agent-token.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';

const secret = 'test-takeover-secret';
const url = '/api/me/studio/games/sky-dodge/sources/session';
async function setup() {
  const store = new InMemoryStore();
  await store.upsertUser({ uid: 'g:creator' });
  await store.upsertUser({ uid: 'g:other' });
  await store.createSubmission(10, 'g:creator', 'Sky Dodge');
  await store.setSubmissionSlug(10, 'sky-dodge');
  await store.setRoundBuilder(10, 'self');
  await store.ensureRoundGeneration(10);
  await store.recordJobTransition(10, { to: 'building', at: new Date().toISOString(), by: 'agent', reason: 'started' });
  await store.recordDispatch(10, { backend: 'self', ref: 'local-session' });
  const app = await buildApp({
    store,
    sessionSecret: secret,
    submissionRoutes: { submissionTokenSecret: secret },
    creatorCodeRoutes: { store },
  });
  const headers = { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken('g:creator', secret)}` };
  return { app, store, headers };
}
describe('creator takeover', () => {
  it('accepts the CLI creator OAuth grant at the real route boundary', async () => {
    const restore = enableCliSurface();
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:creator' });
    await seedSelfRound(store);
    await store.ensureRoundGeneration(42);
    await store.recordDispatch(42, { backend: 'self', ref: 'cli-agent' });
    const app = await buildOAuthApp(store);
    try {
      const tokens = await mintCreatorTokens(app);
      const headers = { authorization: `Bearer ${tokens.access_token}` };
      const route = '/api/me/studio/games/comet-courier/sources/session';
      expect((await app.inject({ url: route, headers })).statusCode).toBe(200);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: route,
            headers,
            payload: { jobId: 42, generation: 1, stopAgent: true },
          })
        ).statusCode,
      ).toBe(200);
    } finally {
      await app.close();
      restore();
    }
  });
  it('revokes the old agent key without resetting budgets or publishing', async () => {
    const { app, store, headers } = await setup();
    try {
      await store.incrementRoundDeliveryCount(10);
      await store.incrementRoundSubmitAttempts(10);
      await store.setSubmissionPreviewVersion(10, 'existing-preview');
      const before = (await store.getSubmission(10))!;
      const probe = await app.inject({ url, headers });
      expect(probe.json()).toMatchObject({ locked: true, canTakeOver: true, generation: 1 });
      const response = await app.inject({
        method: 'POST',
        url,
        headers,
        payload: { jobId: 10, generation: 1, stopAgent: true },
      });
      expect(response.statusCode).toBe(200);
      const after = (await store.getSubmission(10))!;
      expect(after).toMatchObject({ state: before.state, roundGeneration: 2, agentEndedBy: 'end' });
      expect(after.roundDeliveryCount).toBe(1);
      expect(after.roundSubmitAttempts).toBe(1);
      expect(after.previewVersion).toBe(before.previewVersion);
      expect((await app.inject({ url, headers })).json().locked).toBe(false);
      const oldWrite = await app.inject({
        method: 'POST',
        url: '/api/agent/build/progress',
        headers: { authorization: `Bearer ${mintAgentToken(10, secret, { roundGeneration: 1 })}` },
        payload: { text: 'old agent' },
      });
      expect(oldWrite.statusCode).toBe(401);
      expect(await store.listBuildEvents(10)).toHaveLength(0);
    } finally {
      await app.close();
    }
  });
  it('requires ownership, confirmation and the exact round seen by the creator', async () => {
    const { app, store, headers } = await setup();
    try {
      const payload = { jobId: 10, generation: 1, stopAgent: true };
      expect(
        (
          await app.inject({
            method: 'POST',
            url,
            headers: { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken('g:other', secret)}` },
            payload,
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (await app.inject({ method: 'POST', url, headers, payload: { ...payload, stopAgent: false } })).statusCode,
      ).toBe(400);
      await store.bumpRoundGeneration(10);
      expect((await app.inject({ method: 'POST', url, headers, payload })).statusCode).toBe(409);
      expect((await store.getSubmission(10))!.agentEndedAt).toBeUndefined();
    } finally {
      await app.close();
    }
  });
  it.each(['platform', 'closed', 'pending', 'submitted', 'publishing'] as const)('refuses a %s round', async (kind) => {
    const { app, store, headers } = await setup();
    try {
      if (kind === 'submitted' || kind === 'publishing')
        await store.recordJobTransition(10, {
          to: kind,
          at: new Date().toISOString(),
          by: 'agent',
          reason: 'delivery',
        });
      if (kind === 'platform') await store.setRoundBuilder(10, 'platform');
      if (kind === 'closed')
        await store.recordJobTransition(10, {
          to: 'ready_for_review',
          at: new Date().toISOString(),
          by: 'agent',
          reason: 'done',
        });
      if (kind === 'pending') await store.requestBuilderHandoff(10, 'platform', new Date().toISOString());
      expect(
        (await app.inject({ method: 'POST', url, headers, payload: { jobId: 10, generation: 1, stopAgent: true } }))
          .statusCode,
      ).toBe(409);
    } finally {
      await app.close();
    }
  });
});
