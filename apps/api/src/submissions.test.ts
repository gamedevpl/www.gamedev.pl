import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertAgentTokenActive, mintAgentToken, verifyAgentToken } from './agent-surface/agent-token.js';
import { buildApp } from './platform/app.js';
import type { GameSeeder, SeedDraft } from './creation/game-seed.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './platform/auth.js';
import type { CatalogGameEntry, GameSources, GitHubClient, LinkedPullRequest } from './catalog/github-client.js';
import type { ContentChecker } from './platform/moderation.js';
import { InMemoryStore, type Store } from './platform/store.js';
import { mintToken, verifyToken } from './platform/submission-token.js';
import { canTransition } from './creation/job-state.js';
import type { AgentBackend, BuildBrief } from './agent-surface/agent-backend.js';
import type { GamesStore } from './delivery/games-store.js';
import { DELIVERY_GATE_VERDICT_MSG } from './platform/delivery-metrics.js';
import { JOB_ID_FLOOR } from './platform/store.js';
import { createManagedAvailabilityGate, type ManagedAvailabilityGate } from './agent-surface/managed-availability.js';
import { StubStudioChatAgent, type ChatAgentRequest, type StudioChatAgent } from './creation/chat-agent.js';
import type { ChatGate } from './creation/creation-limits.js';
import type { InternalAuthVerifier } from './platform/internal-auth.js';

const secret = 'submission-secret';
const repo = 'gamedevpl/www.gamedev.pl-games';
const sessionSecret = 'dev-session-secret-change-me';

function getAuthHeaders(uid = 'g:test-user') {
  const token = mintSessionToken(uid, sessionSecret);
  return { cookie: `${SESSION_COOKIE_NAME}=${token}` };
}

function catalogEntry(slug: string, overrides: Partial<CatalogGameEntry> = {}): CatalogGameEntry {
  return {
    slug,
    title: slug,
    genre: 'arcade',
    controls: 'arrows',
    status: 'published',
    media: null,
    multiplayer: null,
    orientation: 'any',
    submittedBy: null,
    ...overrides,
  };
}

function createGithubClientStub(params: {
  issueState?: 'open' | 'closed';
  linkedPr?: LinkedPullRequest | null;
  jobId?: number;
  gameSources?: GameSources | null;
  gameMedia?: Uint8Array | null;
  catalog?: CatalogGameEntry[];
  progressNotes?: string | null;
}) {
  const createIssue = vi.fn(async () => ({ number: params.jobId ?? 123 }));
  const getIssueState = vi.fn(async () => ({ state: params.issueState ?? 'open' }));
  const findLinkedPR = vi.fn(async () => params.linkedPr ?? null);
  const getGameSources = vi.fn(async () => params.gameSources ?? null);
  const getGameMedia = vi.fn(async () => params.gameMedia ?? null);
  const getCatalog = vi.fn(async () => params.catalog ?? []);
  const createIssueComment = vi.fn(async () => ({ id: 1 }));
  const updateIssueBody = vi.fn(async () => {});
  const closeIssue = vi.fn(async () => {});
  const closePullRequest = vi.fn(async () => {});
  const getProgressNotes = vi.fn(async () => params.progressNotes ?? null);
  const githubClient: GitHubClient = {
    createIssue,
    getIssueState,
    findLinkedPR,
    createIssueComment,
    updateIssueBody,
    closeIssue,
    closePullRequest,
    getGameSources,
    getGameMedia,
    getCatalog,
    getProgressNotes,
    getRefSha: async () => null,
  };
  return {
    githubClient,
    createIssue,
    getIssueState,
    findLinkedPR,
    createIssueComment,
    updateIssueBody,
    closeIssue,
    closePullRequest,
    getGameSources,
    getGameMedia,
    getCatalog,
    getProgressNotes,
  };
}

/** Captures the brief a dispatch would carry, without talking to any agent. */
function createBackendStub() {
  const briefs: BuildBrief[] = [];
  const backend: AgentBackend = {
    name: 'stub',
    dispatch: async (brief) => {
      briefs.push(brief);
      return { ref: 'task-1', workspace: 'copilot/x' };
    },
    resume: async (brief) => {
      briefs.push(brief);
      // A different branch than dispatch's, because a revision round is a fresh
      // workspace now: the game comes back from the store, not from the old branch.
      return { ref: 'task-2', workspace: 'copilot/y' };
    },
    observe: async () => null,
    cancel: async () => ({ enforced: false }),
  };
  return { backend, briefs };
}

async function createApp(params: {
  githubClient?: GitHubClient;
  now?: () => number;
  submissionTokenSecret?: string;
  store?: Store;
  dailySubmissionQuota?: number;
  dailyFeedbackQuota?: number;
  dailyImprovementQuota?: number;
  globalDailySubmissionCap?: number;
  creationLimitsTtlMs?: number;
  contentChecker?: ContentChecker;
  maxCachedDraftPreviews?: number;
  agentBackend?: AgentBackend;
  agentBackends?: { self?: AgentBackend; platform?: AgentBackend };
  agentChannel?: {
    gamesStore?: GamesStore;
    onSourcesDelivered?: (input: {
      jobId: number;
      slug: string;
      version: string;
      mode?: 'health';
    }) => Promise<{ buildId?: string } | void>;
  };
  adminUids?: string;
  gameSeeder?: GameSeeder;
  // What the seed gate believes is configured; defaults to vertex-only.
  seedProviders?: { providers: string[]; defaultProvider: string };
  // Defaults to always-available; tests of the switch pass an explicit gate.
  managedAvailabilityGate?: ManagedAvailabilityGate | null;
  chatAgent?: StudioChatAgent;
  dailyChatQuota?: number;
  chatGate?: ChatGate | null;
}): Promise<{ app: FastifyInstance; store: Store; authHeaders: Record<string, string> }> {
  const store = params.store ?? new InMemoryStore();
  await store.upsertUser({ uid: 'g:test-user' });
  const app = await buildApp({
    store,
    sessionSecret,
    ...(params.adminUids ? { adminUids: params.adminUids } : {}),
    ...(params.contentChecker ? { contentChecker: params.contentChecker } : {}),
    submissionRoutes: {
      githubToken: params.githubClient ? 'token' : undefined,
      submissionTokenSecret: params.submissionTokenSecret,
      gamesRepo: repo,
      githubClient: params.githubClient,
      agentBackend: params.agentBackend,
      ...(params.agentBackends ? { agentBackends: params.agentBackends } : {}),
      ...(params.gameSeeder ? { gameSeeder: params.gameSeeder } : {}),
      ...(params.seedProviders ? { seedProviders: params.seedProviders } : {}),
      now: params.now,
      dailySubmissionQuota: params.dailySubmissionQuota,
      dailyFeedbackQuota: params.dailyFeedbackQuota,
      dailyImprovementQuota: params.dailyImprovementQuota,
      globalDailySubmissionCap: params.globalDailySubmissionCap,
      creationLimitsTtlMs: params.creationLimitsTtlMs,
      maxCachedDraftPreviews: params.maxCachedDraftPreviews,
      ...(params.agentChannel ? { agentChannel: params.agentChannel } : {}),
      managedAvailabilityGate: params.managedAvailabilityGate === undefined ? null : params.managedAvailabilityGate,
      // No deploy flag anymore — keeps unrelated tests off the real network.
      chatAgent: params.chatAgent ?? new StubStudioChatAgent({ kind: 'build' }),
      ...(params.dailyChatQuota !== undefined ? { dailyChatQuota: params.dailyChatQuota } : {}),
      ...(params.chatGate !== undefined ? { chatGate: params.chatGate } : {}),
    },
  });
  return { app, store, authHeaders: getAuthHeaders('g:test-user') };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('submission routes authentication & quota', () => {
  it('rejects unauthenticated requests to gated routes with 401', async () => {
    const { githubClient } = createGithubClientStub({});
    const { app } = await createApp({ githubClient, submissionTokenSecret: secret });

    const postSub = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      payload: { title: 'Game idea', concept: 'A concept long enough to pass validation rules.' },
    });
    expect(postSub.statusCode).toBe(401);

    const getPreview = await app.inject({ method: 'GET', url: '/api/submissions/token/preview' });
    expect(getPreview.statusCode).toBe(401);

    await app.close();
  });

  it('rejects submissions when daily quota is exceeded', async () => {
    const { githubClient } = createGithubClientStub({});
    const { app, authHeaders } = await createApp({
      githubClient,
      submissionTokenSecret: secret,
      dailySubmissionQuota: 2,
    });

    for (let i = 0; i < 2; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/submissions',
        headers: authHeaders,
        payload: { title: `Game ${i}`, concept: 'A concept long enough to pass validation rules.' },
      });
      expect(res.statusCode).toBe(200);
    }

    const exceeded = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'Game 3', concept: 'A concept long enough to pass validation rules.' },
    });
    expect(exceeded.statusCode).toBe(429);
    expect(exceeded.json()).toEqual({ error: 'daily submission quota exceeded' });

    await app.close();
  });

  /**
   * Moderating a submission is `checkFields([title, concept])` — one *paid* Vertex call
   * per field, so two per request. Both refusals below used to happen only after that
   * spend, which made the quota and the limiter caps on submissions created rather than
   * on what a single account could cost us.
   */
  function countingChecker() {
    const state = {
      calls: 0,
      checker: {
        async check() {
          state.calls += 1;
          return { allowed: true };
        },
        async checkFields(fields: string[]) {
          state.calls += fields.length;
          return { allowed: true };
        },
      } satisfies ContentChecker,
    };
    return state;
  }

  it('spends nothing on moderation once the daily quota is exhausted', async () => {
    const { githubClient } = createGithubClientStub({});
    const moderation = countingChecker();
    const { app, authHeaders } = await createApp({
      githubClient,
      submissionTokenSecret: secret,
      dailySubmissionQuota: 1,
      contentChecker: moderation.checker,
    });

    const body = { title: 'Game idea', concept: 'A concept long enough to pass validation rules.' };
    const first = await app.inject({ method: 'POST', url: '/api/submissions', headers: authHeaders, payload: body });
    expect(first.statusCode).toBe(200);
    expect(moderation.calls).toBe(2);

    const exceeded = await app.inject({ method: 'POST', url: '/api/submissions', headers: authHeaders, payload: body });
    expect(exceeded.statusCode).toBe(429);
    expect(moderation.calls).toBe(2);

    await app.close();
  });

  it('spends nothing on moderation for a rate-limited submission', async () => {
    const { githubClient } = createGithubClientStub({});
    const moderation = countingChecker();
    // Quota above the per-IP ceiling of 5/hour, so the limiter is what refuses the 6th.
    const { app, authHeaders } = await createApp({
      githubClient,
      submissionTokenSecret: secret,
      dailySubmissionQuota: 1000,
      contentChecker: moderation.checker,
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/submissions',
        headers: authHeaders,
        payload: { title: `Game ${attempt}`, concept: 'A concept long enough to pass validation rules.' },
      });
      expect(res.statusCode).toBe(200);
    }
    expect(moderation.calls).toBe(10);

    const limited = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'One too many', concept: 'A concept long enough to pass validation rules.' },
    });
    expect(limited.statusCode).toBe(429);
    expect(moderation.calls).toBe(10);

    await app.close();
  });

  it('rejects blocked users with 403', async () => {
    const { githubClient } = createGithubClientStub({});
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:blocked-user', tier: 'blocked' });

    const { app } = await createApp({ githubClient, submissionTokenSecret: secret, store });

    const res = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: getAuthHeaders('g:blocked-user'),
      payload: { title: 'Game Idea', concept: 'A concept long enough to pass validation rules.' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'account is blocked' });

    await app.close();
  });
});

/**
 * The cost circuit-breaker (readiness item 6). Per-user quotas bound one creator; these
 * bound everyone at once, and can be pulled without a redeploy.
 */
describe('global creation cap and pause switch', () => {
  const body = { title: 'Game idea', concept: 'A concept long enough to pass validation rules.' };

  async function submit(app: FastifyInstance, headers: Record<string, string>, title = body.title) {
    return app.inject({ method: 'POST', url: '/api/submissions', headers, payload: { ...body, title } });
  }

  it('refuses at the shared daily ceiling and leaves the creator’s own allowance unspent', async () => {
    const stub = createGithubClientStub({});
    const { backend, briefs } = createBackendStub();
    const { app, store, authHeaders } = await createApp({
      githubClient: stub.githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
      dailySubmissionQuota: 5,
      globalDailySubmissionCap: 2,
      creationLimitsTtlMs: 0,
    });

    expect((await submit(app, authHeaders, 'One')).statusCode).toBe(200);
    expect((await submit(app, authHeaders, 'Two')).statusCode).toBe(200);

    const refused = await submit(app, authHeaders, 'Three');
    expect(refused.statusCode).toBe(429);
    // A distinct code, because the creator's own allowance is intact and a message
    // implying otherwise is one they can check against the counter on the hero.
    expect(refused.json()).toEqual({ error: 'creation_over_capacity' });

    const dateStr = new Date().toISOString().slice(0, 10);
    expect((await store.getUsage('g:test-user', dateStr)).submissions).toBe(2);
    // And only two builds were dispatched, so the refusal cost an agent run as well as a
    // quota slot. This is the assertion the cap exists for: the ceiling is about spend,
    // and an agent run is what the platform actually pays for. Awaited because dispatch
    // is off the response path — a refused submission returns before an accepted one
    // has finished dispatching.
    await vi.waitFor(() => expect(briefs).toHaveLength(2));

    await app.close();
  });

  it('blocks every creation while paused, before spending anything', async () => {
    const stub = createGithubClientStub({});
    const { backend, briefs } = createBackendStub();
    const { app, store, authHeaders } = await createApp({
      githubClient: stub.githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
      creationLimitsTtlMs: 0,
    });
    await store.setCreationLimits({ paused: true }, 'g:admin');

    const refused = await submit(app, authHeaders);
    expect(refused.statusCode).toBe(429);
    expect(refused.json()).toEqual({ error: 'creation_paused' });

    const dateStr = new Date().toISOString().slice(0, 10);
    expect((await store.getUsage('g:test-user', dateStr)).submissions).toBe(0);
    expect(briefs).toEqual([]);

    await app.close();
  });

  it('leaves per-user quota behaviour exactly as it was', async () => {
    const stub = createGithubClientStub({});
    const { app, authHeaders } = await createApp({
      githubClient: stub.githubClient,
      submissionTokenSecret: secret,
      dailySubmissionQuota: 1,
      globalDailySubmissionCap: 100,
      creationLimitsTtlMs: 0,
    });

    expect((await submit(app, authHeaders, 'One')).statusCode).toBe(200);
    const exceeded = await submit(app, authHeaders, 'Two');
    expect(exceeded.statusCode).toBe(429);
    // The global gate must not shadow the per-user one, or the honest message would be
    // the wrong one: this creator really has used their allowance.
    expect(exceeded.json()).toEqual({ error: 'daily submission quota exceeded' });

    await app.close();
  });

  it('takes effect on a running app, with no restart and no redeploy', async () => {
    const stub = createGithubClientStub({});
    let clock = Date.UTC(2026, 6, 30, 12, 0, 0);
    const { app, store, authHeaders } = await createApp({
      githubClient: stub.githubClient,
      submissionTokenSecret: secret,
      now: () => clock,
      creationLimitsTtlMs: 60_000,
    });

    expect((await submit(app, authHeaders, 'Before')).statusCode).toBe(200);

    // The whole reason the config is a Firestore document rather than an env var: an
    // env change needs a new revision, and a redeploy mid-incident drops every party
    // room in flight.
    await store.setCreationLimits({ paused: true }, 'g:admin');
    clock += 61_000;

    const refused = await submit(app, authHeaders, 'After');
    expect(refused.statusCode).toBe(429);
    expect(refused.json()).toEqual({ error: 'creation_paused' });

    await app.close();
  });

  it('lets bot: accounts through a closed breaker, so a pause cannot redden the deploy gate', async () => {
    const stub = createGithubClientStub({});
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'bot:ci' });
    await store.setCreationLimits({ paused: true, globalDailySubmissionCap: 0 }, 'g:admin');
    const { app } = await createApp({
      githubClient: stub.githubClient,
      submissionTokenSecret: secret,
      store,
      creationLimitsTtlMs: 0,
    });

    const res = await submit(app, getAuthHeaders('bot:ci'));
    expect(res.statusCode).toBe(200);

    await app.close();
  });
});

