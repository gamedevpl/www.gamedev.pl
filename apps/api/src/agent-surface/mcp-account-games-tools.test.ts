import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../platform/app.js';
import { InMemoryStore } from '../store/in-memory.js';
import { mintCreatorAgentKey } from './agent-creator-key.js';
import { createAccountGamesTools } from './mcp-account-games-tools.js';
import { mintMcpSessionKey } from './mcp-session-key.js';
import { STALE_AGENT_TOKEN_REASON } from '../platform/agent-token.js';
import { PLATFORM_CONNECTOR_ONLY_REASON, RETIRED_GAME_KEY_REASON } from './mcp-tool-support.js';
import { mintGameAgentKey } from './agent-game-key.js';
import type { GitHubClient } from '../github.js';
import type { LinkedPullRequest } from '../pr-monitor.js';
import type { CatalogGameEntry, GameSources } from '../catalog/catalog-types.js';

const secret = 'test-token-secret-must-be-32-chars-long';
const sessionSecret = 'dev-session-secret-change-me';
const connectorSecret = 'test-connector-secret-32-chars-min';

const OWNER = 'g:owner';
const OTHER = 'g:other';

function stubGitHub(): GitHubClient {
  return {
    getIssueState: async () => ({ state: 'open' as const }),
    findLinkedPR: async (): Promise<LinkedPullRequest | null> => null,
    createIssueComment: async () => ({ id: 1 }),
    updateIssueBody: async () => {},
    closeIssue: async () => {},
    ensureOpenPullRequest: async () => ({ number: 1 }),
    deleteBranch: async () => {},
    getGameSources: async (): Promise<GameSources | null> => null,
    getGameMedia: async () => null,
    getCatalog: async (): Promise<CatalogGameEntry[]> => [],
    getProgressNotes: async () => null,
  };
}

async function createApp(store: InMemoryStore) {
  await store.upsertUser({ uid: OWNER, email: 'o@example.com', betaStatus: 'approved' });
  await store.upsertUser({ uid: OTHER, email: 'x@example.com', betaStatus: 'approved' });
  await store.ensureCreatorAgentKey(OWNER, new Date().toISOString());
  return buildApp({
    store,
    sessionSecret,
    platformConnectorSecret: connectorSecret,
    submissionRoutes: {
      githubClient: stubGitHub(),
      githubToken: 'gh',
      submissionTokenSecret: secret,
      managedAvailabilityGate: null,
    },
  });
}

async function mcpCall(app: FastifyInstance, method: string, params?: unknown, headers: Record<string, string> = {}) {
  return app.inject({
    method: 'POST',
    url: '/api/mcp',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(method === 'initialize' ? { authorization: 'Bearer handshake', ...headers } : headers),
    },
    payload: { jsonrpc: '2.0', id: 1, method, ...(params !== undefined ? { params } : {}) },
  });
}

async function callListAccountGames(
  app: FastifyInstance,
  args: Record<string, unknown> = {},
  headers: Record<string, string> = {},
) {
  const res = await mcpCall(app, 'tools/call', { name: 'list_account_games', arguments: args }, headers);
  expect(res.statusCode).toBe(200);
  const body = res.json() as {
    result?: {
      isError?: boolean;
      structuredContent?: { games?: unknown[]; total?: number; error?: string };
      content?: Array<{ text: string }>;
    };
  };
  const structured =
    body.result?.structuredContent ??
    (body.result?.content?.[0]?.text ? JSON.parse(body.result.content[0].text) : undefined);
  const errorText = (structured as { error?: string } | undefined)?.error ?? body.result?.content?.[0]?.text;
  return { structured, errorText, isError: Boolean(body.result?.isError) };
}

