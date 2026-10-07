import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../platform/app.js';
import { InMemoryStore, FirestoreStore, type Store } from '../platform/store.js';
import { fakeFirestore } from '../store/fake-firestore.js';
import { opsHeaders, opsTestVerifier, opsUrl } from '../platform/ops-console.fixture.js';
import { retryUndispatchedBuild } from './retry-undispatched.js';
import type { AgentBackend } from '../agent-surface/agent-backend.js';
import type { SeedDraft } from './game-seed.js';
import { createDispatcher } from './dispatch-build.js';

const now = () => Date.parse('2025-01-01T20:00:00Z');
const log = { error: vi.fn() };
async function failedJob(store: Store) {
  await store.createSubmission(1000001, 'creator', 'Retry test');
  await store.setSubmissionSlug(1000001, 'retry-test');
  await store.setSubmissionBrief(1000001, { spec: 'Dig treasure and return safely.', qa: [] });
  await store.setRoundBuilder(1000001, 'self');
  await store.ensureRoundGeneration(1000001);
  await store.recordJobTransition(1000001, {
    to: 'queued',
    at: '2025-01-01T12:00:00Z',
    by: 'creator',
    reason: 'submitted',
  });
  await store.claimInitialDispatch(1000001, '2025-01-01T12:00:00Z');
  await store.claimDispatchReaperAttempt(1000001, '2025-01-01T13:00:00Z');
  await store.recordJobTransition(1000001, {
    to: 'failed',
    at: '2025-01-01T13:30:00Z',
    by: 'system',
    reason: 'dispatch_reaper_exhausted',
  });
  return (await store.getSubmission(1000001))!;
}

for (const [name, makeStore] of [
  ['memory', () => new InMemoryStore()],
  ['firestore', () => new FirestoreStore(fakeFirestore().db)],
] as const)
  describe(`manual undispatched retry: ${name}`, () => {
    it('claims one manual retry with the saved brief and original builder', async () => {
      const store = makeStore();
      const record = await failedJob(store);
      const dispatchBuild = vi.fn(async () => true);
      const input = { store, record, dispatchBuild, now, log };
      expect(await Promise.all([retryUndispatchedBuild(input), retryUndispatchedBuild(input)])).toEqual([
        'started',
        'changed',
      ]);
      expect(dispatchBuild).toHaveBeenCalledTimes(1);
      expect(dispatchBuild).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'retry-test', builder: 'self', spec: expect.stringContaining('Dig treasure') }),
      );
      expect((await store.getSubmission(record.jobId))?.transitions?.at(-1)).toMatchObject({
        to: 'queued',
        by: 'operator',
        reason: 'operator_retry_dispatch',
      });
      expect((await store.getSubmission(record.jobId))?.roundGeneration).toBe(record.roundGeneration);
    });

    it('refuses a stale retry after dispatch', async () => {
      const store = makeStore();
      const record = await failedJob(store);
      const dispatchBuild = vi.fn(async () => true);
      await store.recordDispatch(record.jobId, { backend: 'self', ref: 'new-round' });
      expect(await retryUndispatchedBuild({ store, record, dispatchBuild, now, log })).toBe('changed');
      expect(dispatchBuild).not.toHaveBeenCalled();
    });

    it('keeps failure visible when dispatch fails, without automatic retrying', async () => {
      const store = makeStore();
      const record = await failedJob(store);
      const dispatchBuild = vi.fn(async () => false);
      expect(await retryUndispatchedBuild({ store, record, dispatchBuild, now, log })).toBe('dispatch_failed');
      expect(dispatchBuild).toHaveBeenCalledTimes(1);
      expect((await store.getSubmission(record.jobId))?.dispatchReaperAttemptedAt).toBe(
        record.dispatchReaperAttemptedAt,
      );
      const backendFor = vi.fn(async () => undefined);
      const dispatcher = createDispatcher({
        store,
        submissionTokenSecret: 'secret',
        gameSeeder: undefined,
        now,
        notifyAppBaseUrl: 'https://test.invalid',
        backendFor,
        builderOf: () => 'self',
        recordSessionCost: async () => {},
        seedDeliveryFor: () => 'channel',
        seedBuild: async () => ({ reason: 'unused' }),
        publishSeedPreview: async () => {},
      });
      expect(await dispatcher.redispatchQueuedJob({ jobId: record.jobId, log })).toEqual({ outcome: 'exhausted' });
      expect(backendFor).not.toHaveBeenCalled();
      expect((await store.getSubmission(record.jobId))?.state).toBe('failed');
    });
  });

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});
it('the admin retry reseeds an exhausted self job without starting a managed agent', async () => {
  const store = new InMemoryStore();
  const record = await failedJob(store);
  await store.upsertUser({ uid: 'operator' });
  const dispatch = vi.fn(async () => ({ ref: 'self:recovered' }));
  const self: AgentBackend = {
    name: 'self',
    seedDelivery: () => 'channel',
    dispatch,
    resume: dispatch,
    observe: async () => null,
    cancel: async () => ({ enforced: false }),
  };
  const platform = { ...self, name: 'platform', dispatch: vi.fn(async () => ({ ref: 'platform' })) };
  const draft: SeedDraft = {
    slug: 'retry-test',
    files: [{ path: 'game.ts', content: 'export {};' }],
    references: [],
    usage: { model: 'test', inputTokens: 1, outputTokens: 1 },
    elapsedMs: 1,
    compiles: false,
    repaired: false,
    typeChecked: false,
    typeErrors: 0,
  };
  const seed = vi.fn(async () => draft);
  const app = await buildApp({
    store,
    adminUids: 'operator',
    opsConsole: { verifier: opsTestVerifier },
    submissionRoutes: {
      submissionTokenSecret: 'secret',
      agentBackends: { self, platform },
      gameSeeder: { seed },
      managedAvailabilityGate: null,
    },
  });
  apps.push(app);
  const headers = opsHeaders('operator');
  const unauthorized = await app.inject({ method: 'POST', url: opsUrl(`/api/admin/jobs/${record.jobId}/retry`) });
  expect(unauthorized.statusCode).toBe(404);
  const response = await app.inject({ method: 'POST', url: opsUrl(`/api/admin/jobs/${record.jobId}/retry`), headers });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({ ok: true, state: 'dispatched', creditsSpent: 0 });
  expect(seed).toHaveBeenCalledTimes(1);
  expect(platform.dispatch).not.toHaveBeenCalled();
  expect(dispatch).toHaveBeenCalledTimes(1);
  expect((await store.getSubmission(record.jobId))?.seed?.files).toEqual(draft.files);
});
