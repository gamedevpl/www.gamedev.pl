import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { mintCreatorAgentKey } from './agent-creator-key.js';
import {
  GAME_NOT_PUBLISHED_REASON,
  IMPROVEMENT_QUOTA_EXHAUSTED_REASON,
  mintGameAgentKey,
  SLUG_NOT_ON_ACCOUNT_REASON,
} from './agent-game-key.js';
import { resolveGameAgentKeyForOpenRound } from './agent-game-key-resolve.js';
import { mintAgentToken } from './agent-token.js';
import { buildApp } from './app.js';
import type { ContentChecker } from './moderation.js';
import type { GamesStore } from './delivery/games-store.js';
import type { CatalogGameEntry, GameSources, GitHubClient, LinkedPullRequest } from './catalog/github-client.js';
import { mintMcpSessionKey } from './mcp-session-key.js';
import { InMemoryStore } from './store.js';
import { mintToken } from './submission-token.js';

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

async function creatorHeaders(store: InMemoryStore): Promise<Record<string, string>> {
  await store.ensureCreatorAgentKey(OWNER, new Date().toISOString());
  const key = mintCreatorAgentKey(secret, {
    creatorUid: OWNER,
    keyGeneration: 1,
    now: Date.parse('2026-08-01T12:00:00.000Z'),
  });
  return { authorization: `Bearer ${key}` };
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
  it('refuses when the game is not published', async () => {
    const store = new InMemoryStore();
    const at = '2026-08-01T12:00:00.000Z';
    await store.ensureGameAgentKey(SLUG, OWNER, at);
    await store.createSubmission(20, OWNER, 'Draft');
    await store.setSubmissionSlug(20, SLUG);

    const result = await resolveGameAgentKeyForOpenRound(store, gameKey(), secret);
    expect(result).toEqual({ ok: false, reason: GAME_NOT_PUBLISHED_REASON });
  });

  it('succeeds for a published game with no opt-in flag', async () => {
    const store = new InMemoryStore();
    const at = '2026-08-01T12:00:00.000Z';
    await store.ensureGameAgentKey(SLUG, OWNER, at);
    await seedPublishedGame(store);

    const result = await resolveGameAgentKeyForOpenRound(store, gameKey(), secret);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.publishedRecord.issueNumber).toBe(PUBLISHED_ISSUE);
      expect(result.activeRound).toBeNull();
    }
  });
});

