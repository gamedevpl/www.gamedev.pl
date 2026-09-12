import Fastify from 'fastify';
import { expect, it, vi } from 'vitest';
import { InMemoryStore } from './platform/store.js';
import { registerSubmissionRoutes } from './submissions.js';

it('does not dispatch a stale improvement after recovery claims the archived game', async () => {
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
  const routes = await registerSubmissionRoutes(app, { store, submissionTokenSecret: 'test-secret' });
  const original = store.claimManualRoundSlug.bind(store);
  let recoveredJob = 0;
  const claim = vi.spyOn(store, 'claimManualRoundSlug').mockImplementationOnce(async (...args) => {
    recoveredJob = await store.allocateJobId();
    await store.createSubmission(recoveredJob, 'g:creator', 'Recovered');
    expect(
      await store.claimSubmissionSlug(recoveredJob, 'sky-dodge', 10, {
        key: 'recovery',
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
        builder: 'self',
        log: app.log,
      }),
    ).toBeNull();
    const lost = await store.getSubmission(claim.mock.calls[0]![0]);
    expect(lost?.state).toBe('abandoned');
    expect(lost?.dispatch).toBeUndefined();
    expect((await store.listQueuedSubmissions()).map((row) => row.jobId)).not.toContain(lost!.jobId);
    expect((await store.getSubmissionBySlug('sky-dodge'))?.jobId).toBe(recoveredJob);
  } finally {
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
