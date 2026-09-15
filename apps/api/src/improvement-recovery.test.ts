import Fastify from 'fastify';
import { expect, it, vi } from 'vitest';
import { InMemoryStore } from './platform/store.js';
import { registerSubmissionRoutes } from './submissions.js';

it('does not charge or dispatch an improvement whose expired admission was replaced by recovery', async () => {
  const store = new InMemoryStore();
  await store.createSubmission(10, 'g:creator', 'Sky Dodge');
  await store.setSubmissionSlug(10, 'sky-dodge');
  await store.recordJobTransition(10, { to: 'published', at: new Date().toISOString(), by: 'operator' });
  await store.setPublication({
    slug: 'sky-dodge',
    state: 'archived',
    currentVersion: 'old',
    publishedAt: '2026-08-01T00:00:00.000Z',
    takedownReason: 'deleted by creator',
  });
  const app = Fastify();
  const quota = vi.fn(async () => true);
  const managedSpend = vi.fn(async () => ({ available: true as const }));
  const routes = await registerSubmissionRoutes(app, {
    store,
    submissionTokenSecret: 'test-secret',
    managedAvailabilityGate: { peek: managedSpend, checkAndSpend: managedSpend, resolveVendor: async () => undefined },
  });
  const original = store.claimManualRoundSlug.bind(store);
  const time = vi.spyOn(Date, 'now');
  let recoveredJob = 0;
  const claim = vi.spyOn(store, 'claimManualRoundSlug').mockImplementationOnce(async (...args) => {
    time.mockReturnValue(Date.now() + 16 * 60_000);
    expect(await store.beginCheckoutRecovery('sky-dodge', 'replacement', Date.now())).toBe(true);
    recoveredJob = await store.allocateJobId();
    await store.createSubmission(recoveredJob, 'g:creator', 'Recovered');
    expect(
      await store.claimSubmissionSlug(recoveredJob, 'sky-dodge', 10, {
        key: 'recovery',
        admissionNonce: 'replacement',
        spec: 'Local sources',
        locale: 'en',
      }),
    ).toBe(true);
    return original(...args);
  });
  try {
    expect(
      await routes.startImprovementRound({
        jobId: 10,
        text: 'Improve the sky',
        locale: 'en',
        builder: 'platform',
        beforeDispatch: quota,
        log: app.log,
      }),
    ).toBeNull();
    const lost = await store.getSubmission(claim.mock.calls[0]![0]);
    expect(lost?.state).toBe('abandoned');
    expect(lost?.dispatch).toBeUndefined();
    expect(quota).not.toHaveBeenCalled();
    expect(managedSpend).not.toHaveBeenCalled();
    expect((await store.listQueuedSubmissions()).map((row) => row.jobId)).not.toContain(lost!.jobId);
    expect((await store.getSubmissionBySlug('sky-dodge'))?.jobId).toBe(recoveredJob);
    expect(await store.beginCheckoutRecovery('sky-dodge', 'other', Date.now())).toBe(false);
  } finally {
    time.mockRestore();
    await app.close();
  }
});

it('opens an improvement from a published base after its newer round was canceled', async () => {
  const store = new InMemoryStore();
  await store.createSubmission(10, 'g:creator', 'Sky Dodge');
  await store.setSubmissionSlug(10, 'sky-dodge');
  await store.recordJobTransition(10, { to: 'published', at: new Date().toISOString(), by: 'operator' });
  await store.createSubmission(11, 'g:creator', 'Sky Dodge');
  await store.setSubmissionSlug(11, 'sky-dodge');
  await store.recordJobTransition(11, { to: 'canceled', at: new Date().toISOString(), by: 'operator' });
  await store.setSubmissionAbandoned(11, new Date().toISOString());
  const app = Fastify();
  const routes = await registerSubmissionRoutes(app, { store, submissionTokenSecret: 'test-secret' });
  try {
    const result = await routes.startImprovementRound({
      jobId: 10,
      text: 'Improve the sky',
      locale: 'en',
      builder: 'self',
      log: app.log,
    });
    expect(result?.route).toBe('job');
    if (result?.route !== 'job') throw new Error('round missing');
    expect((await store.getSubmissionBySlug('sky-dodge'))?.jobId).toBe(result.jobId);
    expect((await store.getSubmission(result.jobId))?.dispatch?.backend).toBe('self');
  } finally {
    await app.close();
  }
});

it('refuses to open a round once canonical ownership moved to someone else', async () => {
  const at = '2026-01-01T00:00:00.000Z';
  const store = new InMemoryStore();
  await store.upsertUser({ uid: 'g:ada' });
  await store.upsertUser({ uid: 'g:grace' });
  await store.ensureGameAccess('sky-dodge', 'g:ada', at, at);
  await store.createSubmission(10, 'g:ada', 'Sky Dodge');
  await store.setSubmissionSlug(10, 'sky-dodge');
  await store.recordJobTransition(10, { to: 'published', at, by: 'operator' });

  // A transfer accepted between the route's ownership check and this call.
  await store.recordSettledOwner('sky-dodge', 'g:grace', 999, at, at);

  const app = Fastify();
  const routes = await registerSubmissionRoutes(app, { store, submissionTokenSecret: 'test-secret' });
  try {
    await expect(
      routes.startImprovementRound({
        jobId: 10,
        text: 'Improve the sky',
        locale: 'en',
        builder: 'self',
        // The caller's now-stale uid, as improve-routes.ts passes it.
        ownerUid: 'g:ada',
        log: app.log,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(await store.getSubmissionBySlug('sky-dodge')).toMatchObject({ jobId: 10 });
  } finally {
    await app.close();
  }
});