describe('submission routes', () => {
  it('returns 503 when submissions are not configured', async () => {
    const app = await buildApp({ submissionRoutes: { githubToken: undefined, submissionTokenSecret: undefined } });

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: getAuthHeaders(),
      payload: { title: 'Game idea', concept: 'A concept long enough to pass the schema checks.' },
    });
    expect(createRes.statusCode).toBe(503);
    expect(createRes.json()).toEqual({ error: 'submissions are not configured' });

    const statusRes = await app.inject({ method: 'GET', url: '/api/submissions/token' });
    expect(statusRes.statusCode).toBe(503);
    expect(statusRes.json()).toEqual({ error: 'submissions are not configured' });

    await app.close();
  });

  it('validates submission payload and returns first zod error', async () => {
    const { githubClient } = createGithubClientStub({});
    const { app, authHeaders } = await createApp({ githubClient, submissionTokenSecret: secret });
    const response = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'ab', concept: 'too short' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'title must be at least 3 characters' });
    await app.close();
  });

  it('rejects a submission that trips content moderation with 422, before creating an issue or spending quota', async () => {
    const { githubClient, createIssue } = createGithubClientStub({});
    const { app, store, authHeaders } = await createApp({ githubClient, submissionTokenSecret: secret });

    const response = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'Fine title', concept: 'A concept describing a porn game with adult content in it.' },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({ error: 'content_rejected', category: 'adult' });
    expect(createIssue).not.toHaveBeenCalled();

    const quota = await store.checkAndIncrementQuota(
      'g:test-user',
      new Date().toISOString().slice(0, 10),
      5,
      'submissions',
    );
    expect(quota.current).toBe(1); // the moderated attempt didn't count
    await app.close();
  });

  it('files nothing on GitHub, and sends the sanitized spec straight to an agent', async () => {
    // Job identity is ours: no issue is created, so a build no longer waits on a work
    // item existing in someone else's system before it can be named.
    const { githubClient, createIssue } = createGithubClientStub({ jobId: 77 });
    const { backend, briefs } = createBackendStub();
    const { app, authHeaders, store } = await createApp({
      githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: {
        title: '<b>My [cool](https://example.com) title</b>',
        concept: 'This is a sufficiently long [concept](https://example.com) with <i>markup</i> and details.',
        displayName: '<script>Alice</script>',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(createIssue).not.toHaveBeenCalled();

    // The token addresses a job id of ours, allocated above the floor that separates
    // them from the era when identity came from an issue number.
    const jobs = await store.listSubmissionsByOwner('g:test-user');
    expect(jobs[0].jobId).toBeGreaterThanOrEqual(JOB_ID_FLOOR);
    expect(response.json()).toEqual({
      token: mintToken(jobs[0].jobId, secret),
      // Minted here, from the sanitized title, and returned so the app can open the
      // studio on a readable address instead of on a capability token.
      slug: 'my-cool-title',
      statusUrl: `/api/submissions/${response.json().token}`,
    });
    expect(jobs[0].slug).toBe('my-cool-title');

    // Creator text is still sanitized and still fenced as data — it just reaches the
    // agent directly now instead of by way of an issue body.
    expect(briefs).toHaveLength(1);
    expect(briefs[0].spec).toContain('My cool title');
    // The agent is told where to build. Its brief used to name the game directory as
    // "(the slug named in your first progress report)", which is a sentence, not a path.
    expect(briefs[0].slug).toBe('my-cool-title');
    expect(briefs[0].spec).toContain('This is a sufficiently long concept with markup and details.');
    expect(briefs[0].spec).not.toContain('<script>');
    expect(briefs[0].spec).not.toContain('<i>');
    // Round-scoped: same job + generation. `exp` is wall-clock, so compare claims
    // rather than the opaque string (a second boundary would flake an equality check).
    expect(verifyAgentToken(briefs[0].channelToken, secret)).toMatchObject({
      jobId: jobs[0].jobId,
      roundGeneration: jobs[0].roundGeneration ?? 1,
    });
  });
  it('gives two games of the same name addresses of their own', async () => {
    const { githubClient } = createGithubClientStub({ jobId: 93 });
    const store = new InMemoryStore();
    const { app, authHeaders } = await createApp({ githubClient, submissionTokenSecret: secret, store });

    const submit = () =>
      app.inject({
        method: 'POST',
        url: '/api/submissions',
        headers: authHeaders,
        payload: {
          title: 'Space Miner',
          concept: 'Dig asteroids for ore and sell it at the station before your fuel runs out.',
        },
      });

    const first = await submit();
    const second = await submit();

    expect(first.json().slug).toBe('space-miner');
    // Numbered rather than randomised: the second "space miner" being space-miner-2 is
    // a fact a creator can hold in their head.
    expect(second.json().slug).toBe('space-miner-2');
  });

  it('gives the loser of a slug race a different name rather than a shared one', async () => {
    // Minting reads then writes, so two submissions of one title can both be told a name
    // is free. Nothing about that shows until much later and then it is severe: both
    // agents deliver into the same games-store slug, and whichever job loses the by-slug
    // lookup becomes unplayable to its own creator. The claim is read back, so the loser
    // finds out while a different name still costs nothing.
    const { githubClient } = createGithubClientStub({ jobId: 94 });
    const store = new InMemoryStore();
    const { app, authHeaders } = await createApp({ githubClient, submissionTokenSecret: secret, store });

    // Somebody else took the name in the window between our probe and our write.
    const realProbe = store.getSubmissionBySlug.bind(store);
    let raced = false;
    store.getSubmissionBySlug = async (slug: string) => {
      if (slug === 'space-miner' && !raced) {
        raced = true;
        return { jobId: 999_999, ownerUid: 'g:someone-else', createdAt: '', title: 'Space Miner', slug };
      }
      return realProbe(slug);
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: {
        title: 'Space Miner',
        concept: 'Dig asteroids for ore and sell it at the station before your fuel runs out.',
      },
    });

    expect(res.statusCode).toBe(200);
    // A different address, not a shared one — and not a failure either, because the
    // creator has nothing to fix and nothing has been dispatched yet.
    expect(res.json().slug).toBe('space-miner-2');
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    expect(job.slug).toBe('space-miner-2');

    await app.close();
  });

  it('refuses the submission outright when it cannot claim any name', async () => {
    // Losing twice means something is racing us persistently rather than by coincidence.
    // Better a creator who is told to rename than a game that cannot be addressed.
    const { githubClient } = createGithubClientStub({ jobId: 95 });
    const { backend, briefs } = createBackendStub();
    const store = new InMemoryStore();
    const { app, authHeaders } = await createApp({
      githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
      store,
    });

    store.getSubmissionBySlug = async (slug: string) => ({
      jobId: 999_999,
      ownerUid: 'g:someone-else',
      createdAt: '',
      title: 'Space Miner',
      slug,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: {
        title: 'Space Miner',
        concept: 'Dig asteroids for ore and sell it at the station before your fuel runs out.',
      },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('name_unavailable');
    // And no agent was sent to build a game that has nowhere to live.
    expect(briefs).toHaveLength(0);

    await app.close();
  });

  it('records how many QA answers came with the concept', async () => {
    const { githubClient } = createGithubClientStub({ jobId: 92 });
    const store = new InMemoryStore();
    const { app, authHeaders } = await createApp({ githubClient, submissionTokenSecret: secret, store });

    const response = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: {
        title: 'Space Postman',
        concept: [
          'Deliver parcels between planets while dodging asteroids and storms.',
          '',
          '## Creator clarifications',
          '- What visual style fits best: Pixel Art',
          '- How should flying work: Vector physics',
        ].join('\n'),
      },
    });

    expect(response.statusCode).toBe(200);
    // Derived from the concept the agent was given, not sent by the client.
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    expect(job.clarificationCount).toBe(2);

    await app.close();
  });

  it('records zero clarifications when the creator skipped the questions', async () => {
    const { githubClient } = createGithubClientStub({ jobId: 93 });
    const store = new InMemoryStore();
    const { app, authHeaders } = await createApp({ githubClient, submissionTokenSecret: secret, store });

    const response = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'Space Postman', concept: 'Deliver parcels between planets while dodging asteroids.' },
    });

    expect(response.statusCode).toBe(200);
    // Zero, not absent: "answered nothing" and "we never looked" must stay distinct.
    const [skipped] = await store.listSubmissionsByOwner('g:test-user');
    expect(skipped.clarificationCount).toBe(0);

    await app.close();
  });

  it('tells the agent which language to report progress in', async () => {
    const { githubClient } = createGithubClientStub({ jobId: 91 });
    const { backend, briefs } = createBackendStub();
    const store = new InMemoryStore();
    const { app, authHeaders } = await createApp({
      githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
      store,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: { ...authHeaders, 'accept-language': 'pl-PL,pl;q=0.9' },
      payload: { title: 'Kosmiczna gra', concept: 'A sufficiently long concept about a spaceship and its crew.' },
    });

    expect(response.statusCode).toBe(200);
    // The agent is told directly, in its brief, rather than through an issue body.
    expect(briefs[0].locale).toBe('pl');
    // And it is recorded, so the channel can tell the agent the same thing later.
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    expect(job.locale).toBe('pl');

    await app.close();
  });

  it('serves a native job status from its own record, with no GitHub call at all', async () => {
    // The whole point of owning job identity: a creator watching their build is no
    // longer exposed to GitHub being slow, rate-limited, or down.
    const { githubClient, getIssueState, findLinkedPR } = createGithubClientStub({ jobId: 77 });
    const { backend } = createBackendStub();
    const { app, authHeaders, store } = await createApp({
      githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
    });

    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about delivering parcels in space.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    getIssueState.mockClear();
    findLinkedPR.mockClear();

    const status = await app.inject({
      method: 'GET',
      url: `/api/submissions/${mintToken(job.jobId, secret)}`,
      headers: authHeaders,
    });

    expect(status.statusCode).toBe(200);
    expect(status.json().status).toBe('queued');
    expect(getIssueState).not.toHaveBeenCalled();
    expect(findLinkedPR).not.toHaveBeenCalled();

    await app.close();
  });

  it('queues feedback to the inbox without starting a second session on an in-flight round', async () => {
    // The agent-tasks API cannot steer or cancel a running Copilot session. Spawning a
    // second task on top of an in-flight round is what produced concurrent builds of the
    // same game; the inbox is the steering path the brief already tells the agent to poll.
    const { githubClient, createIssueComment } = createGithubClientStub({ jobId: 77 });
    const { backend, briefs } = createBackendStub();
    const { app, authHeaders, store } = await createApp({
      githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
    });

    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about delivering parcels in space.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    expect(job.dispatch?.refs?.length).toBeGreaterThan(0);
    const briefsBefore = briefs.length;

    const response = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(job.jobId, secret)}/feedback`,
      headers: authHeaders,
      payload: { feedback: 'Make the parcels bigger and the asteroids slower.' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true });
    expect(response.json()).not.toHaveProperty('roundStarted');
    expect(createIssueComment).not.toHaveBeenCalled();
    expect(briefs).toHaveLength(briefsBefore);
    const pending = await store.listPendingCreatorMessages(job.jobId);
    expect(pending.some((message) => message.text.includes('Make the parcels bigger'))).toBe(true);

    await app.close();
  });

  it('restarts a platform round after its agent has ended', async () => {
    const { githubClient } = createGithubClientStub({ jobId: 77 });
    const { backend, briefs } = createBackendStub();
    const { app, authHeaders, store } = await createApp({
      githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
      chatAgent: { decide: async () => ({ kind: 'build' as const, text: 'On it!' }) },
    });

    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about delivering parcels in space.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    const briefsBefore = briefs.length;
    await store.markAgentEnded(job.jobId, new Date().toISOString());

    const response = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(job.jobId, secret)}/feedback`,
      headers: authHeaders,
      payload: { feedback: 'Please make the parcels bigger and the asteroids slower.' },
    });

    expect(response.statusCode).toBe(200);
    expect(briefs).toHaveLength(briefsBefore + 1);
    expect((await store.getSubmission(job.jobId))?.state).toBe('dispatched');
    const messages = await store.listCreatorMessages(job.jobId);
    expect(messages.some((message) => message.origin === 'studio_ack')).toBe(true);

    await app.close();
  });

  it('keeps feedback in the inbox after an optimistic submit marker', async () => {
    const { githubClient } = createGithubClientStub({ jobId: 77 });
    const { backend, briefs } = createBackendStub();
    const { app, authHeaders, store } = await createApp({
      githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
      chatAgent: { decide: async () => ({ kind: 'build' as const, text: 'On it!' }) },
    });

    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about delivering parcels in space.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    const briefsBefore = briefs.length;
    await store.markAgentEnded(job.jobId, new Date().toISOString(), 'submit');

    const response = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(job.jobId, secret)}/feedback`,
      headers: authHeaders,
      payload: { feedback: 'Please make the parcels bigger and the asteroids slower.' },
    });

    expect(response.statusCode).toBe(200);
    expect(briefs).toHaveLength(briefsBefore);
    expect((await store.getSubmission(job.jobId))?.agentEndedBy).toBe('submit');

    await app.close();
  });

  it('keeps gate-wait and gate-red rounds on inbox steering rather than a new session', async () => {
    // After submit the job is `submitted` while the same session waits on the gate; a
    // red verdict moves it to `needs_changes` with mustFixGate. Both must stay inbox-only.
    const { githubClient } = createGithubClientStub({ jobId: 77 });
    const { backend, briefs } = createBackendStub();
    const { app, authHeaders, store } = await createApp({
      githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
    });

    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about delivering parcels in space.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    await store.setSubmissionDeliveredVersion(job.jobId, 'v1');
    await store.recordJobTransition(job.jobId, {
      to: 'submitted',
      at: new Date().toISOString(),
      by: 'agent',
      reason: 'sources_uploaded',
    });
    const briefsAfterSubmit = briefs.length;

    const duringGate = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(job.jobId, secret)}/feedback`,
      headers: authHeaders,
      payload: { feedback: 'Make the parcels bigger while the gate is still running.' },
    });
    expect(duringGate.statusCode).toBe(200);
    expect(briefs).toHaveLength(briefsAfterSubmit);

    await store.recordJobTransition(job.jobId, {
      to: 'needs_changes',
      at: new Date().toISOString(),
      by: 'gate',
      reason: 'gate_red',
    });
    const briefsAfterRed = briefs.length;

    const duringRepair = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(job.jobId, secret)}/feedback`,
      headers: authHeaders,
      payload: { feedback: 'Also slow the asteroids down while you fix the gate.' },
    });
    expect(duringRepair.statusCode).toBe(200);
    expect(briefs).toHaveLength(briefsAfterRed);

    await app.close();
  });

  it('still resumes when feedback arrives on a queued job that was never dispatched', async () => {
    // dispatchBuild leaves the job queued when startTask throws. Nobody will poll the
    // inbox — feedback has to be the retry that starts a session.
    const store = new InMemoryStore();
    const jobId = JOB_ID_FLOOR + 77;
    await store.upsertUser({ uid: 'g:test-user' });
    await store.createSubmission(jobId, 'g:test-user', 'A game');
    expect((await store.getSubmission(jobId))?.dispatch?.refs).toBeUndefined();

    const { githubClient } = createGithubClientStub({ jobId });
    const { backend, briefs } = createBackendStub();
    const { app, authHeaders } = await createApp({
      store,
      githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(jobId, secret)}/feedback`,
      headers: authHeaders,
      payload: { feedback: 'Please start this build — nothing has happened yet.' },
    });

    expect(response.statusCode).toBe(200);
    expect(briefs.at(-1)?.feedback).toContain('nothing has happened yet');
    expect((await store.getSubmission(jobId))?.dispatch?.refs?.length).toBeGreaterThan(0);

    await app.close();
  });

  it('does not claim success when inbox steering cannot queue the note', async () => {
    // Inbox is the sole delivery path for an in-flight round. A silent ok:true after a
    // queue failure would clear the composer while the agent never sees the words.
    const { githubClient } = createGithubClientStub({ jobId: 77 });
    const { backend, briefs } = createBackendStub();
    const { app, authHeaders, store } = await createApp({
      githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
    });

    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about delivering parcels in space.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    const briefsBefore = briefs.length;
    store.appendCreatorMessage = async () => {
      throw new Error('firestore unavailable');
    };

    const response = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(job.jobId, secret)}/feedback`,
      headers: authHeaders,
      payload: { feedback: 'Make the parcels bigger and the asteroids slower.' },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ error: 'failed to queue feedback for the agent' });
    expect(briefs).toHaveLength(briefsBefore);

    await app.close();
  });

  it('refuses feedback while the game is publishing', async () => {
    // Publishing already closed the round; no session can collect inbox mail, and a
    // fresh resume would race the bake.
    const { githubClient } = createGithubClientStub({ jobId: 77 });
    const { backend, briefs } = createBackendStub();
    const { app, authHeaders, store } = await createApp({
      githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
    });

    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about delivering parcels in space.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    await store.setSubmissionDeliveredVersion(job.jobId, 'v1');
    await store.recordJobTransition(job.jobId, {
      to: 'ready_for_review',
      at: new Date().toISOString(),
      by: 'reconciler',
      reason: 'gate_green',
    });
    await store.recordJobTransition(job.jobId, {
      to: 'publishing',
      at: new Date().toISOString(),
      by: 'operator',
      reason: 'publish_started',
    });
    const briefsBefore = briefs.length;

    const response = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(job.jobId, secret)}/feedback`,
      headers: authHeaders,
      payload: { feedback: 'Make the parcels bigger and the asteroids slower.' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatch(/publishing/i);
    expect(briefs).toHaveLength(briefsBefore);

    await app.close();
  });

  it('briefs feedback on an undelivered job as recovery, not as a revision', async () => {
    // Job #1000003: first round died on quota with nothing uploaded; creator feedback
    // then opened with "revise it, do not rebuild it" and `npm run restore` against an
    // empty store. The record already knows (`deliveredVersion`); use it.
    const { githubClient } = createGithubClientStub({ jobId: 77 });
    const { backend, briefs } = createBackendStub();
    const { app, authHeaders, store } = await createApp({
      githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
    });

    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about delivering parcels in space.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    await store.setDispatchWorkspace(job.jobId, 'copilot/partial-work');
    await store.recordJobTransition(job.jobId, {
      to: 'failed',
      at: new Date().toISOString(),
      by: 'reconciler',
      reason: 'task_failed',
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(job.jobId, secret)}/feedback`,
      headers: authHeaders,
      payload: { feedback: 'Gdzie moja gra — I played nothing yet.' },
    });

    expect(response.statusCode).toBe(200);
    expect(briefs.at(-1)?.undelivered).toBe(true);
    expect(briefs.at(-1)?.feedback).toContain('Gdzie moja gra');

    await app.close();
  });

  it('briefs feedback on a delivered job as a revision that restores from the store', async () => {
    const { githubClient } = createGithubClientStub({ jobId: 77 });
    const { backend, briefs } = createBackendStub();
    const { app, authHeaders, store } = await createApp({
      githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
    });

    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about delivering parcels in space.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    await store.appendCreatorMessage(job.jobId, 'The first draft had the right controls; keep them in the revision.');
    await store.setSubmissionDeliveredVersion(job.jobId, 'v20260731T153306124Z');
    await store.recordJobTransition(job.jobId, {
      to: 'ready_for_review',
      at: new Date().toISOString(),
      by: 'reconciler',
      reason: 'gate_green',
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(job.jobId, secret)}/feedback`,
      headers: authHeaders,
      payload: { feedback: 'Make the parcels bigger and the asteroids slower.' },
    });

    expect(response.statusCode).toBe(200);
    expect(briefs.at(-1)?.undelivered).toBeUndefined();
    expect(briefs.at(-1)?.feedback).toContain('Make the parcels bigger');
    expect(briefs.at(-1)?.feedbackQueueFailed).toBeUndefined();
    // Context now reads back via get_transcript, not an injected brief field.
    expect(briefs.at(-1)).not.toHaveProperty('history');
    // Gate-green closed the round; feedback must reopen the job, not leave it stuck
    // in ready_for_review while a session quietly starts underneath. Land on
    // `dispatched` — Copilot boots before GitHub reports `in_progress`.
    const after = await store.getSubmission(job.jobId);
    expect(after?.state).toBe('dispatched');
    expect(after?.transitions?.at(-1)).toMatchObject({
      to: 'dispatched',
      by: 'creator',
      reason: 'creator_feedback',
    });

    await app.close();
  });

  // ready_for_review isn't inbox-steered, so a failed queue write still dispatches.
  it('falls back to inlining feedback in the prompt when the queue write fails but the round still dispatches', async () => {
    const { githubClient } = createGithubClientStub({ jobId: 77 });
    const { backend, briefs } = createBackendStub();
    const { app, authHeaders, store } = await createApp({
      githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
    });

    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about delivering parcels in space.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    await store.setSubmissionDeliveredVersion(job.jobId, 'v20260731T153306124Z');
    await store.recordJobTransition(job.jobId, {
      to: 'ready_for_review',
      at: new Date().toISOString(),
      by: 'reconciler',
      reason: 'gate_green',
    });
    store.appendCreatorMessage = async () => {
      throw new Error('firestore unavailable');
    };

    const response = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(job.jobId, secret)}/feedback`,
      headers: authHeaders,
      payload: { feedback: 'Make the parcels bigger and the asteroids slower.' },
    });

    expect(response.statusCode).toBe(200);
    expect(briefs.at(-1)?.feedback).toContain('Make the parcels bigger');
    expect(briefs.at(-1)?.feedbackQueueFailed).toBe(true);

    await app.close();
  });

  it('drops cached stall=ended when the self agent resumes after submit auto-end', async () => {
    // Submit marks agentEndedAt for ChatGPT-class stop-without-end. Claude often keeps
    // iterating: progress/stage clear ended in the store, but a 60s status cache used to
    // keep serving stall=ended beside fresh "now" events — Studio said finished and working.
    const { githubClient } = createGithubClientStub({ jobId: 78 });
    const { backend } = createBackendStub();
    const { app, authHeaders, store } = await createApp({
      githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
    });

    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about delivering parcels in space.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    const token = mintToken(job.jobId, secret);
    await store.setRoundBuilder(job.jobId, 'self');
    await store.ensureRoundGeneration(job.jobId);
    await store.recordJobTransition(job.jobId, {
      to: 'building',
      at: new Date().toISOString(),
      by: 'agent',
      reason: 'self_signal',
    });
    await store.touchLastAgentSignalAt(job.jobId, new Date().toISOString());
    await store.markAgentEnded(job.jobId, new Date().toISOString());

    const ended = await app.inject({ method: 'GET', url: `/api/submissions/${token}`, headers: authHeaders });
    expect(ended.statusCode).toBe(200);
    expect(ended.json()).toMatchObject({ builder: 'self', stall: 'ended' });
    expect(ended.json().agentEndedAt).toBeTruthy();

    const progress = await app.inject({
      method: 'POST',
      url: '/api/agent/build/progress',
      headers: { authorization: `Bearer ${mintAgentToken(job.jobId, secret, { roundGeneration: 1 })}` },
      payload: { text: 'Fixing the roofline before the next preview.' },
    });
    expect(progress.statusCode).toBe(200);
    expect((await store.getSubmission(job.jobId))?.agentEndedAt).toBeUndefined();

    // Immediate poll must not keep the cached ended snapshot next to the new event.
    const resumed = await app.inject({ method: 'GET', url: `/api/submissions/${token}`, headers: authHeaders });
    expect(resumed.statusCode).toBe(200);
    expect(resumed.json().stall).toBeUndefined();
    expect(resumed.json().agentEndedAt).toBeUndefined();
    expect(resumed.json().events?.some((event: { text: string }) => /roofline/i.test(event.text))).toBe(true);

    await app.close();
  });

  it('drops cached stall=ended when an undelivered round is resumed via retry', async () => {
    const { githubClient } = createGithubClientStub({ jobId: 79 });
    const { backend } = createBackendStub();
    const { app, authHeaders, store } = await createApp({
      githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
      adminUids: 'g:boss',
    });
    await store.upsertUser({ uid: 'g:boss' });

    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about delivering parcels in space.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    const token = mintToken(job.jobId, secret);
    await store.setRoundBuilder(job.jobId, 'self');
    await store.ensureRoundGeneration(job.jobId);
    await store.recordJobTransition(job.jobId, {
      to: 'building',
      at: new Date().toISOString(),
      by: 'agent',
      reason: 'self_signal',
    });
    await store.touchLastAgentSignalAt(job.jobId, new Date().toISOString());
    await store.markAgentEnded(job.jobId, new Date().toISOString());

    const before = await store.getSubmission(job.jobId);
    expect(before?.deliveredVersion).toBeFalsy();

    const ended = await app.inject({ method: 'GET', url: `/api/submissions/${token}`, headers: authHeaders });
    expect(ended.statusCode).toBe(200);
    expect(ended.json()).toMatchObject({ builder: 'self', stall: 'ended' });
    expect(ended.json().agentEndedAt).toBeTruthy();

    const response = await app.inject({
      method: 'POST',
      url: `/api/admin/jobs/${job.jobId}/retry`,
      headers: getAuthHeaders('g:boss'),
    });
    expect(response.statusCode).toBe(200);

    const after = await store.getSubmission(job.jobId);
    expect(after?.agentEndedAt).toBeUndefined();

    const resumed = await app.inject({ method: 'GET', url: `/api/submissions/${token}`, headers: authHeaders });
    expect(resumed.statusCode).toBe(200);
    expect(resumed.json().stall).not.toBe('ended');
    expect(resumed.json().agentEndedAt).toBeUndefined();

    await app.close();
  });

  it('keeps stall=ended when an undelivered retry fails to start', async () => {
    const { githubClient } = createGithubClientStub({ jobId: 80 });
    let failNext = false;
    const backend: AgentBackend = {
      name: 'stub',
      dispatch: async () => {
        if (failNext) throw new Error('backend unavailable');
        return { ref: 'task-1', workspace: 'copilot/x' };
      },
      resume: async () => {
        if (failNext) throw new Error('backend unavailable');
        return { ref: 'task-2', workspace: 'copilot/y' };
      },
      observe: async () => null,
      cancel: async () => ({ enforced: false }),
    };
    const { app, authHeaders, store } = await createApp({
      githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
      adminUids: 'g:boss',
    });
    await store.upsertUser({ uid: 'g:boss' });

    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about delivering parcels in space.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    const token = mintToken(job.jobId, secret);
    await store.ensureRoundGeneration(job.jobId);
    await store.touchLastAgentSignalAt(job.jobId, new Date().toISOString());
    await store.markAgentEnded(job.jobId, new Date().toISOString());

    failNext = true;
    const response = await app.inject({
      method: 'POST',
      url: `/api/admin/jobs/${job.jobId}/retry`,
      headers: getAuthHeaders('g:boss'),
    });
    expect(response.statusCode).toBe(502);

    const after = await store.getSubmission(job.jobId);
    expect(after?.agentEndedAt).toBeTruthy();

    const resumed = await app.inject({ method: 'GET', url: `/api/submissions/${token}`, headers: authHeaders });
    expect(resumed.statusCode).toBe(200);
    expect(resumed.json().stall).toBe('ended');

    await app.close();
  });

  it('self→platform handoff lands on dispatched and busts the status cache', async () => {
    // Without the cache bust, Studio kept serving the previous self stall
    // (`no_agent_yet` / ended) for up to a minute while Copilot was already queued.
    const { githubClient } = createGithubClientStub({ jobId: 77 });
    const { backend } = createBackendStub();
    const { app, authHeaders, store } = await createApp({
      githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
    });

    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about delivering parcels in space.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    const token = mintToken(job.jobId, secret);
    await store.setRoundBuilder(job.jobId, 'self');
    await store.recordJobTransition(job.jobId, {
      to: 'building',
      at: new Date().toISOString(),
      by: 'agent',
      reason: 'self_signal',
    });
    await store.markAgentEnded(job.jobId, new Date().toISOString());

    const before = await app.inject({ method: 'GET', url: `/api/submissions/${token}`, headers: authHeaders });
    expect(before.statusCode).toBe(200);
    expect(before.json()).toMatchObject({ builder: 'self', stall: 'ended' });

    const handoff = await app.inject({
      method: 'POST',
      url: `/api/submissions/${token}/feedback`,
      headers: authHeaders,
      payload: {
        feedback: 'Please continue this round with the platform coding agent.',
        builder: 'platform',
      },
    });
    expect(handoff.statusCode).toBe(200);

    const after = await store.getSubmission(job.jobId);
    expect(after?.builder).toBe('platform');
    expect(after?.state).toBe('dispatched');
    expect(after?.transitions?.at(-1)).toMatchObject({
      to: 'dispatched',
      by: 'creator',
      reason: 'agent_ended_handoff',
    });

    // Immediate status must not return the cached self+ended snapshot.
    const status = await app.inject({ method: 'GET', url: `/api/submissions/${token}`, headers: authHeaders });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({
      builder: 'platform',
      status: 'queued',
      phase: 'dispatched',
    });
    expect(status.json().stall).toBeUndefined();

    await app.close();
  });

  it('platform→self handoff on a never-dispatched round resumes immediately, not pending', async () => {
    // A never-dispatched round has no agent to ack a stop request.
    const { githubClient } = createGithubClientStub({ jobId: 77 });
    const { backend } = createBackendStub();
    const { app, authHeaders, store } = await createApp({
      githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
    });

    const jobId = await store.allocateJobId();
    await store.createSubmission(jobId, 'g:test-user', 'A game');
    await store.recordJobTransition(jobId, {
      to: 'queued',
      at: new Date().toISOString(),
      by: 'creator',
      reason: 'code_surface_opened',
    });
    const token = mintToken(jobId, secret);

    const handoff = await app.inject({
      method: 'POST',
      url: `/api/submissions/${token}/handoff`,
      headers: authHeaders,
      payload: { builder: 'self', stopActivePlatformAgent: true },
    });

    expect(handoff.statusCode).toBe(200);
    expect(handoff.json()).not.toMatchObject({ pending: true });

    const after = await store.getSubmission(jobId);
    expect(after?.builder).toBe('self');
    expect(after?.builderHandoff).toBeUndefined();

    await app.close();
  });

  it('busts the status cache when the agent acks an inbox message', async () => {
    const { githubClient } = createGithubClientStub({ jobId: 77 });
    const { app, authHeaders, store } = await createApp({
      githubClient,
      submissionTokenSecret: secret,
    });

    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about delivering parcels in space.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    const token = mintToken(job.jobId, secret);
    await store.setRoundBuilder(job.jobId, 'self');
    await store.ensureRoundGeneration(job.jobId);
    await store.recordJobTransition(job.jobId, {
      to: 'building',
      at: new Date().toISOString(),
      by: 'agent',
      reason: 'self_signal',
    });
    const message = await store.appendCreatorMessage(job.jobId, 'Make the enemies slower.');

    const before = await app.inject({ method: 'GET', url: `/api/submissions/${token}`, headers: authHeaders });
    expect(before.json().progress.revisions[0]).toMatchObject({ delivered: false });

    const acked = await app.inject({
      method: 'POST',
      url: '/api/agent/build/inbox/ack',
      headers: { authorization: `Bearer ${mintAgentToken(job.jobId, secret, { roundGeneration: 1 })}` },
      payload: { ids: [message.id] },
    });
    expect(acked.statusCode).toBe(200);

    // Immediate poll must not keep serving the cached undelivered snapshot.
    const after = await app.inject({ method: 'GET', url: `/api/submissions/${token}`, headers: authHeaders });
    expect(after.json().progress.revisions[0]).toMatchObject({ delivered: true });

    await app.close();
  });

  it('does not commit the requested builder when its dispatch fails', async () => {
    const { githubClient } = createGithubClientStub({ jobId: 77 });
    const activeStore = new InMemoryStore();
    let builderAtHandoff: string | undefined;
    const backend: AgentBackend = {
      name: 'stub',
      dispatch: async (brief) => {
        const record = await activeStore?.getSubmission(brief.jobId);
        if (brief.feedback) builderAtHandoff = record?.builder;
        throw new Error('vendor rejected the session');
      },
      resume: async (brief) => {
        const record = await activeStore?.getSubmission(brief.jobId);
        if (brief.feedback) builderAtHandoff = record?.builder;
        throw new Error('vendor rejected the session');
      },
      observe: async () => null,
      cancel: async () => ({ enforced: false }),
    };
    const { app, authHeaders, store } = await createApp({
      store: activeStore,
      githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
    });

    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about delivering parcels in space.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    const token = mintToken(job.jobId, secret);
    await store.setRoundBuilder(job.jobId, 'self');
    await store.recordDispatch(job.jobId, { backend: 'self', ref: 'self:77' });
    await store.recordJobTransition(job.jobId, {
      to: 'building',
      at: new Date().toISOString(),
      by: 'agent',
      reason: 'self_signal',
    });
    await store.markAgentEnded(job.jobId, new Date().toISOString());

    const handoff = await app.inject({
      method: 'POST',
      url: `/api/submissions/${token}/feedback`,
      headers: authHeaders,
      payload: {
        feedback: 'Please continue this round with the platform coding agent.',
        builder: 'platform',
      },
    });
    expect(handoff.statusCode).toBe(200);
    expect(handoff.json()).toMatchObject({ ok: true, roundStarted: false });

    expect(builderAtHandoff).toBe('platform');
    const after = await store.getSubmission(job.jobId);
    expect(after?.builder).toBe('self');
    expect(after?.dispatch?.refs.at(-1)).toBe('self:77');

    await app.close();
  });

  it('echoes the creator’s revisions back from the store, without the playtest context', async () => {
    // A native job has no PR conversation to re-read a revision from, so the store copy
    // is the durable record. The page used to show a sent revision from its own local
    // state only — one reload and the creator's request looked like it never happened.
    const { githubClient } = createGithubClientStub({ jobId: 77 });
    const { backend } = createBackendStub();
    const { app, authHeaders, store } = await createApp({
      githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
    });

    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about delivering parcels in space.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    const token = mintToken(job.jobId, secret);

    await app.inject({
      method: 'POST',
      url: `/api/submissions/${token}/feedback`,
      headers: authHeaders,
      payload: {
        feedback: 'Make the parcels bigger and the asteroids slower.',
        context: { instrumentation: { playSeconds: 30 } },
      },
    });

    const status = await app.inject({ method: 'GET', url: `/api/submissions/${token}`, headers: authHeaders });

    expect(status.statusCode).toBe(200);
    const revisions = status.json().progress?.revisions;
    expect(revisions).toHaveLength(1);
    // The creator's words only: the instrumentation block stapled on for the agent is
    // not something they wrote, so it must not be echoed back as if they did.
    expect(revisions[0].text).toBe('Make the parcels bigger and the asteroids slower.');
    expect(revisions[0].createdAt).toBeTruthy();
    // Typed in the composer, so it is the creator's own message — nothing to disclaim.
    expect(revisions[0].origin).toBeUndefined();

    await app.close();
  });

  it('marks an agent-relayed request as relayed and echoes it without calling a model', async () => {
    // A creator talking to their coding agent in a chat we never see gets their request
    // relayed through `continue_draft({ feedback })` — written by the agent, in whatever
    // language it was speaking. Echoing that unlabelled put an English summary on the
    // creator's own side of a Polish thread, as words they had never written.
    //
    // This endpoint is polled every 3s, so it resolves language from stored text only.
    // It used to translate here instead, and when those calls started timing out nothing
    // was cached, so every poll re-sent the same request — ~9,250 billed-and-discarded
    // Vertex calls in a day. Localization belongs at intake; see `report_progress`.
    const { githubClient } = createGithubClientStub({ jobId: 78 });
    const { backend } = createBackendStub();
    const { app, authHeaders, store } = await createApp({
      githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
    });

    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about delivering parcels in space.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    const token = mintToken(job.jobId, secret);

    await store.appendCreatorMessage(job.jobId, 'Zrób paczki większe.');
    await store.appendCreatorMessage(job.jobId, 'Major systems pass: zoom out the battlefield.', {
      origin: 'agent',
    });

    const status = await app.inject({
      method: 'GET',
      url: `/api/submissions/${token}?locale=pl`,
      headers: authHeaders,
    });

    expect(status.statusCode).toBe(200);
    const revisions = status.json().progress?.revisions;
    expect(revisions).toHaveLength(2);
    // The creator's own sentence is already in the language they chose to write it in.
    expect(revisions[0]).toMatchObject({ text: 'Zrób paczki większe.' });
    expect(revisions[0].origin).toBeUndefined();
    // Verbatim, even though the reader asked for `pl`: nothing was stored alongside it.
    // Anything that turns this into a translated string has put a model call on the poll
    // path again — the translation must come from the write, not from here.
    expect(revisions[1]).toMatchObject({
      text: 'Major systems pass: zoom out the battlefield.',
      origin: 'agent',
    });

    await app.close();
  });

  it('serves a relayed request in the reader’s language from what the write stored', async () => {
    // The other half of the same contract: the poll resolves language by *choosing*
    // between stored strings, never by producing one. See localize-intake.ts.
    const { githubClient } = createGithubClientStub({ jobId: 79 });
    const { backend } = createBackendStub();
    const { app, authHeaders, store } = await createApp({
      githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
    });

    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about delivering parcels in space.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    const token = mintToken(job.jobId, secret);

    await store.appendCreatorMessage(job.jobId, 'Zoom out the battlefield.', {
      origin: 'agent',
      textLocalized: 'Oddal widok pola bitwy.',
      locale: 'pl',
    });

    const polish = await app.inject({
      method: 'GET',
      url: `/api/submissions/${token}?locale=pl`,
      headers: authHeaders,
    });
    const plRevision = polish.json().progress?.revisions?.[0];
    expect(plRevision).toMatchObject({ text: 'Oddal widok pola bitwy.', origin: 'agent' });
    // One resolved sentence on the wire — the client never has to pick, and never sees a
    // language it did not ask for.
    expect(plRevision.textLocalized).toBeUndefined();
    expect(plRevision.locale).toBeUndefined();

    // A reader in another language gets the agent's own wording rather than Polish they
    // may not read.
    const english = await app.inject({
      method: 'GET',
      url: `/api/submissions/${token}?locale=en`,
      headers: authHeaders,
    });
    expect(english.json().progress?.revisions?.[0]).toMatchObject({ text: 'Zoom out the battlefield.' });

    await app.close();
  });

  it('asks the backend about a quiet job and names the dead session instead of spinning forever', async () => {
    // A session that crashes, times out, or is killed for quota reports nothing on the
    // build channel — the channel only ever carries good news. Without this, the page
    // says "building" until the end of time and the creator has nothing to act on.
    const { githubClient } = createGithubClientStub({ jobId: 77 });
    const { backend } = createBackendStub();
    // Fresh `dispatched` jobs are observed immediately (session boot). First answer
    // advances to building; later answers (after the quiet window) name the death.
    let observeCalls = 0;
    const observe = vi.fn(async (_ref: string, opts: { hasCandidate: boolean }) => {
      observeCalls += 1;
      if (observeCalls === 1) {
        return { state: 'in_progress' as const, hasCandidate: opts.hasCandidate };
      }
      return { state: 'failed' as const, hasCandidate: opts.hasCandidate };
    });
    const clock = { t: Date.now() };
    const { app, authHeaders, store } = await createApp({
      githubClient,
      agentBackend: { ...backend, observe },
      submissionTokenSecret: secret,
      now: () => clock.t,
    });

    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about delivering parcels in space.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    const token = mintToken(job.jobId, secret);

    // Fresh dispatch: observe immediately so `in_progress` advances us to building.
    const early = await app.inject({ method: 'GET', url: `/api/submissions/${token}`, headers: authHeaders });
    expect(early.statusCode).toBe(200);
    expect(observe).toHaveBeenCalledWith('task-1', {
      hasCandidate: false,
      jobId: job.jobId,
      slug: 'a-game',
      roundGeneration: 1,
    });
    expect((await store.getSubmission(job.jobId))?.state).toBe('building');
    expect(early.json().phase).toBe('building');

    // Three minutes of silence is past the window (and past the status cache).
    clock.t += 3 * 60 * 1000;
    const status = await app.inject({ method: 'GET', url: `/api/submissions/${token}`, headers: authHeaders });

    expect(status.statusCode).toBe(200);
    expect(observe).toHaveBeenCalledTimes(2);
    // `failed` projects onto `needs_changes`, and `failure` names what happened —
    // without it the page reads "waiting for your input" about a session that died.
    expect(status.json().status).toBe('needs_changes');
    expect(status.json().failure).toEqual({ reason: 'task_failed' });
    expect((await store.getSubmission(job.jobId))?.state).toBe('failed');

    await app.close();
  });

  it('names a gate bounce so Studio can say why the build needs another round', async () => {
    // Public status collapses `needs_changes` into a label; without `failure` the
    // creator who clicked the notification sees planning notes and an empty foot.
    const { githubClient } = createGithubClientStub({ jobId: 88 });
    const { backend } = createBackendStub();
    const { app, authHeaders, store } = await createApp({
      githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
    });

    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about delivering parcels in space.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    await store.setSubmissionDeliveredVersion(job.jobId, 'v1');
    await store.recordJobTransition(job.jobId, {
      to: 'needs_changes',
      at: new Date().toISOString(),
      by: 'gate',
      reason: 'gate_red',
    });

    const status = await app.inject({
      method: 'GET',
      url: `/api/submissions/${mintToken(job.jobId, secret)}`,
      headers: authHeaders,
    });

    expect(status.statusCode).toBe(200);
    expect(status.json().status).toBe('needs_changes');
    expect(status.json().phase).toBe('needs_changes');
    expect(status.json().failure).toEqual({ reason: 'gate_red' });

    await app.close();
  });

  // The bug this covers was visible to creators and invisible to us: a delivered game
  // whose gate had passed kept showing "delivered, but verification hasn't started —
  // that's on our side" indefinitely. The gate had run and its verdict was in the
  // manifest; the job could not act on it, because `submitted` listed only `gating` as
  // an exit and nothing writes `gating`. The reconciler computed `ready_for_review`,
  // canTransition refused it, and the job sat in `submitted` until the creator gave up.
  it('acts on a gate verdict for a job still sitting in submitted', async () => {
    const { githubClient } = createGithubClientStub({ jobId: 97 });
    const { backend } = createBackendStub();
    const gamesStore = {
      getManifest: async () => ({
        slug: 'space-parcels',
        version: 'v3',
        createdAt: '2026-07-31T10:00:00.000Z',
        jobId: 97,
        roundGeneration: 1,
        sourceFiles: [],
        gate: { green: true, ranAt: '2026-07-31T10:30:00.000Z' },
      }),
    } as unknown as GamesStore;

    const { app, authHeaders, store } = await createApp({
      githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
      agentChannel: { gamesStore },
    });

    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about delivering parcels in space.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');

    // The shape a real delivery leaves behind: the agent channel marked the sources
    // delivered, and the gate wrote its verdict to that version's manifest.
    await store.setSubmissionSlug(job.jobId, 'space-parcels');
    await store.setSubmissionDeliveredVersion(job.jobId, 'v3');
    await store.recordJobTransition(job.jobId, {
      to: 'submitted',
      at: '2026-07-31T10:00:00.000Z',
      by: 'agent',
      reason: 'sources_delivered',
    });

    const status = await app.inject({
      method: 'GET',
      url: `/api/submissions/${mintToken(job.jobId, secret)}`,
      headers: authHeaders,
    });

    expect(status.statusCode).toBe(200);
    expect(status.json().phase).toBe('ready_for_review');
    // And the warning the creator was staring at is gone with the state that caused it.
    expect(status.json().stall).toBeUndefined();

    await app.close();
  });

  it('seals a green preview into a publishable candidate the gate can judge', async () => {
    // A platform round only ever delivers previews (its agents cannot record TRACE.json),
    // so without this the job sits in ready_for_review with no deliveredVersion and the
    // one publish route answers nothing_delivered — unpublishable by anyone.
    const { githubClient } = createGithubClientStub({ jobId: 501 });
    const { backend } = createBackendStub();
    const sealed: Array<{ origin?: string; mode?: string; files: string[] }> = [];
    const gated: Array<{ version: string }> = [];
    const gamesStore = {
      getManifest: async () => ({
        slug: 'space-parcels',
        version: 'v1',
        roundGeneration: 1,
        sourceFiles: ['SPEC.md', 'game.ts', 'GAME.json'],
        previewGate: { green: true, ranAt: '2026-08-24T10:30:00.000Z' },
      }),
      getSourceFile: async (_s: string, _v: string, path: string) => `contents of ${path}`,
      putCandidateSources: async (input: { origin?: string; mode?: string; files: Array<{ path: string }> }) => {
        sealed.push({ origin: input.origin, mode: input.mode, files: input.files.map((f) => f.path) });
        return { version: 'v2-sealed', manifest: {} };
      },
    } as unknown as GamesStore;

    const { app, authHeaders, store } = await createApp({
      githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
      agentChannel: {
        gamesStore,
        onSourcesDelivered: async ({ version }) => {
          gated.push({ version });
          return { buildId: 'build-1' };
        },
      },
    });

    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about delivering parcels in space.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    await store.setSubmissionSlug(job.jobId, 'space-parcels');
    await store.setSubmissionPreviewVersion(job.jobId, 'v1');
    for (const to of ['submitted', 'ready_for_review'] as const) {
      await store.recordJobTransition(job.jobId, {
        to,
        at: new Date().toISOString(),
        by: 'gate',
        reason: to === 'ready_for_review' ? 'gate_green' : 'sources_delivered',
      });
    }

    const token = mintToken(job.jobId, secret);
    const status = await app.inject({ method: 'GET', url: `/api/submissions/${token}`, headers: authHeaders });
    expect(status.json().canSeal).toBe(true);

    const seal = await app.inject({ method: 'POST', url: `/api/submissions/${token}/seal`, headers: authHeaders });

    expect(seal.statusCode).toBe(200);
    expect(seal.json()).toMatchObject({ ok: true, version: 'v2-sealed' });
    // origin drives the gate's golden derivation; publish is the lane being entered.
    expect(sealed[0]).toMatchObject({ origin: 'seal', mode: 'publish' });
    // The landmark declaration the agent had no reason to write.
    expect(sealed[0]?.files).toContain('PLAYTEST.json');
    expect(gated).toEqual([{ version: 'v2-sealed' }]);

    const after = await store.getSubmission(job.jobId);
    expect(after?.deliveredVersion).toBe('v2-sealed');
    // Back into the lane reconcileGateVerdict actually walks.
    expect(after?.state).toBe('submitted');

    // Second press is refused — the round is being gated, which is the truer answer
    // here than "already delivered": the state check is what a double-click hits.
    const again = await app.inject({ method: 'POST', url: `/api/submissions/${token}/seal`, headers: authHeaders });
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ error: 'not_reviewable' });
    expect(sealed).toHaveLength(1);

    await app.close();
  });

  it('claims a seal atomically — two concurrent requests spend only one gate run', async () => {
    const { githubClient } = createGithubClientStub({ jobId: 503 });
    const { backend } = createBackendStub();
    let sealCount = 0;
    const gamesStore = {
      getManifest: async () => ({
        slug: 'space-parcels',
        version: 'v1',
        roundGeneration: 1,
        sourceFiles: ['game.ts', 'PLAYTEST.json'],
        previewGate: { green: true, ranAt: '2026-08-24T10:30:00.000Z' },
      }),
      getSourceFile: async (_s: string, _v: string, path: string) => `contents of ${path}`,
      putCandidateSources: async () => {
        sealCount += 1;
        return { version: `v${sealCount}-sealed`, manifest: {} };
      },
    } as unknown as GamesStore;

    const { app, authHeaders, store } = await createApp({
      githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
      agentChannel: { gamesStore, onSourcesDelivered: async () => ({ buildId: 'build-1' }) },
    });

    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about delivering parcels in space.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    await store.setSubmissionSlug(job.jobId, 'space-parcels');
    await store.setSubmissionPreviewVersion(job.jobId, 'v1');
    for (const to of ['submitted', 'ready_for_review'] as const) {
      await store.recordJobTransition(job.jobId, {
        to,
        at: new Date().toISOString(),
        by: 'gate',
        reason: to === 'ready_for_review' ? 'gate_green' : 'sources_delivered',
      });
    }

    const token = mintToken(job.jobId, secret);
    const [first, second] = await Promise.all([
      app.inject({ method: 'POST', url: `/api/submissions/${token}/seal`, headers: authHeaders }),
      app.inject({ method: 'POST', url: `/api/submissions/${token}/seal`, headers: authHeaders }),
    ]);

    const statuses = [first.statusCode, second.statusCode].sort();
    expect(statuses).toEqual([200, 409]);
    expect(sealCount).toBe(1);

    await app.close();
  });

  it('refuses to seal a preview the gate has not passed', async () => {
    const { githubClient } = createGithubClientStub({ jobId: 502 });
    const { backend } = createBackendStub();
    const putCandidateSources = vi.fn();
    const gamesStore = {
      getManifest: async () => ({
        slug: 'space-parcels',
        version: 'v1',
        sourceFiles: ['game.ts'],
        previewGate: { green: false, ranAt: '2026-08-24T10:30:00.000Z' },
      }),
      getSourceFile: async () => 'x',
      putCandidateSources,
    } as unknown as GamesStore;

    const { app, authHeaders, store } = await createApp({
      githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
      agentChannel: { gamesStore, onSourcesDelivered: async () => ({ buildId: 'b' }) },
    });

    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about delivering parcels in space.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    await store.setSubmissionSlug(job.jobId, 'space-parcels');
    await store.setSubmissionPreviewVersion(job.jobId, 'v1');
    for (const to of ['submitted', 'ready_for_review'] as const) {
      await store.recordJobTransition(job.jobId, {
        to,
        at: new Date().toISOString(),
        by: 'gate',
        reason: to === 'ready_for_review' ? 'gate_green' : 'sources_delivered',
      });
    }

    const seal = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(job.jobId, secret)}/seal`,
      headers: authHeaders,
    });

    expect(seal.statusCode).toBe(409);
    expect(seal.json()).toMatchObject({ error: 'preview_not_green' });
    expect(putCandidateSources).not.toHaveBeenCalled();

    await app.close();
  });

  it('ignores carried-over gate verdicts from an older round', async () => {
    const { githubClient } = createGithubClientStub({ jobId: 99 });
    const { backend } = createBackendStub();
    const getManifest = vi.fn(async (_slug: string, version: string) =>
      version === 'v1'
        ? {
            roundGeneration: 1,
            gate: { green: true, ranAt: '2026-07-31T10:30:00.000Z' },
          }
        : {
            roundGeneration: 2,
            gate: { green: true, ranAt: '2026-08-01T10:30:00.000Z' },
          },
    );
    const gamesStore = { getManifest } as unknown as GamesStore;

    const { app, authHeaders, store } = await createApp({
      githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
      agentChannel: { gamesStore },
    });

    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about delivering parcels in space.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    await store.setSubmissionSlug(job.jobId, 'space-parcels');
    await store.setSubmissionDeliveredVersion(job.jobId, 'v1');
    await store.setSubmissionPreviewVersion(job.jobId, 'v2');
    await store.recordJobTransition(job.jobId, {
      to: 'submitted',
      at: '2026-07-31T10:00:00.000Z',
      by: 'agent',
      reason: 'sources_delivered',
    });
    await store.bumpRoundGeneration(job.jobId);

    const status = await app.inject({
      method: 'GET',
      url: `/api/submissions/${mintToken(job.jobId, secret)}`,
      headers: authHeaders,
    });

    expect(status.statusCode).toBe(200);
    expect(status.json().phase).toBe('ready_for_review');
    expect(getManifest).toHaveBeenCalledWith('space-parcels', 'v2');
    expect(getManifest).not.toHaveBeenCalledWith('space-parcels', 'v1');

    await app.close();
  });

  // mode=preview writes manifest.previewGate, not manifest.gate (arena-brawlers).
  it('acts on a red preview-only gate verdict for a job still sitting in submitted', async () => {
    const { githubClient } = createGithubClientStub({ jobId: 197 });
    const { backend } = createBackendStub();
    const gamesStore = {
      getManifest: async () => ({
        slug: 'arena-brawlers',
        version: 'v3',
        createdAt: '2026-08-09T14:20:00.000Z',
        jobId: 197,
        roundGeneration: 1,
        sourceFiles: [],
        previewGate: {
          green: false,
          ranAt: '2026-08-09T14:22:00.000Z',
          report: "FAIL smoke arena-brawlers\n  - Cannot read properties of undefined (reading 'modules')",
        },
      }),
    } as unknown as GamesStore;

    const { app, authHeaders, store } = await createApp({
      githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
      agentChannel: { gamesStore },
    });

    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about a top-down arena brawler.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');

    await store.setSubmissionSlug(job.jobId, 'arena-brawlers');
    await store.setSubmissionDeliveredVersion(job.jobId, 'v3');
    await store.recordJobTransition(job.jobId, {
      to: 'submitted',
      at: '2026-08-09T14:20:00.000Z',
      by: 'agent',
      reason: 'sources_delivered',
    });

    const status = await app.inject({
      method: 'GET',
      url: `/api/submissions/${mintToken(job.jobId, secret)}`,
      headers: authHeaders,
    });

    expect(status.statusCode).toBe(200);
    // Never `ready_for_review` — a preview pass is not publish readiness.
    expect(status.json().phase).toBe('needs_changes');
    expect(status.json().failure).toEqual({ reason: 'gate_red' });

    await app.close();
  });

  // Mirror case: a green preview must never promote the round.
  it('does not promote a job on a green preview-only gate verdict', async () => {
    const { githubClient } = createGithubClientStub({ jobId: 198 });
    const { backend } = createBackendStub();
    const gamesStore = {
      getManifest: async () => ({
        slug: 'arena-brawlers',
        version: 'v4',
        createdAt: '2026-08-09T14:20:00.000Z',
        jobId: 198,
        roundGeneration: 1,
        sourceFiles: [],
        previewGate: { green: true, ranAt: '2026-08-09T14:22:00.000Z' },
      }),
    } as unknown as GamesStore;

    const { app, authHeaders, store } = await createApp({
      githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
      agentChannel: { gamesStore },
    });

    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about a top-down arena brawler.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');

    await store.setSubmissionSlug(job.jobId, 'arena-brawlers');
    await store.setSubmissionDeliveredVersion(job.jobId, 'v4');
    await store.recordJobTransition(job.jobId, {
      to: 'submitted',
      at: '2026-08-09T14:20:00.000Z',
      by: 'agent',
      reason: 'sources_delivered',
    });

    const status = await app.inject({
      method: 'GET',
      url: `/api/submissions/${mintToken(job.jobId, secret)}`,
      headers: authHeaders,
    });

    expect(status.statusCode).toBe(200);
    // `phase` is the raw job state; `status` is the public projection.
    expect(status.json().phase).toBe('submitted');
    expect(status.json().status).toBe('building');

    await app.close();
  });

  it('summarizes recent versions from listVersions, newest first', async () => {
    const { githubClient } = createGithubClientStub({ jobId: 731 });
    const { backend } = createBackendStub();
    const gamesStore = {
      getManifest: async () => null,
      listVersions: async () => [
        {
          slug: 'space-parcels',
          version: 'v3',
          createdAt: '2026-08-10T09:00:00.000Z',
          jobId: 731,
          roundGeneration: 1,
          sourceFiles: [],
          deliveryMode: 'preview',
          previewGate: { green: false, ranAt: '2026-08-10T09:02:00.000Z', status: 'kit_outdated' },
        },
        {
          slug: 'space-parcels',
          version: 'v2',
          createdAt: '2026-08-10T08:00:00.000Z',
          jobId: 731,
          roundGeneration: 1,
          sourceFiles: [],
          gate: { green: true, ranAt: '2026-08-10T08:02:00.000Z' },
        },
        {
          slug: 'space-parcels',
          version: 'v1',
          createdAt: '2026-08-10T07:00:00.000Z',
          jobId: 731,
          roundGeneration: 1,
          sourceFiles: [],
        },
      ],
    } as unknown as GamesStore;

    const { app, authHeaders, store } = await createApp({
      githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
      agentChannel: { gamesStore },
    });

    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about delivering parcels in space.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    await store.setSubmissionSlug(job.jobId, 'space-parcels');
    await store.setSubmissionDeliveredVersion(job.jobId, 'v1');

    const status = await app.inject({
      method: 'GET',
      url: `/api/submissions/${mintToken(job.jobId, secret)}`,
      headers: authHeaders,
    });

    expect(status.statusCode).toBe(200);
    // `total` is the bar's denominator: preview 6, publish 12.
    expect(status.json().recentBuilds).toEqual([
      {
        version: 'v3',
        createdAt: '2026-08-10T09:00:00.000Z',
        mode: 'preview',
        verdict: 'red',
        status: 'kit_outdated',
        total: 6,
        finishedInMs: 120000,
        fileCount: 0,
        jobId: 731,
      },
      {
        version: 'v2',
        createdAt: '2026-08-10T08:00:00.000Z',
        mode: 'publish',
        verdict: 'green',
        total: 12,
        finishedInMs: 120000,
        fileCount: 0,
        jobId: 731,
      },
      {
        version: 'v1',
        createdAt: '2026-08-10T07:00:00.000Z',
        mode: 'publish',
        verdict: 'pending',
        total: 12,
        fileCount: 0,
        jobId: 731,
      },
    ]);
    expect(status.json().totalBuildsCount).toBe(3);

    await app.close();
  });

  it('fills an empty build changelog from the round done event', async () => {
    const { githubClient } = createGithubClientStub({ jobId: 732 });
    const { backend } = createBackendStub();
    let jobId = 732;
    const gamesStore = {
      getManifest: async () => null,
      listVersions: async () => [
        {
          slug: 'space-parcels',
          version: 'v1',
          createdAt: '2026-08-10T07:00:00.000Z',
          jobId,
          sourceFiles: ['game.ts'],
        },
      ],
    } as unknown as GamesStore;

    const { app, authHeaders, store } = await createApp({
      githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
      agentChannel: { gamesStore },
    });

    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about delivering parcels in space.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    jobId = job.jobId;
    await store.setSubmissionSlug(job.jobId, 'space-parcels');
    await store.appendBuildEvent(job.jobId, {
      kind: 'done',
      text: 'Added a second lane of traffic.',
      textLocalized: 'Dodałem drugi pas ruchu.',
      locale: 'pl',
      createdAt: '2026-08-10T07:05:00.000Z',
    });

    const status = await app.inject({
      method: 'GET',
      url: `/api/submissions/${mintToken(job.jobId, secret)}?locale=pl`,
      headers: authHeaders,
    });

    expect(status.statusCode).toBe(200);
    expect(status.json().recentBuilds[0]).toMatchObject({
      version: 'v1',
      summary: 'Dodałem drugi pas ruchu.',
    });

    await app.close();
  });

  it('emits a stable delivery gate verdict once per version/status', async () => {
    // Green preview stays submitted so dedupe can re-poll.
    const { githubClient } = createGithubClientStub({ jobId: 727 });
    const { backend } = createBackendStub();
    const gamesStore = {
      getManifest: async () => ({
        slug: 'space-parcels',
        version: 'v3',
        createdAt: '2026-08-09T22:00:00.000Z',
        jobId: 727,
        roundGeneration: 1,
        sourceFiles: [],
        previewGate: { green: true, ranAt: '2026-08-09T22:30:00.000Z' },
      }),
    } as unknown as GamesStore;
    const clock = { t: Date.UTC(2026, 7, 9, 22, 0, 0) };

    const { app, authHeaders, store } = await createApp({
      githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
      agentChannel: { gamesStore },
      now: () => clock.t,
    });
    const infoSpy = vi.spyOn(app.log, 'info');

    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about delivering parcels in space.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    await store.setSubmissionSlug(job.jobId, 'space-parcels');
    await store.setSubmissionPreviewVersion(job.jobId, 'v3');
    await store.recordDispatch(job.jobId, { backend: 'managed:anthropic', ref: 'sess-1' });
    await store.recordJobTransition(job.jobId, {
      to: 'submitted',
      at: '2026-08-09T22:00:00.000Z',
      by: 'agent',
      reason: 'sources_delivered',
    });

    const token = mintToken(job.jobId, secret);
    const first = await app.inject({
      method: 'GET',
      url: `/api/submissions/${token}`,
      headers: authHeaders,
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().phase).toBe('submitted');

    const gateCalls = infoSpy.mock.calls.filter((call) => call[1] === DELIVERY_GATE_VERDICT_MSG);
    expect(gateCalls).toHaveLength(1);
    expect(gateCalls[0]![0]).toEqual({
      delivery: {
        jobId: job.jobId,
        roundGeneration: 1,
        builder: 'managed',
        mode: 'preview',
        outcome: 'passed',
        status: 'preview_passed',
      },
    });
    expect(JSON.stringify(gateCalls[0]![0])).not.toMatch(/slug|prompt|uid|game\.ts|SPEC/);

    // Past the 60s status cache so reconcile runs again.
    clock.t += 61_000;
    const second = await app.inject({
      method: 'GET',
      url: `/api/submissions/${token}`,
      headers: authHeaders,
    });
    expect(second.statusCode).toBe(200);
    expect(infoSpy.mock.calls.filter((call) => call[1] === DELIVERY_GATE_VERDICT_MSG)).toHaveLength(1);
    expect((await store.getSubmission(job.jobId))?.roundLastGateMetricKey).toBe('v3:preview_passed');

    await app.close();
  });

  it('posts the gate capture screenshot into the build thread on reconcile', async () => {
    const { githubClient } = createGithubClientStub({ jobId: 197 });
    const { backend } = createBackendStub();
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x11]);
    const gamesStore = {
      getManifest: async () => ({
        slug: 'space-parcels',
        version: 'v3',
        createdAt: '2026-07-31T10:00:00.000Z',
        jobId: 197,
        roundGeneration: 1,
        sourceFiles: [],
        gate: {
          green: true,
          ranAt: '2026-07-31T10:30:00.000Z',
          screenshot: 'media/opening.png',
        },
      }),
      getDerivedArtifact: async (_slug: string, _version: string, name: string) =>
        name === 'media/opening.png' ? png : null,
    } as unknown as GamesStore;

    const { app, authHeaders, store } = await createApp({
      githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
      agentChannel: { gamesStore },
    });

    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about delivering parcels in space.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    await store.setSubmissionSlug(job.jobId, 'space-parcels');
    await store.setSubmissionDeliveredVersion(job.jobId, 'v3');
    await store.recordJobTransition(job.jobId, {
      to: 'submitted',
      at: '2026-07-31T10:00:00.000Z',
      by: 'agent',
      reason: 'sources_delivered',
    });

    await app.inject({
      method: 'GET',
      url: `/api/submissions/${mintToken(job.jobId, secret)}`,
      headers: authHeaders,
    });

    const shots = await store.listBuildShots(job.jobId);
    expect(shots).toHaveLength(1);
    expect(shots[0]?.label).toBe('Platform check');
    // Reconcile is once-only: a second poll must not double-post the frame.
    await app.inject({
      method: 'GET',
      url: `/api/submissions/${mintToken(job.jobId, secret)}`,
      headers: authHeaders,
    });
    expect(await store.countBuildShots(job.jobId)).toBe(1);

    await app.close();
  });

  // The other half of the same path, and the one that only became reachable once the
  // gate verdict could land at all: a red gate does not necessarily end the round. The
  // session that delivered is usually still alive, and `mustFixGate` tells it to fix the
  // cause and deliver again with no new dispatch. That repaired upload has to be able to
  // re-enter `submitted`, or its green verdict sits in a manifest nobody reads and the
  // creator is asked to start a round the agent already finished.
  it('reads the verdict on a redelivery the agent made after a gate refusal', async () => {
    const { githubClient } = createGithubClientStub({ jobId: 98 });
    const { backend } = createBackendStub();
    const gamesStore = {
      // Version-aware on purpose: v3 is what the gate refused, v4 is the repair.
      getManifest: async (_slug: string, version: string) => ({
        slug: 'space-parcels',
        version,
        createdAt: '2026-07-31T10:00:00.000Z',
        jobId: 98,
        roundGeneration: 1,
        sourceFiles: [],
        gate:
          version === 'v3'
            ? { green: false, ranAt: '2026-07-31T10:30:00.000Z', report: 'trace diff' }
            : { green: true, ranAt: '2026-07-31T11:15:00.000Z' },
      }),
    } as unknown as GamesStore;

    // The status answer is cached for 60s, so the two polls below need to be further
    // apart than that — otherwise the second reads the first's answer and this proves
    // nothing about the transition it exists to check.
    const clock = { t: Date.now() };
    const { app, authHeaders, store } = await createApp({
      githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
      agentChannel: { gamesStore },
      now: () => clock.t,
    });

    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about delivering parcels in space.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    const url = `/api/submissions/${mintToken(job.jobId, secret)}`;

    await store.setSubmissionSlug(job.jobId, 'space-parcels');
    await store.setSubmissionDeliveredVersion(job.jobId, 'v3');
    await store.recordJobTransition(job.jobId, {
      to: 'submitted',
      at: '2026-07-31T10:00:00.000Z',
      by: 'agent',
      reason: 'sources_delivered',
    });

    const refused = await app.inject({ method: 'GET', url, headers: authHeaders });
    expect(refused.json().phase).toBe('needs_changes');

    // The repair, recorded the way agent-channel records one — which it can only do when
    // the transition is legal from where the refusal left the job.
    expect(canTransition('needs_changes', 'submitted')).toBe(true);
    clock.t += 61_000;
    await store.setSubmissionDeliveredVersion(job.jobId, 'v4');
    await store.recordJobTransition(job.jobId, {
      to: 'submitted',
      at: '2026-07-31T11:00:00.000Z',
      by: 'agent',
      reason: 'sources_delivered',
    });

    const repaired = await app.inject({ method: 'GET', url, headers: authHeaders });
    expect(repaired.json().phase).toBe('ready_for_review');

    await app.close();
  });

  it('reports the job phase alongside the status, so the page can say which wait this is', async () => {
    // `toSubmissionStatus` is lossy on purpose — `gating` and `building` arrive as one
    // word, and `ready_for_review` (delivered, checked, waiting on us) arrives as the
    // same "in_review" the page described as "checks are running". The finer state rides
    // along so the sentence under the timeline can be true for hours at a time.
    const { githubClient } = createGithubClientStub({ jobId: 91 });
    const { backend } = createBackendStub();
    const { app, authHeaders, store } = await createApp({
      githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
    });

    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about delivering parcels in space.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    await store.recordJobTransition(job.jobId, {
      to: 'ready_for_review',
      at: new Date().toISOString(),
      by: 'system',
      reason: 'gate_green',
    });

    const status = await app.inject({
      method: 'GET',
      url: `/api/submissions/${mintToken(job.jobId, secret)}`,
      headers: authHeaders,
    });

    expect(status.statusCode).toBe(200);
    expect(status.json().status).toBe('in_review');
    expect(status.json().phase).toBe('ready_for_review');
    expect(status.json().draftOrigin).toBeUndefined();

    await app.close();
  });

  it('marks a remix-saved draft so Studio can skip gate-green copy', async () => {
    const { githubClient } = createGithubClientStub({ jobId: 92 });
    const { backend } = createBackendStub();
    const { app, authHeaders, store } = await createApp({
      githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
    });

    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A remix', concept: 'A sufficiently long concept about a private remix draft.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    await store.recordJobTransition(job.jobId, {
      to: 'queued',
      at: new Date().toISOString(),
      by: 'creator',
      reason: 'remix_saved',
    });
    await store.recordJobTransition(job.jobId, {
      to: 'ready_for_review',
      at: new Date().toISOString(),
      by: 'creator',
      reason: 'remix_saved',
    });

    const status = await app.inject({
      method: 'GET',
      url: `/api/submissions/${mintToken(job.jobId, secret)}`,
      headers: authHeaders,
    });

    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({
      status: 'in_review',
      phase: 'ready_for_review',
      draftOrigin: 'remix',
    });

    await app.close();
  });

  it('learns the branch a dispatch is working on, so a revision resumes it', async () => {
    // The task API answers `startTask` before the agent has a branch, so this is the
    // only moment it can be learned. Without it `resume` degrades to a fresh dispatch
    // on a new branch and the creator's game silently starts again from nothing.
    const { githubClient } = createGithubClientStub({ jobId: 77 });
    const { backend } = createBackendStub();
    const observe = vi.fn(async () => ({
      state: 'in_progress' as const,
      hasCandidate: false,
      workspace: 'copilot/tv-tycoon',
    }));
    const { app, authHeaders, store } = await createApp({
      githubClient,
      agentBackend: { ...backend, observe },
      submissionTokenSecret: secret,
    });

    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about delivering parcels in space.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    expect((await store.getSubmission(job.jobId))?.dispatch?.workspace).toBe('copilot/x');

    // A job whose branch is unknown is asked about on the very next poll, however
    // recently it spoke: without the branch a revision cannot resume the work at all.
    await store.setDispatchWorkspace(job.jobId, '');
    const status = await app.inject({
      method: 'GET',
      url: `/api/submissions/${mintToken(job.jobId, secret)}`,
      headers: authHeaders,
    });

    expect(status.statusCode).toBe(200);
    expect(observe).toHaveBeenCalled();
    const dispatch = (await store.getSubmission(job.jobId))?.dispatch;
    expect(dispatch?.workspace).toBe('copilot/tv-tycoon');
    // Learning the branch is not another agent session, and counting it as one would
    // inflate the per-build cost figures the ref list exists to support.
    expect(dispatch?.refs).toEqual(['task-1']);

    await app.close();
  });

  it('deletes the spent workspace once a new round has one of its own', async () => {
    // Branches are per-round and disposable: the game lives in the store, so a branch
    // that has been superseded is litter in a repository people also read. Only applies
    // when the store actually has the game — an undelivered round keeps its branch.
    const { githubClient } = createGithubClientStub({ jobId: 77 });
    const { backend } = createBackendStub();
    const cleanup = vi.fn(async () => {});
    const { app, authHeaders, store } = await createApp({
      githubClient,
      agentBackend: { ...backend, cleanup },
      submissionTokenSecret: secret,
    });

    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about delivering parcels in space.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    await store.setDispatchWorkspace(job.jobId, 'copilot/old');
    await store.setSubmissionDeliveredVersion(job.jobId, 'v1');
    await store.recordJobTransition(job.jobId, {
      to: 'ready_for_review',
      at: new Date().toISOString(),
      by: 'reconciler',
      reason: 'gate_green',
    });

    await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(job.jobId, secret)}/feedback`,
      headers: authHeaders,
      payload: { feedback: 'Make the parcels bigger and the asteroids slower.' },
    });

    // The stub's resume reports a different branch, which is the point: the old one is
    // spent the moment the new round has its own.
    expect(cleanup).toHaveBeenCalledWith(expect.objectContaining({ workspace: 'copilot/old' }));

    await app.close();
  });

  it('starts another round when the creator sends feedback after a failed one', async () => {
    // Retry is not a separate feature: feedback after a dead round *is* the retry.
    const { githubClient } = createGithubClientStub({ jobId: 77 });
    const { backend, briefs } = createBackendStub();
    const { app, authHeaders, store } = await createApp({
      githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
    });

    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about delivering parcels in space.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    await store.recordJobTransition(job.jobId, {
      to: 'failed',
      at: new Date().toISOString(),
      by: 'reconciler',
      reason: 'task_failed',
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(job.jobId, secret)}/feedback`,
      headers: authHeaders,
      payload: { feedback: 'Please pick this up again and finish the delivery.' },
    });

    expect(response.statusCode).toBe(200);
    expect(briefs.at(-1)?.feedback).toContain('pick this up again');
    // The dead round must not orphan the job: the retry hands it to an agent again.
    // `dispatched` until the session is observed `in_progress`.
    expect((await store.getSubmission(job.jobId))?.state).toBe('dispatched');
    // Nothing to report when the round did start — the field exists to say otherwise.
    expect(response.json()).not.toHaveProperty('roundStarted');

    await app.close();
  });

  it('says so when the message was kept but no round could start', async () => {
    // The failure this is written for: GitHub answers an exhausted premium-request
    // allowance with 412, `resumeBuild` logs it and swallows it, and the creator is left
    // with a thread showing their message and a game that never moves again. It cost one
    // real creator three hours of watching a build that was never running.
    //
    // The previous session must already be dead — while one is live we only queue the
    // inbox and never call resume, so capacity is not the question.
    const { githubClient } = createGithubClientStub({ jobId: 77 });
    const { backend } = createBackendStub();
    backend.resume = async () => {
      throw Object.assign(new Error('agent tasks POST 412: insufficient premium quota to create assignment'), {
        name: 'AgentTasksError',
        status: 412,
      });
    };
    const { app, authHeaders, store } = await createApp({
      githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
      chatAgent: { decide: async () => ({ kind: 'build' as const, text: 'On it!' }) },
    });

    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about delivering parcels in space.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    await store.recordJobTransition(job.jobId, {
      to: 'failed',
      at: new Date().toISOString(),
      by: 'reconciler',
      reason: 'task_failed',
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(job.jobId, secret)}/feedback`,
      headers: authHeaders,
      payload: { feedback: 'Please make the asteroids slower and the parcels bigger.' },
    });

    // Accepted — the note is kept and queued, so it is not the creator's to send again —
    // but the answer says plainly that nothing is running behind it, and says which kind
    // of nothing: out of capacity is a billing problem, not a broken game.
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, roundStarted: false, reason: 'no_capacity' });
    const messages = await store.listCreatorMessages(job.jobId);
    expect(messages).not.toHaveLength(0);
    // A failed dispatch must not leave a transcript claiming it started.
    expect(messages.some((message) => message.origin === 'studio_ack')).toBe(false);
    // And the job must not claim to be building when no session exists.
    expect((await store.getSubmission(job.jobId))?.state).not.toBe('building');

    await app.close();
  });

  it('abandons a native job without closing anything on GitHub', async () => {
    const { githubClient, closeIssue, closePullRequest } = createGithubClientStub({ jobId: 77 });
    const { backend } = createBackendStub();
    const { app, authHeaders, store } = await createApp({
      githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
    });

    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about delivering parcels in space.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');

    const response = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(job.jobId, secret)}/abandon`,
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(200);
    expect(closeIssue).not.toHaveBeenCalled();
    expect(closePullRequest).not.toHaveBeenCalled();
    expect((await store.getSubmission(job.jobId))?.state).toBe('canceled');

    await app.close();
  });

  it('rate limits submissions to 5 per hour per IP', async () => {
    const { githubClient } = createGithubClientStub({});
    let currentTime = 1_000_000;
    const { app, authHeaders } = await createApp({
      githubClient,
      submissionTokenSecret: secret,
      now: () => currentTime,
      dailySubmissionQuota: 100,
    });

    for (let index = 0; index < 5; index += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/submissions',
        headers: authHeaders,
        payload: {
          title: `Game title ${index}`,
          concept: 'A concept long enough to pass validation for this submission endpoint.',
        },
      });
      expect(response.statusCode).toBe(200);
    }

    const limited = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: {
        title: 'Game title 6',
        concept: 'A concept long enough to pass validation for this submission endpoint.',
      },
    });
    expect(limited.statusCode).toBe(429);

    currentTime += 60 * 60 * 1000;
    const reset = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: {
        title: 'Game title 7',
        concept: 'A concept long enough to pass validation for this submission endpoint.',
      },
    });
    expect(reset.statusCode).toBe(200);

    await app.close();
  });

  it('rejects invalid status tokens', async () => {
    const { githubClient } = createGithubClientStub({});
    const { app } = await createApp({ githubClient, submissionTokenSecret: secret });
    const response = await app.inject({ method: 'GET', url: '/api/submissions/not-a-token' });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'invalid submission token' });
    await app.close();
  });
});

