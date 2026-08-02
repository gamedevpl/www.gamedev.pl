import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AGENT_OPEN_ROUNDS_DISABLED_REASON,
  GAME_NOT_PUBLISHED_REASON,
  IMPROVEMENT_QUOTA_EXHAUSTED_REASON,
  mintGameAgentKey,
} from './agent-game-key.js';
import { resolveGameAgentKeyForOpenRound } from './agent-game-key-resolve.js';
import { mintAgentToken } from './agent-token.js';
import { buildApp } from './app.js';
import type { ContentChecker } from './moderation.js';
import type { GamesStore } from './games-store.js';
import type { CatalogGameEntry, GameSources, GitHubClient, LinkedPullRequest } from './github-client.js';
import { mintMcpSessionKey } from './mcp-session-key.js';
import { InMemoryStore } from './store.js';
import { NoopTranslator } from './translate.js';

const secret = 'open-round-test-secret';
const OWNER = 'g:owner';
const SLUG = 'comet-courier';
const PUBLISHED_ISSUE = 10;

function stubGitHub(): GitHubClient {
  return {
    createIssue: async () => ({ number: PUBLISHED_ISSUE }),
    getIssueState: async () => ({ state: 'open' as const }),
    findLinkedPR: async (): Promise<LinkedPullRequest | null> => null,
    createIssueComment: async () => ({ id: 1 }),
    updateIssueBody: async () => {},
    closeIssue: async () => {},
    closePullRequest: async () => {},
    ensureOpenPullRequest: async () => ({ number: 1 }),
    deleteBranch: async () => {},
    getGameSources: async (): Promise<GameSources | null> => null,
    getGameMedia: async () => null,
    getCatalog: async (): Promise<CatalogGameEntry[]> => [],
    getProgressNotes: async () => null,
  };
}

function rejectingChecker(): ContentChecker {
  return {
    check: async () => ({ allowed: false, category: 'hate' }),
    checkFields: async () => ({ allowed: false, category: 'hate' }),
  };
}

async function createApp(store: InMemoryStore, contentChecker?: ContentChecker) {
  return buildApp({
    store,
    sessionSecret: 'dev-session-secret-change-me',
    ...(contentChecker ? { contentChecker } : {}),
    submissionRoutes: {
      githubClient: stubGitHub(),
      githubToken: 'gh-token',
      submissionTokenSecret: secret,
      translator: new NoopTranslator(),
      dailyImprovementQuota: 2,
      agentChannel: {} as { gamesStore?: GamesStore },
    },
  });
}

async function seedPublishedGame(store: InMemoryStore) {
  await store.createSubmission(PUBLISHED_ISSUE, OWNER, 'Comet Courier');
  await store.setSubmissionSlug(PUBLISHED_ISSUE, SLUG);
  await store.setRoundBuilder(PUBLISHED_ISSUE, 'self');
  await store.setSubmissionPublishedAt(PUBLISHED_ISSUE, '2026-07-01T00:00:00.000Z');
  await store.recordJobTransition(PUBLISHED_ISSUE, {
    to: 'published',
    at: '2026-07-01T00:00:00.000Z',
    by: 'operator',
    reason: 'published',
  });
}

function gameKey(generation = 1) {
  return mintGameAgentKey(secret, {
    slug: SLUG,
    creatorUid: OWNER,
    keyGeneration: generation,
    now: Date.parse('2026-08-01T12:00:00.000Z'),
  });
}

async function mcpCall(
  app: FastifyInstance,
  method: string,
  params?: unknown,
  headers: Record<string, string> = {},
  id: string | number = 1,
) {
  return app.inject({
    method: 'POST',
    url: '/api/mcp',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...headers,
    },
    payload: { jsonrpc: '2.0', id, method, ...(params !== undefined ? { params } : {}) },
  });
}

