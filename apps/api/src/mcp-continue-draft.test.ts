import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { mintCreatorAgentKey } from './agent-creator-key.js';
import {
  DRAFT_NOT_CONTINUABLE_REASON,
  GAME_ALREADY_PUBLISHED_REASON,
  mintGameAgentKey,
  NO_OPEN_ROUND_REASON,
  SLUG_NOT_ON_ACCOUNT_REASON,
} from './agent-game-key.js';
import { buildApp } from './app.js';
import type { ContentChecker } from './moderation.js';
import type { GamesStore } from './games-store.js';
import type { CatalogGameEntry, GameSources, GitHubClient, LinkedPullRequest } from './github-client.js';
import { InMemoryStore } from './store.js';
import { NoopTranslator } from './translate.js';

const secret = 'continue-draft-test-secret';
const OWNER = 'g:owner';
const SLUG = 'pong-draft';
const DRAFT_ISSUE = 1000018;

function stubGitHub(): GitHubClient {
  return {
    createIssue: async () => ({ number: DRAFT_ISSUE }),
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
      agentChannel: {} as { gamesStore?: GamesStore },
    },
  });
}

async function seedGreenDraft(store: InMemoryStore) {
  await store.createSubmission(DRAFT_ISSUE, OWNER, 'Pong Draft');
  await store.setSubmissionSlug(DRAFT_ISSUE, SLUG);
  await store.setRoundBuilder(DRAFT_ISSUE, 'self');
  await store.setSubmissionDeliveredVersion(DRAFT_ISSUE, 'v1');
  await store.recordJobTransition(DRAFT_ISSUE, {
    to: 'ready_for_review',
    at: '2026-08-01T12:00:00.000Z',
    by: 'gate',
    reason: 'gate_green',
  });
  await store.ensureGameAgentKey(SLUG, OWNER, '2026-08-01T12:00:00.000Z');
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

async function callTool(
  app: FastifyInstance,
  name: string,
  args: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  const res = await mcpCall(app, 'tools/call', { name, arguments: args }, headers);
  expect(res.statusCode).toBe(200);
  const body = res.json() as {
    result?: { content?: Array<{ text: string }>; structuredContent?: unknown; isError?: boolean };
  };
  const structured =
    body.result?.structuredContent ??
    (body.result?.content?.[0]?.text ? JSON.parse(body.result.content[0].text) : undefined);
  return { structured, isError: Boolean(body.result?.isError) };
}

describe('MCP continue_draft', () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    await app?.close();
    app = null;
  });

  it('reopens a ready_for_review draft into building and lets start join', async () => {
    const store = new InMemoryStore();
    await seedGreenDraft(store);
    app = await createApp(store);

    const startBefore = await callTool(app, 'start', { key: gameKey() });
    expect(startBefore.isError).toBe(true);
    expect((startBefore.structured as { error: string }).error).toMatch(/continue_draft/i);
    expect((startBefore.structured as { error: string }).error).toBe(NO_OPEN_ROUND_REASON);

    const { structured, isError } = await callTool(app, 'continue_draft', {
      key: gameKey(),
      feedback: 'Make the paddle wider and add a second ball.',
    });
    expect(isError).toBe(false);
    expect(structured).toMatchObject({
      jobId: DRAFT_ISSUE,
      slug: SLUG,
      alreadyOpen: false,
    });

    const job = await store.getSubmission(DRAFT_ISSUE);
    expect(job?.state).toBe('building');
    expect(job?.transitions?.at(-1)).toMatchObject({
      to: 'building',
      by: 'agent',
      reason: 'continue_draft',
    });

    const started = await callTool(app, 'start', { key: gameKey() });
    expect(started.isError).toBe(false);
    expect(started.structured).toMatchObject({ jobId: DRAFT_ISSUE, slug: SLUG });
  });

  it('is idempotent while a round is already open', async () => {
    const store = new InMemoryStore();
    await seedGreenDraft(store);
    app = await createApp(store);

    await callTool(app, 'continue_draft', {
      key: gameKey(),
      feedback: 'First continue.',
    });
    const again = await callTool(app, 'continue_draft', {
      key: gameKey(),
      feedback: 'Second continue should not reopen.',
    });
    expect(again.isError).toBe(false);
    expect(again.structured).toMatchObject({ jobId: DRAFT_ISSUE, alreadyOpen: true });
  });

  it('refuses a published game and points at open_round', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(DRAFT_ISSUE, OWNER, 'Live Game');
    await store.setSubmissionSlug(DRAFT_ISSUE, SLUG);
    await store.setSubmissionPublishedAt(DRAFT_ISSUE, '2026-07-01T00:00:00.000Z');
    await store.recordJobTransition(DRAFT_ISSUE, {
      to: 'published',
      at: '2026-07-01T00:00:00.000Z',
      by: 'operator',
      reason: 'published',
    });
    await store.ensureGameAgentKey(SLUG, OWNER, '2026-08-01T12:00:00.000Z');
    app = await createApp(store);

    const { structured, isError } = await callTool(app, 'continue_draft', {
      key: gameKey(),
      feedback: 'Post-publish work belongs on open_round.',
    });
    expect(isError).toBe(true);
    expect((structured as { error: string }).error).toBe(GAME_ALREADY_PUBLISHED_REASON);
  });

  it('opens via creator-key Bearer + slug', async () => {
    const store = new InMemoryStore();
    await seedGreenDraft(store);
    await store.ensureCreatorAgentKey(OWNER, new Date().toISOString());
    const creatorKey = mintCreatorAgentKey(secret, {
      creatorUid: OWNER,
      keyGeneration: 1,
      now: Date.parse('2026-08-01T12:00:00.000Z'),
    });
    app = await createApp(store);

    const { structured, isError } = await callTool(
      app,
      'continue_draft',
      { slug: SLUG, feedback: 'Tighten the serve angle.' },
      { authorization: `Bearer ${creatorKey}` },
    );
    expect(isError).toBe(false);
    expect(structured).toMatchObject({ jobId: DRAFT_ISSUE, alreadyOpen: false });
  });

  it('refuses an unowned slug without blaming the key', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(DRAFT_ISSUE, 'g:other', 'Other');
    await store.setSubmissionSlug(DRAFT_ISSUE, 'other-slug');
    await store.ensureCreatorAgentKey(OWNER, new Date().toISOString());
    const creatorKey = mintCreatorAgentKey(secret, {
      creatorUid: OWNER,
      keyGeneration: 1,
      now: Date.parse('2026-08-01T12:00:00.000Z'),
    });
    app = await createApp(store);

    const { structured, isError } = await callTool(
      app,
      'continue_draft',
      { slug: 'other-slug', feedback: 'Do not rotate for a typo.' },
      { authorization: `Bearer ${creatorKey}` },
    );
    expect(isError).toBe(true);
    expect((structured as { error: string }).error).toBe(SLUG_NOT_ON_ACCOUNT_REASON);
  });

  it('refuses a draft that is mid-publish', async () => {
    const store = new InMemoryStore();
    await seedGreenDraft(store);
    await store.recordJobTransition(DRAFT_ISSUE, {
      to: 'publishing',
      at: '2026-08-01T12:05:00.000Z',
      by: 'operator',
      reason: 'publish_started',
    });
    app = await createApp(store);

    const { structured, isError } = await callTool(app, 'continue_draft', {
      key: gameKey(),
      feedback: 'Too late — bake is in flight.',
    });
    expect(isError).toBe(true);
    expect((structured as { error: string }).error).toMatch(/publishing/i);
    expect((structured as { error: string }).error).not.toBe(DRAFT_NOT_CONTINUABLE_REASON);
  });

  it('adopts a legacy draft with no state into building', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(DRAFT_ISSUE, OWNER, 'Legacy Draft');
    await store.setSubmissionSlug(DRAFT_ISSUE, SLUG);
    await store.setRoundBuilder(DRAFT_ISSUE, 'self');
    await store.ensureGameAgentKey(SLUG, OWNER, '2026-08-01T12:00:00.000Z');
    // No recordJobTransition — state stays undefined (pre-job-model shape).
    expect((await store.getSubmission(DRAFT_ISSUE))?.state).toBeUndefined();
    app = await createApp(store);

    const { structured, isError } = await callTool(app, 'continue_draft', {
      key: gameKey(),
      feedback: 'Pick up this legacy draft and keep going.',
    });
    expect(isError).toBe(false);
    expect(structured).toMatchObject({ jobId: DRAFT_ISSUE, alreadyOpen: false });
    const job = await store.getSubmission(DRAFT_ISSUE);
    expect(job?.state).toBe('building');
  });
});