describe('list_account_games MCP tool', () => {
  it('is advertised in tools/list with readOnlyHint: true', async () => {
    const store = new InMemoryStore();
    const app = await createApp(store);

    const res = await mcpCall(app, 'tools/list');
    expect(res.statusCode).toBe(200);
    const tools = (res.json().result as { tools: Array<{ name: string; annotations?: { readOnlyHint?: boolean } }> })
      .tools;
    const tool = tools.find((t) => t.name === 'list_account_games');
    expect(tool).toBeDefined();
    expect(tool?.annotations?.readOnlyHint).toBe(true);
  });

  it('refuses unauthenticated calls with HTTP 401 challenge', async () => {
    const store = new InMemoryStore();
    const app = await createApp(store);

    const res = await mcpCall(app, 'tools/call', { name: 'list_account_games', arguments: {} });
    expect(res.statusCode).toBe(401);
    expect(res.json().hint).toMatch(/creator account|creator key or OAuth access/i);
  });

  it('refuses invalid bearer credentials with tool error', async () => {
    const store = new InMemoryStore();
    const app = await createApp(store);

    const { structured, isError } = await callListAccountGames(
      app,
      {},
      {
        authorization: 'Bearer invalid-bearer-token',
      },
    );
    expect(isError).toBe(true);
    expect(JSON.stringify(structured)).toMatch(/creator key or OAuth access/i);
  });

  it('refuses platform connector secret', async () => {
    const store = new InMemoryStore();
    const app = await createApp(store);

    const { structured, isError } = await callListAccountGames(
      app,
      {},
      {
        authorization: `Bearer ${connectorSecret}`,
      },
    );
    expect(isError).toBe(true);
    expect(JSON.stringify(structured)).toContain(PLATFORM_CONNECTOR_ONLY_REASON);
  });

  it('refuses retired game keys', async () => {
    const store = new InMemoryStore();
    const app = await createApp(store);
    const retiredKey = mintGameAgentKey(secret, {
      slug: 'comet',
      creatorUid: OWNER,
      keyGeneration: 1,
      now: Date.now(),
    });

    const { structured, isError } = await callListAccountGames(
      app,
      {},
      {
        authorization: `Bearer ${retiredKey}`,
      },
    );
    expect(isError).toBe(true);
    expect(JSON.stringify(structured)).toContain(RETIRED_GAME_KEY_REASON);
  });

  it('returns an empty list when the account has no games', async () => {
    const store = new InMemoryStore();
    const app = await createApp(store);
    const creatorKey = mintCreatorAgentKey(secret, { creatorUid: OWNER, keyGeneration: 1, now: Date.now() });

    const { structured, isError } = await callListAccountGames(
      app,
      {},
      {
        authorization: `Bearer ${creatorKey}`,
      },
    );
    expect(isError).toBe(false);
    expect(structured).toEqual({ games: [], total: 0 });
  });

  it('lists published games and unpublished drafts with correct round states', async () => {
    const store = new InMemoryStore();
    const app = await createApp(store);
    const creatorKey = mintCreatorAgentKey(secret, { creatorUid: OWNER, keyGeneration: 1, now: Date.now() });

    // 1. Published game (no active round)
    const JOB_PUBLISHED = 101;
    await store.createSubmission(JOB_PUBLISHED, OWNER, 'Solar Escape');
    await store.setSubmissionSlug(JOB_PUBLISHED, 'solar-escape');
    await store.setRoundBuilder(JOB_PUBLISHED, 'self');
    await store.setSubmissionPublishedAt(JOB_PUBLISHED, '2026-08-01T12:00:00.000Z');
    await store.recordJobTransition(JOB_PUBLISHED, {
      to: 'published',
      at: '2026-08-01T12:00:00.000Z',
      by: 'operator',
      reason: 'published',
    });

    // 2. Unpublished draft in progress (active build round)
    const JOB_DRAFT = 102;
    await store.createSubmission(JOB_DRAFT, OWNER, 'Dungeon Crawl');
    await store.setSubmissionSlug(JOB_DRAFT, 'dungeon-crawl');
    await store.setRoundBuilder(JOB_DRAFT, 'self');
    await store.recordJobTransition(JOB_DRAFT, {
      to: 'building',
      at: '2026-08-02T12:00:00.000Z',
      by: 'agent',
      reason: 'building',
    });

    // 3. Another user's game (should not appear)
    const JOB_OTHER = 103;
    await store.createSubmission(JOB_OTHER, OTHER, 'Secret Island');
    await store.setSubmissionSlug(JOB_OTHER, 'secret-island');

    const { structured, isError } = await callListAccountGames(
      app,
      {},
      {
        authorization: `Bearer ${creatorKey}`,
      },
    );

    expect(isError).toBe(false);
    const body = structured as {
      total: number;
      games: Array<{
        slug: string;
        title: string;
        state: string;
        round: number;
        published: boolean;
        hasActiveRound: boolean;
        builder: string;
      }>;
    };
    expect(body.total).toBe(2);
    expect(body.games).toHaveLength(2);

    const solar = body.games.find((g) => g.slug === 'solar-escape');
    expect(solar).toMatchObject({
      slug: 'solar-escape',
      title: 'Solar Escape',
      state: 'published',
      published: true,
      hasActiveRound: false,
      builder: 'self',
    });

    const dungeon = body.games.find((g) => g.slug === 'dungeon-crawl');
    expect(dungeon).toMatchObject({
      slug: 'dungeon-crawl',
      title: 'Dungeon Crawl',
      state: 'building',
      published: false,
      hasActiveRound: true,
      builder: 'self',
    });

    expect(body.games.some((g) => g.slug === 'secret-island')).toBe(false);
  });

  it('allows calling with sessionKey', async () => {
    const store = new InMemoryStore();
    const app = await createApp(store);

    const JOB_ID = 201;
    await store.createSubmission(JOB_ID, OWNER, 'Cyber Racer');
    await store.setSubmissionSlug(JOB_ID, 'cyber-racer');
    await store.setRoundBuilder(JOB_ID, 'self');

    const sessionKey = mintMcpSessionKey(secret, {
      sessionId: 'session-123456789012',
      jobId: JOB_ID,
      roundGeneration: 1,
      now: Date.now(),
    });

    const { structured, isError } = await callListAccountGames(app, { sessionKey });
    expect(isError).toBe(false);
    const body = structured as { total: number; games: Array<{ slug: string }> };
    expect(body.total).toBe(1);
    expect(body.games[0]?.slug).toBe('cyber-racer');
  });

  it('respects limit parameter', async () => {
    const store = new InMemoryStore();
    const app = await createApp(store);
    const creatorKey = mintCreatorAgentKey(secret, { creatorUid: OWNER, keyGeneration: 1, now: Date.now() });

    for (let i = 1; i <= 5; i++) {
      const id = 300 + i;
      await store.createSubmission(id, OWNER, `Game ${i}`);
      await store.setSubmissionSlug(id, `game-${i}`);
    }

    const { structured, isError } = await callListAccountGames(
      app,
      { limit: 2 },
      {
        authorization: `Bearer ${creatorKey}`,
      },
    );
    expect(isError).toBe(false);
    const body = structured as { total: number; games: Array<{ slug: string }> };
    expect(body.total).toBe(5);
    expect(body.games).toHaveLength(2);
  });

  it('clamps fractional limit like 0.5 to 1', async () => {
    const store = new InMemoryStore();
    const app = await createApp(store);
    const creatorKey = mintCreatorAgentKey(secret, { creatorUid: OWNER, keyGeneration: 1, now: Date.now() });

    await store.createSubmission(401, OWNER, 'Game 1');
    await store.createSubmission(402, OWNER, 'Game 2');

    const { structured, isError } = await callListAccountGames(
      app,
      { limit: 0.5 },
      {
        authorization: `Bearer ${creatorKey}`,
      },
    );
    expect(isError).toBe(false);
    const body = structured as { total: number; games: Array<{ slug: string }> };
    expect(body.total).toBe(2);
    expect(body.games).toHaveLength(1);
  });

  it('allows platform connector bearer when valid sessionKey is supplied', async () => {
    const store = new InMemoryStore();
    const app = await createApp(store);

    const JOB_ID = 501;
    await store.createSubmission(JOB_ID, OWNER, 'Connector Game');
    await store.setSubmissionSlug(JOB_ID, 'connector-game');

    const sessionKey = mintMcpSessionKey(secret, {
      sessionId: 'session-connector-1234',
      jobId: JOB_ID,
      roundGeneration: 1,
      now: Date.now(),
    });

    const { structured, isError } = await callListAccountGames(
      app,
      { sessionKey },
      { authorization: `Bearer ${connectorSecret}` },
    );
    expect(isError).toBe(false);
    const body = structured as { total: number; games: Array<{ slug: string }> };
    expect(body.total).toBe(1);
    expect(body.games[0]?.slug).toBe('connector-game');
  });

  it('refuses stale sessionKey when round generation has advanced', async () => {
    const store = new InMemoryStore();
    const app = await createApp(store);

    const JOB_ID = 601;
    await store.createSubmission(JOB_ID, OWNER, 'Stale Game');

    const sessionKey = mintMcpSessionKey(secret, {
      sessionId: 'session-stale-1234',
      jobId: JOB_ID,
      roundGeneration: 1,
      now: Date.now(),
    });

    await store.bumpRoundGeneration(JOB_ID);

    const { errorText, isError } = await callListAccountGames(app, { sessionKey });
    expect(isError).toBe(true);
    expect(errorText).toBe(STALE_AGENT_TOKEN_REASON);
  });

  it('recovers state and hasActiveRound from legacy lastStatus', async () => {
    const store = new InMemoryStore();
    const app = await createApp(store);
    const creatorKey = mintCreatorAgentKey(secret, { creatorUid: OWNER, keyGeneration: 1, now: Date.now() });

    const JOB_ID = 701;
    await store.createSubmission(JOB_ID, OWNER, 'Legacy Game');
    await store.setSubmissionSlug(JOB_ID, 'legacy-game');
    await store.setSubmissionLastStatus(JOB_ID, 'building');

    const { structured, isError } = await callListAccountGames(
      app,
      {},
      {
        authorization: `Bearer ${creatorKey}`,
      },
    );
    expect(isError).toBe(false);
    const body = structured as {
      total: number;
      games: Array<{ slug: string; state: string; hasActiveRound: boolean }>;
    };
    expect(body.total).toBe(1);
    expect(body.games[0]?.state).toBe('building');
    expect(body.games[0]?.hasActiveRound).toBe(true);
  });

  it('returns not configured tool error when loadOwnerGames is missing', async () => {
    const store = new InMemoryStore();
    await store.ensureCreatorAgentKey(OWNER, new Date().toISOString());
    const tools = createAccountGamesTools({
      store,
      agentTokenSecret: secret,
      platformConnectorSecret: connectorSecret,
      now: () => Date.now(),
    });
    const creatorKey = mintCreatorAgentKey(secret, { creatorUid: OWNER, keyGeneration: 1, now: Date.now() });
    const result = await tools.list_account_games.handler({}, { bearerToken: creatorKey });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('not configured');
  });
});