const sampleSources: GameSources = {
  indexHtml: '<canvas id="game" width="100" height="100"></canvas>',
  gameJs: "const c = document.getElementById('game').getContext('2d'); c.fillRect(0, 0, 10, 10);",
  styleCss: 'body { margin: 0; }',
  title: 'Bubble Pop Rush',
};

describe('playing an unpublished game at its permalink', () => {
  /**
   * A game answers at `/play/<slug>` from the moment it is submitted. Who that includes
   * before it is published is the creator's decision, and off is the default — the whole
   * point of the switch. These pin both halves, because the failure modes are opposite:
   * a leak on one side, and a creator locked out of their own game on the other.
   */
  async function draftApp() {
    const store = new InMemoryStore();
    const jobId = 1_000_077;
    await store.upsertUser({ uid: 'g:test-user' });
    await store.upsertUser({ uid: 'g:someone-else' });
    await store.createSubmission(jobId, 'g:test-user', 'TV Tycoon');
    await store.setSubmissionSlug(jobId, 'tv-tycoon');
    await store.setSubmissionDeliveredVersion(jobId, 'v1');

    const gamesStore = {
      getDerivedArtifact: async (_s: string, _v: string, name: string) =>
        name === 'bundle.html' ? Buffer.from('<!doctype html><title>TV Tycoon</title><canvas></canvas>') : null,
    } as unknown as GamesStore;

    // The catalog knows nothing about it: an unpublished game is in no catalog and no
    // rail, so the link is the only way in — which is what makes one switch enough.
    const { githubClient } = createGithubClientStub({ catalog: [] });
    const { app, authHeaders } = await createApp({
      store,
      githubClient,
      submissionTokenSecret: secret,
      agentChannel: { gamesStore },
    });
    return { app, authHeaders, store, jobId };
  }

  it('lets the creator play their own game before anyone else can', async () => {
    const { app, authHeaders } = await draftApp();

    const mine = await app.inject({ method: 'GET', url: '/api/games/tv-tycoon', headers: authHeaders });
    expect(mine.statusCode).toBe(200);
    expect(mine.json()).toMatchObject({ slug: 'tv-tycoon', title: 'TV Tycoon' });

    // Sharing is off, so it does not exist for anybody else — including signed-in
    // visitors, who used to be able to read any draft whose slug they knew.
    const stranger = await app.inject({
      method: 'GET',
      url: '/api/games/tv-tycoon',
      headers: getAuthHeaders('g:someone-else'),
    });
    expect(stranger.statusCode).toBe(404);

    const anonymous = await app.inject({ method: 'GET', url: '/api/games/tv-tycoon' });
    expect(anonymous.statusCode).toBe(404);

    await app.close();
  });

  it('opens the same permalink to everyone once the creator shares it, and closes it again', async () => {
    const { app, authHeaders, jobId } = await draftApp();

    const on = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(jobId, secret)}/share`,
      headers: authHeaders,
      payload: { shared: true },
    });
    expect(on.statusCode).toBe(200);
    expect(on.json()).toEqual({ shared: true, slug: 'tv-tycoon' });

    // Anyone with the link, signed in or not: it is the game's ordinary permalink, the
    // same one it keeps once published, so there is nothing to re-send later.
    expect((await app.inject({ method: 'GET', url: '/api/games/tv-tycoon' })).statusCode).toBe(200);

    const off = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(jobId, secret)}/share`,
      headers: authHeaders,
      payload: { shared: false },
    });
    expect(off.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/games/tv-tycoon' })).statusCode).toBe(404);

    await app.close();
  });

  it('will not let a link-holder decide who else can see the game', async () => {
    // The token is a bearer capability that gets shared around by design. Changing who
    // may see the game is the creator's alone, checked against the store — the same rule
    // abandoning follows, and for the same reason.
    const { app, jobId } = await draftApp();

    const res = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(jobId, secret)}/share`,
      headers: getAuthHeaders('g:someone-else'),
      payload: { shared: true },
    });

    expect(res.statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/games/tv-tycoon' })).statusCode).toBe(404);

    await app.close();
  });

  it('stops serving a build its creator abandoned, to them as well', async () => {
    const { app, authHeaders, store, jobId } = await draftApp();
    await store.setDraftShared(jobId, new Date().toISOString());
    await store.setSubmissionAbandoned(jobId, new Date().toISOString());

    expect((await app.inject({ method: 'GET', url: '/api/games/tv-tycoon' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/games/tv-tycoon', headers: authHeaders })).statusCode).toBe(
      404,
    );

    await app.close();
  });
});

describe('submission preview route', () => {
  it('returns 503 when submissions are not configured', async () => {
    const app = await buildApp({ submissionRoutes: { githubToken: undefined, submissionTokenSecret: undefined } });
    const res = await app.inject({ method: 'GET', url: '/api/submissions/token/preview', headers: getAuthHeaders() });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('rejects an invalid token with 400', async () => {
    const { githubClient } = createGithubClientStub({});
    const { app, authHeaders } = await createApp({ githubClient, submissionTokenSecret: secret });
    const res = await app.inject({ method: 'GET', url: '/api/submissions/not-a-token/preview', headers: authHeaders });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('previews a native job from its delivered version, with no pull request to read', async () => {
    // The regression this exists for: preview used to resolve through findLinkedPR, and
    // native jobs open no PR — so every creator watched an hour of build activity behind
    // "this game isn't available yet".
    const store = new InMemoryStore();
    const jobId = 1_000_042;
    await store.upsertUser({ uid: 'g:test-user' });
    await store.createSubmission(jobId, 'g:test-user', 'TV Tycoon');
    await store.setSubmissionSlug(jobId, 'tv-tycoon');
    await store.setSubmissionDeliveredVersion(jobId, 'v20260730T132921286Z-1592fc');

    // The gate's bundle, not the raw sources: game.ts is TypeScript importing GameKit
    // modules, so inlining it would serve a page that loads and does nothing.
    const gamesStore = {
      getDerivedArtifact: async (_s: string, _v: string, name: string) =>
        name === 'bundle.html' ? Buffer.from('<!doctype html><title>TV Tycoon</title><canvas></canvas>') : null,
    } as unknown as GamesStore;

    const { githubClient, findLinkedPR } = createGithubClientStub({});
    const { app, authHeaders } = await createApp({
      store,
      githubClient,
      submissionTokenSecret: secret,
      agentChannel: { gamesStore },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/submissions/${mintToken(jobId, secret)}/preview`,
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ slug: 'tv-tycoon', title: 'TV Tycoon' });
    // And it never asked GitHub, which is the point: the delivered candidate is the
    // same tree the gate checks, so the creator plays exactly what gets judged.
    expect(findLinkedPR).not.toHaveBeenCalled();

    await app.close();
  });

  it('serves a requested version override when specified in the query parameter', async () => {
    const store = new InMemoryStore();
    const jobId = 1_000_078;
    await store.upsertUser({ uid: 'g:test-user' });
    await store.createSubmission(jobId, 'g:test-user', 'TV Tycoon');
    await store.setSubmissionSlug(jobId, 'tv-tycoon');
    await store.setSubmissionDeliveredVersion(jobId, 'v2');

    const gamesStore = {
      getDerivedArtifact: async (_s: string, version: string, name: string) =>
        version === 'v1' && name === 'bundle.html'
          ? Buffer.from('<!doctype html><title>TV Tycoon v1</title><canvas></canvas>')
          : version === 'v2' && name === 'bundle.html'
            ? Buffer.from('<!doctype html><title>TV Tycoon v2</title><canvas></canvas>')
            : null,
    } as unknown as GamesStore;

    const { githubClient } = createGithubClientStub({});
    const { app, authHeaders } = await createApp({
      store,
      githubClient,
      submissionTokenSecret: secret,
      agentChannel: { gamesStore },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/submissions/${mintToken(jobId, secret)}/preview?version=v1`,
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      slug: 'tv-tycoon',
      title: 'TV Tycoon',
      html: expect.stringContaining('TV Tycoon v1'),
    });

    await app.close();
  });

  it('does not fall through to a second send after serving a stored draft', async () => {
    // Fastify 5 Reply is a thenable. Awaiting `return reply.send(...)` from an async
    // helper resolves to undefined, so the old `if (stored) return stored` fell through
    // and tried to send again ("Reply was already sent"). Live Studio previews logged
    // served → "no delivery yet… last known draft" → already-sent on every hit.
    const store = new InMemoryStore();
    const jobId = 1_000_047;
    await store.upsertUser({ uid: 'g:test-user' });
    await store.createSubmission(jobId, 'g:test-user', 'TV Tycoon');
    await store.setSubmissionSlug(jobId, 'tv-tycoon');
    await store.setSubmissionDeliveredVersion(jobId, 'v20260804T154320637Z-d53599');

    const getDerivedArtifact = vi.fn(async (_s: string, _v: string, name: string) =>
      name === 'preview.html' ? Buffer.from('<!doctype html><title>TV Tycoon</title><canvas></canvas>') : null,
    );
    const gamesStore = { getDerivedArtifact } as unknown as GamesStore;
    const { githubClient } = createGithubClientStub({});
    const logLines: string[] = [];
    const app = await buildApp({
      store,
      sessionSecret,
      logger: {
        level: 'warn',
        stream: {
          write(chunk: string) {
            logLines.push(chunk);
          },
        },
      },
      submissionRoutes: {
        githubToken: 'token',
        submissionTokenSecret: secret,
        gamesRepo: repo,
        githubClient,
        agentChannel: { gamesStore },
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/submissions/${mintToken(jobId, secret)}/preview`,
      headers: getAuthHeaders(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ slug: 'tv-tycoon', title: 'TV Tycoon' });
    expect(getDerivedArtifact).toHaveBeenCalled();
    const joined = logLines.join('\n');
    expect(joined).not.toMatch(/no delivery yet for native job/i);
    expect(joined).not.toMatch(/already sent/i);

    await app.close();
  });

  it('shows the creator a build the gate refused, rather than nothing at all', async () => {
    // The regression this exists for, found on a real game: the gate went red, a red run
    // stored no artifacts, and the preview only ever read `bundle.html` — so a build that
    // had finished reached the studio as an empty panel that explained nothing. Whether a
    // candidate may be *published* is a different question from whether the person who
    // asked for it may look at it.
    const store = new InMemoryStore();
    const jobId = 1_000_046;
    await store.upsertUser({ uid: 'g:test-user' });
    await store.createSubmission(jobId, 'g:test-user', 'TV Tycoon');
    await store.setSubmissionSlug(jobId, 'tv-tycoon');
    await store.setSubmissionDeliveredVersion(jobId, 'v20260730T193202008Z-ca16cf');

    const gamesStore = {
      getDerivedArtifact: async (_s: string, _v: string, name: string) =>
        name === 'preview.html' ? Buffer.from('<!doctype html><title>TV Tycoon</title><canvas></canvas>') : null,
    } as unknown as GamesStore;

    const { githubClient } = createGithubClientStub({});
    const { app, authHeaders } = await createApp({
      store,
      githubClient,
      submissionTokenSecret: secret,
      agentChannel: { gamesStore },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/submissions/${mintToken(jobId, secret)}/preview`,
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ slug: 'tv-tycoon', title: 'TV Tycoon' });

    await app.close();
  });

  it('does not report a broken preview as one that has not started', async () => {
    // A delivered job whose sources will not read is a failure, not a state. Saying
    // "not yet" to a creator whose game was delivered an hour ago sends them back to
    // waiting for something that is never coming, and hides the fault from us too.
    const store = new InMemoryStore();
    const jobId = 1_000_044;
    await store.upsertUser({ uid: 'g:test-user' });
    await store.createSubmission(jobId, 'g:test-user', 'Broken');
    await store.setSubmissionSlug(jobId, 'broken-game');
    await store.setSubmissionDeliveredVersion(jobId, 'v1');

    const gamesStore = {
      getDerivedArtifact: async () => {
        throw new Error('games store read of bundle.html failed: 503');
      },
    } as unknown as GamesStore;

    const { app, authHeaders } = await createApp({
      store,
      githubClient: createGithubClientStub({}).githubClient,
      submissionTokenSecret: secret,
      agentChannel: { gamesStore },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/submissions/${mintToken(jobId, secret)}/preview`,
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(502);
    await app.close();
  });

  it('waits rather than guessing when the gate has not bundled a delivery yet', async () => {
    // Delivered but not yet gated is a real intermediate state, and the honest answer is
    // "nothing to play". Assembling something from the raw sources instead would serve a
    // page that loads and is dead — worse than saying nothing is ready, because it reads
    // as the creator's game being broken.
    const store = new InMemoryStore();
    const jobId = 1_000_045;
    await store.upsertUser({ uid: 'g:test-user' });
    await store.createSubmission(jobId, 'g:test-user', 'Not gated yet');
    await store.setSubmissionSlug(jobId, 'ungated-game');
    await store.setSubmissionDeliveredVersion(jobId, 'v1');

    const gamesStore = { getDerivedArtifact: async () => null } as unknown as GamesStore;

    const { app, authHeaders } = await createApp({
      store,
      githubClient: createGithubClientStub({}).githubClient,
      submissionTokenSecret: secret,
      agentChannel: { gamesStore },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/submissions/${mintToken(jobId, secret)}/preview`,
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(409);
    await app.close();
  });

  it('says a deployment cannot preview at all rather than implying it might later', async () => {
    // No games store means no delivery can ever land and no PR to fall back to, so a
    // native job here is permanently unpreviewable. 409 would promise a creator
    // something that is never coming — the same lie as reporting a failure as pending,
    // told to whoever is running the deployment instead.
    const store = new InMemoryStore();
    const jobId = 1_000_046;
    await store.upsertUser({ uid: 'g:test-user' });
    await store.createSubmission(jobId, 'g:test-user', 'No store here');

    const { app, authHeaders } = await createApp({
      store,
      githubClient: createGithubClientStub({}).githubClient,
      submissionTokenSecret: secret,
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/submissions/${mintToken(jobId, secret)}/preview`,
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('tells a native job with nothing delivered yet that there is nothing to play', async () => {
    // Honest rather than a 502: before the first delivery there genuinely is no game.
    // The store is configured here — that is what makes this "not yet" rather than
    // "never", and the difference is the point.
    const store = new InMemoryStore();
    const jobId = 1_000_043;
    await store.upsertUser({ uid: 'g:test-user' });
    await store.createSubmission(jobId, 'g:test-user', 'Not yet');
    const { app, authHeaders } = await createApp({
      store,
      githubClient: createGithubClientStub({}).githubClient,
      submissionTokenSecret: secret,
      agentChannel: { gamesStore: { getDerivedArtifact: async () => null } as unknown as GamesStore },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/submissions/${mintToken(jobId, secret)}/preview`,
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(409);
    await app.close();
  });

  it('caches status responses for 60 seconds', async () => {
    const { githubClient } = createGithubClientStub({});
    const inner = new InMemoryStore();
    const getSubmission = vi.fn(inner.getSubmission.bind(inner));
    const store = new Proxy(inner, {
      get: (target, prop) => (prop === 'getSubmission' ? getSubmission : Reflect.get(target, prop)),
    }) as Store;
    let currentTime = 50_000;
    const { app } = await createApp({ githubClient, store, submissionTokenSecret: secret, now: () => currentTime });
    const token = mintToken(123, secret);

    expect((await app.inject({ method: 'GET', url: `/api/submissions/${token}` })).statusCode).toBe(200);
    const callsAfterFirst = getSubmission.mock.calls.length;

    // Inside the window: the heavy refresh is skipped. One cheap record read still
    // runs to overlay live heartbeat / ended / stall (same outside-cache idea as events).
    currentTime += 59_000;
    expect((await app.inject({ method: 'GET', url: `/api/submissions/${token}` })).statusCode).toBe(200);
    expect(getSubmission.mock.calls.length).toBe(callsAfterFirst + 1);

    // Past it: full refresh again (abandoned check + refresh + overlay).
    currentTime += 2_000;
    expect((await app.inject({ method: 'GET', url: `/api/submissions/${token}` })).statusCode).toBe(200);
    expect(getSubmission.mock.calls.length).toBeGreaterThan(callsAfterFirst + 1);

    await app.close();
  });
});

describe('catalog route', () => {
  it('returns 503 when the github client is not configured', async () => {
    const app = await buildApp({ submissionRoutes: { githubToken: undefined, submissionTokenSecret: undefined } });
    const res = await app.inject({ method: 'GET', url: '/api/catalog' });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('serves only published entries from the repo-derived catalog', async () => {
    const { githubClient } = createGithubClientStub({
      catalog: [
        catalogEntry('bubble-pop', { title: 'Bubble Pop Rush', genre: 'arcade' }),
        catalogEntry('wip-game', { status: 'draft' }),
      ],
    });
    const { app } = await createApp({ githubClient, submissionTokenSecret: secret });

    const res = await app.inject({ method: 'GET', url: '/api/catalog' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      {
        slug: 'bubble-pop',
        title: 'Bubble Pop Rush',
        genre: 'arcade',
        controls: 'arrows',
        status: 'published',
        media: null,
        multiplayer: null,
        orientation: 'any',
        submittedBy: null,
      },
    ]);

    await app.close();
  });

  it('caches the catalog for 10 minutes', async () => {
    const { githubClient, getCatalog } = createGithubClientStub({ catalog: [catalogEntry('bubble-pop')] });
    let currentTime = 10_000;
    const { app } = await createApp({ githubClient, submissionTokenSecret: secret, now: () => currentTime });

    await app.inject({ method: 'GET', url: '/api/catalog' });
    await app.inject({ method: 'GET', url: '/api/catalog' });
    expect(getCatalog).toHaveBeenCalledTimes(1);

    currentTime += 10 * 60_000 + 1;
    await app.inject({ method: 'GET', url: '/api/catalog' });
    expect(getCatalog).toHaveBeenCalledTimes(2);

    await app.close();
  });

  it('does not force-refresh the catalog when an unknown play slug misses', async () => {
    const { githubClient, getCatalog } = createGithubClientStub({ catalog: [catalogEntry('bubble-pop')] });
    const { app } = await createApp({ githubClient, submissionTokenSecret: secret });

    await app.inject({ method: 'GET', url: '/api/catalog' });
    expect(getCatalog).toHaveBeenCalledTimes(1);

    const res = await app.inject({ method: 'GET', url: '/api/games/not-a-game' });
    expect(res.statusCode).toBe(404);
    expect(getCatalog).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it('returns 502 when the catalog cannot be loaded', async () => {
    const { githubClient, getCatalog } = createGithubClientStub({});
    getCatalog.mockRejectedValueOnce(new Error('boom'));
    const { app } = await createApp({ githubClient, submissionTokenSecret: secret });

    const res = await app.inject({ method: 'GET', url: '/api/catalog' });
    expect(res.statusCode).toBe(502);

    await app.close();
  });

  it('coalesces concurrent cache-miss requests into a single catalog fetch', async () => {
    let release!: (entries: CatalogGameEntry[]) => void;
    const getCatalog = vi.fn(() => new Promise<CatalogGameEntry[]>((resolve) => (release = resolve)));
    const githubClient = { ...createGithubClientStub({}).githubClient, getCatalog };
    const { app } = await createApp({ githubClient, submissionTokenSecret: secret });

    const requests = Promise.all([
      app.inject({ method: 'GET', url: '/api/catalog' }),
      app.inject({ method: 'GET', url: '/api/catalog' }),
      app.inject({ method: 'GET', url: '/api/catalog' }),
    ]);
    await vi.waitFor(() => expect(getCatalog).toHaveBeenCalled());
    release([catalogEntry('bubble-pop')]);
    const responses = await requests;

    expect(getCatalog).toHaveBeenCalledTimes(1);
    for (const res of responses) {
      expect(res.statusCode).toBe(200);
      expect(res.json()).toHaveLength(1);
    }

    await app.close();
  });

  it('serves the last known catalog when a refresh fails', async () => {
    const { githubClient, getCatalog } = createGithubClientStub({ catalog: [catalogEntry('bubble-pop')] });
    let currentTime = 10_000;
    const { app } = await createApp({ githubClient, submissionTokenSecret: secret, now: () => currentTime });

    const warm = await app.inject({ method: 'GET', url: '/api/catalog' });
    expect(warm.statusCode).toBe(200);

    currentTime += 10 * 60_000 + 1;
    getCatalog.mockRejectedValueOnce(new Error('boom'));
    const stale = await app.inject({ method: 'GET', url: '/api/catalog' });
    expect(stale.statusCode).toBe(200);
    expect(stale.json()).toEqual(warm.json());
    expect(getCatalog).toHaveBeenCalledTimes(2);

    // The failure must not wedge the cache: the next request refreshes normally.
    currentTime += 10 * 60_000 + 1;
    const recovered = await app.inject({ method: 'GET', url: '/api/catalog' });
    expect(recovered.statusCode).toBe(200);
    expect(getCatalog).toHaveBeenCalledTimes(3);

    await app.close();
  });
});

describe('featured pool route', () => {
  it('returns an empty pool when nothing is configured', async () => {
    const { app } = await createApp({ submissionTokenSecret: secret });

    const res = await app.inject({ method: 'GET', url: '/api/featured' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ slugs: [] });
    await app.close();
  });

  it('serves the operator-curated order, unauthenticated, no catalog join', async () => {
    const { app, store } = await createApp({ submissionTokenSecret: secret });
    await store.setFeaturedPoolSlugs(['hearthvale', 'apex-sprint', 'arena-tag'], 'g:boss');

    const res = await app.inject({ method: 'GET', url: '/api/featured' });
    expect(res.statusCode).toBe(200);
    // Order preserved, not sorted.
    expect(res.json()).toEqual({ slugs: ['hearthvale', 'apex-sprint', 'arena-tag'] });
    await app.close();
  });
});

describe('published game media route', () => {
  const media = {
    screenshots: [{ name: 'opening', file: 'opening.png' }],
    video: 'gameplay.mp4',
  };

  it('serves metadata-listed screenshots with a cache policy', async () => {
    const { githubClient, getGameMedia } = createGithubClientStub({
      catalog: [catalogEntry('foo', { media })],
      gameMedia: new Uint8Array([137, 80, 78, 71]),
    });
    const { app } = await createApp({ githubClient, submissionTokenSecret: secret });

    const res = await app.inject({ method: 'GET', url: '/api/games/foo/media/opening.png' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['cache-control']).toContain('max-age=86400');
    expect(res.headers['etag']).toBeDefined();
    expect(getGameMedia).toHaveBeenCalledWith('main', 'foo', 'opening.png');

    await app.close();
  });

  it('serves a repeat request from cache without calling GitHub again', async () => {
    const { githubClient, getGameMedia } = createGithubClientStub({
      catalog: [catalogEntry('foo', { media })],
      gameMedia: new Uint8Array([137, 80, 78, 71]),
    });
    const { app } = await createApp({ githubClient, submissionTokenSecret: secret });

    const first = await app.inject({ method: 'GET', url: '/api/games/foo/media/opening.png' });
    const second = await app.inject({ method: 'GET', url: '/api/games/foo/media/opening.png' });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.rawPayload).toEqual(first.rawPayload);
    // The whole point of the cache: the second render costs no GitHub budget.
    expect(getGameMedia).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it('answers a matching If-None-Match with 304 and no body', async () => {
    const { githubClient } = createGithubClientStub({
      catalog: [catalogEntry('foo', { media })],
      gameMedia: new Uint8Array([137, 80, 78, 71]),
    });
    const { app } = await createApp({ githubClient, submissionTokenSecret: secret });

    const first = await app.inject({ method: 'GET', url: '/api/games/foo/media/opening.png' });
    const etag = first.headers['etag'] as string;

    const revalidated = await app.inject({
      method: 'GET',
      url: '/api/games/foo/media/opening.png',
      headers: { 'if-none-match': etag },
    });

    expect(revalidated.statusCode).toBe(304);
    expect(revalidated.rawPayload.length).toBe(0);

    await app.close();
  });

  it('honours byte Range requests so video clients need not pull the whole file', async () => {
    const body = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const { githubClient } = createGithubClientStub({
      catalog: [catalogEntry('foo', { media })],
      gameMedia: body,
    });
    const { app } = await createApp({ githubClient, submissionTokenSecret: secret });

    const full = await app.inject({ method: 'GET', url: '/api/games/foo/media/gameplay.mp4' });
    expect(full.statusCode).toBe(200);
    expect(full.headers['accept-ranges']).toBe('bytes');
    expect(full.headers['content-length']).toBe(String(body.length));

    const ranged = await app.inject({
      method: 'GET',
      url: '/api/games/foo/media/gameplay.mp4',
      headers: { range: 'bytes=2-5' },
    });
    expect(ranged.statusCode).toBe(206);
    expect(ranged.headers['content-range']).toBe('bytes 2-5/10');
    expect(ranged.headers['content-length']).toBe('4');
    expect(Buffer.from(ranged.rawPayload)).toEqual(Buffer.from([2, 3, 4, 5]));

    const unsatisfiable = await app.inject({
      method: 'GET',
      url: '/api/games/foo/media/gameplay.mp4',
      headers: { range: 'bytes=99-100' },
    });
    expect(unsatisfiable.statusCode).toBe(416);
    expect(unsatisfiable.headers['content-range']).toBe('bytes */10');

    const staleIfRange = await app.inject({
      method: 'GET',
      url: '/api/games/foo/media/gameplay.mp4',
      headers: { range: 'bytes=2-5', 'if-range': '"not-this-etag"' },
    });
    expect(staleIfRange.statusCode).toBe(200);
    expect(Buffer.from(staleIfRange.rawPayload)).toEqual(Buffer.from(body));

    const matchingIfRange = await app.inject({
      method: 'GET',
      url: '/api/games/foo/media/gameplay.mp4',
      headers: { range: 'bytes=2-5', 'if-range': full.headers['etag'] as string },
    });
    expect(matchingIfRange.statusCode).toBe(206);
    expect(Buffer.from(matchingIfRange.rawPayload)).toEqual(Buffer.from([2, 3, 4, 5]));

    await app.close();
  });

  it('does not expose unlisted media or media from unpublished games', async () => {
    const { githubClient, getGameMedia } = createGithubClientStub({
      catalog: [catalogEntry('foo', { media }), catalogEntry('draft', { status: 'draft', media })],
      gameMedia: new Uint8Array([1]),
    });
    const { app } = await createApp({ githubClient, submissionTokenSecret: secret });

    for (const url of [
      '/api/games/foo/media/secret.png',
      '/api/games/draft/media/opening.png',
      '/api/games/foo/media/..%2FSPEC.md',
    ]) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(404);
    }
    expect(getGameMedia).not.toHaveBeenCalled();

    await app.close();
  });
});

describe('published game route', () => {
  it('assembles a published game from the default branch with a strict CSP', async () => {
    const { githubClient, getGameSources } = createGithubClientStub({
      catalog: [catalogEntry('foo', { title: 'Bubble Pop Rush' })],
      gameSources: sampleSources,
    });
    const { app } = await createApp({ githubClient, submissionTokenSecret: secret });

    const res = await app.inject({ method: 'GET', url: '/api/games/foo' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.slug).toBe('foo');
    expect(body.title).toBe('Bubble Pop Rush');
    expect(body.html).toContain(sampleSources.gameJs);
    expect(body.html).toContain(sampleSources.styleCss);
    expect(body.html).toContain('Content-Security-Policy');
    expect(body.html).toContain("default-src 'none'");
    expect(getGameSources).toHaveBeenCalledWith('main', 'foo');

    await app.close();
  });

  it('returns 404 for a slug that is not published in the catalog', async () => {
    const { githubClient, getGameSources } = createGithubClientStub({
      catalog: [catalogEntry('wip-game', { status: 'draft' })],
      gameSources: sampleSources,
    });
    const { app } = await createApp({ githubClient, submissionTokenSecret: secret });

    for (const slug of ['wip-game', 'unknown-game']) {
      const res = await app.inject({ method: 'GET', url: `/api/games/${slug}` });
      expect(res.statusCode).toBe(404);
    }
    expect(getGameSources).not.toHaveBeenCalled();

    await app.close();
  });

  it('returns 404 when the game directory is missing on the default branch', async () => {
    const { githubClient } = createGithubClientStub({
      catalog: [catalogEntry('foo')],
      gameSources: null,
    });
    const { app } = await createApp({ githubClient, submissionTokenSecret: secret });

    const res = await app.inject({ method: 'GET', url: '/api/games/foo' });
    expect(res.statusCode).toBe(404);

    await app.close();
  });

  it('caches an assembled game for 5 minutes', async () => {
    const { githubClient, getGameSources } = createGithubClientStub({
      catalog: [catalogEntry('foo')],
      gameSources: sampleSources,
    });
    let currentTime = 10_000;
    const { app } = await createApp({ githubClient, submissionTokenSecret: secret, now: () => currentTime });

    await app.inject({ method: 'GET', url: '/api/games/foo' });
    await app.inject({ method: 'GET', url: '/api/games/foo' });
    expect(getGameSources).toHaveBeenCalledTimes(1);

    currentTime += 5 * 60_000 + 1;
    await app.inject({ method: 'GET', url: '/api/games/foo' });
    expect(getGameSources).toHaveBeenCalledTimes(2);

    await app.close();
  });
});

describe('submission feedback route', () => {
  const openPr: LinkedPullRequest = {
    number: 30,
    state: 'OPEN',
    merged: false,
    isDraft: true,
    titleHasWip: false,
    headRefName: 'copilot/foo',
    changedFiles: ['games/foo/index.html'],
  };

  it('rejects unauthenticated feedback with 401', async () => {
    const { githubClient } = createGithubClientStub({ linkedPr: openPr });
    const { app } = await createApp({ githubClient, submissionTokenSecret: secret });
    const token = mintToken(123, secret);

    const res = await app.inject({
      method: 'POST',
      url: `/api/submissions/${token}/feedback`,
      payload: { feedback: 'Please make the car faster and add a boost.' },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('rejects an invalid token with 400', async () => {
    const { githubClient } = createGithubClientStub({ linkedPr: openPr });
    const { app, authHeaders } = await createApp({ githubClient, submissionTokenSecret: secret });

    const res = await app.inject({
      method: 'POST',
      url: '/api/submissions/not-a-token/feedback',
      headers: authHeaders,
      payload: { feedback: 'Please make the car faster and add a boost.' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('rejects feedback that is too short with 400', async () => {
    const { githubClient, createIssueComment } = createGithubClientStub({ linkedPr: openPr });
    const { app, authHeaders } = await createApp({ githubClient, submissionTokenSecret: secret });
    const token = mintToken(123, secret);

    const res = await app.inject({
      method: 'POST',
      url: `/api/submissions/${token}/feedback`,
      headers: authHeaders,
      payload: { feedback: 'too short' },
    });
    expect(res.statusCode).toBe(400);
    expect(createIssueComment).not.toHaveBeenCalled();
    await app.close();
  });

  it('enforces a daily feedback quota', async () => {
    const { githubClient } = createGithubClientStub({ linkedPr: openPr });
    const { app, authHeaders } = await createApp({
      githubClient,
      submissionTokenSecret: secret,
      dailyFeedbackQuota: 1,
    });
    const token = mintToken(123, secret);

    const first = await app.inject({
      method: 'POST',
      url: `/api/submissions/${token}/feedback`,
      headers: authHeaders,
      payload: { feedback: 'Make the controls tighter and less slippery.' },
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'POST',
      url: `/api/submissions/${token}/feedback`,
      headers: authHeaders,
      payload: { feedback: 'Also add background music to the menu screen.' },
    });
    expect(second.statusCode).toBe(429);
    expect(second.json()).toEqual({ error: 'daily feedback quota exceeded' });
    await app.close();
  });
});

describe('the Studio mini chat agent (feedback route)', () => {
  it('answers conversationally and never queues or dispatches a change request', async () => {
    const { backend } = createBackendStub();
    const decide = vi.fn(async () => ({ kind: 'reply' as const, text: 'Still building — nothing has shipped yet.' }));
    const { app, authHeaders, store } = await createApp({
      githubClient: createGithubClientStub({ jobId: 90 }).githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
      chatAgent: { decide },
    });
    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about a garden full of robots.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    const token = mintToken(job.jobId, secret);

    const res = await app.inject({
      method: 'POST',
      url: `/api/submissions/${token}/feedback`,
      headers: authHeaders,
      payload: { feedback: 'is it done yet?' },
    });
    expect(res.statusCode).toBe(200);
    expect(decide).toHaveBeenCalledTimes(1);

    // Never entered the builder's inbox — not collectable as work.
    const pending = await store.listPendingCreatorMessages(job.jobId);
    expect(pending.some((m) => m.text === 'is it done yet?')).toBe(false);

    // Both turns land on the thread, in order and distinguishable.
    const all = await store.listCreatorMessages(job.jobId);
    const tail = all.slice(-2);
    expect(tail[0].text).toBe('is it done yet?');
    expect(tail[0].origin).toBeUndefined();
    expect(tail[1]).toMatchObject({ text: 'Still building — nothing has shipped yet.', origin: 'studio' });

    const status = await app.inject({ method: 'GET', url: `/api/submissions/${token}`, headers: authHeaders });
    const revisions = status.json().progress?.revisions ?? [];
    expect(revisions.at(-1)).toMatchObject({
      text: 'Still building — nothing has shipped yet.',
      origin: 'studio',
    });
    await app.close();
  });

  it('passes recent build events oldest-first, though the store returns them newest-first', async () => {
    const { backend } = createBackendStub();
    let seenEvents: string[] = [];
    const decide = vi.fn(async (request: ChatAgentRequest) => {
      seenEvents = request.status.recentEvents;
      return { kind: 'reply' as const, text: 'a reply' };
    });
    const { app, authHeaders, store } = await createApp({
      githubClient: createGithubClientStub({ jobId: 90 }).githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
      chatAgent: { decide },
    });
    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about a garden full of robots.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');

    await store.appendBuildEvent(job.jobId, {
      kind: 'step',
      text: 'Sketching the level layout.',
      createdAt: '2026-08-01T00:00:00.000Z',
    });
    await store.appendBuildEvent(job.jobId, {
      kind: 'step',
      text: 'Fixed the jump bug.',
      createdAt: '2026-08-01T00:05:00.000Z',
    });

    const token = mintToken(job.jobId, secret);
    const res = await app.inject({
      method: 'POST',
      url: `/api/submissions/${token}/feedback`,
      headers: authHeaders,
      payload: { feedback: 'what changed recently?' },
    });
    expect(res.statusCode).toBe(200);
    // Chronological, oldest first — matching what describeStatus tells the model.
    expect(seenEvents).toEqual(['Sketching the level layout.', 'Fixed the jump bug.']);
    await app.close();
  });

  it('fails open to the pre-existing path when the model errors', async () => {
    const { backend } = createBackendStub();
    const decide = vi.fn(async () => {
      throw new Error('vertex timeout');
    });
    const { app, authHeaders, store } = await createApp({
      githubClient: createGithubClientStub({ jobId: 90 }).githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
      chatAgent: { decide },
    });
    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about a garden full of robots.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    const token = mintToken(job.jobId, secret);

    const res = await app.inject({
      method: 'POST',
      url: `/api/submissions/${token}/feedback`,
      headers: authHeaders,
      payload: { feedback: 'Make the robots water the flowers faster.' },
    });
    expect(res.statusCode).toBe(200);
    expect(decide).toHaveBeenCalledTimes(1);
    // Lost nothing: the message still reached the builder's inbox.
    const pending = await store.listPendingCreatorMessages(job.jobId);
    expect(pending.map((m) => m.text)).toContain('Make the robots water the flowers faster.');
    await app.close();
  });

  it("a build decision still queues the creator's own words, plus an optional studio ack", async () => {
    const { backend } = createBackendStub();
    const decide = vi.fn(async () => ({ kind: 'build' as const, text: 'On it!' }));
    const { app, authHeaders, store } = await createApp({
      githubClient: createGithubClientStub({ jobId: 90 }).githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
      chatAgent: { decide },
    });
    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about a garden full of robots.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    const token = mintToken(job.jobId, secret);

    const res = await app.inject({
      method: 'POST',
      url: `/api/submissions/${token}/feedback`,
      headers: authHeaders,
      payload: { feedback: 'Make the robots water the flowers faster.' },
    });
    expect(res.statusCode).toBe(200);

    // Dispatched the creator's own words verbatim, never the model's.
    const pending = await store.listPendingCreatorMessages(job.jobId);
    expect(pending.map((m) => m.text)).toContain('Make the robots water the flowers faster.');

    const all = await store.listCreatorMessages(job.jobId);
    const ack = all.find((m) => m.origin === 'studio_ack');
    expect(ack?.text).toBe('On it!');
    await app.close();
  });

  it('remembers a past build turn as built, not as a reply, even when it had an ack', async () => {
    const { backend } = createBackendStub();
    // First call dispatches with an ack; second call is what actually asserts.
    const decide = vi
      .fn<(request: ChatAgentRequest) => Promise<{ kind: 'build' | 'reply'; text: string }>>()
      .mockResolvedValueOnce({ kind: 'build', text: 'On it!' })
      .mockResolvedValueOnce({ kind: 'reply', text: 'Still working on it.' });
    const { app, authHeaders, store } = await createApp({
      githubClient: createGithubClientStub({ jobId: 90 }).githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
      chatAgent: { decide },
    });
    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about a garden full of robots.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    const token = mintToken(job.jobId, secret);

    await app.inject({
      method: 'POST',
      url: `/api/submissions/${token}/feedback`,
      headers: authHeaders,
      payload: { feedback: 'make it faster' },
    });
    await app.inject({
      method: 'POST',
      url: `/api/submissions/${token}/feedback`,
      headers: authHeaders,
      payload: { feedback: 'is it done yet?' },
    });

    expect(decide).toHaveBeenCalledTimes(2);
    const secondRequest = decide.mock.calls[1]![0];
    // Not a reply — that would say it never dispatched last time.
    expect(secondRequest.history).toContainEqual({ message: 'make it faster', built: true, ackText: 'On it!' });
    await app.close();
  });

  it('a conversational reply does not spend the daily feedback quota', async () => {
    const { backend } = createBackendStub();
    const decide = vi
      .fn<(request: ChatAgentRequest) => Promise<{ kind: 'build' | 'reply'; text?: string }>>()
      .mockResolvedValueOnce({ kind: 'reply', text: 'Still building.' })
      .mockResolvedValueOnce({ kind: 'build' });
    const { app, authHeaders, store } = await createApp({
      githubClient: createGithubClientStub({ jobId: 90 }).githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
      chatAgent: { decide },
      // One slot total — a question must not spend it.
      dailyFeedbackQuota: 1,
    });
    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about a garden full of robots.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    const token = mintToken(job.jobId, secret);

    const question = await app.inject({
      method: 'POST',
      url: `/api/submissions/${token}/feedback`,
      headers: authHeaders,
      payload: { feedback: 'is it done yet?' },
    });
    expect(question.statusCode).toBe(200);
    expect(question.json()).toEqual({ ok: true });

    const realFeedback = await app.inject({
      method: 'POST',
      url: `/api/submissions/${token}/feedback`,
      headers: authHeaders,
      payload: { feedback: 'Make the robots water the flowers faster.' },
    });
    expect(realFeedback.statusCode).toBe(200);
    const pending = await store.listPendingCreatorMessages(job.jobId);
    expect(pending.map((m) => m.text)).toContain('Make the robots water the flowers faster.');
    await app.close();
  });

  it("books the model tokens on the job's own cost ledger, beside gate runs and seeds", async () => {
    const { backend } = createBackendStub();
    const decide = vi.fn(async () => ({
      kind: 'reply' as const,
      text: 'Still building.',
      tokens: { input: 500, output: 40 },
      model: 'gemini-3.7-flash',
    }));
    const { app, authHeaders, store } = await createApp({
      githubClient: createGithubClientStub({ jobId: 90 }).githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
      chatAgent: { decide },
    });
    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about a garden full of robots.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    const token = mintToken(job.jobId, secret);

    await app.inject({
      method: 'POST',
      url: `/api/submissions/${token}/feedback`,
      headers: authHeaders,
      payload: { feedback: 'is it done yet?' },
    });

    const record = await store.getSubmission(job.jobId);
    const entry = record?.costs?.find((cost) => cost.kind === 'chat');
    expect(entry).toMatchObject({ by: 'gemini-3.7-flash', tokens: { input: 500, output: 40 } });
    await app.close();
  });

  it('falls open once the per-user daily chat quota is spent', async () => {
    const { backend } = createBackendStub();
    const decide = vi.fn(async () => ({ kind: 'reply' as const, text: 'a reply' }));
    const { app, authHeaders, store } = await createApp({
      githubClient: createGithubClientStub({ jobId: 90 }).githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
      chatAgent: { decide },
      dailyChatQuota: 1,
    });
    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about a garden full of robots.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    const token = mintToken(job.jobId, secret);

    const first = await app.inject({
      method: 'POST',
      url: `/api/submissions/${token}/feedback`,
      headers: authHeaders,
      payload: { feedback: 'is it done yet?' },
    });
    expect(first.statusCode).toBe(200);
    expect(decide).toHaveBeenCalledTimes(1);

    // Quota spent: the day's next message falls open to the builder.
    const second = await app.inject({
      method: 'POST',
      url: `/api/submissions/${token}/feedback`,
      headers: authHeaders,
      payload: { feedback: 'Please make the robots water the flowers faster.' },
    });
    expect(second.statusCode).toBe(200);
    expect(decide).toHaveBeenCalledTimes(1);
    const pending = await store.listPendingCreatorMessages(job.jobId);
    expect(pending.map((m) => m.text)).toContain('Please make the robots water the flowers faster.');
    await app.close();
  });

  it('falls open when the global chat breaker is paused, without touching editing', async () => {
    const { backend } = createBackendStub();
    const decide = vi.fn(async () => ({ kind: 'reply' as const, text: 'a reply' }));
    const store = new InMemoryStore();
    await store.setCreationLimits({ chatPaused: true }, 'operator');
    const { app, authHeaders } = await createApp({
      githubClient: createGithubClientStub({ jobId: 90 }).githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
      chatAgent: { decide },
      store,
    });
    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about a garden full of robots.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    const token = mintToken(job.jobId, secret);

    const res = await app.inject({
      method: 'POST',
      url: `/api/submissions/${token}/feedback`,
      headers: authHeaders,
      payload: { feedback: 'Please make the robots water the flowers faster.' },
    });
    expect(res.statusCode).toBe(200);
    expect(decide).not.toHaveBeenCalled();
    const pending = await store.listPendingCreatorMessages(job.jobId);
    expect(pending.map((m) => m.text)).toContain('Please make the robots water the flowers faster.');
    await app.close();
  });

  it('a breaker that throws (a Firestore blip) falls open rather than failing the request', async () => {
    // A broken gate must degrade to "skip the layer", never a 500.
    const { backend } = createBackendStub();
    const decide = vi.fn(async () => ({ kind: 'reply' as const, text: 'a reply' }));
    const failingChatGate: ChatGate = {
      checkAndSpend: async () => {
        throw new Error('firestore unavailable');
      },
    };
    const { app, authHeaders, store } = await createApp({
      githubClient: createGithubClientStub({ jobId: 90 }).githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
      chatAgent: { decide },
      chatGate: failingChatGate,
    });
    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about a garden full of robots.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    const token = mintToken(job.jobId, secret);

    const res = await app.inject({
      method: 'POST',
      url: `/api/submissions/${token}/feedback`,
      headers: authHeaders,
      payload: { feedback: 'Please make the robots water the flowers faster.' },
    });
    expect(res.statusCode).toBe(200);
    expect(decide).not.toHaveBeenCalled();
    const pending = await store.listPendingCreatorMessages(job.jobId);
    expect(pending.map((m) => m.text)).toContain('Please make the robots water the flowers faster.');
    await app.close();
  });

  it('a Firestore blip while recording the reply falls open to the builder’s inbox', async () => {
    class FlakyReplyStore extends InMemoryStore {
      async appendCreatorMessage(
        jobId: number,
        text: string,
        opts?: { origin?: 'agent' | 'studio'; delivered?: boolean; textLocalized?: string; locale?: string },
      ) {
        if (opts?.origin === 'studio') throw new Error('firestore unavailable');
        return super.appendCreatorMessage(jobId, text, opts);
      }
    }
    const store = new FlakyReplyStore();
    const { backend } = createBackendStub();
    const decide = vi.fn(async () => ({ kind: 'reply' as const, text: 'Still building.' }));
    const { app, authHeaders } = await createApp({
      githubClient: createGithubClientStub({ jobId: 90 }).githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
      store,
      chatAgent: { decide },
    });
    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about a garden full of robots.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    const token = mintToken(job.jobId, secret);

    const res = await app.inject({
      method: 'POST',
      url: `/api/submissions/${token}/feedback`,
      headers: authHeaders,
      payload: { feedback: 'is it done yet?' },
    });

    // The write failed, so this should fail open, not claim success.
    expect(res.statusCode).toBe(200);
    const pending = await store.listPendingCreatorMessages(job.jobId);
    expect(pending.map((m) => m.text)).toContain('is it done yet?');
    // The fallback below must not queue a second, duplicate copy.
    const all = await store.listCreatorMessages(job.jobId);
    expect(all.filter((m) => m.text === 'is it done yet?')).toHaveLength(1);
    await app.close();
  });
});

describe('POST /api/submissions/:token/improve', () => {
  it('dispatches a job for a published game the caller owns, rather than filing an issue', async () => {
    // Changed deliberately (IL-3). This used to create a games-repo issue, which was the
    // last caller of that path after #347 moved dispatch in-house — and nothing collects
    // such an issue any more, so the request went nowhere. An improvement is now a new
    // job carrying the game's slug.
    const { githubClient, createIssue } = createGithubClientStub({ jobId: 501 });
    const store = new InMemoryStore();
    const { backend, briefs } = createBackendStub();
    const { app, authHeaders } = await createApp({
      githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
      store,
    });
    await store.createSubmission(123, 'g:test-user', 'Sky Dodge');
    await store.setSubmissionSlug(123, 'sky-dodge');
    await store.setSubmissionPublishedAt(123, '2026-07-20T00:00:00.000Z');

    const res = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(123, secret)}/improve`,
      headers: authHeaders,
      payload: { feedback: 'Make level two less punishing and add a checkpoint.' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, slug: 'sky-dodge' });
    expect(createIssue).not.toHaveBeenCalled();
    const dispatched = briefs.at(-1)!;
    expect(dispatched.slug).toBe('sky-dodge');
    expect(dispatched.feedback).toContain('Make level two less punishing');

    await app.close();
  });

  it('refuses unpublished games — those still use the draft feedback path', async () => {
    const { githubClient, createIssue } = createGithubClientStub({});
    const store = new InMemoryStore();
    const { app, authHeaders } = await createApp({ githubClient, submissionTokenSecret: secret, store });
    await store.createSubmission(123, 'g:test-user', 'Not live yet');
    await store.setSubmissionSlug(123, 'not-live-yet');

    const res = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(123, secret)}/improve`,
      headers: authHeaders,
      payload: { feedback: 'Please polish the jump feeling a bit more.' },
    });

    expect(res.statusCode).toBe(409);
    expect(createIssue).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuses someone else’s published game even with a valid token', async () => {
    const { githubClient, createIssue } = createGithubClientStub({});
    const store = new InMemoryStore();
    const { app, authHeaders } = await createApp({ githubClient, submissionTokenSecret: secret, store });
    await store.createSubmission(123, 'g:someone-else', 'Not yours');
    await store.setSubmissionSlug(123, 'not-yours');
    await store.setSubmissionPublishedAt(123, '2026-07-20T00:00:00.000Z');

    const res = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(123, secret)}/improve`,
      headers: authHeaders,
      payload: { feedback: 'Please polish the jump feeling a bit more.' },
    });

    expect(res.statusCode).toBe(403);
    expect(createIssue).not.toHaveBeenCalled();
    await app.close();
  });

  describe('the Studio mini chat agent', () => {
    it('a conversational reply answers on the current job and opens no new one', async () => {
      const { githubClient, createIssue } = createGithubClientStub({ jobId: 501 });
      const store = new InMemoryStore();
      const { backend, briefs } = createBackendStub();
      const decide = vi.fn(async () => ({ kind: 'reply' as const, text: 'You can tune difficulty from Settings.' }));
      const { app, authHeaders } = await createApp({
        githubClient,
        agentBackend: backend,
        submissionTokenSecret: secret,
        store,
        chatAgent: { decide },
      });
      await store.createSubmission(123, 'g:test-user', 'Sky Dodge');
      await store.setSubmissionSlug(123, 'sky-dodge');
      await store.setSubmissionPublishedAt(123, '2026-07-20T00:00:00.000Z');

      const res = await app.inject({
        method: 'POST',
        url: `/api/submissions/${mintToken(123, secret)}/improve`,
        headers: authHeaders,
        payload: { feedback: 'how do I make it harder?' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
      expect(createIssue).not.toHaveBeenCalled();
      // No new job: the reply lives on the published job's thread.
      expect(briefs).toHaveLength(0);
      const all = await store.listCreatorMessages(123);
      expect(all.map((m) => ({ text: m.text, origin: m.origin }))).toEqual([
        { text: 'how do I make it harder?', origin: undefined },
        { text: 'You can tune difficulty from Settings.', origin: 'studio' },
      ]);
      await app.close();
    });

    it('a build decision still opens a new improvement job as before', async () => {
      const { githubClient } = createGithubClientStub({ jobId: 501 });
      const store = new InMemoryStore();
      const { backend, briefs } = createBackendStub();
      const decide = vi.fn(async () => ({ kind: 'build' as const }));
      const { app, authHeaders } = await createApp({
        githubClient,
        agentBackend: backend,
        submissionTokenSecret: secret,
        store,
        chatAgent: { decide },
      });
      await store.createSubmission(123, 'g:test-user', 'Sky Dodge');
      await store.setSubmissionSlug(123, 'sky-dodge');
      await store.setSubmissionPublishedAt(123, '2026-07-20T00:00:00.000Z');

      const res = await app.inject({
        method: 'POST',
        url: `/api/submissions/${mintToken(123, secret)}/improve`,
        headers: authHeaders,
        payload: { feedback: 'Make level two less punishing and add a checkpoint.' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ ok: true, slug: 'sky-dodge' });
      expect(briefs).toHaveLength(1);
      expect(briefs.at(-1)!.feedback).toContain('Make level two less punishing');
      await app.close();
    });

    it('a conversational reply does not spend the daily improvement quota', async () => {
      const { githubClient, createIssue } = createGithubClientStub({ jobId: 501 });
      const store = new InMemoryStore();
      const { backend, briefs } = createBackendStub();
      const responses: Array<{ kind: 'reply'; text: string } | { kind: 'build' }> = [
        { kind: 'reply', text: 'first answer' },
        { kind: 'reply', text: 'second answer' },
        { kind: 'build' },
      ];
      let next = 0;
      const decide = vi.fn(async () => responses[next++]!);
      const { app, authHeaders } = await createApp({
        githubClient,
        agentBackend: backend,
        submissionTokenSecret: secret,
        store,
        chatAgent: { decide },
        // One slot total — a question must not spend it.
        dailyImprovementQuota: 1,
      });
      await store.createSubmission(123, 'g:test-user', 'Sky Dodge');
      await store.setSubmissionSlug(123, 'sky-dodge');
      await store.setSubmissionPublishedAt(123, '2026-07-20T00:00:00.000Z');

      for (let i = 0; i < 2; i++) {
        const res = await app.inject({
          method: 'POST',
          url: `/api/submissions/${mintToken(123, secret)}/improve`,
          headers: authHeaders,
          payload: { feedback: `question ${i}, is it done yet?` },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ ok: true });
      }
      expect(createIssue).not.toHaveBeenCalled();

      const build = await app.inject({
        method: 'POST',
        url: `/api/submissions/${mintToken(123, secret)}/improve`,
        headers: authHeaders,
        payload: { feedback: 'Make level two less punishing and add a checkpoint.' },
      });
      expect(build.statusCode).toBe(200);
      expect(briefs).toHaveLength(1);
      await app.close();
    });

    it('a conversational reply is not blocked by platform unavailability', async () => {
      const { githubClient } = createGithubClientStub({ jobId: 501 });
      const store = new InMemoryStore();
      const { backend } = createBackendStub();
      const decide = vi.fn(async () => ({ kind: 'reply' as const, text: 'Still building.' }));
      const { app, authHeaders } = await createApp({
        githubClient,
        agentBackend: backend,
        submissionTokenSecret: secret,
        store,
        chatAgent: { decide },
        managedAvailabilityGate: createManagedAvailabilityGate({ hasPlatformBackend: false }),
      });
      await store.createSubmission(123, 'g:test-user', 'Sky Dodge');
      await store.setSubmissionSlug(123, 'sky-dodge');
      await store.setSubmissionPublishedAt(123, '2026-07-20T00:00:00.000Z');

      const res = await app.inject({
        method: 'POST',
        url: `/api/submissions/${mintToken(123, secret)}/improve`,
        headers: authHeaders,
        payload: { feedback: 'is it done yet?' },
      });
      // Would 409 here if this ran the build-only availability check.
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
      await app.close();
    });

    it('a Firestore blip while recording the reply falls open to a real improvement round', async () => {
      const { githubClient } = createGithubClientStub({ jobId: 501 });
      class FlakyReplyStore extends InMemoryStore {
        async appendCreatorMessage(
          jobId: number,
          text: string,
          opts?: { origin?: 'agent' | 'studio'; delivered?: boolean; textLocalized?: string; locale?: string },
        ) {
          if (opts?.origin === 'studio') throw new Error('firestore unavailable');
          return super.appendCreatorMessage(jobId, text, opts);
        }
      }
      const store = new FlakyReplyStore();
      const { backend, briefs } = createBackendStub();
      const decide = vi.fn(async () => ({ kind: 'reply' as const, text: 'Still building.' }));
      const { app, authHeaders } = await createApp({
        githubClient,
        agentBackend: backend,
        submissionTokenSecret: secret,
        store,
        chatAgent: { decide },
      });
      await store.createSubmission(123, 'g:test-user', 'Sky Dodge');
      await store.setSubmissionSlug(123, 'sky-dodge');
      await store.setSubmissionPublishedAt(123, '2026-07-20T00:00:00.000Z');

      const res = await app.inject({
        method: 'POST',
        url: `/api/submissions/${mintToken(123, secret)}/improve`,
        headers: authHeaders,
        payload: { feedback: 'is it done yet?' },
      });

      // The write failed, so this should fail open, not claim success.
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ ok: true, slug: 'sky-dodge' });
      expect(briefs).toHaveLength(1);
      expect(briefs.at(-1)!.feedback).toContain('is it done yet?');
      // No duplicate left behind on the old, published job.
      const onOldJob = await store.listCreatorMessages(123);
      const copies = onOldJob.filter((m) => m.text === 'is it done yet?');
      expect(copies).toHaveLength(1);
      // Delivered, not pending — priorRounds must not show it as a live duplicate.
      expect(copies[0]!.deliveredAt).toBeTruthy();
      await app.close();
    });
  });
});

describe('GET /api/submissions/mine', () => {
  it('lists the creator’s own submissions, newest first, with working status tokens', async () => {
    const { githubClient } = createGithubClientStub({});
    const store = new InMemoryStore();
    const { app, authHeaders } = await createApp({ githubClient, submissionTokenSecret: secret, store });

    await store.createSubmission(11, 'g:test-user', 'Older game');
    await new Promise((resolve) => setTimeout(resolve, 2));
    await store.createSubmission(12, 'g:test-user', 'Newer game');
    await store.setSubmissionNotifiedStatus(12, 'building');
    await store.createSubmission(13, 'g:someone-else', 'Not mine');

    const res = await app.inject({ method: 'GET', url: '/api/submissions/mine', headers: authHeaders });
    expect(res.statusCode).toBe(200);

    const submissions = res.json().submissions as Array<{ title: string; token: string; lastKnownStatus: unknown }>;
    expect(submissions.map((item) => item.title)).toEqual(['Newer game', 'Older game']);
    expect(submissions[0]!.lastKnownStatus).toBe('building');
    expect(submissions[1]!.lastKnownStatus).toBeNull();
    // The token is re-minted server-side: a creator on a new device recovers access
    // to their own build without ever having saved the tracking link.
    expect(submissions[0]!.token).toBe(mintToken(12, secret));

    await app.close();
  });

  /**
   * The rail renders straight from this list rather than deriving a status per card,
   * so what it carries has to be right — a stale or missing status here is now visible
   * on the home page instead of being immediately overwritten by a live fetch.
   */
  it('prefers the derived status over the one notifications happened to record', async () => {
    const { githubClient } = createGithubClientStub({});
    const store = new InMemoryStore();
    const { app, authHeaders } = await createApp({ githubClient, submissionTokenSecret: secret, store });

    await store.createSubmission(21, 'g:test-user', 'In review now');
    // in_review shares its notification event with building, so this is exactly the
    // case where lastNotifiedStatus lags the truth and must not win.
    await store.setSubmissionNotifiedStatus(21, 'building');
    await store.setSubmissionLastStatus(21, 'in_review');
    await store.setSubmissionSlug(21, 'in-review-now');

    const res = await app.inject({ method: 'GET', url: '/api/submissions/mine', headers: authHeaders });
    const submissions = res.json().submissions as Array<{ lastKnownStatus: unknown; slug: unknown }>;
    expect(submissions[0]!.lastKnownStatus).toBe('in_review');
    expect(submissions[0]!.slug).toBe('in-review-now');

    await app.close();
  });

  it('falls back to the notified status for records written before lastStatus existed', async () => {
    const { githubClient } = createGithubClientStub({});
    const store = new InMemoryStore();
    const { app, authHeaders } = await createApp({ githubClient, submissionTokenSecret: secret, store });

    await store.createSubmission(22, 'g:test-user', 'Old record');
    await store.setSubmissionNotifiedStatus(22, 'published');

    const res = await app.inject({ method: 'GET', url: '/api/submissions/mine', headers: authHeaders });
    const submissions = res.json().submissions as Array<{ lastKnownStatus: unknown; slug: unknown }>;
    expect(submissions[0]!.lastKnownStatus).toBe('published');
    expect(submissions[0]!.slug).toBeNull();

    await app.close();
  });

  it('requires a session', async () => {
    const { githubClient } = createGithubClientStub({});
    const { app } = await createApp({ githubClient, submissionTokenSecret: secret });

    const res = await app.inject({ method: 'GET', url: '/api/submissions/mine' });
    expect(res.statusCode).toBe(401);

    await app.close();
  });

  it('lists all distinct games even when improvement rounds exceed the job ceiling', async () => {
    const { githubClient } = createGithubClientStub({});
    const store = new InMemoryStore();
    const { app, authHeaders } = await createApp({ githubClient, submissionTokenSecret: secret, store });
    const today = new Date().toISOString().slice(0, 10);

    for (let game = 0; game < 3; game++) {
      const slug = `game-${game}`;
      for (let tip = 0; tip < 20; tip++) {
        const jobId = game * 100 + tip + 1;
        await store.createSubmission(jobId, 'g:test-user', `Game ${game} tip ${tip}`);
        await store.setSubmissionSlug(jobId, slug);
        if (tip === 0) {
          await store.setSubmissionPublishedAt(jobId, `${today}T12:00:00.000Z`);
        }
        if (tip < 19) await new Promise((resolve) => setTimeout(resolve, 2));
      }
    }

    const res = await app.inject({ method: 'GET', url: '/api/submissions/mine', headers: authHeaders });
    expect(res.statusCode).toBe(200);

    const body = res.json() as {
      submissions: Array<{ slug: string | null }>;
      truncated: boolean;
      totalGames: number;
    };
    expect(body.totalGames).toBe(3);
    expect(body.truncated).toBe(false);
    expect(body.submissions).toHaveLength(3);
    expect(new Set(body.submissions.map((item) => item.slug))).toEqual(new Set(['game-0', 'game-1', 'game-2']));

    await app.close();
  });
});

describe('GET /api/drafts/:slug (shareable, read-only)', () => {
  const openPrWithGame: LinkedPullRequest = {
    number: 30,
    state: 'OPEN',
    merged: false,
    isDraft: true,
    titleHasWip: false,
    headRefName: 'copilot/foo',
    headRefOid: 'sha-1',
    changedFiles: ['games/space-runner/index.html'],
  };

  const sources: GameSources = {
    indexHtml: '<div id="game"></div>',
    gameJs: 'console.log("game")',
    styleCss: 'body { margin: 0 }',
    title: 'Space Runner',
  };

  it('serves the draft for a slug the agent’s delivery has claimed', async () => {
    // The slug used to be learned by a status poll reading the PR's changed files. A job
    // has no PR now: the agent's delivery claims it over the build channel, which is
    // earlier and does not depend on anyone polling.
    const jobId = 1_000_055;
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:test-user' });
    await store.createSubmission(jobId, 'g:test-user', 'Space Runner');
    const gamesStore = {
      getDerivedArtifact: async (_s: string, _v: string, name: string) =>
        name === 'bundle.html'
          ? Buffer.from('<!doctype html><title>Space Runner</title><script>console.log("game")</script>')
          : null,
    } as unknown as GamesStore;
    const { githubClient } = createGithubClientStub({});
    const { app, authHeaders } = await createApp({
      store,
      githubClient,
      submissionTokenSecret: secret,
      agentChannel: { gamesStore },
    });

    // Unknown until the delivery names it…
    expect(
      (await app.inject({ method: 'GET', url: '/api/drafts/space-runner', headers: authHeaders })).statusCode,
    ).toBe(404);

    await store.setSubmissionSlug(jobId, 'space-runner');
    await store.setSubmissionDeliveredVersion(jobId, 'v20260730T132921286Z-1592fc');

    // …after which the game is addressable by slug, like a published one.
    const after = await app.inject({ method: 'GET', url: '/api/drafts/space-runner', headers: authHeaders });
    expect(after.statusCode).toBe(200);
    expect(after.json()).toMatchObject({ slug: 'space-runner', title: 'Space Runner' });
    expect(after.json().html).toContain('console.log("game")');

    await app.close();
  });

  it('404s an unknown slug and rejects a malformed one', async () => {
    const { githubClient } = createGithubClientStub({ linkedPr: openPrWithGame, gameSources: sources });
    const { app, authHeaders } = await createApp({ githubClient, submissionTokenSecret: secret });

    expect((await app.inject({ method: 'GET', url: '/api/drafts/nope', headers: authHeaders })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/drafts/..%2Fsecret', headers: authHeaders })).statusCode).toBe(
      404,
    );

    await app.close();
  });

  it('requires a session', async () => {
    const { githubClient } = createGithubClientStub({ linkedPr: openPrWithGame });
    const { app } = await createApp({ githubClient, submissionTokenSecret: secret });

    const res = await app.inject({ method: 'GET', url: '/api/drafts/space-runner' });
    expect(res.statusCode).toBe(401);

    await app.close();
  });
});

describe('GET /api/me/quota', () => {
  it('reports today’s submission usage against the limit', async () => {
    const { githubClient } = createGithubClientStub({});
    const { app, authHeaders } = await createApp({
      githubClient,
      submissionTokenSecret: secret,
      dailySubmissionQuota: 5,
    });

    const before = await app.inject({ method: 'GET', url: '/api/me/quota', headers: authHeaders });
    expect(before.json()).toEqual({ submissions: { used: 0, limit: 5 } });

    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'Game idea', concept: 'A concept long enough to pass validation rules.' },
    });

    const after = await app.inject({ method: 'GET', url: '/api/me/quota', headers: authHeaders });
    expect(after.json()).toEqual({ submissions: { used: 1, limit: 5 } });

    await app.close();
  });

  it('reports no ceiling for a trusted account', async () => {
    const { githubClient } = createGithubClientStub({});
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:test-user', tier: 'trusted' });
    const { app, authHeaders } = await createApp({ githubClient, submissionTokenSecret: secret, store });

    const res = await app.inject({ method: 'GET', url: '/api/me/quota', headers: authHeaders });
    expect(res.json()).toEqual({ submissions: { used: 0, limit: null } });

    await app.close();
  });
});

describe('managed (platform) builder availability', () => {
  it('exposes platformBuilder on /api/me/quota when a gate is wired', async () => {
    const { githubClient } = createGithubClientStub({});
    const { app, authHeaders } = await createApp({
      githubClient,
      submissionTokenSecret: secret,
      managedAvailabilityGate: createManagedAvailabilityGate({ hasPlatformBackend: false }),
    });

    const res = await app.inject({ method: 'GET', url: '/api/me/quota', headers: authHeaders });
    expect(res.json()).toMatchObject({ platformBuilder: { available: false, reason: 'coming_soon' } });

    await app.close();
  });

  it('refuses a new platform-builder submission with a clear reason, spending no quota', async () => {
    const { githubClient } = createGithubClientStub({});
    const { app, authHeaders, store } = await createApp({
      githubClient,
      submissionTokenSecret: secret,
      managedAvailabilityGate: createManagedAvailabilityGate({ hasPlatformBackend: false }),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'Game idea', concept: 'A concept long enough to pass validation rules.', builder: 'platform' },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'platform_builder_unavailable', reason: 'coming_soon' });
    expect(await store.listSubmissionsByOwner('g:test-user')).toHaveLength(0);
    const quota = await app.inject({ method: 'GET', url: '/api/me/quota', headers: authHeaders });
    expect((quota.json() as { submissions: { used: number } }).submissions.used).toBe(0);

    await app.close();
  });

  it('still creates a self (BYOCA) round when the platform builder is unavailable', async () => {
    const { githubClient } = createGithubClientStub({});
    const { app, authHeaders } = await createApp({
      githubClient,
      submissionTokenSecret: secret,
      managedAvailabilityGate: createManagedAvailabilityGate({ hasPlatformBackend: false }),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'Game idea', concept: 'A concept long enough to pass validation rules.', builder: 'self' },
    });

    expect(res.statusCode).toBe(200);

    await app.close();
  });

  it('refuses a quiet self round’s handoff to the platform builder, with a clear reason', async () => {
    const { githubClient } = createGithubClientStub({});
    const { backend } = createBackendStub();
    const { app, authHeaders, store } = await createApp({
      githubClient,
      submissionTokenSecret: secret,
      agentBackend: backend,
      // A backend exists; an operator has switched it off.
      managedAvailabilityGate: createManagedAvailabilityGate({ store: undefined, hasPlatformBackend: true }),
    });

    const submit = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: {
        title: 'Quiet Self Round',
        concept: 'A concept long enough to pass validation rules.',
        builder: 'self',
      },
    });
    expect(submit.statusCode).toBe(200);
    const { token } = submit.json() as { token: string };
    let jobId = 0;
    await vi.waitFor(async () => {
      jobId = (await store.listSubmissionsByOwner('g:test-user'))[0]!.jobId;
      expect((await store.getSubmission(jobId))?.state).toBe('dispatched');
    });

    // Rebuild with the switch off — config lives on the store.
    await store.setCreationLimits({ managedBuilderMode: 'off' }, 'g:boss');
    const { app: appWithGate, authHeaders: freshHeaders } = await createApp({
      githubClient,
      submissionTokenSecret: secret,
      store,
      agentBackend: backend,
      managedAvailabilityGate: createManagedAvailabilityGate({ store, hasPlatformBackend: true, ttlMs: 0 }),
    });

    // No agent signal yet; omitting `builder` defaults the handoff to platform.
    const handoff = await appWithGate.inject({
      method: 'POST',
      url: `/api/submissions/${token}/handoff`,
      headers: freshHeaders,
    });

    expect(handoff.statusCode).toBe(409);
    expect(handoff.json()).toEqual({ error: 'platform_builder_unavailable', reason: 'outage' });
    expect((await store.getSubmission(jobId))?.builder).toBe('self');

    await appWithGate.close();
  });
});