async function callOpenRound(
  app: FastifyInstance,
  args: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  const res = await mcpCall(app, 'tools/call', { name: 'open_round', arguments: args }, headers);
  expect(res.statusCode).toBe(200);
  const body = res.json() as {
    result?: { content?: Array<{ text: string }>; structuredContent?: unknown; isError?: boolean };
  };
  const structured =
    body.result?.structuredContent ??
    (body.result?.content?.[0]?.text ? JSON.parse(body.result.content[0].text) : undefined);
  return { structured, isError: Boolean(body.result?.isError) };
}

describe('resolveGameAgentKeyForOpenRound', () => {
  it('refuses when opt-in is off', async () => {
    const store = new InMemoryStore();
    const at = '2026-08-01T12:00:00.000Z';
    await store.ensureGameAgentKey(SLUG, OWNER, at);
    await seedPublishedGame(store);

    const result = await resolveGameAgentKeyForOpenRound(store, gameKey(), secret);
    expect(result).toEqual({ ok: false, reason: AGENT_OPEN_ROUNDS_DISABLED_REASON });
  });

  it('refuses when the game is not published', async () => {
    const store = new InMemoryStore();
    const at = '2026-08-01T12:00:00.000Z';
    await store.setGameAgentOpenRounds(SLUG, OWNER, true, at);
    await store.createSubmission(20, OWNER, 'Draft');
    await store.setSubmissionSlug(20, SLUG);

    const result = await resolveGameAgentKeyForOpenRound(store, gameKey(), secret);
    expect(result).toEqual({ ok: false, reason: GAME_NOT_PUBLISHED_REASON });
  });
});

