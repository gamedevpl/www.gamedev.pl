import Fastify from 'fastify';
import { expect, it, vi } from 'vitest';
import { registerSubmissionRoutes } from './submissions.js';
import { InMemoryStore } from './platform/store.js';
import { mintToken } from './platform/submission-token.js';
import type { GitHubClient } from './catalog/github-client.js';

it.each(['active', 'concurrent'])('refuses an %s improvement before spending daily or managed quota', async (mode) => {
  const store = new InMemoryStore();
  await store.createSubmission(10, 'g:creator', 'Sky');
  await store.setSubmissionSlug(10, 'sky');
  await store.setSubmissionPublishedAt(10, new Date().toISOString());
  await store.recordJobTransition(10, { to: 'published', at: new Date().toISOString(), by: 'operator' });
  const app = Fastify();
  app.addHook('preHandler', async (req) => {
    req.user = { uid: 'g:creator' } as typeof req.user;
  });
  const managedSpend = vi.fn(async () => ({ available: true as const }));
  await registerSubmissionRoutes(app, {
    store,
    githubClient: {} as GitHubClient,
    githubToken: 'test-token',
    submissionTokenSecret: 'test-secret',
    contentChecker: { check: async () => ({ allowed: true }), checkFields: async () => ({ allowed: true }) },
    managedAvailabilityGate: {
      peek: async () => ({ available: true }),
      checkAndSpend: managedSpend,
      resolveVendor: async () => undefined,
    },
  });
  const quotaOriginal = store.checkAndIncrementQuota.bind(store);
  let release!: () => void;
  let entered!: () => void;
  const waiting = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const quota = vi.spyOn(store, 'checkAndIncrementQuota').mockImplementation(async (...args) => {
    if (args[3] === 'improvements' && mode === 'concurrent') {
      entered();
      await held;
    }
    return quotaOriginal(...args);
  });
  const request = (builder: 'self' | 'platform') =>
    app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(10, 'test-secret')}/improve`,
      payload: { feedback: 'Make the sky clearer.', builder },
    });
  try {
    const first = request('self').then((r) => r);
    if (mode === 'concurrent') await waiting;
    else expect((await first).statusCode).toBe(200);
    expect((await request('platform')).statusCode).toBe(409);
    release();
    expect((await first).statusCode).toBe(200);
    expect(quota.mock.calls.filter((args) => args[3] === 'improvements')).toHaveLength(1);
    expect(managedSpend).not.toHaveBeenCalled();
    expect(await store.listSubmissionsBySlug('sky')).toHaveLength(2);
  } finally {
    release();
    await app.close();
  }
});

it('releases admission and abandons a claimed draft when quota storage fails', async () => {
  const store = new InMemoryStore();
  await store.createSubmission(10, 'g:creator', 'Sky');
  await store.setSubmissionSlug(10, 'sky');
  await store.recordJobTransition(10, { to: 'published', at: new Date().toISOString(), by: 'operator' });
  const app = Fastify();
  const routes = await registerSubmissionRoutes(app, { store, submissionTokenSecret: 'test-secret' });
  try {
    await expect(
      routes.startImprovementRound({
        jobId: 10,
        title: 'Sky',
        text: 'Clearer sky',
        locale: 'en',
        builder: 'self',
        log: app.log,
        beforeDispatch: async () => {
          throw new Error('quota unavailable');
        },
      }),
    ).rejects.toThrow('quota unavailable');
    const failed = (await store.listSubmissionsBySlug('sky'))[0]!;
    expect(failed.state).toBe('abandoned');
    expect(failed.dispatch).toBeUndefined();
    expect((await store.listQueuedSubmissions()).map((record) => record.jobId)).not.toContain(failed.jobId);
    expect(await store.beginCheckoutRecovery('sky', 'next', Date.now())).toBe(true);
  } finally {
    await app.close();
  }
});
