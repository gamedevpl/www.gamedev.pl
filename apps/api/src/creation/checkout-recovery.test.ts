import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import { createGameCreator, type CreateGameRouteDeps } from './create-game.js';
import type { GitHubClient } from '../catalog/github-client.js';
import { registerCheckoutRecovery } from './checkout-recovery.js';
const apps: ReturnType<typeof Fastify>[] = [];
afterEach(async () => {
  vi.useRealTimers();
  for (const app of apps.splice(0)) await app.close();
});
async function fixture(owner = 'owner', state: 'canceled' | 'queued' = 'canceled') {
  const store = new InMemoryStore();
  await store.createSubmission(1, owner, 'Sky Game');
  await store.setSubmissionSlug(1, 'sky');
  await store.recordJobTransition(1, { to: 'queued', at: '2026-01-01', by: 'creator', reason: 'submitted' });
  if (state === 'canceled')
    await store.recordJobTransition(1, {
      to: 'canceled',
      at: '2026-01-02',
      by: 'operator',
      reason: 'operator_canceled',
    });
  if (state === 'canceled') await store.setSubmissionAbandoned(1, '2026-01-02');
  const app = Fastify();
  apps.push(app);
  app.addHook('preHandler', async (req) => {
    req.user = { uid: 'owner' } as typeof req.user;
  });
  const dispatch = vi.fn(async () => {});
  const { createGame: realCreate } = createGameCreator({
    store,
    githubClient: {} as GitHubClient,
    submissionTokenSecret: 'secret',
    contentChecker: { check: async () => ({ allowed: true }), checkFields: async () => ({ allowed: true }) },
    creationGate: null,
    managedAvailabilityGate: null,
    now: Date.now,
    log: app.log,
    dailySubmissionQuota: 100,
    maxSubmissionsPerWindow: 100,
    rateLimitWindowMs: 1000,
    submissionsByIp: new Map(),
    isSlugClaimed: async () => false,
    confirmSlugClaim: async (_, slug) => slug,
    dispatchQueuedJob: dispatch,
  });
  const createGame = vi.fn<CreateGameRouteDeps['createGame']>(realCreate);
  registerCheckoutRecovery(app, {
    store,
    createGame,
    githubClient: null,
    submissionTokenSecret: 'secret',
    checkUserAccess: () => true,
    isSlugPublished: async () => false,
  });
  return { store, app, createGame, dispatch };
}
const payload = () => ({
  slug: 'sky',
  key: randomUUID(),
  title: 'Sky Game',
  concept: 'A long enough description of a game to recover.',
});
it('recognizes owned cancellation and uses the moderated creation path with self builder', async () => {
  const f = await fixture();
  expect((await f.app.inject('/api/me/studio/games/sky/recovery')).json()).toEqual({ kind: 'canceled' });
  expect((await f.app.inject({ method: 'POST', url: '/api/me/studio/recover', payload: payload() })).statusCode).toBe(
    200,
  );
  expect(f.createGame.mock.calls[0]?.[0]).toMatchObject({
    payload: { builder: 'self' },
    recovery: { slug: 'sky', sourceJobId: 1 },
  });
});
it('imports a deleted record but refuses another owner and active rounds', async () => {
  const f = await fixture();
  const p = payload();
  p.slug = 'deleted';
  expect((await f.app.inject({ method: 'POST', url: '/api/me/studio/recover', payload: p })).statusCode).toBe(200);
  for (const [owner, state] of [
    ['other', 'canceled'],
    ['owner', 'queued'],
  ] as const) {
    const blocked = await fixture(owner, state);
    expect(
      (await blocked.app.inject({ method: 'POST', url: '/api/me/studio/recover', payload: payload() })).statusCode,
    ).toBe(409);
    expect(blocked.createGame).not.toHaveBeenCalled();
  }
});
it('only one concurrent recovery can claim a canceled slug; old history is preserved', async () => {
  const { store } = await fixture();
  await store.createSubmission(2, 'owner', 'Sky');
  await store.createSubmission(3, 'owner', 'Sky');
  const result = await Promise.all([store.claimSubmissionSlug(2, 'sky', 1), store.claimSubmissionSlug(3, 'sky', 1)]);
  expect(result.filter(Boolean)).toHaveLength(1);
  expect((await store.getSubmission(1))?.state).toBe('canceled');
  await store.createSubmission(4, 'other', 'Sky');
  expect(await store.claimSubmissionSlug(4, 'sky', null)).toBe(false);
});
it('never claims another owner’s canceled round', async () => {
  const { store } = await fixture('other');
  await store.createSubmission(2, 'owner', 'Sky');
  expect(await store.claimSubmissionSlug(2, 'sky', 1)).toBe(false);
});
it('reuses a fully initialized self round after a lost response without recharging or dispatch', async () => {
  const f = await fixture();
  const body = payload();
  const first = await f.app.inject({ method: 'POST', url: '/api/me/studio/recover', payload: body });
  const second = await f.app.inject({ method: 'POST', url: '/api/me/studio/recover', payload: body });
  expect(first.statusCode).toBe(200);
  expect(second.json()).toEqual(first.json());
  expect(f.createGame).toHaveBeenCalledTimes(1);
  expect(f.dispatch).not.toHaveBeenCalled();
  expect(await f.store.getSubmissionBySlug('sky')).toMatchObject({
    builder: 'self',
    state: 'queued',
    recoveryKey: body.key,
    spec: body.concept,
  });
});
it('serializes same-millisecond normal creation and recovery claims', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-12'));
  const { store } = await fixture();
  await store.createSubmission(2, 'owner', 'Sky');
  await store.createSubmission(3, 'other', 'Sky');
  const result = await Promise.all([store.claimSubmissionSlug(2, 'sky', 1), store.claimSubmissionSlug(3, 'sky', null)]);
  expect(result).toEqual([true, false]);
  expect((await store.getSubmissionBySlug('sky'))?.jobId).toBe(2);
});

