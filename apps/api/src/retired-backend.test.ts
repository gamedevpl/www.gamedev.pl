import { describe, expect, it, vi } from 'vitest';
import { buildApp } from './platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './platform/auth.js';
import type { GitHubClient } from './catalog/github-client.js';
import { InMemoryStore } from './platform/store.js';
import { mintToken } from './platform/submission-token.js';
import type { AgentBackend, BuildBrief } from './agent-surface/agent-backend.js';

const secret = 'submission-secret';
const sessionSecret = 'dev-session-secret-change-me';
const headers = { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken('g:test-user', sessionSecret)}` };

function githubStub(): GitHubClient {
  return {
    createIssue: async () => ({ number: 90 }),
    getIssueState: async () => ({ state: 'open' as const }),
    findLinkedPR: async () => null,
    createIssueComment: async () => ({ id: 1 }),
    updateIssueBody: async () => {},
    closeIssue: async () => {},
    closePullRequest: async () => {},
    getGameSources: async () => null,
    getGameMedia: async () => null,
    getCatalog: async () => [],
    getProgressNotes: async () => null,
    getRefSha: async () => null,
  };
}

describe('retired builder backends', () => {
  // A pre-removal Copilot job belongs to no other vendor.
  it('never hands a retired Copilot session to another vendor', async () => {
    const briefs: BuildBrief[] = [];
    const cleanup = vi.fn(async () => {});
    const cancel = vi.fn(async () => ({ enforced: false }));
    const backend: AgentBackend = {
      name: 'stub',
      dispatch: async (brief) => (briefs.push(brief), { ref: 'task-1', workspace: 'stub/x' }),
      resume: async (brief) => (briefs.push(brief), { ref: 'task-2', workspace: 'stub/y' }),
      observe: async () => null,
      cancel,
      cleanup,
    };
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:test-user' });
    const app = await buildApp({
      store,
      sessionSecret,
      submissionRoutes: {
        githubToken: 'token',
        submissionTokenSecret: secret,
        githubClient: githubStub(),
        agentBackend: backend,
      },
    });

    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers,
      payload: { title: 'A game', concept: 'A sufficiently long concept about delivering parcels in space.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    await store.recordDispatch(job.jobId, {
      backend: 'managed:copilot',
      ref: 'copilot-task',
      workspace: 'copilot/old',
    });
    await store.setSubmissionDeliveredVersion(job.jobId, 'v1');
    await store.recordJobTransition(job.jobId, {
      to: 'ready_for_review',
      at: new Date().toISOString(),
      by: 'reconciler',
      reason: 'gate_green',
    });

    const feedback = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(job.jobId, secret)}/feedback`,
      headers,
      payload: { feedback: 'Make the parcels bigger and the asteroids slower.' },
    });

    expect(feedback.statusCode).toBe(200);
    expect(briefs.length).toBeGreaterThan(1);
    expect(cleanup).not.toHaveBeenCalledWith(expect.objectContaining({ workspace: 'copilot/old' }));
    expect(cancel).not.toHaveBeenCalledWith('copilot-task');

    await app.close();
  });
});