/**
 * The status page polls, so several watchers of one build arrive together, and a
 * refresh is several GitHub reads against a token GitHub limits as a whole. Measured
 * in production before this existed: 28–58% of status polls returned 502 during the
 * hours people were actually watching builds.
 */
/**
 * The status route's coalescing and stale-serve, which used to be exercised through
 * GitHub. A job answers from its own record now, so the store is what can be slow or
 * fail — the behaviours under test are unchanged, only their source of pressure is.
 */
describe('status route under store pressure', () => {
  /**
   * The route reads the store twice per request: an abandoned-check that deliberately
   * sits outside the cache, then the coalesced refresh. `failOnCall` targets the second
   * of those, because the stale-serve being tested only wraps the refresh.
   */
  function spyStore(opts: { onGet?: () => Promise<void>; failOnCall?: number } = {}) {
    const inner = new InMemoryStore();
    let calls = 0;
    const getSubmission = vi.fn(async (jobId: number) => {
      calls += 1;
      if (opts.failOnCall === calls) throw new Error('firestore unavailable');
      if (opts.onGet) await opts.onGet();
      return inner.getSubmission(jobId);
    });
    const store = new Proxy(inner, {
      get: (target, prop) => (prop === 'getSubmission' ? getSubmission : Reflect.get(target, prop)),
    }) as Store;
    return { store, getSubmission };
  }

  it('coalesces concurrent cache misses into a single derivation', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { store, getSubmission } = spyStore({ onGet: () => gate });
    const { app } = await createApp({
      githubClient: createGithubClientStub({}).githubClient,
      store,
      submissionTokenSecret: secret,
    });
    const token = mintToken(123, secret);

    const polls = Promise.all([
      app.inject({ method: 'GET', url: `/api/submissions/${token}` }),
      app.inject({ method: 'GET', url: `/api/submissions/${token}` }),
      app.inject({ method: 'GET', url: `/api/submissions/${token}` }),
    ]);
    await vi.waitFor(() => expect(getSubmission).toHaveBeenCalled());
    release();
    const responses = await polls;

    // Three abandoned-checks + one coalesced refresh + three heartbeat overlays
    // (attachBuildEvents runs per response). A second refresh would mean no coalescing.
    expect(getSubmission).toHaveBeenCalledTimes(7);
    for (const response of responses) expect(response.statusCode).toBe(200);

    await app.close();
  });

  it('keeps the two locales apart while coalescing', async () => {
    const { store, getSubmission } = spyStore();
    const { app } = await createApp({
      githubClient: createGithubClientStub({}).githubClient,
      store,
      submissionTokenSecret: secret,
    });
    const token = mintToken(123, secret);

    await Promise.all([
      app.inject({ method: 'GET', url: `/api/submissions/${token}?locale=en` }),
      app.inject({ method: 'GET', url: `/api/submissions/${token}?locale=pl` }),
    ]);

    // Two keys → two refreshes (a shared one would hand a Polish reader English),
    // plus two abandoned-checks and two heartbeat overlays.
    expect(getSubmission).toHaveBeenCalledTimes(6);

    await app.close();
  });

  it('serves the last known status when a refresh fails', async () => {
    // Warm: abandoned + refresh + overlay (1–3). Stale: abandoned (4), then refresh
    // fails (5) — the stale-serve path. Overlay on the fallback is soft and may be 6.
    const { store } = spyStore({ failOnCall: 5 });
    let currentTime = 10_000;
    const { app } = await createApp({
      githubClient: createGithubClientStub({}).githubClient,
      store,
      submissionTokenSecret: secret,
      now: () => currentTime,
    });
    const token = mintToken(123, secret);

    const warm = await app.inject({ method: 'GET', url: `/api/submissions/${token}` });
    expect(warm.statusCode).toBe(200);

    currentTime += 60_001;
    const stale = await app.inject({ method: 'GET', url: `/api/submissions/${token}` });
    expect(stale.statusCode).toBe(200);
    expect(stale.json()).toEqual(warm.json());

    // The failure must not wedge anything: the next poll refreshes normally.
    currentTime += 60_001;
    expect((await app.inject({ method: 'GET', url: `/api/submissions/${token}` })).statusCode).toBe(200);

    await app.close();
  });

  it('still 502s when it fails with nothing cached to fall back on', async () => {
    const { store } = spyStore({ failOnCall: 2 });
    const { app } = await createApp({
      githubClient: createGithubClientStub({}).githubClient,
      store,
      submissionTokenSecret: secret,
    });

    const response = await app.inject({ method: 'GET', url: `/api/submissions/${mintToken(123, secret)}` });
    expect(response.statusCode).toBe(502);

    await app.close();
  });
});

