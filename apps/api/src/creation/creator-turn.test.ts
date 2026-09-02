import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import type { GitHubClient } from '../catalog/github-client.js';
import { InMemoryStore, type Store } from '../platform/store.js';
import { mintToken } from '../platform/submission-token.js';
import type { AgentBackend, BuildBrief } from '../agent-surface/agent-backend.js';
import { enableCliSurface } from '../platform/oauth-cli-test-app.js';
import type { StudioChatAgent } from './chat-agent.js';

const secret = 'submission-secret';
const sessionSecret = 'dev-session-secret-change-me';
const repo = 'gamedevpl/www.gamedev.pl-games';

function authHeaders(uid = 'g:test-user') {
  return { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}` };
}

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

function backendStub(resume?: AgentBackend['resume']) {
  const briefs: BuildBrief[] = [];
  const backend: AgentBackend = {
    name: 'stub',
    dispatch: async (brief) => {
      briefs.push(brief);
      return { ref: 'task-1', workspace: 'copilot/x' };
    },
    resume:
      resume ??
      (async (brief) => {
        briefs.push(brief);
        return { ref: 'task-2', workspace: 'copilot/y' };
      }),
    observe: async () => null,
    cancel: async () => ({ enforced: false }),
  };
  return { backend, briefs };
}

async function createApp(params: { chatAgent: StudioChatAgent; store?: Store; resume?: AgentBackend['resume'] }) {
  const store = params.store ?? new InMemoryStore();
  await store.upsertUser({ uid: 'g:test-user' });
  const { backend, briefs } = backendStub(params.resume);
  const app = await buildApp({
    store,
    sessionSecret,
    submissionRoutes: {
      githubToken: 'token',
      submissionTokenSecret: secret,
      gamesRepo: repo,
      githubClient: githubStub(),
      agentBackend: backend,
      chatAgent: params.chatAgent,
    },
  });
  return { app, store, briefs, authHeaders: authHeaders() };
}

async function openDraft(
  app: FastifyInstance,
  store: Store,
  headers: Record<string, string>,
): Promise<{ jobId: number; token: string }> {
  const created = await app.inject({
    method: 'POST',
    url: '/api/submissions',
    headers,
    payload: { title: 'A game', concept: 'A sufficiently long concept about a garden full of robots.' },
  });
  expect(created.statusCode).toBe(200);
  const [job] = await store.listSubmissionsByOwner('g:test-user');
  return { jobId: job.jobId, token: mintToken(job.jobId, secret) };
}

describe('POST /api/submissions/:token/turn (CL-10, CL-11)', () => {
  let restore: (() => void) | undefined;

  beforeEach(() => {
    restore = enableCliSurface();
  });

  afterEach(() => {
    restore?.();
    restore = undefined;
    vi.restoreAllMocks();
  });

  it('returns a reply and does not dispatch a round for a status question', async () => {
    const decide = vi.fn(async () => ({ kind: 'reply' as const, text: 'Still building — nothing has shipped yet.' }));
    const { app, store, briefs, authHeaders: headers } = await createApp({ chatAgent: { decide } });
    const { jobId, token } = await openDraft(app, store, headers);
    const dispatchesBefore = briefs.length;
    const generationBefore = (await store.getSubmission(jobId))?.roundGeneration ?? 0;

    const res = await app.inject({
      method: 'POST',
      url: `/api/submissions/${token}/turn`,
      headers,
      payload: { text: 'is it done yet?' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ kind: 'reply', text: 'Still building — nothing has shipped yet.' });
    expect(briefs.length).toBe(dispatchesBefore);
    expect((await store.getSubmission(jobId))?.roundGeneration ?? 0).toBe(generationBefore);

    const history = await app.inject({
      method: 'GET',
      url: `/api/submissions/${token}/turns`,
      headers,
    });
    expect(history.statusCode).toBe(200);
    expect(history.json()).toEqual({
      turns: [{ message: 'is it done yet?', reply: 'Still building — nothing has shipped yet.' }],
    });
    await app.close();
  });

  it('returns a build with roundId when the mini agent dispatches', async () => {
    const decide = vi.fn(async () => ({ kind: 'build' as const, text: 'On it.' }));
    const { app, store, authHeaders: headers } = await createApp({ chatAgent: { decide } });
    const { jobId, token } = await openDraft(app, store, headers);

    const res = await app.inject({
      method: 'POST',
      url: `/api/submissions/${token}/turn`,
      headers,
      payload: { text: 'make the robots blue' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ kind: 'build', roundId: jobId, ack: 'On it.' });
    const queued = await store.listCreatorMessages(jobId);
    expect(queued.some((m) => m.text === 'make the robots blue')).toBe(true);
    await app.close();
  });

  it('accepts a one-character status question that feedback would reject', async () => {
    const decide = vi.fn(async () => ({ kind: 'reply' as const, text: '?' }));
    const { app, store, authHeaders: headers } = await createApp({ chatAgent: { decide } });
    const { token } = await openDraft(app, store, headers);
    const res = await app.inject({
      method: 'POST',
      url: `/api/submissions/${token}/turn`,
      headers,
      payload: { text: '?' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().kind).toBe('reply');
    await app.close();
  });

  it('returns a reply when resume cannot start a round', async () => {
    const decide = vi.fn(async () => ({ kind: 'build' as const, text: 'On it.' }));
    const resume = vi.fn(async () => {
      throw Object.assign(new Error('agent tasks POST 412: insufficient premium quota to create assignment'), {
        name: 'AgentTasksError',
        status: 412,
      });
    });
    const { app, store, authHeaders: headers } = await createApp({ chatAgent: { decide }, resume });
    const { jobId, token } = await openDraft(app, store, headers);
    await store.recordJobTransition(jobId, {
      to: 'failed',
      at: new Date().toISOString(),
      by: 'reconciler',
      reason: 'task_failed',
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/submissions/${token}/turn`,
      headers,
      payload: { text: 'make the robots blue' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().kind).toBe('reply');
    expect(res.json().text).toMatch(/out of capacity/i);
    expect(res.json()).not.toHaveProperty('roundId');
    const messages = await store.listCreatorMessages(jobId);
    expect(messages.some((message) => message.origin === 'studio_ack')).toBe(false);
    await app.close();
  });

  it('404s turn and turns when CLI_SURFACE is off', async () => {
    restore?.();
    restore = undefined;
    delete process.env.CLI_SURFACE;
    const {
      app,
      store,
      authHeaders: headers,
    } = await createApp({
      chatAgent: { decide: async () => ({ kind: 'reply', text: 'no' }) },
    });
    const { token } = await openDraft(app, store, headers);
    const turn = await app.inject({
      method: 'POST',
      url: `/api/submissions/${token}/turn`,
      headers,
      payload: { text: 'is it done yet?' },
    });
    const turns = await app.inject({
      method: 'GET',
      url: `/api/submissions/${token}/turns`,
      headers,
    });
    expect(turn.statusCode).toBe(404);
    expect(turns.statusCode).toBe(404);
    for (let i = 0; i < 10; i += 1) {
      const extra = await app.inject({
        method: 'POST',
        url: `/api/submissions/${token}/turn`,
        headers,
        payload: { text: 'is it done yet?' },
      });
      expect(extra.statusCode).toBe(404);
    }
    await app.close();
  });

  it('returns text is required when turn text is omitted', async () => {
    const {
      app,
      store,
      authHeaders: headers,
    } = await createApp({
      chatAgent: { decide: async () => ({ kind: 'reply', text: 'no' }) },
    });
    const { token } = await openDraft(app, store, headers);
    const res = await app.inject({
      method: 'POST',
      url: `/api/submissions/${token}/turn`,
      headers,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'text is required' });
    await app.close();
  });
});