it('retries atomic collisions for ordinary same-title creation', async () => {
  const f = await fixture();
  const create = () =>
    f.createGame({
      uid: 'owner',
      ip: '127.0.0.1',
      payload: { title: 'Same Title', concept: payload().concept, builder: 'self' },
      log: f.app.log,
    });
  const results = await Promise.all([create(), create()]);
  expect(results.every((result) => result.ok)).toBe(true);
  expect(results.map((result) => result.ok && result.slug).sort()).toEqual(['same-title', 'same-title-2']);
});

it('recovers creator-archived publications while preserving the archived publication', async () => {
  const f = await fixture('owner', 'queued');
  await f.store.setPublication({ slug: 'sky', state: 'published', currentVersion: 'v1', publishedAt: '2026-01-01' });
  await f.store.recordJobTransition(1, { to: 'published', at: '2026-01-01', by: 'operator' });
  await f.store.archivePublication('sky', 'deleted by creator', '2026-01-02');
  expect((await f.app.inject('/api/me/studio/games/sky/recovery')).json()).toEqual({ kind: 'archived' });
  expect((await f.app.inject({ method: 'POST', url: '/api/me/studio/recover', payload: payload() })).statusCode).toBe(
    200,
  );
  expect((await f.store.getPublication('sky'))?.state).toBe('archived');
  const recovered = (await f.store.getSubmissionBySlug('sky'))!;
  await f.store.setSubmissionPublishedAt(recovered.jobId, '2026-01-03');
  await f.store.recordJobTransition(recovered.jobId, { to: 'published', at: '2026-01-03', by: 'operator' });
  await f.store.setPublication({ slug: 'sky', state: 'published', currentVersion: 'v2', publishedAt: '2026-01-03' });
  await f.store.archivePublication('sky', 'deleted by creator', '2026-01-04');
  expect((await f.app.inject('/api/me/studio/games/sky/recovery')).json()).toEqual({ kind: 'archived' });
  expect((await f.app.inject({ method: 'POST', url: '/api/me/studio/recover', payload: payload() })).statusCode).toBe(
    200,
  );
  expect((await f.store.getSubmissionBySlug('sky'))?.jobId).not.toBe(recovered.jobId);
});
it('refuses moderation-disabled publications', async () => {
  const f = await fixture();
  await f.store.setPublication({ slug: 'sky', state: 'disabled', currentVersion: 'v1', publishedAt: '2026-01-01' });
  expect((await f.app.inject('/api/me/studio/games/sky/recovery')).json()).toEqual({ kind: 'occupied' });
});

it('refuses archived recovery while an improvement round is active', async () => {
  const f = await fixture('owner', 'queued');
  await f.store.setPublication({
    slug: 'sky',
    state: 'archived',
    currentVersion: 'v1',
    publishedAt: '2026-01-01',
    takedownReason: 'deleted by creator',
  });
  expect((await f.app.inject('/api/me/studio/games/sky/recovery')).json()).toEqual({ kind: 'active' });
  expect((await f.app.inject({ method: 'POST', url: '/api/me/studio/recover', payload: payload() })).statusCode).toBe(
    409,
  );
  await f.store.createSubmission(2, 'owner', 'Sky');
  expect(await f.store.claimSubmissionSlug(2, 'sky', 1)).toBe(false);
});

it('admits one concurrent recovery before creation spends and reuses its result', async () => {
  const f = await fixture();
  const real = f.createGame.getMockImplementation()!;
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  f.createGame.mockImplementation(async (input) => {
    entered();
    await blocked;
    return real(input);
  });
  const body = payload();
  const first = f.app.inject({ method: 'POST', url: '/api/me/studio/recover', payload: body });
  const firstResult = first.then((response) => response);
  await started;
  const duplicate = await f.app.inject({ method: 'POST', url: '/api/me/studio/recover', payload: body });
  expect(duplicate.statusCode).toBe(409);
  expect(duplicate.json().error).toBe('recovery_in_progress');
  expect(f.createGame).toHaveBeenCalledTimes(1);
  release();
  const completed = await firstResult;
  expect(completed.statusCode).toBe(200);
  const retry = await f.app.inject({ method: 'POST', url: '/api/me/studio/recover', payload: body });
  expect(retry.json()).toEqual(completed.json());
  expect(f.createGame).toHaveBeenCalledTimes(1);
});