describe('MCP open_round (BY-24)', () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    await app?.close();
    app = null;
  });

  it('refuses when opt-in is off', async () => {
    const store = new InMemoryStore();
    await seedPublishedGame(store);
    await store.ensureGameAgentKey(SLUG, OWNER, new Date().toISOString());
    app = await createApp(store);

    const { structured, isError } = await callOpenRound(app, {
      key: gameKey(),
      feedback: 'Add a checkpoint.',
    });
    expect(isError).toBe(true);
    expect(structured).toMatchObject({ error: AGENT_OPEN_ROUNDS_DISABLED_REASON });
  });

  it('opens exactly one self improvement round when opt-in is on', async () => {
    const store = new InMemoryStore();
    await seedPublishedGame(store);
    const at = new Date().toISOString();
    await store.setGameAgentOpenRounds(SLUG, OWNER, true, at);
    app = await createApp(store);

    const { structured, isError } = await callOpenRound(app, {
      key: gameKey(),
      feedback: 'Add a checkpoint after level one.',
    });
    expect(isError).toBe(false);
    expect(structured).toMatchObject({ slug: SLUG, alreadyOpen: false });
    const jobId = (structured as { jobId: number }).jobId;
    expect(jobId).not.toBe(PUBLISHED_ISSUE);

    const job = await store.getSubmission(jobId);
    expect(job?.builder).toBe('self');
    expect(job?.transitions?.[0]).toMatchObject({ to: 'queued', by: 'agent', reason: 'agent_open_round' });
  });

  it('is idempotent while a round is open and does not stack', async () => {
    const store = new InMemoryStore();
    await seedPublishedGame(store);
    const at = new Date().toISOString();
    await store.setGameAgentOpenRounds(SLUG, OWNER, true, at);
    app = await createApp(store);

    const first = await callOpenRound(app, { key: gameKey(), feedback: 'First change.' });
    expect(first.isError).toBe(false);
    const jobId = (first.structured as { jobId: number }).jobId;

    const second = await callOpenRound(app, { key: gameKey(), feedback: 'Second change.' });
    expect(second.isError).toBe(false);
    expect(second.structured).toMatchObject({ jobId, alreadyOpen: true });

    const owned = await store.listSubmissionsByOwner(OWNER, { limit: 50 });
    const active = owned.filter((job) => job.slug === SLUG && job.issueNumber !== PUBLISHED_ISSUE);
    expect(active).toHaveLength(1);
  });

  it('refuses when improvement quota is exhausted', async () => {
    const store = new InMemoryStore();
    await seedPublishedGame(store);
    const at = new Date().toISOString();
    await store.setGameAgentOpenRounds(SLUG, OWNER, true, at);
    const dateStr = new Date().toISOString().slice(0, 10);
    await store.checkAndIncrementQuota(OWNER, dateStr, 2, 'improvements');
    await store.checkAndIncrementQuota(OWNER, dateStr, 2, 'improvements');
    app = await createApp(store);

    const { structured, isError } = await callOpenRound(app, {
      key: gameKey(),
      feedback: 'One more try.',
    });
    expect(isError).toBe(true);
    expect(structured).toMatchObject({ error: IMPROVEMENT_QUOTA_EXHAUSTED_REASON });
  });

  it('moderates feedback on this path', async () => {
    const store = new InMemoryStore();
    await seedPublishedGame(store);
    await store.setGameAgentOpenRounds(SLUG, OWNER, true, new Date().toISOString());
    app = await createApp(store, rejectingChecker());

    const { structured, isError } = await callOpenRound(app, {
      key: gameKey(),
      feedback: 'bad words',
    });
    expect(isError).toBe(true);
    expect(structured).toMatchObject({ error: 'content_rejected' });
  });

  it('rejects a round key where the durable key is required', async () => {
    const store = new InMemoryStore();
    await seedPublishedGame(store);
    await store.setGameAgentOpenRounds(SLUG, OWNER, true, new Date().toISOString());
    app = await createApp(store);

    const roundKey = mintAgentToken(PUBLISHED_ISSUE, secret, { roundGeneration: 1 });
    const { structured, isError } = await callOpenRound(app, {
      key: roundKey,
      feedback: 'Nope.',
    });
    expect(isError).toBe(true);
    expect((structured as { error: string }).error).toMatch(/durable per-game key/i);
  });

  it('rejects a sessionKey where the durable key is required', async () => {
    const store = new InMemoryStore();
    await seedPublishedGame(store);
    await store.setGameAgentOpenRounds(SLUG, OWNER, true, new Date().toISOString());
    app = await createApp(store);

    const sessionKey = mintMcpSessionKey(secret, {
      sessionId: 'sess-1',
      jobId: PUBLISHED_ISSUE,
      roundGeneration: 1,
    });
    const { structured, isError } = await callOpenRound(app, {
      key: sessionKey,
      feedback: 'Nope.',
    });
    expect(isError).toBe(true);
    expect((structured as { error: string }).error).toMatch(/durable per-game key/i);
  });

  it('refuses an unpublished game', async () => {
    const store = new InMemoryStore();
    const at = new Date().toISOString();
    await store.setGameAgentOpenRounds(SLUG, OWNER, true, at);
    await store.createSubmission(30, OWNER, 'Unpublished');
    await store.setSubmissionSlug(30, SLUG);
    await store.ensureGameAgentKey(SLUG, OWNER, at);
    app = await createApp(store);

    const { structured, isError } = await callOpenRound(app, {
      key: gameKey(),
      feedback: 'Too early.',
    });
    expect(isError).toBe(true);
    expect(structured).toMatchObject({ error: GAME_NOT_PUBLISHED_REASON });
  });

  it('cannot open a round when the key slug has no published game', async () => {
    const store = new InMemoryStore();
    const at = new Date().toISOString();
    await store.createSubmission(35, OWNER, 'Unpublished comet');
    await store.setSubmissionSlug(35, SLUG);
    await store.setGameAgentOpenRounds(SLUG, OWNER, true, at);

    const otherSlug = 'other-game';
    await store.createSubmission(40, OWNER, 'Other');
    await store.setSubmissionSlug(40, otherSlug);
    await store.setSubmissionPublishedAt(40, '2026-07-02T00:00:00.000Z');

    app = await createApp(store);

    const { structured, isError } = await callOpenRound(app, {
      key: gameKey(),
      feedback: 'Wrong slug published.',
    });
    expect(isError).toBe(true);
    expect(structured).toMatchObject({ error: GAME_NOT_PUBLISHED_REASON });
  });
});
