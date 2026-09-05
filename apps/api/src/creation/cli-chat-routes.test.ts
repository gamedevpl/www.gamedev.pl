import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import type { GitHubClient } from '../catalog/github-client.js';
import { InMemoryStore, type Store } from '../platform/store.js';
import { enableCliSurface } from '../platform/oauth-cli-test-app.js';
import type { AgentBackend } from '../agent-surface/agent-backend.js';
import { StubIntakeAgent, type IntakeAgent } from './intake-agent.js';

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
    getGameSources: async () => null,
    getGameMedia: async () => null,
    getCatalog: async () => [],
    getProgressNotes: async () => null,
    getRefSha: async () => null,
  } as unknown as GitHubClient;
}

function backendStub() {
  const briefs: unknown[] = [];
  const backend: AgentBackend = {
    name: 'stub',
    dispatch: async (brief) => {
      briefs.push(brief);
      return { ref: 'task-1', workspace: 'copilot/x' };
    },
    resume: async () => ({ ref: 'task-2', workspace: 'copilot/y' }),
    observe: async () => null,
    cancel: async () => ({ enforced: false }),
  };
  return { backend, briefs };
}

async function createApp(params: {
  intakeAgent: IntakeAgent;
  store?: Store;
  contentChecker?: {
    check: () => Promise<{ allowed: boolean }>;
    checkFields: () => Promise<{ allowed: boolean; category?: string }>;
  };
}) {
  const store = params.store ?? new InMemoryStore();
  await store.upsertUser({ uid: 'g:test-user' });
  const { backend } = backendStub();
  const app = await buildApp({
    store,
    sessionSecret,
    ...(params.contentChecker ? { contentChecker: params.contentChecker } : {}),
    submissionRoutes: {
      githubToken: 'token',
      submissionTokenSecret: secret,
      gamesRepo: repo,
      githubClient: githubStub(),
      agentBackend: backend,
      intakeAgent: params.intakeAgent,
    },
  });
  return { app, store, authHeaders: authHeaders() };
}

async function chat(app: FastifyInstance, headers: Record<string, string>, payload: object) {
  return app.inject({ method: 'POST', url: '/api/cli/chat', headers, payload });
}

describe('POST /api/cli/chat', () => {
  let restore: (() => void) | undefined;

  beforeEach(() => {
    restore = enableCliSurface();
  });

  afterEach(() => {
    restore?.();
    restore = undefined;
    vi.restoreAllMocks();
  });

  it('404s when CLI_SURFACE is off', async () => {
    restore?.();
    restore = undefined;
    delete process.env.CLI_SURFACE;
    const { app, authHeaders: headers } = await createApp({
      intakeAgent: new StubIntakeAgent({ kind: 'reply', text: 'hi' }),
    });
    const res = await chat(app, headers, { text: 'hej' });
    expect(res.statusCode).toBe(404);
  });

  it('replies to a greeting and does not create a game', async () => {
    const {
      app,
      store,
      authHeaders: headers,
    } = await createApp({
      intakeAgent: new StubIntakeAgent({ kind: 'reply', text: 'Cześć! Jaki game chcesz zrobić?' }),
    });
    const res = await chat(app, headers, { text: 'hej' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ kind: 'reply', text: 'Cześć! Jaki game chcesz zrobić?' });
    expect(await store.listSubmissionsByOwner('g:test-user')).toEqual([]);
    const saved = await store.getCliChat('g:test-user');
    expect(saved?.turns).toEqual([
      { role: 'user', text: 'hej' },
      { role: 'assistant', text: 'Cześć! Jaki game chcesz zrobić?' },
    ]);
  });

  it('replays stored history on the next turn', async () => {
    const seen: Array<{ message: string; history: Array<{ role: string; text: string }> }> = [];
    const { app, authHeaders: headers } = await createApp({
      intakeAgent: {
        async decide(request) {
          seen.push({ message: request.message, history: request.history });
          return { kind: 'reply', text: `got ${request.message}` };
        },
      },
    });
    const first = await chat(app, headers, { text: 'hej' });
    const conversationId = first.json().conversationId as string;
    await chat(app, headers, { text: 'zrób platformówkę', conversationId });
    expect(seen[1]?.history).toEqual([
      { role: 'user', text: 'hej' },
      { role: 'assistant', text: 'got hej' },
    ]);
  });

  it('creates a game only when the agent calls create_game', async () => {
    const {
      app,
      store,
      authHeaders: headers,
    } = await createApp({
      intakeAgent: new StubIntakeAgent({
        kind: 'create',
        title: 'Robot Garden',
        concept: 'A garden full of robots that water the plants and fight weeds.',
        ack: 'Opening it.',
      }),
    });
    const res = await chat(app, headers, { text: 'zrób grę o robotach w ogrodzie' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { kind: string; slug: string; token: string; ack?: string };
    expect(body.kind).toBe('create');
    expect(body.slug).toBeTruthy();
    expect(body.token).toBeTruthy();
    expect(body.ack).toBe('Opening it.');
    const owned = await store.listSubmissionsByOwner('g:test-user');
    expect(owned).toHaveLength(1);
    expect(owned[0]?.title).toBe('Robot Garden');
  });

  it('moderates before calling the model', async () => {
    const decide = vi.fn(async () => ({ kind: 'reply' as const, text: 'nope' }));
    const { app, authHeaders: headers } = await createApp({
      intakeAgent: { decide },
      contentChecker: {
        check: async () => ({ allowed: false, category: 'hate' }),
        checkFields: async () => ({ allowed: false, category: 'hate' }),
      },
    });
    const res = await chat(app, headers, { text: 'hej' });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({ error: 'content_rejected', category: 'hate' });
    expect(decide).not.toHaveBeenCalled();
  });

  it('fails closed to a reply when the model throws', async () => {
    const {
      app,
      store,
      authHeaders: headers,
    } = await createApp({
      intakeAgent: {
        async decide() {
          throw new Error('timeout');
        },
      },
    });
    const res = await chat(app, headers, { text: 'zrób grę o kotach w kosmosie proszę bardzo' });
    expect(res.statusCode).toBe(200);
    expect(res.json().kind).toBe('reply');
    expect(await store.listSubmissionsByOwner('g:test-user')).toEqual([]);
  });

  it('erases CLI chat history with the account', async () => {
    const store = new InMemoryStore();
    const { app, authHeaders: headers } = await createApp({
      store,
      intakeAgent: new StubIntakeAgent({ kind: 'reply', text: 'ok' }),
    });
    await chat(app, headers, { text: 'hej' });
    expect(await store.getCliChat('g:test-user')).not.toBeNull();
    await store.deleteAccountIdentity('g:test-user', '2026-09-05T00:00:00Z');
    expect(await store.getCliChat('g:test-user')).toBeNull();
  });
});
