import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { mintCreatorAgentKey } from './agent-surface/agent-creator-key.js';
import {
  DRAFT_NOT_CONTINUABLE_REASON,
  GAME_ALREADY_PUBLISHED_REASON,
  NO_OPEN_ROUND_REASON,
  SLUG_NOT_ON_ACCOUNT_REASON,
} from './agent-surface/agent-game-key.js';
import { buildApp } from './platform/app.js';
import type { ContentChecker } from './platform/moderation.js';
import type { GamesStore } from './delivery/games-store.js';
import type { CatalogGameEntry, GameSources, GitHubClient, LinkedPullRequest } from './catalog/github-client.js';
import { InMemoryStore } from './platform/store.js';
import type { Translator } from './platform/translate.js';

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

async function createApp(store: InMemoryStore, contentChecker?: ContentChecker, translator?: Translator) {
  return buildApp({
    store,
    sessionSecret: 'dev-session-secret-change-me',
    ...(contentChecker ? { contentChecker } : {}),
    submissionRoutes: {
      githubClient: stubGitHub(),
      githubToken: 'gh-token',
      submissionTokenSecret: secret,
      agentChannel: {} as { gamesStore?: GamesStore },
      ...(translator ? { translator } : {}),
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
    const headers = await creatorHeaders(store);
    app = await createApp(store);

    const startBefore = await callTool(app, 'start', { slug: SLUG }, headers);
    expect(startBefore.isError).toBe(true);
    expect((startBefore.structured as { error: string }).error).toMatch(/continue_draft/i);
    expect((startBefore.structured as { error: string }).error).toBe(NO_OPEN_ROUND_REASON);

    const { structured, isError } = await callTool(
      app,
      'continue_draft',
      { slug: SLUG, feedback: 'Make the paddle wider and add a second ball.' },
      headers,
    );
    expect(isError).toBe(false);
    expect(structured).toMatchObject({
      jobId: DRAFT_ISSUE,
      slug: SLUG,
      alreadyOpen: false,
    });

    const job = await store.getSubmission(DRAFT_ISSUE);
    expect(job?.state).toBe('dispatched');
    expect(job?.transitions?.at(-1)).toMatchObject({
      to: 'dispatched',
      by: 'agent',
      reason: 'continue_draft',
    });

    const started = await callTool(app, 'start', { slug: SLUG }, headers);
    expect(started.isError).toBe(false);
    expect(started.structured).toMatchObject({ jobId: DRAFT_ISSUE, slug: SLUG });
  });

  it('reopens as self even when the closed round was platform-built and never set deliveredVersion', async () => {
    // A platform round reaches ready_for_review without ever setting deliveredVersion.
    const store = new InMemoryStore();
    await store.createSubmission(DRAFT_ISSUE, OWNER, 'Pong Draft');
    await store.setSubmissionSlug(DRAFT_ISSUE, SLUG);
    await store.recordDispatch(DRAFT_ISSUE, { backend: 'managed:openai', ref: 'resp_1' });
    await store.recordJobTransition(DRAFT_ISSUE, {
      to: 'ready_for_review',
      at: '2026-08-01T12:00:00.000Z',
      by: 'reconciler',
      reason: 'task_completed',
    });
    await store.ensureGameAgentKey(SLUG, OWNER, '2026-08-01T12:00:00.000Z');
    const headers = await creatorHeaders(store);
    app = await createApp(store);

    const { isError } = await callTool(
      app,
      'continue_draft',
      { slug: SLUG, feedback: 'Switch this to my own agent.' },
      headers,
    );
    expect(isError).toBe(false);

    const job = await store.getSubmission(DRAFT_ISSUE);
    expect(job?.builder).toBe('self');
    expect(job?.state).toBe('dispatched');

    const started = await callTool(app, 'start', { slug: SLUG }, headers);
    expect(started.isError).toBe(false);
  });

  it('records the relayed feedback as the agent’s words, not the creator’s', async () => {
    // The agent writes this sentence; the creator said something else, somewhere else.
    // Studio shows it on the creator's side of the thread, so it has to carry who typed
    // it — otherwise a paraphrase reads as a message the creator wrote themselves.
    const store = new InMemoryStore();
    await seedGreenDraft(store);
    const headers = await creatorHeaders(store);
    app = await createApp(store);

    await callTool(
      app,
      'continue_draft',
      { slug: SLUG, feedback: 'Make the paddle wider and add a second ball.' },
      headers,
    );

    const messages = await store.listCreatorMessages(DRAFT_ISSUE);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      text: 'Make the paddle wider and add a second ball.',
      origin: 'agent',
    });
  });

  it('stores the relayed request in the creator’s language, translated on the write', async () => {
    // The agent relays in whatever language it was speaking — nearly always English —
    // and the creator reads the thread in theirs. This is translated here, on the write
    // that stores it, so the 3s status poll that shows it never calls a model.
    const store = new InMemoryStore();
    await seedGreenDraft(store);
    await store.setSubmissionLocale(DRAFT_ISSUE, 'pl');
    const asked: Array<{ text: string; kind?: string }> = [];
    const translator: Translator = {
      toBilingual: async (text, _locale, opts) => {
        asked.push({ text, kind: opts?.kind });
        return { en: text, localized: `PL:${text}` };
      },
    };
    const headers = await creatorHeaders(store);
    app = await createApp(store, undefined, translator);

    await callTool(
      app,
      'continue_draft',
      { slug: SLUG, feedback: 'Make the paddle wider and add a second ball.' },
      headers,
    );

    const messages = await store.listCreatorMessages(DRAFT_ISSUE);
    expect(messages[0]).toMatchObject({
      text: 'Make the paddle wider and add a second ball.',
      textLocalized: 'PL:Make the paddle wider and add a second ball.',
      locale: 'pl',
      origin: 'agent',
    });
    // kind must be 'message', never 'log'. The log prompt compresses to one short line,
    // which on a numbered change request hands the creator a summary of their own
    // request with pieces missing.
    expect(asked).toEqual([{ text: 'Make the paddle wider and add a second ball.', kind: 'message' }]);
  });

  it('leaves the relayed request in its own language when translation fails', async () => {
    // Decorative, and never retried: the round must open even with Vertex down, and the
    // stored message stays as the agent wrote it rather than being re-attempted by a
    // reader. That asymmetry is what keeps a failure from becoming a per-poll retry.
    const store = new InMemoryStore();
    await seedGreenDraft(store);
    await store.setSubmissionLocale(DRAFT_ISSUE, 'pl');
    const translator: Translator = {
      toBilingual: async () => {
        throw new Error('vertex is down');
      },
    };
    const headers = await creatorHeaders(store);
    app = await createApp(store, undefined, translator);

    const res = await callTool(app, 'continue_draft', { slug: SLUG, feedback: 'Make the paddle wider.' }, headers);

    expect((res.structured as { error?: string }).error).toBeUndefined();
    const messages = await store.listCreatorMessages(DRAFT_ISSUE);
    expect(messages[0]).toMatchObject({ text: 'Make the paddle wider.', origin: 'agent' });
    expect(messages[0]!.textLocalized).toBeUndefined();
  });

  it('never translates a creator’s own words', async () => {
    // The creator typed these in the language they chose. Running them through a
    // translator would hand them back a paraphrase of their own request — the exact bug
    // the origin field exists to prevent.
    const store = new InMemoryStore();
    await seedGreenDraft(store);
    await store.setSubmissionLocale(DRAFT_ISSUE, 'pl');
    let calls = 0;
    const translator: Translator = {
      toBilingual: async (text) => {
        calls++;
        return { en: text, localized: `PL:${text}` };
      },
    };
    app = await createApp(store, undefined, translator);

    await store.appendCreatorMessage(DRAFT_ISSUE, 'Zrób paletkę szerszą.', { origin: 'creator' });

    const messages = await store.listCreatorMessages(DRAFT_ISSUE);
    expect(messages[0]!.textLocalized).toBeUndefined();
    expect(calls).toBe(0);
  });

  it('is idempotent while a round is already open', async () => {
    const store = new InMemoryStore();
    await seedGreenDraft(store);
    const headers = await creatorHeaders(store);
    app = await createApp(store);

    await callTool(app, 'continue_draft', { slug: SLUG, feedback: 'First continue.' }, headers);
    const again = await callTool(
      app,
      'continue_draft',
      { slug: SLUG, feedback: 'Second continue should not reopen.' },
      headers,
    );
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
    const headers = await creatorHeaders(store);
    app = await createApp(store);

    const { structured, isError } = await callTool(
      app,
      'continue_draft',
      { slug: SLUG, feedback: 'Post-publish work belongs on open_round.' },
      headers,
    );
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
    const headers = await creatorHeaders(store);
    app = await createApp(store);

    const { structured, isError } = await callTool(
      app,
      'continue_draft',
      { slug: SLUG, feedback: 'Too late — bake is in flight.' },
      headers,
    );
    expect(isError).toBe(true);
    expect((structured as { error: string }).error).toMatch(/publishing/i);
    expect((structured as { error: string }).error).not.toBe(DRAFT_NOT_CONTINUABLE_REASON);
  });

  it('adopts a legacy draft with no state into dispatched', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(DRAFT_ISSUE, OWNER, 'Legacy Draft');
    await store.setSubmissionSlug(DRAFT_ISSUE, SLUG);
    await store.setRoundBuilder(DRAFT_ISSUE, 'self');
    const headers = await creatorHeaders(store);
    // No recordJobTransition — state stays undefined (pre-job-model shape).
    expect((await store.getSubmission(DRAFT_ISSUE))?.state).toBeUndefined();
    app = await createApp(store);

    const { structured, isError } = await callTool(
      app,
      'continue_draft',
      { slug: SLUG, feedback: 'Pick up this legacy draft and keep going.' },
      headers,
    );
    expect(isError).toBe(false);
    expect(structured).toMatchObject({ jobId: DRAFT_ISSUE, alreadyOpen: false });
    const job = await store.getSubmission(DRAFT_ISSUE);
    expect(job?.state).toBe('dispatched');
  });
});
