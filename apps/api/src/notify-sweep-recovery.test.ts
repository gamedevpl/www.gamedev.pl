import { expect, it } from 'vitest';
import { buildApp } from './platform/app.js';
import { InMemoryStore } from './platform/store.js';
import type { GitHubClient } from './catalog/github-client.js';

it('keeps local recovery drafts past both abandonment windows while ordinary jobs still expire', async () => {
  const store = new InMemoryStore();
  for (const jobId of [1, 2, 3, 4]) {
    await store.createSubmission(jobId, 'owner', `Game ${jobId}`);
    if (jobId !== 2) {
      await store.claimSubmissionSlug(jobId, `recovered-${jobId}`, null, {
        key: `key-${jobId}`,
        spec: 'Local game sources',
        locale: 'en',
      });
    } else {
      await store.setSubmissionSlug(jobId, 'ordinary');
      await store.setRoundBuilder(jobId, 'self', { resetRoundBudget: false });
      await store.recordJobTransition(jobId, { to: 'queued', at: new Date().toISOString(), by: 'creator' });
    }
  }
  await store.touchLastAgentSignalAt(4);
  await store.setRoundBuilder(3, 'platform', { resetRoundBudget: false });
  const githubClient: GitHubClient = {
    getIssueState: async () => ({ state: 'open' }),
    findLinkedPR: async () => null,
    getGameSources: async () => null,
    getGameMedia: async () => null,
    getCatalog: async () => [],
  };
  const app = await buildApp({
    store,
    submissionRoutes: {
      githubToken: 'test',
      githubClient,
      submissionTokenSecret: 'test-secret',
      internalAuthVerifier: { verify: async () => true },
      now: () => Date.now() + 90 * 24 * 60 * 60_000,
    },
  });
  try {
    const response = await app.inject({ method: 'POST', url: '/api/internal/notify-sweep' });
    expect(response.statusCode).toBe(200);
    expect((await store.getSubmission(1))?.abandonedAt).toBeUndefined();
    expect((await store.getSubmission(1))?.state).toBe('queued');
    expect((await store.getSubmission(2))?.state).toBe('abandoned');
    expect((await store.getSubmission(3))?.state).toBe('abandoned');
    expect((await store.getSubmission(4))?.state).toBe('abandoned');
  } finally {
    await app.close();
  }
});