describe('MCP open_round (BY-24 / BY-27b)', () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    await app?.close();
    app = null;
  });

  it('opens exactly one self improvement round with no flag set', async () => {
    const store = new InMemoryStore();
    await seedPublishedGame(store);
    const headers = await creatorHeaders(store);
    app = await createApp(store);

    const { structured, isError } = await callOpenRound(
      app,
      { slug: SLUG, feedback: 'Add a checkpoint after level one.' },
      headers,
    );
    expect(isError).toBe(false);
    expect(structured).toMatchObject({ slug: SLUG, alreadyOpen: false });
    const jobId = (structured as { jobId: number }).jobId;
    expect(jobId).not.toBe(PUBLISHED_ISSUE);

    const job = await store.getSubmission(jobId);
    expect(job?.builder).toBe('self');
    expect(job?.transitions?.[0]).toMatchObject({ to: 'queued', by: 'agent', reason: 'agent_open_round' });
  });

  it('opens a round via creator key Bearer + slug and surfaces openedBy agent on status', async () => {
    const store = new InMemoryStore();
    await seedPublishedGame(store);
    const at = new Date().toISOString();
    await store.ensureCreatorAgentKey(OWNER, at);
    const creatorKey = mintCreatorAgentKey(secret, {
      creatorUid: OWNER,
      keyGeneration: 1,
      now: Date.parse('2026-08-01T12:00:00.000Z'),
    });
    app = await createApp(store);

    const { structured, isError } = await callOpenRound(
      app,
      { slug: SLUG, feedback: 'Tighten the jump arc.' },
      { authorization: `Bearer ${creatorKey}` },
    );
    expect(isError).toBe(false);
    expect(structured).toMatchObject({ slug: SLUG, alreadyOpen: false });
    const jobId = (structured as { jobId: number }).jobId;
    expect(jobId).not.toBe(PUBLISHED_ISSUE);

    const job = await store.getSubmission(jobId);
    expect(job?.transitions?.[0]).toMatchObject({ to: 'queued', by: 'agent', reason: 'agent_open_round' });

    const statusRes = await app.inject({
      method: 'GET',
      url: `/api/submissions/${mintToken(jobId, secret)}`,
    });
    expect(statusRes.statusCode).toBe(200);
    expect(statusRes.json()).toMatchObject({ openedBy: 'agent' });
  });

  it('refuses creator-key open_round for an unowned slug without blaming the key', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(PUBLISHED_ISSUE, 'g:other', 'Other Game');
    await store.setSubmissionSlug(PUBLISHED_ISSUE, 'other-game');
    await store.setSubmissionPublishedAt(PUBLISHED_ISSUE, '2026-07-01T00:00:00.000Z');
    await store.recordJobTransition(PUBLISHED_ISSUE, {
      to: 'published',
      at: '2026-07-01T00:00:00.000Z',
      by: 'operator',
      reason: 'published',
    });
    const at = new Date().toISOString();
    await store.ensureCreatorAgentKey(OWNER, at);
    const creatorKey = mintCreatorAgentKey(secret, {
      creatorUid: OWNER,
      keyGeneration: 1,
      now: Date.parse('2026-08-01T12:00:00.000Z'),
    });
    app = await createApp(store);

    const { structured, isError } = await callOpenRound(
      app,
      { slug: 'other-game', feedback: 'Do not rotate for a typo.' },
      { authorization: `Bearer ${creatorKey}` },
    );
    expect(isError).toBe(true);
    expect((structured as { error: string }).error).toBe(SLUG_NOT_ON_ACCOUNT_REASON);
    expect((structured as { error: string }).error).not.toMatch(/rotated/i);
  });

  it('refuses open_round when gameAgentKeys/{slug} is owned by someone else', async () => {
    const store = new InMemoryStore();
    await seedPublishedGame(store);
    // Lock doc belongs to another account — ensure for OWNER must return null.
    await store.ensureGameAgentKey(SLUG, 'g:other', '2026-07-01T00:00:00.000Z');
    const at = new Date().toISOString();
    await store.ensureCreatorAgentKey(OWNER, at);
    const creatorKey = mintCreatorAgentKey(secret, {
      creatorUid: OWNER,
      keyGeneration: 1,
      now: Date.parse('2026-08-01T12:00:00.000Z'),
    });
    app = await createApp(store);

    const { structured, isError } = await callOpenRound(
      app,
      { slug: SLUG, feedback: 'Do not touch another account lock.' },
      { authorization: `Bearer ${creatorKey}` },
    );
    expect(isError).toBe(true);
    expect((structured as { error: string }).error).toBe(SLUG_NOT_ON_ACCOUNT_REASON);
  });

  it('assigns an agent-opened round to the authorized creator after a slug transfer', async () => {
    const store = new InMemoryStore();
    // Previous owner published; current owner has a newer live (non-active) job.
    await store.createSubmission(PUBLISHED_ISSUE, 'g:previous', 'Comet Courier');
    await store.setSubmissionSlug(PUBLISHED_ISSUE, SLUG);
    await store.setSubmissionPublishedAt(PUBLISHED_ISSUE, '2026-07-01T00:00:00.000Z');
    await store.recordJobTransition(PUBLISHED_ISSUE, {
      to: 'published',
      at: '2026-07-01T00:00:00.000Z',
      by: 'operator',
      reason: 'published',
    });
    await store.createSubmission(11, OWNER, 'Comet Courier');
    await store.setSubmissionSlug(11, SLUG);
    const map = (store as unknown as { submissions: Map<number, { createdAt: string }> }).submissions;
    const published = map.get(PUBLISHED_ISSUE)!;
    const live = map.get(11)!;
    map.set(PUBLISHED_ISSUE, { ...published, createdAt: '2026-07-01T00:00:00.000Z' });
    map.set(11, { ...live, createdAt: '2026-09-01T12:00:00.000Z' });

    const at = new Date().toISOString();
    await store.ensureCreatorAgentKey(OWNER, at);
    const creatorKey = mintCreatorAgentKey(secret, {
      creatorUid: OWNER,
      keyGeneration: 1,
      now: Date.parse('2026-08-01T12:00:00.000Z'),
    });
    app = await createApp(store);

    const { structured, isError } = await callOpenRound(
      app,
      { slug: SLUG, feedback: 'Keep the round on the new owner.' },
      { authorization: `Bearer ${creatorKey}` },
    );
    expect(isError).toBe(false);
    const jobId = (structured as { jobId: number }).jobId;
    const job = await store.getSubmission(jobId);
    expect(job?.ownerUid).toBe(OWNER);
    expect(job?.ownerUid).not.toBe('g:previous');
  });

  // CP-2: the feedback reached dispatchBuild but was never persisted as the round's
  // brief, so a self round — which has no backend to read the dispatch prompt — served
  // get_brief with spec:"" and the agent never learned what the creator asked for.
  it('persists the change request as the new round brief so get_brief can serve it', async () => {
    const store = new InMemoryStore();
    await seedPublishedGame(store);
    const at = new Date().toISOString();
    await store.ensureCreatorAgentKey(OWNER, at);
    const creatorKey = mintCreatorAgentKey(secret, {
      creatorUid: OWNER,
      keyGeneration: 1,
      now: Date.parse('2026-08-01T12:00:00.000Z'),
    });
    app = await createApp(store);

    const { structured, isError } = await callOpenRound(
      app,
      { slug: SLUG, feedback: 'Make the title screen background a solid coloured rectangle.' },
      { authorization: `Bearer ${creatorKey}` },
    );
    expect(isError).toBe(false);
    const jobId = (structured as { jobId: number }).jobId;

    const job = await store.getSubmission(jobId);
    expect(job?.spec).toBe('Make the title screen background a solid coloured rectangle.');
    expect(job?.spec).not.toBe('');
    // The change request is free text, not a clarifications block.
    expect(job?.qa).toEqual([]);

    // It also opens the round's thread — as the agent's relay, not the creator's words,
    // so Studio labels and translates it the way continue_draft's relay is.
    const messages = await store.listCreatorMessages(jobId);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      text: 'Make the title screen background a solid coloured rectangle.',
      origin: 'agent',
    });
    // Already delivered: the brief above is how the agent receives it.
    expect(await store.listPendingCreatorMessages(jobId)).toEqual([]);
  });

  it('admits only one concurrent open_round per slug', async () => {
    const store = new InMemoryStore();
    await seedPublishedGame(store);
    const headers = await creatorHeaders(store);
    app = await createApp(store);

    const results = await Promise.all([
      callOpenRound(app, { slug: SLUG, feedback: 'Concurrent A.' }, headers),
      callOpenRound(app, { slug: SLUG, feedback: 'Concurrent B.' }, headers),
      callOpenRound(app, { slug: SLUG, feedback: 'Concurrent C.' }, headers),
    ]);

    const newOpens = results.filter(
      (result) => !result.isError && !(result.structured as { alreadyOpen?: boolean }).alreadyOpen,
    );
    expect(newOpens).toHaveLength(1);

    const owned = await store.listSubmissionsByOwner(OWNER, { limit: 50 });
    const active = owned.filter((job) => job.slug === SLUG && job.issueNumber !== PUBLISHED_ISSUE);
    expect(active).toHaveLength(1);

    const dateStr = new Date().toISOString().slice(0, 10);
    const usage = await store.getUsage(OWNER, dateStr);
    expect(usage.improvements).toBe(1);
  });

  it('is idempotent while a round is open and does not stack', async () => {
    const store = new InMemoryStore();
    await seedPublishedGame(store);
    const headers = await creatorHeaders(store);
    app = await createApp(store);

    const first = await callOpenRound(app, { slug: SLUG, feedback: 'First change.' }, headers);
    expect(first.isError).toBe(false);
    const jobId = (first.structured as { jobId: number }).jobId;

    const second = await callOpenRound(app, { slug: SLUG, feedback: 'Second change.' }, headers);
    expect(second.isError).toBe(false);
    expect(second.structured).toMatchObject({ jobId, alreadyOpen: true });

    const owned = await store.listSubmissionsByOwner(OWNER, { limit: 50 });
    const active = owned.filter((job) => job.slug === SLUG && job.issueNumber !== PUBLISHED_ISSUE);
    expect(active).toHaveLength(1);
  });

  it('refuses when improvement quota is exhausted', async () => {
    const store = new InMemoryStore();
    await seedPublishedGame(store);
    const headers = await creatorHeaders(store);
    const dateStr = new Date().toISOString().slice(0, 10);
    await store.checkAndIncrementQuota(OWNER, dateStr, 2, 'improvements');
    await store.checkAndIncrementQuota(OWNER, dateStr, 2, 'improvements');
    app = await createApp(store);

    const { structured, isError } = await callOpenRound(app, { slug: SLUG, feedback: 'One more try.' }, headers);
    expect(isError).toBe(true);
    expect(structured).toMatchObject({ error: IMPROVEMENT_QUOTA_EXHAUSTED_REASON });
  });

  it('moderates feedback on this path', async () => {
    const store = new InMemoryStore();
    await seedPublishedGame(store);
    const headers = await creatorHeaders(store);
    app = await createApp(store, rejectingChecker());

    const { structured, isError } = await callOpenRound(app, { slug: SLUG, feedback: 'bad words' }, headers);
    expect(isError).toBe(true);
    expect(structured).toMatchObject({ error: 'content_rejected' });
  });

  it('rejects a round key where account authorization is required', async () => {
    const store = new InMemoryStore();
    await seedPublishedGame(store);
    app = await createApp(store);

    const roundKey = mintAgentToken(PUBLISHED_ISSUE, secret, { roundGeneration: 1 });
    const { structured, isError } = await callOpenRound(app, {
      key: roundKey,
      feedback: 'Nope.',
    });
    expect(isError).toBe(true);
    expect((structured as { error: string }).error).toMatch(/Authorization Bearer/i);
  });

  it('rejects a sessionKey where account authorization is required', async () => {
    const store = new InMemoryStore();
    await seedPublishedGame(store);
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
    expect((structured as { error: string }).error).toMatch(/Authorization Bearer/i);
  });

  it('refuses an unpublished game', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(30, OWNER, 'Unpublished');
    await store.setSubmissionSlug(30, SLUG);
    const headers = await creatorHeaders(store);
    app = await createApp(store);

    const { structured, isError } = await callOpenRound(app, { slug: SLUG, feedback: 'Too early.' }, headers);
    expect(isError).toBe(true);
    expect(structured).toMatchObject({ error: GAME_NOT_PUBLISHED_REASON });
  });

  it('cannot open a round when the key slug has no published game', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(35, OWNER, 'Unpublished comet');
    await store.setSubmissionSlug(35, SLUG);
    const headers = await creatorHeaders(store);

    const otherSlug = 'other-game';
    await store.createSubmission(40, OWNER, 'Other');
    await store.setSubmissionSlug(40, otherSlug);
    await store.setSubmissionPublishedAt(40, '2026-07-02T00:00:00.000Z');

    app = await createApp(store);

    const { structured, isError } = await callOpenRound(
      app,
      { slug: SLUG, feedback: 'Wrong slug published.' },
      headers,
    );
    expect(isError).toBe(true);
    expect(structured).toMatchObject({ error: GAME_NOT_PUBLISHED_REASON });
  });
});
