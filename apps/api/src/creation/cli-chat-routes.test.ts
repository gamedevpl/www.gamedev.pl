import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import type { GitHubClient } from '../catalog/github-client.js';
import { InMemoryStore, type Store } from '../platform/store.js';
import { enableCliSurface } from '../platform/oauth-cli-test-app.js';
import type { AgentBackend } from '../agent-surface/agent-backend.js';
import { StubIntakeAgent, type IntakeAgent, type IntakeAgentRequest } from './intake-agent.js';

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

  it('prepares a game without creating or dispatching until the builder is chosen', async () => {
    const {
      app,
      store,
      authHeaders: headers,
    } = await createApp({
      intakeAgent: new StubIntakeAgent({
        kind: 'create',
        title: 'Robot Garden',
        concept: 'A garden full of robots that water plants.',
      }),
    });
    const prepared = await chat(app, headers, { text: 'build my robot garden', prepareOnly: true });
    expect(prepared.statusCode).toBe(200);
    expect(prepared.json()).toMatchObject({ kind: 'proposal', title: 'Robot Garden' });
    expect(await store.listSubmissionsByOwner('g:test-user')).toEqual([]);
    const proposal = prepared.json();
    const created = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers,
      payload: { title: proposal.title, concept: proposal.concept, builder: 'self' },
    });
    expect(created.statusCode).toBe(200);
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    expect(job.builder).toBe('self');
    await app.close();
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

  it('returns the stored conversationId after create', async () => {
    const seen: Array<{ message: string; history: Array<{ role: string; text: string }> }> = [];
    const {
      app,
      store,
      authHeaders: headers,
    } = await createApp({
      intakeAgent: {
        async decide(request) {
          seen.push({ message: request.message, history: request.history });
          if (request.message.includes('robot')) {
            return {
              kind: 'create',
              title: 'Robot Garden',
              concept: 'A garden full of robots that water the plants and fight weeds.',
            };
          }
          return { kind: 'reply', text: `got ${request.message}` };
        },
      },
    });
    const first = await chat(app, headers, { text: 'hej' });
    const beforeCreate = first.json().conversationId as string;
    const created = await chat(app, headers, { text: 'zrób grę o robotach w ogrodzie', conversationId: beforeCreate });
    expect(created.statusCode).toBe(200);
    const body = created.json() as { kind: string; conversationId: string };
    expect(body.kind).toBe('create');
    const saved = await store.getCliChat('g:test-user');
    expect(body.conversationId).toBe(saved?.conversationId);
    expect(body.conversationId).not.toBe(beforeCreate);
    expect(saved?.turns).toEqual([]);
    const follow = await chat(app, headers, { text: 'jeszcze jedno', conversationId: body.conversationId });
    expect(follow.statusCode).toBe(200);
    expect(follow.json().conversationId).toBe(body.conversationId);
    expect(seen.at(-1)?.history).toEqual([]);
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

// The route hands the agent the real shelf, never a guess.
describe('the shelf the CLI chat hands the agent', () => {
  let restore: (() => void) | undefined;

  beforeEach(() => {
    restore = enableCliSurface();
  });

  afterEach(() => {
    restore?.();
    restore = undefined;
  });

  function capturingAgent() {
    const seen: IntakeAgentRequest[] = [];
    const agent: IntakeAgent = {
      async decide(request) {
        seen.push(request);
        return { kind: 'reply', text: 'ok' };
      },
    };
    return { agent, seen };
  }

  it('passes the creator own games, newest job per slug', async () => {
    const store = new InMemoryStore();
    const { agent, seen } = capturingAgent();
    const { app, authHeaders: headers } = await createApp({ store, intakeAgent: agent });
    await store.createSubmission(1, 'g:test-user', 'Wojna robakow');
    await store.setSubmissionSlug(1, 'wojna-robakow');
    await store.setSubmissionPublishedAt(1, '2026-09-01T00:00:00.000Z');
    await store.createSubmission(2, 'g:test-user', 'TV Tycoon');
    await store.setSubmissionSlug(2, 'tv-tycoon');

    const res = await chat(app, headers, { text: 'what are my games?' });
    expect(res.statusCode).toBe(200);
    const games = (seen[0]?.games ?? []).map((game) => game.slug).sort();
    expect(games).toEqual(['tv-tycoon', 'wojna-robakow']);
    expect(seen[0]?.games?.find((game) => game.slug === 'wojna-robakow')?.state).toBe('published');
    await app.close();
  });

  it('sends an empty list for a creator with no games, not a missing one', async () => {
    const { agent, seen } = capturingAgent();
    const { app, authHeaders: headers } = await createApp({ intakeAgent: agent });
    const res = await chat(app, headers, { text: 'what are my games?' });
    expect(res.statusCode).toBe(200);
    expect(seen[0]?.games).toEqual([]);
    await app.close();
  });

  it('omits the games rather than claiming none when the shelf cannot be read', async () => {
    const store = new InMemoryStore();
    store.listSubmissionsByOwner = async () => {
      throw new Error('firestore is down');
    };
    const { agent, seen } = capturingAgent();
    const { app, authHeaders: headers } = await createApp({ store, intakeAgent: agent });
    const res = await chat(app, headers, { text: 'what are my games?' });
    expect(res.statusCode).toBe(200);
    expect(seen[0]?.games).toBeUndefined();
    await app.close();
  });
});
