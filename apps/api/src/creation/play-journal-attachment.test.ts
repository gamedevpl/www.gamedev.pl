import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { registerFeedbackRoutes, type FeedbackRoutesOptions } from './feedback-routes.js';
import { registerImproveRoutes } from './improve-routes.js';
import { InMemoryStore } from '../platform/store.js';
import { mintToken } from '../platform/submission-token.js';
import { decodePlayJournal } from '../platform/play-journal.js';
import type { GitHubClient } from '../catalog/github-client.js';

it.each([
  ['feedback', 'platform'],
  ['improve', 'platform'],
  ['feedback', 'self'],
  ['improve', 'self'],
] as const)('scopes explicit journal dispatch for %s with %s builder', async (mode, builder) => {
  const store = new InMemoryStore();
  await store.upsertUser({ uid: 'g:creator' });
  await store.createSubmission(12, 'g:creator', 'Test');
  await store.setSubmissionSlug(12, 'test');
  if (mode === 'improve') await store.setSubmissionPublishedAt(12, new Date().toISOString());
  const app = Fastify();
  app.decorateRequest('user', null);
  app.decorateRequest('clientIp', '127.0.0.1');
  app.addHook('onRequest', async (request) => {
    request.user = (await store.getUser('g:creator'))!;
  });
  let dispatchedText = '',
    dispatchedJob = 0;
  const checkDispatch = async (jobId: number, text: string) => {
    dispatchedText = text;
    dispatchedJob = jobId;
    const id = /playJournalAttachmentId: ([\w-]+)/.exec(text)?.[1];
    expect(id).toBeTruthy();
    const saved = await store.getPlayJournal(jobId, id!);
    expect(saved).not.toBeNull();
    expect(decodePlayJournal(saved!).version).toBe('played-v1');
  };
  const common: FeedbackRoutesOptions = {
    store,
    githubClient: {} as GitHubClient,
    submissionTokenSecret: 'test-secret',
    contentChecker: { checkFields: async () => ({ allowed: true }) },
    now: Date.now,
    dailyFeedbackQuota: 20,
    maxFeedbackPerWindow: 20,
    feedbackRateLimitWindowMs: 60000,
    feedbackByIp: new Map(),
    checkUserAccess: () => true,
    builderOf: () => builder,
    invalidateStatusCache: () => {},
    invalidateMedia: () => {},
    runChatAgent: vi.fn(async () => null),
    resumeBuild: async ({ jobId, feedback }) => {
      await checkDispatch(jobId, feedback);
      return { started: true };
    },
  };
  if (mode === 'feedback') registerFeedbackRoutes(app, common);
  else
    registerImproveRoutes(app, {
      ...common,
      managedAvailabilityGate: null,
      dailyImprovementQuota: 20,
      maxImprovementsPerWindow: 20,
      improvementRateLimitWindowMs: 60000,
      startImprovementRound: async (input) => {
        await store.createSubmission(13, 'g:creator', 'New task');
        expect(await input.beforeDispatch?.(13)).toBe(true);
        await checkDispatch(13, input.text);
        return { route: 'job', jobId: 13 };
      },
    });
  try {
    const response = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(12, 'test-secret')}/${mode}`,
      payload: {
        feedback: 'Investigate this recorded problem',
        context: {
          playJournal: {
            recordingId: randomUUID(),
            version: 'played-v1',
            startedAt: Date.now(),
            droppedEntries: 0,
            entries: [{ seq: 1, timeMs: 0, frame: 1, kind: 'state', data: { privateGameValue: 'not-for-the-prompt' } }],
          },
        },
      },
    });
    if (builder === 'self') {
      expect(response.statusCode, response.body).toBe(400);
      expect(dispatchedJob).toBe(0);
      return;
    }
    expect(response.statusCode, response.body).toBe(200);
    expect(dispatchedJob).toBe(mode === 'feedback' ? 12 : 13);
    expect(dispatchedText).not.toContain('not-for-the-prompt');
    expect(common.runChatAgent).not.toHaveBeenCalled();
  } finally {
    await app.close();
  }
});