describe('games published from the store rather than the repo', () => {
  const MEDIA_METADATA = JSON.stringify({
    captures: {
      opening: { file: 'opening.png' },
      gameplay: { file: 'gameplay.png' },
    },
    video: { file: 'gameplay.mp4' },
  });

  /** A store holding one published version: its spec, and the bundle the gate assembled. */
  function publishedGamesStore(
    bundle = '<!doctype html><meta name="ai-provenance" content="x" />game',
    submittedBy?: string,
  ) {
    return {
      getSourceFile: async (_slug: string, _version: string, path: string) =>
        path === 'SPEC.md'
          ? `---\ntitle: Comet Courier\ngenre: arcade\n${submittedBy ? `submitted_by: ${submittedBy}\n` : ''}---\n`
          : null,
      getDerivedArtifact: async (_slug: string, _version: string, name: string) => {
        if (name === 'bundle.html') return Buffer.from(bundle, 'utf8');
        if (name === 'media/metadata.json') return Buffer.from(MEDIA_METADATA, 'utf8');
        if (name === 'media/opening.png') return Buffer.from([0x89, 0x50, 0x4e, 0x47]);
        if (name === 'media/gameplay.mp4') return Buffer.from('fake-mp4');
        return null;
      },
      getManifest: async () => null,
      putCandidateSources: async () => ({ version: 'v1', manifest: {} }),
      putGateResult: async () => {},
      putDerivedArtifact: async () => {},
    } as unknown as GamesStore;
  }

  async function appWithPublication(
    gamesStore: GamesStore,
    catalog: CatalogGameEntry[] = [],
    gameSources: GameSources | null = null,
  ) {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:test-user' });
    await store.setPublication({
      slug: 'comet-courier',
      state: 'published',
      currentVersion: 'v1',
      publishedAt: '2026-07-30T12:00:00Z',
    });
    const { githubClient } = createGithubClientStub({ catalog, gameSources });
    const { app } = await createApp({
      githubClient,
      store,
      submissionTokenSecret: secret,
      agentChannel: { gamesStore },
    });
    return { app, store };
  }

  it('lists a store-published game the games repo has never heard of', async () => {
    // A delivered game is never committed, so the repo catalog cannot see it. Without
    // this the operator publishes a game and the site it was published to shows nothing.
    const { app } = await appWithPublication(publishedGamesStore());

    const response = await app.inject({ method: 'GET', url: '/api/catalog' });

    expect(response.statusCode).toBe(200);
    const entry = response.json().find((item: CatalogGameEntry) => item.slug === 'comet-courier');
    // Described by the same parser the repo path uses, so the two cannot disagree about
    // what a game's genre is. Media comes from the gate's derived artifacts — stubbing
    // the sibling reader used to leave every store card with `media: null`.
    expect(entry).toMatchObject({
      title: 'Comet Courier',
      genre: 'arcade',
      status: 'published',
      media: {
        screenshots: [
          { name: 'opening', file: 'opening.png' },
          { name: 'gameplay', file: 'gameplay.png' },
        ],
        video: 'gameplay.mp4',
      },
    });

    await app.close();
  });

  it('replaces a deleted creator byline even when the cached source still names them', async () => {
    const { app, store } = await appWithPublication(publishedGamesStore(undefined, 'Ada Lovelace'));
    await store.createSubmission(123, 'g:test-user', 'Comet Courier');
    await store.setSubmissionSlug(123, 'comet-courier');
    await store.setSubmissionPublishedAt(123, '2026-07-30T12:00:00Z');
    await store.deleteAccountIdentity('g:test-user', '2026-08-04T00:00:00Z');

    const response = await app.inject({ method: 'GET', url: '/api/catalog' });

    expect(response.statusCode).toBe(200);
    expect(response.json().find((item: CatalogGameEntry) => item.slug === 'comet-courier')).toMatchObject({
      submittedBy: 'gamedev-platform',
      creatorHandle: null,
    });

    await app.close();
  });

  it('serves store-published gallery media from the published version’s derived artifacts', async () => {
    const { app } = await appWithPublication(publishedGamesStore());

    const png = await app.inject({ method: 'GET', url: '/api/games/comet-courier/media/opening.png' });
    expect(png.statusCode).toBe(200);
    expect(png.headers['content-type']).toMatch(/image\/png/);
    expect(png.rawPayload).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const mp4 = await app.inject({ method: 'GET', url: '/api/games/comet-courier/media/gameplay.mp4' });
    expect(mp4.statusCode).toBe(200);
    expect(mp4.headers['content-type']).toMatch(/video\/mp4/);

    // Filenames the metadata does not declare stay behind the API boundary.
    const undeclared = await app.inject({ method: 'GET', url: '/api/games/comet-courier/media/secret.png' });
    expect(undeclared.statusCode).toBe(404);

    await app.close();
  });

  it('serves the gate’s own assembled document, so the played bytes are the checked ones', async () => {
    const { app } = await appWithPublication(publishedGamesStore());

    const response = await app.inject({ method: 'GET', url: '/api/games/comet-courier' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ slug: 'comet-courier', title: 'Comet Courier' });
    // The provenance marking is the visible proof it came through assembleGameHtml
    // rather than the games repo's own build.
    expect(response.json().html).toContain('ai-provenance');

    await app.close();
  });

  it('does not list one game twice while it exists on both sides', async () => {
    // During the migration a slug can be both committed and delivered. Two cards for
    // one game is worse than either source winning, and the repo copy is what the bake
    // serves — so it keeps the slug.
    const { app } = await appWithPublication(publishedGamesStore(), [catalogEntry('comet-courier')]);

    const response = await app.inject({ method: 'GET', url: '/api/catalog' });

    expect(response.json().filter((item: CatalogGameEntry) => item.slug === 'comet-courier')).toHaveLength(1);

    await app.close();
  });

  it('falls through to the repo rather than 404ing when a publication has no bundle', async () => {
    // A store record with no artifact must not take a working repo game off the site.
    const gamesStore = {
      ...publishedGamesStore(),
      getDerivedArtifact: async () => null,
    } as unknown as GamesStore;
    const { app } = await appWithPublication(gamesStore, [catalogEntry('comet-courier')], {
      indexHtml: '<div id="game"></div>',
      gameJs: 'const repoCopy = true;',
      styleCss: 'body{}',
      title: 'Comet Courier',
    });

    const response = await app.inject({ method: 'GET', url: '/api/games/comet-courier' });

    // Served from the repo path (the stub's sources), not refused.
    expect(response.statusCode).toBe(200);

    await app.close();
  });

  it('evicts the bundle, catalog and media caches so a delete takes effect immediately', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:boss' });
    await store.setPublication({
      slug: 'comet-courier',
      state: 'published',
      currentVersion: 'v1',
      publishedAt: '2026-07-30T12:00:00Z',
    });
    const { githubClient } = createGithubClientStub({});
    const { app } = await createApp({
      githubClient,
      store,
      submissionTokenSecret: secret,
      adminUids: 'g:boss',
      agentChannel: { gamesStore: publishedGamesStore() },
    });

    expect((await app.inject({ method: 'GET', url: '/api/games/comet-courier' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/games/comet-courier/media/opening.png' })).statusCode).toBe(
      200,
    );
    const warmCatalog = await app.inject({ method: 'GET', url: '/api/catalog' });
    expect(warmCatalog.json().some((item: CatalogGameEntry) => item.slug === 'comet-courier')).toBe(true);

    const del = await app.inject({
      method: 'POST',
      url: '/api/admin/games/comet-courier/delete',
      headers: getAuthHeaders('g:boss'),
    });
    expect(del.statusCode).toBe(200);

    expect((await app.inject({ method: 'GET', url: '/api/games/comet-courier' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/games/comet-courier/media/opening.png' })).statusCode).toBe(
      404,
    );
    const coldCatalog = await app.inject({ method: 'GET', url: '/api/catalog' });
    expect(coldCatalog.json().some((item: CatalogGameEntry) => item.slug === 'comet-courier')).toBe(false);

    await app.close();
  });
});

describe('a session that finishes without delivering', () => {
  /** Observes a finished session; `hasCandidate` comes from the record, not the stub. */
  function finishedBackend() {
    const { backend, briefs } = createBackendStub();
    return {
      briefs,
      backend: {
        ...backend,
        observe: async (_ref: string, opts: { hasCandidate: boolean }) => ({
          state: 'completed' as const,
          hasCandidate: opts.hasCandidate,
        }),
      },
    };
  }

  async function jobWithFinishedSession(overrides: { maxDeliveryNudges?: number } = {}) {
    const { githubClient } = createGithubClientStub({ jobId: 77 });
    const { backend, briefs } = finishedBackend();
    const clock = { t: Date.now() };
    const cleanup = vi.fn(async () => {});
    const { app, authHeaders, store } = await createApp({
      githubClient,
      agentBackend: { ...backend, cleanup },
      submissionTokenSecret: secret,
      now: () => clock.t,
      ...overrides,
    });
    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about delivering parcels in space.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    await store.setDispatchWorkspace(job.jobId, 'copilot/has-the-work');
    return { app, store, job, briefs, clock, cleanup, token: mintToken(job.jobId, secret) };
  }

  it('sends the session back to deliver instead of failing the build', async () => {
    // The work is very likely done and sitting on a branch — only the upload is
    // missing. Asking is far cheaper than the round it would otherwise cost.
    const { app, store, job, briefs, clock, token } = await jobWithFinishedSession();

    clock.t += 3 * 60 * 1000;
    const status = await app.inject({ method: 'GET', url: `/api/submissions/${token}`, headers: getAuthHeaders() });

    expect(status.statusCode).toBe(200);
    const brief = briefs.at(-1);
    expect(brief?.undelivered).toBe(true);
    // Dispatched again, not failed: the creator is not shown an error about a round that
    // is at this moment starting. `building` waits on a real `in_progress` observation.
    expect((await store.getSubmission(job.jobId))?.state).toBe('dispatched');

    await app.close();
  });

  it('keeps the branch holding the undelivered work', async () => {
    // Every other round deletes the previous workspace, because the store has the
    // truth. Here it does not — deleting would destroy what the new round was sent
    // to recover.
    const { app, cleanup, clock, token } = await jobWithFinishedSession();

    clock.t += 3 * 60 * 1000;
    await app.inject({ method: 'GET', url: `/api/submissions/${token}`, headers: getAuthHeaders() });

    expect(cleanup).not.toHaveBeenCalled();

    await app.close();
  });

  it('asks once, then reports the failure rather than retrying forever', async () => {
    // A setup that cannot deliver fails the same way however many times it is asked,
    // and every attempt is a real agent session against a real quota.
    const { app, store, job, briefs, clock, token } = await jobWithFinishedSession();

    clock.t += 3 * 60 * 1000;
    await app.inject({ method: 'GET', url: `/api/submissions/${token}`, headers: getAuthHeaders() });
    const afterFirst = briefs.length;

    // The re-sent session finishes without delivering too.
    clock.t += 3 * 60 * 1000;
    const status = await app.inject({ method: 'GET', url: `/api/submissions/${token}`, headers: getAuthHeaders() });

    expect(briefs.length).toBe(afterFirst);
    expect((await store.getSubmission(job.jobId))?.state).toBe('failed');
    expect(status.json().failure).toEqual({ reason: 'task_completed_without_delivery' });

    await app.close();
  });

  it('leaves a session that did deliver alone', async () => {
    const { app, store, job, briefs, clock, token } = await jobWithFinishedSession();
    await store.setSubmissionDeliveredVersion(job.jobId, 'v1');

    clock.t += 3 * 60 * 1000;
    await app.inject({ method: 'GET', url: `/api/submissions/${token}`, headers: getAuthHeaders() });

    expect(briefs.at(-1)?.undelivered).toBeUndefined();

    await app.close();
  });

  it('leaves a session that only delivered a preview alone too', async () => {
    // roundDeliveryCount proves a preview round submitted something.
    const { app, store, job, briefs, clock, token } = await jobWithFinishedSession();
    await store.setSubmissionPreviewVersion(job.jobId, 'v1');
    await store.incrementRoundDeliveryCount(job.jobId);

    clock.t += 3 * 60 * 1000;
    await app.inject({ method: 'GET', url: `/api/submissions/${token}`, headers: getAuthHeaders() });

    expect(briefs.at(-1)?.undelivered).toBeUndefined();
    expect((await store.getSubmission(job.jobId))?.state).not.toBe('failed');

    await app.close();
  });

  it('remints a validating round-scoped token for a legacy job with no generation field', async () => {
    // Pre-migration records have no roundGeneration. Undelivered resume remints a
    // round-scoped key claiming generation 1 — that field must be written, or the
    // brand-new token fails assertAgentTokenActive (active === undefined).
    const { app, store, job, briefs, clock, token } = await jobWithFinishedSession();
    const submissions = (
      store as unknown as { submissions: Map<number, import('./platform/store.js').SubmissionRecord> }
    ).submissions;
    const before = await store.getSubmission(job.jobId);
    submissions.set(job.jobId, { ...before!, roundGeneration: undefined });

    clock.t += 3 * 60 * 1000;
    await app.inject({ method: 'GET', url: `/api/submissions/${token}`, headers: getAuthHeaders() });

    const reminted = briefs.at(-1)?.channelToken;
    expect(reminted).toBeTruthy();
    const after = await store.getSubmission(job.jobId);
    expect(after?.roundGeneration).toBe(1);
    const claims = verifyAgentToken(reminted!, secret);
    expect(claims).toMatchObject({ jobId: job.jobId, roundGeneration: 1 });
    expect(() => assertAgentTokenActive(claims, after!, clock.t)).not.toThrow();

    await app.close();
  });
});

describe('a stale observation racing a handoff', () => {
  it("does not let a superseded ref's cancellation overwrite the round that replaced it", async () => {
    const { githubClient } = createGithubClientStub({});
    const briefs: BuildBrief[] = [];
    let observed = false;
    const dispatched = { jobId: undefined as number | undefined };
    const backend: AgentBackend = {
      name: 'stub',
      dispatch: async (brief) => {
        briefs.push(brief);
        return { ref: 'task-1', workspace: 'copilot/x' };
      },
      resume: async (brief) => {
        briefs.push(brief);
        return { ref: 'task-2', workspace: 'copilot/y' };
      },
      // A handoff dispatches "task-2" mid-observation of "task-1".
      observe: async (ref) => {
        if (ref === 'task-1' && !observed && dispatched.jobId !== undefined) {
          observed = true;
          await store.recordDispatch(dispatched.jobId, {
            backend: 'stub',
            ref: 'task-2',
            workspace: 'copilot/y',
          });
        }
        return { state: 'cancelled' as const };
      },
      cancel: async () => ({ enforced: false }),
    };
    const clock = { t: Date.now() };
    const { app, store, authHeaders } = await createApp({
      githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
      now: () => clock.t,
    });
    await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'A game', concept: 'A sufficiently long concept about a stale-observation race.' },
    });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    dispatched.jobId = job.jobId;
    const token = mintToken(job.jobId, secret);

    clock.t += 3 * 60 * 1000;
    await app.inject({ method: 'GET', url: `/api/submissions/${token}`, headers: getAuthHeaders() });

    const after = await store.getSubmission(job.jobId);
    expect(after?.dispatch?.refs).toEqual(['task-1', 'task-2']);
    expect(after?.state).not.toBe('canceled');

    await app.close();
  });
});

/**
 * The cost ledger. The unit here is a session, because that is the unit the backend
 * bills — see `JobCostEntry`.
 */
describe('what a build costs', () => {
  const body = { title: 'Game idea', concept: 'A concept long enough to pass validation rules.' };

  it('books a session the moment one is started', async () => {
    const stub = createGithubClientStub({});
    const { backend } = createBackendStub();
    const { app, store, authHeaders } = await createApp({
      githubClient: stub.githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
    });

    const created = await app.inject({ method: 'POST', url: '/api/submissions', headers: authHeaders, payload: body });
    expect(created.statusCode).toBe(200);

    const [record] = await store.listSubmissionsByOwner('g:test-user');
    expect(record?.costs).toEqual([
      {
        kind: 'agent_session',
        at: expect.any(String),
        by: 'stub',
        ref: 'task-1',
        credits: 1,
      },
    ]);

    await app.close();
  });

  it('books every round, including the ones that produced nothing', async () => {
    // The whole point of recording at dispatch: a revision round costs a premium request
    // whether or not it delivers, and a ledger written on success would price a game at
    // whatever its last attempt cost.
    const stub = createGithubClientStub({});
    const { backend } = createBackendStub();
    const { app, store, authHeaders } = await createApp({
      githubClient: stub.githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
    });

    const created = await app.inject({ method: 'POST', url: '/api/submissions', headers: authHeaders, payload: body });
    const { token } = created.json() as { token: string };

    // A delivery so the feedback round is a real revision (not the undelivered path),
    // and the first session must be over — mid-build feedback only steers via the inbox.
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    await store.setSubmissionDeliveredVersion(job.jobId, 'v1');
    await store.recordJobTransition(job.jobId, {
      to: 'ready_for_review',
      at: new Date().toISOString(),
      by: 'reconciler',
      reason: 'gate_green',
    });

    const feedback = await app.inject({
      method: 'POST',
      url: `/api/submissions/${token}/feedback`,
      headers: authHeaders,
      payload: { feedback: 'Make the ship a little slower, it is hard to control.' },
    });
    expect(feedback.statusCode).toBe(200);

    const [record] = await store.listSubmissionsByOwner('g:test-user');
    expect(record?.costs?.map((entry) => entry.ref)).toEqual(['task-1', 'task-2']);
    expect(record?.costs?.every((entry) => entry.credits === 1)).toBe(true);

    await app.close();
  });

  it('overwrites the dispatch placeholder with the real bill once the session reports usage', async () => {
    // The create response has no usage. Observation does — and that can arrive after
    // delivery has already moved the job past the agent, so cost reconciliation must
    // not be gated on job state the way lifecycle reconciliation is.
    const stub = createGithubClientStub({});
    const { backend } = createBackendStub();
    const observe = vi.fn(async () => ({
      state: 'completed' as const,
      hasCandidate: true,
      sessionCredits: 403.45,
    }));
    const clock = { t: Date.now() };
    const { app, store, authHeaders } = await createApp({
      githubClient: stub.githubClient,
      agentBackend: { ...backend, observe },
      submissionTokenSecret: secret,
      now: () => clock.t,
    });

    const created = await app.inject({ method: 'POST', url: '/api/submissions', headers: authHeaders, payload: body });
    const { token } = created.json() as { token: string };
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    await store.setSubmissionDeliveredVersion(job.jobId, 'v1');
    await store.recordJobTransition(job.jobId, {
      to: 'submitted',
      at: new Date(clock.t).toISOString(),
      by: 'agent',
      reason: 'sources_uploaded',
    });

    clock.t += 3 * 60 * 1000;
    await app.inject({ method: 'GET', url: `/api/submissions/${token}`, headers: authHeaders });

    const costs = (await store.getSubmission(job.jobId))?.costs;
    expect(costs).toEqual([
      {
        kind: 'agent_session',
        at: expect.any(String),
        by: 'stub',
        ref: 'task-1',
        credits: 403.45,
        creditsMeasured: true,
      },
    ]);

    await app.close();
  });
});

/**
 * Post-publish improvement (docs/improvement-loop-plan.md IL-3).
 *
 * The rule this pins is stated in job-state.ts: `published: []`, "improvements start a
 * *new* job, so publishing is terminal for this one". Getting it wrong is quiet — the
 * agent would be dispatched, the transition would fail to record, and the work would
 * land on a job that can never move on.
 */
describe('POST /api/submissions/:token/improve', () => {
  it('creates a new job on the same slug instead of resuming the published one', async () => {
    const stub = createGithubClientStub({});
    const { backend, briefs } = createBackendStub();
    const { app, store, authHeaders } = await createApp({
      githubClient: stub.githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
    });

    const published = await store.allocateJobId();
    await store.createSubmission(published, 'g:test-user', 'Crashy');
    await store.setSubmissionSlug(published, 'crashy');
    await store.setSubmissionPublishedAt(published, '2026-07-01T00:00:00.000Z');
    await store.recordJobTransition(published, {
      to: 'published',
      at: '2026-07-01T00:00:00.000Z',
      by: 'operator',
      reason: 'published',
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(published, secret)}/improve`,
      headers: authHeaders,
      payload: { feedback: 'Players keep falling through the floor on level two.' },
    });

    expect(res.statusCode).toBe(200);
    const dispatched = briefs.at(-1)!;
    // A different job, carrying the slug and the request — which is what makes the agent
    // prompt say "continue that game, revise it" and restore the delivered sources.
    expect(dispatched.jobId).not.toBe(published);
    expect(dispatched.slug).toBe('crashy');
    expect(dispatched.feedback).toContain('falling through the floor');
    // The published job is left exactly as it was.
    const source = await store.getSubmission(published);
    expect(source?.state).toBe('published');
    expect(source?.dispatch).toBeUndefined();
    await app.close();
  });

  it('inherits the source game’s last-used builder when the body omits builder', async () => {
    // Regression: improve used to create a blank job and let dispatchBuild default to
    // platform, so a self-built published game silently went to Copilot on the next
    // post-publish change — even when Studio later started sending builder again.
    const stub = createGithubClientStub({});
    const { backend } = createBackendStub();
    const { app, store, authHeaders } = await createApp({
      githubClient: stub.githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
    });

    const published = await store.allocateJobId();
    await store.createSubmission(published, 'g:test-user', 'Self Crashy');
    await store.setSubmissionSlug(published, 'self-crashy');
    await store.setRoundBuilder(published, 'self');
    await store.setSubmissionPublishedAt(published, '2026-07-01T00:00:00.000Z');

    const res = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(published, secret)}/improve`,
      headers: authHeaders,
      payload: { feedback: 'Keep the self agent on this revision of the published game.' },
    });

    expect(res.statusCode).toBe(200);
    const jobId = res.json().jobId as number;
    expect(jobId).not.toBe(published);
    const improvement = await store.getSubmission(jobId);
    expect(improvement?.builder).toBe('self');
    expect(improvement?.defaultBuilder).toBe('self');
    expect(improvement?.dispatch?.backend).toBe('self');
    expect(improvement?.dispatch?.refs).toEqual([`self:${jobId}`]);
    await app.close();
  });

  it('honours an explicit builder on improve, overriding the source game’s last builder', async () => {
    const stub = createGithubClientStub({});
    const { backend, briefs } = createBackendStub();
    const { app, store, authHeaders } = await createApp({
      githubClient: stub.githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
    });

    const published = await store.allocateJobId();
    await store.createSubmission(published, 'g:test-user', 'Was Self');
    await store.setSubmissionSlug(published, 'was-self');
    await store.setRoundBuilder(published, 'self');
    await store.setSubmissionPublishedAt(published, '2026-07-01T00:00:00.000Z');

    const res = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(published, secret)}/improve`,
      headers: authHeaders,
      payload: {
        feedback: 'Hand this published revision back to the platform team for once.',
        builder: 'platform',
      },
    });

    expect(res.statusCode).toBe(200);
    const jobId = res.json().jobId as number;
    const improvement = await store.getSubmission(jobId);
    expect(improvement?.builder).toBe('platform');
    expect(improvement?.defaultBuilder).toBe('platform');
    expect(improvement?.dispatch?.backend).toBe('stub');
    expect(briefs.at(-1)?.jobId).toBe(jobId);
    await app.close();
  });

  it('returns the new job’s own token so the creator’s thread can move onto it', async () => {
    // Publishing is terminal: the improvement is a new job, and the published token
    // cannot address it (its round key is dead). The response has to carry the new
    // job's own capability, minted exactly like the shelf mints one per record.
    const stub = createGithubClientStub({});
    const { backend } = createBackendStub();
    const { app, store, authHeaders } = await createApp({
      githubClient: stub.githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
    });

    const published = await store.allocateJobId();
    await store.createSubmission(published, 'g:test-user', 'Handoff Game');
    await store.setSubmissionSlug(published, 'handoff-game');
    await store.setSubmissionPublishedAt(published, '2026-07-01T00:00:00.000Z');

    const res = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(published, secret)}/improve`,
      headers: authHeaders,
      payload: { feedback: 'Please add a checkpoint before the hard second level jump.' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; jobId: number; token: string; slug: string };
    // The wire name stays `jobId` (the client type was the thing out of step, not this).
    expect(body.jobId).toBeTypeOf('number');
    expect(body.jobId).not.toBe(published);
    expect(body.slug).toBe('handoff-game');
    // The token addresses the *new* job, not the published one it was minted from.
    expect(body.token).toBeTypeOf('string');
    expect(verifyToken(body.token, secret)).toBe(body.jobId);
    expect(verifyToken(body.token, secret)).not.toBe(published);
    await app.close();
  });

  it('opens the new round’s thread with the request that started it', async () => {
    // Publishing is terminal, so an improvement is a new job with an empty thread. The
    // request used to live only in the brief the agent reads: the creator would send it,
    // land on the new round, and find no trace of what they had just asked for — and a
    // reload dropped the page's own local echo too.
    const stub = createGithubClientStub({});
    const { backend } = createBackendStub();
    const { app, store, authHeaders } = await createApp({
      githubClient: stub.githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
    });

    const published = await store.allocateJobId();
    await store.createSubmission(published, 'g:test-user', 'Echo Game');
    await store.setSubmissionSlug(published, 'echo-game');
    await store.setSubmissionPublishedAt(published, '2026-07-01T00:00:00.000Z');

    const res = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(published, secret)}/improve`,
      headers: authHeaders,
      payload: {
        feedback: 'Please add a checkpoint before the hard second level jump.',
        context: { instrumentation: { playSeconds: 30 } },
      },
    });
    expect(res.statusCode).toBe(200);
    const jobId = res.json().jobId as number;

    const status = await app.inject({
      method: 'GET',
      url: `/api/submissions/${res.json().token}`,
      headers: authHeaders,
    });
    const revisions = status.json().progress?.revisions;
    expect(revisions).toHaveLength(1);
    // Their own words, so no relay label — and without the instrumentation block that
    // was stapled on for the agent.
    expect(revisions[0].text).toBe('Please add a checkpoint before the hard second level jump.');
    expect(revisions[0].origin).toBeUndefined();

    // Written already delivered: the brief carries the same words to the agent, so
    // queueing it too would hand over one instruction that looks like two.
    expect(await store.listPendingCreatorMessages(jobId)).toEqual([]);
    await app.close();
  });

  it('attaches prior sibling rounds on the tip job’s status so Studio can keep history', async () => {
    // Publishing is terminal → improve = new job with an empty live thread. Prior days of
    // chat still live on the old job; status must surface them as priorRounds rather than
    // looking deleted.
    const stub = createGithubClientStub({});
    const { backend } = createBackendStub();
    const { app, store, authHeaders } = await createApp({
      githubClient: stub.githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
    });

    const published = await store.allocateJobId();
    await store.createSubmission(published, 'g:test-user', 'History Game');
    await store.setSubmissionSlug(published, 'history-game');
    await store.setSubmissionPublishedAt(published, '2026-07-01T00:00:00.000Z');
    await store.appendCreatorMessage(published, 'Make the lobby louder.');
    await store.appendBuildEvent(published, {
      kind: 'done',
      step: 'polishing',
      text: 'Lobby volume bumped for the opening scene.',
      createdAt: '2026-07-01T01:00:00.000Z',
    });

    // Another creator's job on the same slug must never appear.
    const foreign = await store.allocateJobId();
    await store.createSubmission(foreign, 'g:other-user', 'History Game');
    await store.setSubmissionSlug(foreign, 'history-game');
    await store.appendCreatorMessage(foreign, 'Secret foreign note.');

    const improve = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(published, secret)}/improve`,
      headers: authHeaders,
      payload: { feedback: 'Add a pause button on the schedule screen.' },
    });
    expect(improve.statusCode).toBe(200);
    const tipToken = improve.json().token as string;

    const status = await app.inject({ method: 'GET', url: `/api/submissions/${tipToken}` });
    expect(status.statusCode).toBe(200);
    const prior = status.json().priorRounds as
      Array<{ id: string; publishedAt?: string; entries: Array<{ kind: string; text: string }> }> | undefined;
    expect(prior).toHaveLength(1);
    expect(prior![0]!.id).toBe(String(published));
    expect(prior![0]!.publishedAt).toBe('2026-07-01T00:00:00.000Z');
    expect(prior![0]!.entries.map((e) => e.text)).toEqual(
      expect.arrayContaining(['Make the lobby louder.', 'Lobby volume bumped for the opening scene.']),
    );
    expect(prior![0]!.entries.some((e) => e.text.includes('foreign'))).toBe(false);

    // An old status token must not list later improve rounds as "earlier" history
    // (Codex): the published job's status stays its own thread only.
    const oldStatus = await app.inject({
      method: 'GET',
      url: `/api/submissions/${mintToken(published, secret)}`,
    });
    expect(oldStatus.statusCode).toBe(200);
    expect(oldStatus.json().priorRounds).toBeUndefined();

    await app.close();
  });
});

/**
 * The operator's cancel and retry. Both live behind the same 404-to-strangers posture
 * as every other operator surface, and both act through the state machine rather than
 * around it.
 */
describe('operator cancel and retry', () => {
  const body = { title: 'Game idea', concept: 'A concept long enough to pass validation rules.' };
  const bossHeaders = () => getAuthHeaders('g:boss');

  /** A dispatched job owned by g:test-user, with an operator allowlisted. */
  async function appWithJob(overrides: { backend?: AgentBackend } = {}) {
    const stub = createGithubClientStub({});
    const { backend, briefs } = createBackendStub();
    const { app, store, authHeaders } = await createApp({
      githubClient: stub.githubClient,
      agentBackend: overrides.backend ?? backend,
      submissionTokenSecret: secret,
      adminUids: 'g:boss',
    });
    // The auth hook resolves the session's user from the store, so the operator has to
    // exist there like anyone else.
    await store.upsertUser({ uid: 'g:boss' });
    await app.inject({ method: 'POST', url: '/api/submissions', headers: authHeaders, payload: body });
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    return { app, store, job, briefs };
  }

  it('answers 404 to a non-operator, the same as every operator surface', async () => {
    const { app, job } = await appWithJob();

    for (const verb of ['cancel', 'retry']) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/jobs/${job.jobId}/${verb}`,
        headers: getAuthHeaders('g:someone-else'),
      });
      expect(response.statusCode).toBe(404);
    }

    await app.close();
  });

  it('cancels a running job, and is honest that the stop is cooperative', async () => {
    const { app, store, job } = await appWithJob();

    const response = await app.inject({
      method: 'POST',
      url: `/api/admin/jobs/${job.jobId}/cancel`,
      headers: bossHeaders(),
    });

    expect(response.statusCode).toBe(200);
    // `stopEnforced: false` is the Copilot backend telling the truth: there is no kill
    // endpoint, the session winds down when it next reads the channel.
    expect(response.json()).toEqual({ ok: true, state: 'canceled', stopEnforced: false });

    const record = await store.getSubmission(job.jobId);
    expect(record?.state).toBe('canceled');
    // Shelf filters on `abandonedAt`. Without it, an operator reject left the game
    // on the creator's studio with Playtest still offered.
    expect(record?.abandonedAt).toBeTruthy();
    const last = record?.transitions?.at(-1);
    expect(last).toMatchObject({ to: 'canceled', by: 'operator', reason: 'operator_canceled' });

    await app.close();
  });

  it('refuses to cancel a finished job rather than rewriting its ending', async () => {
    const { app, store, job } = await appWithJob();
    await store.recordJobTransition(job.jobId, {
      to: 'published',
      at: new Date().toISOString(),
      by: 'operator',
      reason: 'published',
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/admin/jobs/${job.jobId}/cancel`,
      headers: bossHeaders(),
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: 'already_finished', state: 'published' });

    await app.close();
  });

  it('refuses to cancel mid-publish, where a half-killed bake could lie', async () => {
    const { app, store, job } = await appWithJob();
    await store.recordJobTransition(job.jobId, {
      to: 'publishing',
      at: new Date().toISOString(),
      by: 'operator',
      reason: 'approved',
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/admin/jobs/${job.jobId}/cancel`,
      headers: bossHeaders(),
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: 'mid_publish' });

    await app.close();
  });

  it('retries a failed round that never delivered, preserving its branch', async () => {
    const { app, store, job, briefs } = await appWithJob();
    await store.setDispatchWorkspace(job.jobId, 'copilot/has-the-work');
    await store.recordJobTransition(job.jobId, {
      to: 'failed',
      at: new Date().toISOString(),
      by: 'reconciler',
      reason: 'task_failed',
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/admin/jobs/${job.jobId}/retry`,
      headers: bossHeaders(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, state: 'dispatched', creditsSpent: 1 });

    const brief = briefs.at(-1);
    expect(brief?.undelivered).toBe(true);

    const record = await store.getSubmission(job.jobId);
    expect(record?.state).toBe('dispatched');
    // The history says who restarted it, not `derived_from_github`.
    expect(record?.transitions?.at(-1)).toMatchObject({ to: 'dispatched', by: 'operator', reason: 'operator_retry' });
    // The retry is an agent session like any other, so the ledger books it.
    expect(record?.costs?.filter((entry) => entry.kind === 'agent_session')).toHaveLength(2);

    await app.close();
  });

  it('briefs a delivered-but-refused retry from the channel, not from a second copy', async () => {
    const { app, store, job, briefs } = await appWithJob();
    await store.setSubmissionDeliveredVersion(job.jobId, 'v1');
    await store.recordJobTransition(job.jobId, {
      to: 'needs_changes',
      at: new Date().toISOString(),
      by: 'gate',
      reason: 'gate_red',
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/admin/jobs/${job.jobId}/retry`,
      headers: bossHeaders(),
    });

    expect(response.statusCode).toBe(200);
    const brief = briefs.at(-1);
    // Delivered work restores from the store; nothing to salvage from a branch.
    expect(brief?.undelivered).toBeUndefined();
    // The brief points at the channel rather than repeating the gate report, which the
    // channel already carries on every call.
    expect(brief?.feedback).toContain('build channel');

    await app.close();
  });

  it('kicks a quiet building job with a fresh session, and says so in the history', async () => {
    const { app, store, job } = await appWithJob();
    await store.recordJobTransition(job.jobId, {
      to: 'building',
      at: new Date().toISOString(),
      by: 'reconciler',
      reason: 'task_in_progress',
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/admin/jobs/${job.jobId}/retry`,
      headers: bossHeaders(),
    });

    expect(response.statusCode).toBe(200);
    const record = await store.getSubmission(job.jobId);
    // New session boots at `dispatched` — claiming `building` again would lie about
    // Copilot startup. History still names the operator retry.
    expect(record?.state).toBe('dispatched');
    expect(record?.transitions?.at(-1)).toMatchObject({ to: 'dispatched', by: 'operator', reason: 'operator_retry' });
    expect(record?.dispatch?.refs).toHaveLength(2);

    await app.close();
  });

  it('refuses to retry a job that was never dispatched, where a round would brief nothing', async () => {
    const stub = createGithubClientStub({});
    // No agent backend on create: the job stays queued with no dispatch and no spec on
    // record. Retry must refuse rather than start an empty session — but the route
    // needs *a* backend to exist, so one is present and never called.
    const { backend, briefs } = createBackendStub();
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:test-user' });
    await store.upsertUser({ uid: 'g:boss' });
    const first = await createApp({ githubClient: stub.githubClient, submissionTokenSecret: secret, store });
    await first.app.inject({ method: 'POST', url: '/api/submissions', headers: first.authHeaders, payload: body });
    await first.app.close();
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    await store.recordJobTransition(job.jobId, {
      to: 'failed',
      at: new Date().toISOString(),
      by: 'system',
      reason: 'dispatch_failed',
    });

    const { app } = await createApp({
      githubClient: stub.githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
      adminUids: 'g:boss',
      store,
    });
    const response = await app.inject({
      method: 'POST',
      url: `/api/admin/jobs/${job.jobId}/retry`,
      headers: bossHeaders(),
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: 'never_dispatched' });
    expect(briefs).toHaveLength(0);

    await app.close();
  });

  it('refuses states where a retry has nothing to redo', async () => {
    const { app, store, job } = await appWithJob();
    await store.setSubmissionDeliveredVersion(job.jobId, 'v1');
    await store.recordJobTransition(job.jobId, {
      to: 'ready_for_review',
      at: new Date().toISOString(),
      by: 'gate',
      reason: 'gate_green',
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/admin/jobs/${job.jobId}/retry`,
      headers: bossHeaders(),
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: 'not_retryable', state: 'ready_for_review' });

    await app.close();
  });

  it('reports a dispatch that failed instead of pretending the retry took', async () => {
    const { backend } = createBackendStub();
    const failing: AgentBackend = {
      ...backend,
      dispatch: async () => {
        throw new Error('backend down');
      },
      resume: async () => {
        throw new Error('backend down');
      },
    };
    const { app, store, job } = await appWithJob();
    await app.close();

    const second = await createApp({
      githubClient: createGithubClientStub({}).githubClient,
      agentBackend: failing,
      submissionTokenSecret: secret,
      adminUids: 'g:boss',
      store,
    });
    await store.recordJobTransition(job.jobId, {
      to: 'failed',
      at: new Date().toISOString(),
      by: 'reconciler',
      reason: 'task_failed',
    });

    const response = await second.app.inject({
      method: 'POST',
      url: `/api/admin/jobs/${job.jobId}/retry`,
      headers: bossHeaders(),
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({ error: 'dispatch_failed' });

    await second.app.close();
  });

  it('names an exhausted agent allowance rather than calling it a dispatch failure', async () => {
    // 412 from the agent-tasks API means the coding-agent account has no premium requests
    // left. Every job on the site is equally stuck and the button will not fix any of
    // them, so the operator has to be sent to billing rather than back to the button.
    const { backend } = createBackendStub();
    const outOfQuota: AgentBackend = {
      ...backend,
      resume: async () => {
        throw Object.assign(new Error('agent tasks POST 412: insufficient premium quota to create assignment'), {
          name: 'AgentTasksError',
          status: 412,
        });
      },
    };
    const { app, store, job } = await appWithJob({ backend: outOfQuota });
    await store.recordJobTransition(job.jobId, {
      to: 'failed',
      at: new Date().toISOString(),
      by: 'reconciler',
      reason: 'task_failed',
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/admin/jobs/${job.jobId}/retry`,
      headers: bossHeaders(),
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({ error: 'no_capacity' });

    await app.close();
  });
});

describe('dispatch reaper', () => {
  const body = { title: 'Game idea', concept: 'A concept long enough to pass validation rules.' };
  const allowAll: InternalAuthVerifier = { verify: async () => true };
  const denyAll: InternalAuthVerifier = { verify: async () => false };

  // A job whose create-time dispatch had no backend to run on.
  async function stuckJob(store: Store) {
    const stub = createGithubClientStub({});
    const first = await createApp({ githubClient: stub.githubClient, submissionTokenSecret: secret, store });
    const res = await first.app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: first.authHeaders,
      payload: body,
    });
    await first.app.close();
    const [job] = await store.listSubmissionsByOwner('g:test-user');
    expect(res.statusCode).toBe(200);
    expect(job.state).toBe('queued');
    expect(job.dispatch).toBeUndefined();
    return job;
  }

  async function reaperApp(params: {
    store: Store;
    agentBackend?: AgentBackend;
    internalAuthVerifier?: InternalAuthVerifier;
    now?: () => number;
  }) {
    const stub = createGithubClientStub({});
    return buildApp({
      store: params.store,
      sessionSecret,
      submissionRoutes: {
        githubToken: 'token',
        submissionTokenSecret: secret,
        gamesRepo: repo,
        githubClient: stub.githubClient,
        agentBackend: params.agentBackend,
        managedAvailabilityGate: null,
        chatAgent: new StubStudioChatAgent({ kind: 'build' }),
      },
      dispatchReaperRoutes: {
        internalAuthVerifier: params.internalAuthVerifier ?? allowAll,
        ...(params.now ? { now: params.now } : {}),
      },
    });
  }

  it('is closed by default, so an unconfigured deploy cannot be swept by anyone', async () => {
    const app = await buildApp({ store: new InMemoryStore(), sessionSecret });
    const res = await app.inject({ method: 'POST', url: '/api/internal/dispatch-reaper' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('rejects a caller without a valid scheduler token', async () => {
    const store = new InMemoryStore();
    const app = await reaperApp({ store, internalAuthVerifier: denyAll });
    const res = await app.inject({ method: 'POST', url: '/api/internal/dispatch-reaper' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('leaves a job alone while it is still within the dispatch window', async () => {
    const store = new InMemoryStore();
    const job = await stuckJob(store);
    const { backend, briefs } = createBackendStub();
    const app = await reaperApp({ store, agentBackend: backend });

    const res = await app.inject({ method: 'POST', url: '/api/internal/dispatch-reaper' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ checked: 1, retried: 0, exhausted: 0, skipped: 1 });
    expect(briefs).toHaveLength(0);
    expect((await store.getSubmission(job.jobId))?.state).toBe('queued');
    await app.close();
  });

  it('redispatches a job stuck past the window, with a spec rebuilt from what was stored', async () => {
    const store = new InMemoryStore();
    const job = await stuckJob(store);
    const { backend, briefs } = createBackendStub();
    const farFuture = () => Date.now() + 60 * 60 * 1000;
    const app = await reaperApp({ store, agentBackend: backend, now: farFuture });

    const res = await app.inject({ method: 'POST', url: '/api/internal/dispatch-reaper' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ checked: 1, retried: 1, exhausted: 0 });
    expect(briefs).toHaveLength(1);
    expect(briefs[0]?.spec).toContain('Game idea');
    const record = await store.getSubmission(job.jobId);
    expect(record?.state).toBe('dispatched');
    expect(record?.dispatch?.refs).toHaveLength(1);
    expect(record?.dispatchReaperAttemptedAt).toBeDefined();
    await app.close();
  });

  it('does not redispatch twice: a second stall after the one retry ends the round', async () => {
    const store = new InMemoryStore();
    const job = await stuckJob(store);
    const dead: AgentBackend = {
      ...createBackendStub().backend,
      dispatch: async () => {
        throw new Error('backend down');
      },
    };
    const farFuture = () => Date.now() + 60 * 60 * 1000;
    const app = await reaperApp({ store, agentBackend: dead, now: farFuture });

    const first = await app.inject({ method: 'POST', url: '/api/internal/dispatch-reaper' });
    expect(first.json()).toMatchObject({ retried: 1, exhausted: 0 });
    expect((await store.getSubmission(job.jobId))?.state).toBe('queued');

    const second = await app.inject({ method: 'POST', url: '/api/internal/dispatch-reaper' });
    expect(second.json()).toMatchObject({ retried: 0, exhausted: 1 });
    const record = await store.getSubmission(job.jobId);
    expect(record?.state).toBe('failed');
    expect(record?.transitions?.at(-1)).toMatchObject({ by: 'system', reason: 'dispatch_reaper_exhausted' });

    await app.close();
  });
});

/**
 * The operator's health re-gate: the manual trigger of the break-and-nudge loop. The
 * verdict's read-back and the nudge itself are covered with the sweep
 * (notify-sweep.test.ts); this is the request side.
 */
describe('operator health re-gate', () => {
  const bossHeaders = () => getAuthHeaders('g:boss');

  async function appWithPublishedGame(publicationState: 'published' | 'disabled' = 'published') {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:test-user' });
    await store.upsertUser({ uid: 'g:boss' });
    await store.createSubmission(1_000_042, 'g:creator', 'Sky Dodge');
    await store.setPublication({
      slug: 'sky-dodge',
      state: publicationState,
      currentVersion: 'v1',
      publishedAt: '2026-07-01T00:00:00.000Z',
    });

    const triggered: Array<{ jobId: number; slug: string; version: string; mode?: 'health' }> = [];
    const gamesStore = {
      getManifest: async () => ({
        slug: 'sky-dodge',
        version: 'v1',
        createdAt: '2026-06-30T00:00:00.000Z',
        jobId: 1_000_042,
        sourceFiles: [],
      }),
    } as unknown as GamesStore;

    const { app } = await createApp({
      githubClient: createGithubClientStub({}).githubClient,
      store,
      submissionTokenSecret: secret,
      adminUids: 'g:boss',
      agentChannel: {
        gamesStore,
        onSourcesDelivered: async (input) => {
          triggered.push(input);
          return { buildId: 'health-build-1' };
        },
      },
    });
    return { app, store, triggered };
  }

  it('answers 404 to a non-operator', async () => {
    const { app } = await appWithPublishedGame();

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/games/sky-dodge/regate',
      headers: getAuthHeaders('g:someone-else'),
    });
    expect(response.statusCode).toBe(404);

    await app.close();
  });

  it('starts a health run against the current engine and records what it asked', async () => {
    const { app, store, triggered } = await appWithPublishedGame();

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/games/sky-dodge/regate',
      headers: bossHeaders(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, slug: 'sky-dodge', version: 'v1', buildId: 'health-build-1' });
    // Same configured trigger the delivery path uses, in health mode — a second
    // trigger would be a second definition of the gate.
    expect(triggered).toEqual([{ jobId: 1_000_042, slug: 'sky-dodge', version: 'v1', mode: 'health' }]);

    // The pending check is what the sweep will resolve.
    const publication = await store.getPublication('sky-dodge');
    expect(publication?.healthCheck).toMatchObject({ version: 'v1', buildId: 'health-build-1' });
    expect(publication?.healthCheck?.verdictAt).toBeUndefined();

    // A health run is a gate run on the bill, booked to the job that built the game.
    const record = await store.getSubmission(1_000_042);
    expect(record?.costs).toEqual([
      expect.objectContaining({ kind: 'gate_run', by: 'cloud-build', ref: 'health-build-1' }),
    ]);

    await app.close();
  });

  it('refuses a game that is not currently published', async () => {
    // Nothing is live, so there is nothing whose health could mean anything.
    const { app, triggered } = await appWithPublishedGame('disabled');

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/games/sky-dodge/regate',
      headers: bossHeaders(),
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: 'not_published', state: 'disabled' });
    expect(triggered).toHaveLength(0);

    await app.close();
  });

  it('lists the published shelf with its health for the console', async () => {
    const { app, store } = await appWithPublishedGame();
    await store.setPublicationHealthCheck('sky-dodge', {
      version: 'v1',
      requestedAt: '2026-07-29T10:00:00.000Z',
      green: false,
      verdictAt: '2026-07-29T10:20:00.000Z',
    });

    const response = await app.inject({ method: 'GET', url: '/api/admin/games', headers: bossHeaders() });

    expect(response.statusCode).toBe(200);
    expect(response.json().games).toEqual([
      expect.objectContaining({
        slug: 'sky-dodge',
        currentVersion: 'v1',
        healthCheck: expect.objectContaining({ green: false }),
      }),
    ]);

    await app.close();
  });
});

describe('creator deletes their own published game', () => {
  async function appWithPublishedSubmission(
    ownerUid: string,
    publicationState: 'published' | 'archived' = 'published',
  ) {
    const { githubClient } = createGithubClientStub({});
    const { app, authHeaders, store } = await createApp({ githubClient, submissionTokenSecret: secret });
    await store.upsertUser({ uid: ownerUid });
    await store.createSubmission(1_000_099, ownerUid, 'Sky Dodge');
    await store.setSubmissionSlug(1_000_099, 'sky-dodge');
    await store.setPublication({
      slug: 'sky-dodge',
      state: publicationState,
      currentVersion: 'v1',
      publishedAt: '2026-07-01T00:00:00.000Z',
    });
    return { app, authHeaders, store };
  }

  it('archives the publication and leaves nothing else touched', async () => {
    const { app, authHeaders, store } = await appWithPublishedSubmission('g:test-user');

    const response = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(1_000_099, secret)}/delete-game`,
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, slug: 'sky-dodge' });
    expect(await store.getPublication('sky-dodge')).toMatchObject({
      state: 'archived',
      takedownReason: 'deleted by creator',
    });

    await app.close();
  });

  it("refuses a token that is not the game's creator", async () => {
    const { app, store } = await appWithPublishedSubmission('g:someone-else');
    await store.upsertUser({ uid: 'g:test-user' });

    const response = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(1_000_099, secret)}/delete-game`,
      headers: getAuthHeaders('g:test-user'),
    });

    expect(response.statusCode).toBe(403);
    expect(await store.getPublication('sky-dodge')).toMatchObject({ state: 'published' });

    await app.close();
  });

  it('refuses a game that is not currently published', async () => {
    const { app, authHeaders, store } = await appWithPublishedSubmission('g:test-user', 'archived');

    const response = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(1_000_099, secret)}/delete-game`,
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(409);
    expect(await store.getPublication('sky-dodge')).toMatchObject({ state: 'archived' });

    await app.close();
  });

  it("refuses the previous owner's token once a slug transfer moves the game on", async () => {
    const { githubClient } = createGithubClientStub({});
    const { app, store } = await createApp({ githubClient, submissionTokenSecret: secret });
    await store.upsertUser({ uid: 'g:previous' });
    await store.upsertUser({ uid: 'g:new-owner' });
    await store.createSubmission(1_000_100, 'g:previous', 'Sky Dodge');
    await store.setSubmissionSlug(1_000_100, 'sky-dodge');
    await store.setSubmissionPublishedAt(1_000_100, '2026-07-01T00:00:00.000Z');
    await new Promise((resolve) => setTimeout(resolve, 2));
    await store.createSubmission(1_000_101, 'g:new-owner', 'Sky Dodge');
    await store.setSubmissionSlug(1_000_101, 'sky-dodge');
    await store.setPublication({
      slug: 'sky-dodge',
      state: 'published',
      currentVersion: 'v1',
      publishedAt: '2026-07-01T00:00:00.000Z',
    });

    const fromPrevious = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(1_000_100, secret)}/delete-game`,
      headers: getAuthHeaders('g:previous'),
    });
    expect(fromPrevious.statusCode).toBe(403);
    expect(await store.getPublication('sky-dodge')).toMatchObject({ state: 'published' });

    const fromNewOwner = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(1_000_101, secret)}/delete-game`,
      headers: getAuthHeaders('g:new-owner'),
    });
    expect(fromNewOwner.statusCode).toBe(200);
    expect(await store.getPublication('sky-dodge')).toMatchObject({ state: 'archived' });

    await app.close();
  });
});

describe('operator deletes a published game', () => {
  const bossHeaders = () => getAuthHeaders('g:boss');

  async function appWithPublishedGame(publicationState: 'published' | 'disabled' = 'published') {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:test-user' });
    await store.upsertUser({ uid: 'g:boss' });
    await store.setPublication({
      slug: 'sky-dodge',
      state: publicationState,
      currentVersion: 'v1',
      publishedAt: '2026-07-01T00:00:00.000Z',
    });

    const { app } = await createApp({
      githubClient: createGithubClientStub({}).githubClient,
      store,
      submissionTokenSecret: secret,
      adminUids: 'g:boss',
    });
    return { app, store };
  }

  it('answers 404 to a non-operator', async () => {
    const { app } = await appWithPublishedGame();

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/games/sky-dodge/delete',
      headers: getAuthHeaders('g:someone-else'),
    });
    expect(response.statusCode).toBe(404);

    await app.close();
  });

  it('answers 404 for a slug with no publication at all', async () => {
    const { app } = await appWithPublishedGame();

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/games/never-published/delete',
      headers: bossHeaders(),
    });
    expect(response.statusCode).toBe(404);

    await app.close();
  });

  it('refuses a game that is not currently published', async () => {
    const { app, store } = await appWithPublishedGame('disabled');

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/games/sky-dodge/delete',
      headers: bossHeaders(),
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: 'not_published', state: 'disabled' });
    expect(await store.getPublication('sky-dodge')).toMatchObject({ state: 'disabled' });

    await app.close();
  });

  it('archives the game and records the operator-supplied reason', async () => {
    const { app, store } = await appWithPublishedGame();

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/games/sky-dodge/delete',
      headers: { ...bossHeaders(), 'content-type': 'application/json' },
      payload: { reason: 'infringing assets' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, slug: 'sky-dodge' });
    expect(await store.getPublication('sky-dodge')).toMatchObject({
      state: 'archived',
      takedownReason: 'infringing assets',
    });

    await app.close();
  });

  it('defaults the reason when the operator gives none', async () => {
    const { app, store } = await appWithPublishedGame();

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/games/sky-dodge/delete',
      headers: bossHeaders(),
    });

    expect(response.statusCode).toBe(200);
    expect(await store.getPublication('sky-dodge')).toMatchObject({
      state: 'archived',
      takedownReason: 'deleted by operator',
    });

    await app.close();
  });
});

/**
 * Seeding through the whole submission path.
 *
 * The unit tests cover what a seed may contain and how a backend places it; these cover
 * the two things only the route can get wrong — that a seeded build has a slug and a
 * priced ledger entry before the agent starts, and that none of it can cost a creator
 * their build when it goes wrong.
 */
describe('seeded dispatch', () => {
  function seederStub(draft: Partial<SeedDraft> | null, onSeed?: (slug: string) => void): GameSeeder {
    return {
      seed: async ({ slug }) => {
        onSeed?.(slug);
        if (!draft) return null;
        return {
          slug,
          files: [{ path: 'game.ts', content: 'export {};\n' }],
          references: ['apex-sprint'],
          usage: { inputTokens: 30_000, outputTokens: 9_000, model: 'gemini-3.7-flash' },
          elapsedMs: 41_000,
          compiles: false,
          repaired: false,
          ...draft,
        } as SeedDraft;
      },
    };
  }

  async function submitOne(title: string, params: Parameters<typeof createApp>[0]) {
    const { app, store, authHeaders } = await createApp(params);
    const response = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title, concept: 'A game where you deliver parcels between comets, dodging debris.' },
    });
    return { app, store, response };
  }

  it('seeds into the job’s own slug and bills the tokens to it', async () => {
    const stub = createGithubClientStub({});
    const { backend, briefs } = createBackendStub();
    const seeded: string[] = [];
    const { app, store, response } = await submitOne('Comet Courier', {
      githubClient: stub.githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
      gameSeeder: seederStub({}, (slug) => seeded.push(slug)),
    });

    expect(response.statusCode).toBe(200);
    // Dispatch is off the response path, so this is awaited rather than assumed: the
    // submit returns as soon as the job exists, and seeding runs behind it.
    await vi.waitFor(() => expect(briefs).toHaveLength(1));
    // The submission minted and confirmed this address before dispatch; the seeder
    // writes into it rather than deciding a second one.
    expect(seeded).toEqual(['comet-courier']);

    // The job id comes from the brief the backend was handed: the route answers with a
    // status token, and the seed is written before either of them exists.
    const record = await store.getSubmission(briefs[0].jobId);
    expect(record?.slug).toBe('comet-courier');
    expect(briefs[0].seed?.slug).toBe('comet-courier');
    expect(briefs[0].slug).toBe('comet-courier');

    // A real token measurement on the ledger — the first thing in it that is not a
    // premium request with no numbers behind it.
    const seedCost = record?.costs?.find((entry) => entry.kind === 'seed');
    expect(seedCost?.tokens).toEqual({ input: 30_000, output: 9_000 });
    expect(seedCost?.by).toBe('gemini-3.7-flash');

    await app.close();
  });

  it('skips the paid call entirely when the console kill switch is off', async () => {
    const stub = createGithubClientStub({});
    const { backend, briefs } = createBackendStub();
    const seeded: string[] = [];
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:test-user' });
    // The switch SEED_DISPATCH used to be.
    await store.setCreationLimits({ seedingMode: 'off' }, 'g:boss');
    const { app, response } = await submitOne('Comet Courier', {
      githubClient: stub.githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
      gameSeeder: seederStub({}, (slug) => seeded.push(slug)),
      store,
    });

    expect(response.statusCode).toBe(200);
    await vi.waitFor(() => expect(briefs).toHaveLength(1));
    // Never called: checked before the seeder runs.
    expect(seeded).toEqual([]);
    expect(briefs[0].seed).toBeUndefined();

    const record = await store.getSubmission(briefs[0].jobId);
    expect(record?.costs?.find((entry) => entry.kind === 'seed')).toBeUndefined();

    await app.close();
  });

  it('passes the console-selected provider through to the seeder, and records it', async () => {
    const stub = createGithubClientStub({});
    const { backend, briefs } = createBackendStub();
    const providersSeen: (string | undefined)[] = [];
    const seeder: GameSeeder = {
      seed: async (request) => {
        providersSeen.push(request.provider);
        return {
          slug: request.slug,
          files: [{ path: 'game.ts', content: 'export {};\n' }],
          references: ['apex-sprint'],
          usage: { inputTokens: 100, outputTokens: 50, model: 'claude-haiku-4-5', provider: 'anthropic' },
          elapsedMs: 1_000,
          compiles: true,
          repaired: false,
        } as SeedDraft;
      },
    };
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:test-user' });
    await store.setCreationLimits({ seedProviderOverride: 'anthropic' }, 'g:boss');
    const { app, response } = await submitOne('Comet Courier', {
      githubClient: stub.githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
      gameSeeder: seeder,
      // Without this the gate falls back to vertex; see the test below.
      seedProviders: { providers: ['vertex', 'anthropic'], defaultProvider: 'vertex' },
      store,
    });

    expect(response.statusCode).toBe(200);
    await vi.waitFor(() => expect(briefs).toHaveLength(1));
    expect(providersSeen).toEqual(['anthropic']);

    const record = await store.getSubmission(briefs[0].jobId);
    const seedCost = record?.costs?.find((entry) => entry.kind === 'seed');
    expect(seedCost?.provider).toBe('anthropic');
    expect(seedCost?.by).toBe('claude-haiku-4-5');

    await app.close();
  });

  it('falls back to the default rather than failing when the override names an unconfigured provider', async () => {
    const stub = createGithubClientStub({});
    const { backend, briefs } = createBackendStub();
    const providersSeen: (string | undefined)[] = [];
    const seeder: GameSeeder = {
      seed: async (request) => {
        providersSeen.push(request.provider);
        return {
          slug: request.slug,
          files: [{ path: 'game.ts', content: 'export {};\n' }],
          references: ['apex-sprint'],
          usage: { inputTokens: 100, outputTokens: 50, model: 'gemini-3.7-flash', provider: 'vertex' },
          elapsedMs: 1_000,
          compiles: true,
          repaired: false,
        } as SeedDraft;
      },
    };
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:test-user' });
    // Nothing registered "meta"; picking it must degrade, not stop seeding.
    await store.setCreationLimits({ seedProviderOverride: 'meta' }, 'g:boss');
    const { app, response } = await submitOne('Comet Courier', {
      githubClient: stub.githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
      gameSeeder: seeder,
      seedProviders: { providers: ['vertex'], defaultProvider: 'vertex' },
      store,
    });

    expect(response.statusCode).toBe(200);
    await vi.waitFor(() => expect(briefs).toHaveLength(1));
    expect(providersSeen).toEqual(['vertex']);

    await app.close();
  });

  it('records what the seed achieved, including that a backend placed it', async () => {
    const stub = createGithubClientStub({});
    const briefs: BuildBrief[] = [];
    const backend: AgentBackend = {
      name: 'stub',
      dispatch: async (brief) => {
        briefs.push(brief);
        return { ref: 'task-1', workspace: 'copilot/x', seedWorkspace: 'seed/job-9' };
      },
      resume: async () => ({ ref: 'task-2' }),
      observe: async () => null,
      cancel: async () => ({ enforced: false }),
    };
    const { app, store, response } = await submitOne('Comet Courier', {
      githubClient: stub.githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
      gameSeeder: seederStub({ compiles: true, repaired: true }),
    });

    expect(response.statusCode).toBe(200);
    await vi.waitFor(() => expect(briefs).toHaveLength(1));
    const outcome = await vi.waitFor(async () => {
      const record = await store.getSubmission(briefs[0].jobId);
      expect(record?.seedOutcome).toBeDefined();
      return record!.seedOutcome!;
    });

    expect(outcome).toMatchObject({
      generated: true,
      references: ['apex-sprint'],
      ms: 41_000,
      compiles: true,
      repaired: true,
      staged: true,
    });

    await app.close();
  });

  it('records a failed round 0, so an outage that generates nothing is countable', async () => {
    const stub = createGithubClientStub({});
    const { backend, briefs } = createBackendStub();
    const { app, store, response } = await submitOne('Comet Courier', {
      githubClient: stub.githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
      gameSeeder: seederStub(null),
    });

    expect(response.statusCode).toBe(200);
    await vi.waitFor(() => expect(briefs).toHaveLength(1));
    const outcome = await vi.waitFor(async () => {
      const record = await store.getSubmission(briefs[0].jobId);
      expect(record?.seedOutcome).toBeDefined();
      return record!.seedOutcome!;
    });

    expect(outcome).toMatchObject({ generated: false, reason: 'seeder_declined', staged: false });
    // The attempted provider survives a decline too, not only a successful draft.
    expect(outcome.provider).toBe('vertex');
    // Nothing generated, so nothing billed.
    const record = await store.getSubmission(briefs[0].jobId);
    expect(record?.costs ?? []).not.toContainEqual(expect.objectContaining({ kind: 'seed' }));

    await app.close();
  });

  it('counts a draft the job itself stored as placed, not only one a workspace took', async () => {
    const stub = createGithubClientStub({});
    const briefs: BuildBrief[] = [];
    const backend: AgentBackend = {
      name: 'stub',
      seedDelivery: () => 'channel',
      dispatch: async (brief) => {
        briefs.push(brief);
        return { ref: 'task-1' };
      },
      resume: async () => ({ ref: 'task-2' }),
      observe: async () => null,
      cancel: async () => ({ enforced: false }),
    };
    const { app, store, response } = await submitOne('Comet Courier', {
      githubClient: stub.githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
      gameSeeder: seederStub({ compiles: true }),
    });

    expect(response.statusCode).toBe(200);
    await vi.waitFor(() => expect(briefs).toHaveLength(1));
    const outcome = await vi.waitFor(async () => {
      const record = await store.getSubmission(briefs[0].jobId);
      expect(record?.seedOutcome).toBeDefined();
      return record!.seedOutcome!;
    });

    expect(outcome).toMatchObject({ generated: true, staged: true });
    const record = await store.getSubmission(briefs[0].jobId);
    expect(record?.seed?.files).toHaveLength(1);

    await app.close();
  });

  it('dispatches unseeded when the seeder declines, and still builds the game', async () => {
    const stub = createGithubClientStub({});
    const { backend, briefs } = createBackendStub();
    const { app, store, response } = await submitOne('Comet Courier', {
      githubClient: stub.githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
      gameSeeder: seederStub(null),
    });

    expect(response.statusCode).toBe(200);
    await vi.waitFor(() => expect(briefs).toHaveLength(1));
    expect(briefs[0].seed).toBeUndefined();
    // The job keeps the slug the submission gave it — seeding declining changes nothing
    // about the game's address — and nothing is billed for a seed that never happened.
    const record = await store.getSubmission(briefs[0].jobId);
    expect(record?.slug).toBe('comet-courier');
    expect(record?.costs ?? []).not.toContainEqual(expect.objectContaining({ kind: 'seed' }));

    await app.close();
  });

  it('still dispatches when the seeder throws', async () => {
    const stub = createGithubClientStub({});
    const { backend, briefs } = createBackendStub();
    const { app, response } = await submitOne('Comet Courier', {
      githubClient: stub.githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
      gameSeeder: {
        seed: async () => {
          throw new Error('vertex is having a day');
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(briefs).toHaveLength(1);
    expect(briefs[0].seed).toBeUndefined();

    await app.close();
  });

  it('publishes a round-0 preview from the draft itself when the seed compiles', async () => {
    const stub = createGithubClientStub({
      gameSources: {
        indexHtml: '<main id="game"></main>',
        gameJs: 'console.log("round zero");',
        styleCss: 'body { background: #000; }',
        title: 'Comet Courier',
      },
    });
    const briefs: BuildBrief[] = [];
    const backend: AgentBackend = {
      name: 'stub',
      dispatch: async (brief) => {
        briefs.push(brief);
        return { ref: 'task-1', workspace: 'copilot/x' };
      },
      resume: async (brief) => {
        briefs.push(brief);
        return { ref: 'task-2' };
      },
      observe: async () => null,
      cancel: async () => ({ enforced: false }),
    };
    const { app, store, response } = await submitOne('Comet Courier', {
      githubClient: stub.githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
      gameSeeder: seederStub({ compiles: true }),
    });

    expect(response.statusCode).toBe(200);
    await vi.waitFor(() => expect(briefs).toHaveLength(1));
    // Deliberately off the submit response path, so the preview lands moments later.
    const previews = await vi.waitFor(async () => {
      const listed = await store.listBuildPreviews(briefs[0].jobId);
      expect(listed.length).toBeGreaterThan(0);
      return listed;
    });

    expect(previews[0].slug).toBe('comet-courier');
    expect(previews[0].label).toContain('rough draft');
    // Marked provisional at the source: the agent has not run yet.
    expect(previews[0].origin).toBe('seed');
    const stored = await store.getBuildPreview(briefs[0].jobId, previews[0].id);
    const html = Buffer.from(stored!.data, 'base64').toString('utf8');
    // The full serve hygiene, not a weaker preview variant: sandbox CSP and the AI Act
    // provenance marking both present in what the creator's iframe will run.
    expect(html).toContain('round zero');
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain('ai-generated');
    // Assembled from the draft's own files over the published engine — no branch needed.
    expect(stub.githubClient.getGameSources).toHaveBeenCalledWith('main', 'comet-courier', {
      'game.ts': 'export {};\n',
    });

    await app.close();
  });

  it('publishes no preview for a draft that does not compile', async () => {
    const stub = createGithubClientStub({
      gameSources: {
        indexHtml: '<main id="game"></main>',
        gameJs: 'console.log("round zero");',
        styleCss: '',
        title: 'Comet Courier',
      },
    });
    const briefs: BuildBrief[] = [];
    const backend: AgentBackend = {
      name: 'stub',
      dispatch: async (brief) => {
        briefs.push(brief);
        return { ref: 'task-1', workspace: 'copilot/x', seedWorkspace: 'seed/job-9' };
      },
      resume: async () => ({ ref: 'task-2' }),
      observe: async () => null,
      cancel: async () => ({ enforced: false }),
    };
    const { app, store, response } = await submitOne('Comet Courier', {
      githubClient: stub.githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
      gameSeeder: seederStub({ compiles: false }),
    });

    expect(response.statusCode).toBe(200);
    await vi.waitFor(() => expect(briefs).toHaveLength(1));
    // A draft that does not bundle is still dispatched (the agent will fix it) — the
    // only thing withheld is showing it to the creator.
    expect(briefs[0].seed).toBeDefined();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await store.listBuildPreviews(briefs[0].jobId)).toEqual([]);
    expect(stub.githubClient.getGameSources).not.toHaveBeenCalled();

    await app.close();
  });

  it('stores the seed on the job for a managed round that can only read it', async () => {
    // The Anthropic shape: refuses inline files, but can read get_seed.
    const stub = createGithubClientStub({});
    const briefs: BuildBrief[] = [];
    const backend: AgentBackend = {
      name: 'managed:stub',
      seedDelivery: () => 'channel' as const,
      dispatch: async (brief) => {
        briefs.push(brief);
        return { ref: 'session-1' };
      },
      resume: async () => ({ ref: 'session-2' }),
      observe: async () => null,
      cancel: async () => ({ enforced: false }),
    };
    const { app, store, authHeaders } = await createApp({
      githubClient: stub.githubClient,
      agentBackend: backend,
      submissionTokenSecret: secret,
      gameSeeder: seederStub({ compiles: true }),
    });

    const created = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders,
      payload: { title: 'Managed Game', concept: 'A game where you deliver parcels between comets, dodging debris.' },
    });
    expect(created.statusCode).toBe(200);
    await vi.waitFor(() => expect(briefs).toHaveLength(1));

    // The seed is on the job, which is what get_seed reads.
    const record = await store.getSubmission(briefs[0].jobId);
    expect(record?.seed?.files).toHaveLength(1);
    expect(record?.seedStatus).toBe('available');
    // Still offered to the backend, which decides if it can place files.
    expect(briefs[0].seed).toBeDefined();

    await app.close();
  });

  it('records the seed workspace so the branch is released with the job', async () => {
    const { InMemoryStore } = await import('./platform/store.js');
    const store = new InMemoryStore();
    await store.createSubmission(1, 'g:1', 'A game');
    await store.recordDispatch(1, {
      backend: 'copilot',
      ref: 'task-1',
      workspace: 'copilot/x',
      seedWorkspace: 'seed/job-1',
    });

    expect((await store.getSubmission(1))?.dispatch?.seedWorkspace).toBe('seed/job-1');

    // Cleared once released, so nothing asks GitHub to delete the same ref forever.
    await store.clearDispatchSeedWorkspace(1);
    expect((await store.getSubmission(1))?.dispatch?.seedWorkspace).toBeUndefined();
    expect((await store.getSubmission(1))?.dispatch?.workspace).toBe('copilot/x');
  });
});

describe('operator slug backfill', () => {
  const bossHeaders = () => getAuthHeaders('g:boss');

  /** An app with an operator, plus whatever slug-less records a test asks for. */
  async function appWithLegacyRecords(titles: string[]) {
    const { app, store } = await createApp({ adminUids: 'g:boss' });
    await store.upsertUser({ uid: 'g:boss' });
    // createSubmission is what the flow used to do on its own: a record, no slug. It is
    // the exact shape of every game that predates minting at submission.
    let jobId = 500;
    for (const title of titles) await store.createSubmission(jobId++, 'g:test-user', title);
    return { app, store };
  }

  it('answers 404 to a non-operator, the same as every operator surface', async () => {
    const { app } = await appWithLegacyRecords(['Space Miner']);

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/slug-backfill',
      headers: getAuthHeaders('g:someone-else'),
    });

    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('gives every slug-less game an address derived from its title', async () => {
    const { app, store } = await appWithLegacyRecords(['Space Miner', 'Łódź Nights']);

    const response = await app.inject({ method: 'POST', url: '/api/admin/slug-backfill', headers: bossHeaders() });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, dryRun: false, scanned: 2, named: 2, failed: 0 });
    expect((await store.getSubmission(500))?.slug).toBe('space-miner');
    // The Polish letter survives: NFD alone would drop it and leave 'dz-nights'.
    expect((await store.getSubmission(501))?.slug).toBe('lodz-nights');

    await app.close();
  });

  it('reports what it would do without writing anything, when asked to rehearse', async () => {
    const { app, store } = await appWithLegacyRecords(['Space Miner']);

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/slug-backfill?dryRun=1',
      headers: bossHeaders(),
    });

    expect(response.json()).toMatchObject({ dryRun: true, scanned: 1, named: 1 });
    expect(response.json().games).toEqual([{ jobId: 500, title: 'Space Miner', slug: 'space-miner' }]);
    expect((await store.getSubmission(500))?.slug).toBeUndefined();

    await app.close();
  });

  it('does not promise one name to two games, even in a rehearsal that writes nothing', async () => {
    const { app } = await appWithLegacyRecords(['Space Miner', 'Space Miner']);

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/slug-backfill?dryRun=1',
      headers: bossHeaders(),
    });

    // Without an in-run ledger both would be told 'space-miner', and the rehearsal would
    // be reporting an outcome the real run could not produce.
    expect(response.json().games.map((game: { slug: string }) => game.slug)).toEqual(['space-miner', 'space-miner-2']);

    await app.close();
  });

  it('leaves abandoned builds alone rather than reserving names for them', async () => {
    const { app, store } = await appWithLegacyRecords(['Space Miner']);
    await store.setSubmissionAbandoned(500, new Date().toISOString());

    const response = await app.inject({ method: 'POST', url: '/api/admin/slug-backfill', headers: bossHeaders() });

    expect(response.json()).toMatchObject({ scanned: 0, named: 0 });
    expect((await store.getSubmission(500))?.slug).toBeUndefined();

    await app.close();
  });

  it('finds nothing to do on a second run', async () => {
    const { app } = await appWithLegacyRecords(['Space Miner']);

    await app.inject({ method: 'POST', url: '/api/admin/slug-backfill', headers: bossHeaders() });
    const second = await app.inject({ method: 'POST', url: '/api/admin/slug-backfill', headers: bossHeaders() });

    expect(second.json()).toMatchObject({ scanned: 0, named: 0, failed: 0 });
    await app.close();
  });
});

describe('operator title backfill', () => {
  const bossHeaders = () => getAuthHeaders('g:boss');

  async function appWithTruncatedTitle() {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:boss' });
    await store.createSubmission(600, 'g:test-user', 'A game tycoon like where I run a tv busi');
    await store.setSubmissionSlug(600, 'tv-tycoon');
    await store.setSubmissionDeliveredVersion(600, 'v1');
    const gamesStore = {
      getSourceFile: async (_slug: string, _version: string, path: string) =>
        path === 'SPEC.md' ? '---\ntitle: TV Tycoon\n---\n' : null,
    } as unknown as GamesStore;
    const { app } = await createApp({
      adminUids: 'g:boss',
      store,
      agentChannel: { gamesStore },
    });
    return { app, store };
  }

  it('answers 404 to a non-operator', async () => {
    const { app } = await appWithTruncatedTitle();

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/title-backfill',
      headers: getAuthHeaders('g:someone-else'),
    });

    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('replaces the truncated prompt with the delivered SPEC title', async () => {
    const { app, store } = await appWithTruncatedTitle();

    const response = await app.inject({ method: 'POST', url: '/api/admin/title-backfill', headers: bossHeaders() });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      dryRun: false,
      scanned: 1,
      renamed: 1,
      unchanged: 0,
    });
    expect(response.json().games[0]).toMatchObject({
      jobId: 600,
      slug: 'tv-tycoon',
      from: 'A game tycoon like where I run a tv busi',
      to: 'TV Tycoon',
      changed: true,
    });
    expect((await store.getSubmission(600))?.title).toBe('TV Tycoon');

    await app.close();
  });

  it('reports without writing when asked to rehearse', async () => {
    const { app, store } = await appWithTruncatedTitle();

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/title-backfill?dryRun=1',
      headers: bossHeaders(),
    });

    expect(response.json()).toMatchObject({ dryRun: true, renamed: 1 });
    expect((await store.getSubmission(600))?.title).toBe('A game tycoon like where I run a tv busi');

    await app.close();
  });

  it('leaves a title alone when it already matches the SPEC', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:boss' });
    await store.createSubmission(601, 'g:test-user', 'TV Tycoon');
    await store.setSubmissionSlug(601, 'tv-tycoon');
    await store.setSubmissionDeliveredVersion(601, 'v1');
    const gamesStore = {
      getSourceFile: async () => '---\ntitle: TV Tycoon\n---\n',
    } as unknown as GamesStore;
    const { app } = await createApp({
      adminUids: 'g:boss',
      store,
      agentChannel: { gamesStore },
    });

    const response = await app.inject({ method: 'POST', url: '/api/admin/title-backfill', headers: bossHeaders() });

    expect(response.json()).toMatchObject({ scanned: 1, renamed: 0, unchanged: 1 });
    expect(response.json().games[0].changed).toBe(false);

    await app.close();
  });
});
