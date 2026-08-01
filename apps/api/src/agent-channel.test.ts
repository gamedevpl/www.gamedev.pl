import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { mintAgentToken, mintLegacyAgentToken, STALE_AGENT_TOKEN_REASON } from './agent-token.js';
import { buildApp } from './app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './auth.js';
import type { CatalogGameEntry, GameSources, GitHubClient, LinkedPullRequest } from './github-client.js';
import type { GamesStore } from './games-store.js';
import { InMemoryStore } from './store.js';
import { mintToken } from './submission-token.js';
import { NoopTranslator } from './translate.js';

const secret = 'test-secret';
const ISSUE = 42;

function stubGitHub(overrides: Partial<GitHubClient> = {}): GitHubClient {
  return {
    createIssue: async () => ({ number: ISSUE }),
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
    ...overrides,
  };
}

const sessionSecret = 'dev-session-secret-change-me';

async function createApp(
  store: InMemoryStore,
  agentChannel?: {
    maxEventsPerWindow?: number;
    gamesStore?: GamesStore;
    maxSubmitsPerWindow?: number;
    onSourcesDelivered?: (input: { issueNumber: number; slug: string; version: string }) => void;
  },
) {
  await store.upsertUser({ uid: 'g:owner' });
  return await buildApp({
    store,
    sessionSecret,
    submissionRoutes: {
      githubClient: stubGitHub(),
      githubToken: 'gh-token',
      submissionTokenSecret: secret,
      translator: new NoopTranslator(),
      ...(agentChannel ? { agentChannel } : {}),
    },
  });
}

function creatorHeaders(uid = 'g:owner') {
  return { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}` };
}

async function seedSubmission(store: InMemoryStore, issueNumber = ISSUE) {
  await store.createSubmission(issueNumber, 'g:owner', 'Squad game');
  await store.setSubmissionLocale(issueNumber, 'pl');
}

function agentHeaders(issueNumber = ISSUE, roundGeneration = 1) {
  return {
    authorization: `Bearer ${mintAgentToken(issueNumber, secret, { roundGeneration })}`,
  };
}

describe('agent build channel', () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    await app?.close();
    app = null;
  });

  it('records a progress event and returns it on the creator status response', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    app = await createApp(store);

    const posted = await app.inject({
      method: 'POST',
      url: '/api/agent/build/progress',
      headers: agentHeaders(),
      payload: { kind: 'step', step: 'mechanics', text: 'Getting the squad moving and shooting.' },
    });

    expect(posted.statusCode).toBe(200);
    expect(posted.json().accepted).toBe(true);
    expect(posted.json().event).toMatchObject({ kind: 'step', step: 'mechanics' });

    const status = await app.inject({ method: 'GET', url: `/api/submissions/${mintToken(ISSUE, secret)}` });
    expect(status.statusCode).toBe(200);
    expect(status.json().events).toHaveLength(1);
    expect(status.json().events[0]).toMatchObject({
      step: 'mechanics',
      text: 'Getting the squad moving and shooting.',
    });
  });

  it('serves the agent sentence written in the creator language without translating it', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    app = await createApp(store);

    await app.inject({
      method: 'POST',
      url: '/api/agent/build/progress',
      headers: agentHeaders(),
      payload: {
        step: 'art',
        text: 'Drawing the soldiers.',
        textLocalized: 'Rysuję żołnierzy.',
        locale: 'pl',
      },
    });

    const polish = await app.inject({
      method: 'GET',
      url: `/api/submissions/${mintToken(ISSUE, secret)}?locale=pl`,
    });
    expect(polish.json().events[0].text).toBe('Rysuję żołnierzy.');
    // The wire carries one resolved sentence, not a choice for the client to make.
    expect(polish.json().events[0].textLocalized).toBeUndefined();

    // A reader in another language falls back to the source text (translation is
    // stubbed out here) rather than being served Polish they may not read.
    const english = await app.inject({
      method: 'GET',
      url: `/api/submissions/${mintToken(ISSUE, secret)}?locale=en`,
    });
    expect(english.json().events[0].text).toBe('Drawing the soldiers.');
  });

  it('drops a localized sentence with no language tag', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    app = await createApp(store);

    await app.inject({
      method: 'POST',
      url: '/api/agent/build/progress',
      headers: agentHeaders(),
      payload: { text: 'Drawing the soldiers.', textLocalized: 'Rysuję żołnierzy.' },
    });

    const events = await store.listBuildEvents(ISSUE);
    expect(events[0]!.textLocalized).toBeUndefined();
  });

  it('sanitizes agent text and caps its length', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    app = await createApp(store);

    await app.inject({
      method: 'POST',
      url: '/api/agent/build/progress',
      headers: agentHeaders(),
      payload: { text: `<img src=x onerror=alert(1)> **${'a'.repeat(400)}**` },
    });

    const [event] = await store.listBuildEvents(ISSUE);
    expect(event!.text).not.toContain('<');
    expect(event!.text).not.toContain('*');
    expect(event!.text.length).toBeLessThanOrEqual(300);
  });

  it('hands the creator’s change requests back in the reply, and keeps them until acked', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    await store.appendCreatorMessage(ISSUE, 'Make the soldiers faster');
    app = await createApp(store);

    const first = await app.inject({
      method: 'POST',
      url: '/api/agent/build/progress',
      headers: agentHeaders(),
      payload: { text: 'Working on the maze.' },
    });
    expect(first.json().pending).toHaveLength(1);
    expect(first.json().pending[0].text).toBe('Make the soldiers faster');
    expect(first.json().control).toMatchObject({ stop: false, locale: 'pl' });

    // Reading is not acknowledging: an agent that crashes here must not lose it.
    const again = await app.inject({ method: 'GET', url: '/api/agent/build/inbox', headers: agentHeaders() });
    expect(again.json().pending).toHaveLength(1);

    const acked = await app.inject({
      method: 'POST',
      url: '/api/agent/build/inbox/ack',
      headers: agentHeaders(),
      payload: { ids: [first.json().pending[0].id] },
    });
    expect(acked.json().pending).toHaveLength(0);
  });

  it('queues creator feedback for the agent when it is posted to GitHub', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    app = await createApp(store);

    const sent = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(ISSUE, secret)}/feedback`,
      headers: creatorHeaders(),
      payload: { feedback: 'Please make the soldiers move faster' },
    });

    expect(sent.statusCode).toBe(200);
    const pending = await store.listPendingCreatorMessages(ISSUE);
    expect(pending).toHaveLength(1);
    expect(pending[0]!.text).toBe('Please make the soldiers move faster');
  });

  it('tells an agent to stop when the creator abandoned the build, and records nothing', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    await store.setSubmissionAbandoned(ISSUE, new Date().toISOString());
    app = await createApp(store);

    const response = await app.inject({
      method: 'POST',
      url: '/api/agent/build/progress',
      headers: agentHeaders(),
      payload: { text: 'Still building away.' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      accepted: false,
      rejected: 'stopped',
      control: { stop: true, reason: 'abandoned' },
    });
    expect(await store.listBuildEvents(ISSUE)).toHaveLength(0);
  });

  it('rejects the pre-cancel token after operator cancel bumps the round generation', async () => {
    // Cancel closes the round (generation bump). The agent's held key is then stale;
    // the 401 fresh-prompt body is the stop signal — no terminal-job exception.
    const store = new InMemoryStore();
    await seedSubmission(store);
    await store.recordJobTransition(ISSUE, {
      to: 'canceled',
      at: new Date().toISOString(),
      by: 'operator',
      reason: 'operator_canceled',
    });
    expect((await store.getSubmission(ISSUE))?.roundGeneration).toBe(2);
    app = await createApp(store);

    const response = await app.inject({
      method: 'POST',
      url: '/api/agent/build/progress',
      headers: agentHeaders(ISSUE, 1),
      payload: { text: 'Still building away.' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe(STALE_AGENT_TOKEN_REASON);
    expect(await store.listBuildEvents(ISSUE)).toHaveLength(0);
  });

  it('rejects a missing, malformed, or wrongly scoped token', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    app = await createApp(store);

    const payload = { text: 'hello' };
    const none = await app.inject({ method: 'POST', url: '/api/agent/build/progress', payload });
    expect(none.statusCode).toBe(401);

    const garbage = await app.inject({
      method: 'POST',
      url: '/api/agent/build/progress',
      headers: { authorization: 'Bearer not-a-token' },
      payload,
    });
    expect(garbage.statusCode).toBe(401);

    // A submission token is a *different* capability (it can spend quota and stop
    // the build). Presenting one here must not work, even for the same issue.
    const wrongScope = await app.inject({
      method: 'POST',
      url: '/api/agent/build/progress',
      headers: { authorization: `Bearer ${mintToken(ISSUE, secret)}` },
      payload,
    });
    expect(wrongScope.statusCode).toBe(401);
  });

  it('rejects a stale-generation or expired token with the fresh-prompt reason', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    app = await createApp(store);

    const stale = await app.inject({
      method: 'POST',
      url: '/api/agent/build/progress',
      headers: agentHeaders(ISSUE, 99),
      payload: { text: 'hello' },
    });
    expect(stale.statusCode).toBe(401);
    expect(stale.json().error).toBe(STALE_AGENT_TOKEN_REASON);

    const expired = mintAgentToken(ISSUE, secret, {
      roundGeneration: 1,
      now: Date.now() - 20 * 24 * 60 * 60 * 1000,
      ttlDays: 14,
    });
    const expiredRes = await app.inject({
      method: 'POST',
      url: '/api/agent/build/progress',
      headers: { authorization: `Bearer ${expired}` },
      payload: { text: 'hello' },
    });
    expect(expiredRes.statusCode).toBe(401);
    expect(expiredRes.json().error).toBe(STALE_AGENT_TOKEN_REASON);
  });

  it('rejects stale and expired tokens on terminal jobs with a strict 401 (no stopReason bypass)', async () => {
    // Regression for the rejected resolveBuild exception: publishedAt is permanent, so
    // letting a signature-valid stale/expired key through on stopReason would grant
    // indefinite source/inbox reads and unguarded inbox/ack writes.
    const store = new InMemoryStore();
    await seedSubmission(store);
    await store.setSubmissionPublishedAt(ISSUE, '2026-07-31T12:00:00.000Z');
    // Leave roundGeneration at 1 so a gen-99 key is clearly stale, not merely "closed".
    app = await createApp(store);

    const staleHeaders = agentHeaders(ISSUE, 99);
    for (const req of [
      { method: 'GET' as const, url: '/api/agent/build/sources' },
      { method: 'GET' as const, url: '/api/agent/build/inbox' },
      { method: 'GET' as const, url: '/api/agent/build/brief' },
      { method: 'GET' as const, url: '/api/agent/build/seed' },
      { method: 'GET' as const, url: '/api/agent/build/kit' },
      { method: 'GET' as const, url: '/api/agent/build/examples' },
      { method: 'POST' as const, url: '/api/agent/build/inbox/ack', payload: { ids: ['m1'] } },
      { method: 'POST' as const, url: '/api/agent/build/progress', payload: { text: 'hello' } },
    ]) {
      const res = await app.inject({
        method: req.method,
        url: req.url,
        headers: staleHeaders,
        ...(req.payload ? { payload: req.payload } : {}),
      });
      expect(res.statusCode, req.url).toBe(401);
      expect(res.json().error).toBe(STALE_AGENT_TOKEN_REASON);
    }

    const expired = mintAgentToken(ISSUE, secret, {
      roundGeneration: 1,
      now: Date.now() - 20 * 24 * 60 * 60 * 1000,
      ttlDays: 14,
    });
    const expiredSources = await app.inject({
      method: 'GET',
      url: '/api/agent/build/sources',
      headers: { authorization: `Bearer ${expired}` },
    });
    expect(expiredSources.statusCode).toBe(401);
    expect(expiredSources.json().error).toBe(STALE_AGENT_TOKEN_REASON);
  });

  it('still accepts a legacy token on a job that has never closed a round under the new model', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    // Simulate a pre-migration record: strip the generation new creates stamp.
    const legacy = await store.getSubmission(ISSUE);
    const submissions = (store as unknown as { submissions: Map<number, import('./store.js').SubmissionRecord> })
      .submissions;
    submissions.set(ISSUE, { ...legacy!, roundGeneration: undefined });

    app = await createApp(store);
    const response = await app.inject({
      method: 'POST',
      url: '/api/agent/build/progress',
      headers: { authorization: `Bearer ${mintLegacyAgentToken(ISSUE, secret)}` },
      payload: { kind: 'step', step: 'mechanics', text: 'Still the same round.' },
    });
    expect(response.statusCode).toBe(200);

    // Closing the round initializes generation; the legacy token must not revive.
    await store.recordJobTransition(ISSUE, {
      to: 'ready_for_review',
      at: '2026-07-31T12:00:00.000Z',
      by: 'gate',
      reason: 'gate_green',
    });
    expect((await store.getSubmission(ISSUE))?.roundGeneration).toBe(1);

    const afterClose = await app.inject({
      method: 'POST',
      url: '/api/agent/build/progress',
      headers: { authorization: `Bearer ${mintLegacyAgentToken(ISSUE, secret)}` },
      payload: { text: 'too late' },
    });
    expect(afterClose.statusCode).toBe(401);
    expect(afterClose.json().error).toBe(STALE_AGENT_TOKEN_REASON);
  });

  it('refuses a token for a build that does not exist', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    app = await createApp(store);

    const response = await app.inject({
      method: 'POST',
      url: '/api/agent/build/progress',
      headers: agentHeaders(999),
      payload: { text: 'hello' },
    });
    expect(response.statusCode).toBe(404);
  });

  it('caps how many events one build may record', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    app = await createApp(store, { maxEventsPerWindow: 2 });

    for (let index = 0; index < 2; index += 1) {
      const ok = await app.inject({
        method: 'POST',
        url: '/api/agent/build/progress',
        headers: agentHeaders(),
        payload: { text: `update ${index}` },
      });
      expect(ok.json().accepted).toBe(true);
    }

    const limited = await app.inject({
      method: 'POST',
      url: '/api/agent/build/progress',
      headers: agentHeaders(),
      payload: { text: 'one too many' },
    });
    // Still a 200 carrying the inbox: dropping the creator's request because the
    // agent is chatty would be the worst of both.
    expect(limited.json()).toMatchObject({ accepted: false, rejected: 'rate_limited' });
    expect(limited.json().pending).toEqual([]);
  });
  // A 1x1 PNG — the smallest payload that still carries a real PNG signature.
  const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  it('stores a pushed screenshot, lists it on the status response, and serves the bytes', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    app = await createApp(store);

    const pushed = await app.inject({
      method: 'POST',
      url: '/api/agent/build/shot',
      headers: agentHeaders(),
      payload: { png: TINY_PNG, label: 'First bridge' },
    });

    expect(pushed.statusCode).toBe(200);
    expect(pushed.json().accepted).toBe(true);
    const shotId = pushed.json().shot.id as string;

    // No pull request exists in this fixture, so this is exactly the empty-page
    // stretch the channel is for: a picture with nothing committed anywhere.
    const token = mintToken(ISSUE, secret);
    const status = await app.inject({ method: 'GET', url: `/api/submissions/${token}` });
    expect(status.json().media).toEqual([
      expect.objectContaining({ source: 'channel', ref: shotId, label: 'First bridge' }),
    ]);

    const image = await app.inject({
      method: 'GET',
      url: `/api/submissions/${token}/shot/${shotId}`,
      headers: creatorHeaders(),
    });
    expect(image.statusCode).toBe(200);
    expect(image.headers['content-type']).toContain('image/png');
    expect(image.rawPayload.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  });

  it('refuses a payload that is not a PNG, whatever it claims to be', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    app = await createApp(store);

    const response = await app.inject({
      method: 'POST',
      url: '/api/agent/build/shot',
      headers: agentHeaders(),
      payload: { png: Buffer.from('<svg onload=alert(1)>').toString('base64') },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('not a PNG');
    expect(await store.countBuildShots(ISSUE)).toBe(0);
  });

  it('will not serve one build\u2019s screenshot to another build\u2019s token', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    await seedSubmission(store, 99);
    app = await createApp(store);

    const pushed = await app.inject({
      method: 'POST',
      url: '/api/agent/build/shot',
      headers: agentHeaders(),
      payload: { png: TINY_PNG },
    });
    const shotId = pushed.json().shot.id as string;

    const stolen = await app.inject({
      method: 'GET',
      url: `/api/submissions/${mintToken(99, secret)}/shot/${shotId}`,
      headers: creatorHeaders(),
    });
    expect(stolen.statusCode).toBe(404);
  });

  const GAME_HTML = Buffer.from('<!doctype html><html><body><canvas id="game"></canvas></body></html>').toString(
    'base64',
  );

  it('stores a pushed playable build, lists it on the status response, and serves it', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    app = await createApp(store);

    const pushed = await app.inject({
      method: 'POST',
      url: '/api/agent/build/preview',
      headers: agentHeaders(),
      payload: { html: GAME_HTML, slug: 'puppy-stroll', label: 'You can walk the puppy now.' },
    });

    expect(pushed.statusCode).toBe(200);
    expect(pushed.json().accepted).toBe(true);
    const previewId = pushed.json().preview.id as string;

    const token = mintToken(ISSUE, secret);
    const status = await app.inject({ method: 'GET', url: `/api/submissions/${token}` });
    expect(status.json().playable).toEqual([
      expect.objectContaining({ ref: previewId, slug: 'puppy-stroll', label: 'You can walk the puppy now.' }),
    ]);

    const page = await app.inject({
      method: 'GET',
      url: `/api/submissions/${token}/preview/${previewId}`,
      headers: creatorHeaders(),
    });
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-type']).toContain('text/html');
    expect(page.body).toContain('<canvas id="game">');
  });

  it('serves a preview sandboxed, uncacheable by shared caches, and unable to call home', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    app = await createApp(store);

    const pushed = await app.inject({
      method: 'POST',
      url: '/api/agent/build/preview',
      headers: agentHeaders(),
      payload: { html: GAME_HTML },
    });
    const token = mintToken(ISSUE, secret);
    const page = await app.inject({
      method: 'GET',
      url: `/api/submissions/${token}/preview/${pushed.json().preview.id}`,
      headers: creatorHeaders(),
    });

    // This document is unreviewed agent output executed in the creator's browser. Each
    // of these is load-bearing, so each is asserted rather than assumed.
    const csp = page.headers['content-security-policy'] as string;
    expect(csp).toContain('sandbox allow-scripts allow-pointer-lock');
    // Never granted: with it, the sandbox would share the site's origin and the
    // document could reach the creator's session.
    expect(csp).not.toContain('allow-same-origin');
    // A game bundle is offline by construction, so nothing legitimate needs the network.
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("form-action 'none'");
    // Deliberately absent: the web app may live on a different origin than the API
    // (VITE_API_BASE_URL), and frame-ancestors would block the status page from
    // framing its own preview in exactly those deployments.
    expect(csp).not.toContain('frame-ancestors');
    expect(page.headers['x-content-type-options']).toBe('nosniff');
    expect(page.headers['cache-control']).toContain('private');
  });

  it('refuses a payload that is not an HTML document', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    app = await createApp(store);

    const response = await app.inject({
      method: 'POST',
      url: '/api/agent/build/preview',
      headers: agentHeaders(),
      payload: { html: Buffer.from('GIF89a<script>alert(1)</script>').toString('base64') },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('not an HTML document');
    expect(await store.countBuildPreviews(ISSUE)).toBe(0);
  });

  it('keeps only the newest previews, because each one obsoletes the last', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    app = await createApp(store);

    for (let index = 0; index < 7; index++) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/agent/build/preview',
        headers: agentHeaders(),
        payload: { html: GAME_HTML, label: `build ${index}` },
      });
      expect(response.json().accepted).toBe(true);
    }

    // A watcher pushing every time the game recompiles would otherwise accumulate
    // hundreds of megabytes over one build.
    expect(await store.countBuildPreviews(ISSUE)).toBe(4);
    const newest = await store.listBuildPreviews(ISSUE);
    expect(newest[0]?.label).toBe('build 6');
  });

  it('will not serve one build’s playable preview to another build’s token', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    await seedSubmission(store, 99);
    app = await createApp(store);

    const pushed = await app.inject({
      method: 'POST',
      url: '/api/agent/build/preview',
      headers: agentHeaders(),
      payload: { html: GAME_HTML },
    });

    const stolen = await app.inject({
      method: 'GET',
      url: `/api/submissions/${mintToken(99, secret)}/preview/${pushed.json().preview.id}`,
      headers: creatorHeaders(),
    });
    expect(stolen.statusCode).toBe(404);
  });

  it('stops accepting previews once the creator has stopped the build', async () => {
    const store = new InMemoryStore();
    await seedSubmission(store);
    await store.setSubmissionAbandoned(ISSUE, new Date().toISOString());
    app = await createApp(store);

    const response = await app.inject({
      method: 'POST',
      url: '/api/agent/build/preview',
      headers: agentHeaders(),
      payload: { html: GAME_HTML },
    });

    expect(response.json()).toMatchObject({ accepted: false, rejected: 'stopped' });
    expect(await store.countBuildPreviews(ISSUE)).toBe(0);
  });

  /**
   * Delivery: the verb that replaces "open a pull request and wait for a merge".
   *
   * The interesting cases are all about not trusting the upload — the agent is working
   * from creator-authored text, so the request is treated as a claim to be checked rather
   * than an instruction to be carried out.
   */
  describe('POST /api/agent/build/sources', () => {
    const MINIMAL = [
      { path: 'SPEC.md', content: '---\ntitle: A game\n---\n' },
      { path: 'index.html', content: '<!doctype html>' },
      { path: 'game.ts', content: 'export {};' },
      { path: 'TRACE.json', content: '{"samples":[]}' },
      { path: 'PLAYTEST.json', content: '{"expectProgress":["round-start"]}' },
      { path: 'AGENT.json', content: '{"policy":"capture"}' },
    ];

    function stubGamesStore() {
      const stored: Array<{ slug: string; issueNumber: number; files: unknown[]; kitEngineRef?: string }> = [];
      const gamesStore = {
        putCandidateSources: async (input: {
          slug: string;
          issueNumber: number;
          files: unknown[];
          kitEngineRef?: string;
        }) => {
          stored.push(input);
          const { validateSourceUpload } = await import('./games-store.js');
          validateSourceUpload(input.files as Array<{ path: string; content: string }>);
          return { version: 'v1', manifest: {} as never };
        },
        getManifest: async () => null,
        getSourceFile: async () => null,
        putGateResult: async () => {},
        putDerivedArtifact: async () => {},
        getDerivedArtifact: async () => null,
        getKitRegistry: async () => null,
      } as unknown as GamesStore;
      return { gamesStore, stored };
    }

    it('stores a delivered game as a candidate version', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      const { gamesStore, stored } = stubGamesStore();
      app = await createApp(store, { gamesStore });

      const response = await app.inject({
        method: 'POST',
        url: '/api/agent/build/sources',
        headers: agentHeaders(),
        payload: {
          slug: 'comet-courier',
          files: MINIMAL,
          kitEngineRef: 'abcdef1234567890',
        },
      });

      expect(response.json()).toMatchObject({ accepted: true, delivery: { slug: 'comet-courier', version: 'v1' } });
      expect(stored[0]).toMatchObject({
        slug: 'comet-courier',
        issueNumber: ISSUE,
        kitEngineRef: 'abcdef1234567890',
      });
    });

    it('rejects config-shaped filenames at the sources endpoint, naming the path', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      const { gamesStore } = stubGamesStore();
      app = await createApp(store, { gamesStore });

      const response = await app.inject({
        method: 'POST',
        url: '/api/agent/build/sources',
        headers: agentHeaders(),
        payload: {
          slug: 'comet-courier',
          files: [...MINIMAL, { path: 'package.json', content: '{}' }],
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain('package.json');
      expect(response.json().error).toMatch(/Config or executable-shaped/i);
    });

    it('adopts the SPEC title so the shelf stops showing a truncated prompt', async () => {
      // The production example: submission title was prompt.slice(0, 40), SPEC said
      // "TV Tycoon". Publish already preferred the SPEC title for the catalog; the
      // shelf and studio kept the fragment until delivery wrote it back.
      const store = new InMemoryStore();
      await store.createSubmission(ISSUE, 'g:owner', 'A game tycoon like where I run a tv busi');
      await store.setSubmissionLocale(ISSUE, 'pl');
      const { gamesStore } = stubGamesStore();
      app = await createApp(store, { gamesStore });

      const files = MINIMAL.map((file) =>
        file.path === 'SPEC.md' ? { ...file, content: '---\ntitle: TV Tycoon\n---\n' } : file,
      );
      const response = await app.inject({
        method: 'POST',
        url: '/api/agent/build/sources',
        headers: agentHeaders(),
        payload: { slug: 'tv-tycoon', files },
      });

      expect(response.statusCode).toBe(200);
      expect((await store.getSubmission(ISSUE))?.title).toBe('TV Tycoon');
    });

    it('tells the agent the gate refused its delivery, and that it is not done', async () => {
      // The step an agent cannot see: the gate runs after the upload, in our container,
      // against our engine. A session that delivered and exited learned nothing, so the
      // report nobody read became the next round's starting point. It is carried on the
      // channel the agent is already polling, for the same reason `mustDeliver` is.
      const store = new InMemoryStore();
      await seedSubmission(store);
      await store.setSubmissionSlug(ISSUE, 'comet-courier');
      await store.setSubmissionDeliveredVersion(ISSUE, 'v1');
      const { gamesStore } = stubGamesStore();
      app = await createApp(store, {
        gamesStore: {
          ...gamesStore,
          getManifest: async () => ({
            gate: {
              green: false,
              ranAt: '2026-07-30T19:35:00Z',
              report: 'Check 26 failed: every control is pointer-driven',
            },
          }),
        } as unknown as GamesStore,
      });

      const response = await app.inject({ method: 'GET', url: '/api/agent/build/inbox', headers: agentHeaders() });

      expect(response.json()).toMatchObject({
        gate: { version: 'v1', green: false, report: 'Check 26 failed: every control is pointer-driven' },
      });
      expect(response.json().control.mustFixGate).toContain('not');
    });

    it('does not nudge a build whose gate passed', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      await store.setSubmissionSlug(ISSUE, 'comet-courier');
      await store.setSubmissionDeliveredVersion(ISSUE, 'v1');
      const { gamesStore } = stubGamesStore();
      app = await createApp(store, {
        gamesStore: {
          ...gamesStore,
          getManifest: async () => ({ gate: { green: true, ranAt: '2026-07-30T19:35:00Z' } }),
        } as unknown as GamesStore,
      });

      const response = await app.inject({ method: 'GET', url: '/api/agent/build/inbox', headers: agentHeaders() });

      expect(response.json()).toMatchObject({ gate: { green: true } });
      expect(response.json().control.mustFixGate).toBeUndefined();
    });

    it('keeps the channel working when the gate verdict cannot be read', async () => {
      // The channel is how an agent reports progress and reads its creator's messages.
      // A store that will not answer must cost it the verdict, not both.
      const store = new InMemoryStore();
      await seedSubmission(store);
      await store.setSubmissionSlug(ISSUE, 'comet-courier');
      await store.setSubmissionDeliveredVersion(ISSUE, 'v1');
      const { gamesStore } = stubGamesStore();
      app = await createApp(store, {
        gamesStore: {
          ...gamesStore,
          getManifest: async () => {
            throw new Error('games store read failed: 503');
          },
        } as unknown as GamesStore,
      });

      const response = await app.inject({ method: 'GET', url: '/api/agent/build/inbox', headers: agentHeaders() });

      expect(response.statusCode).toBe(200);
      expect(response.json().gate).toBeUndefined();
    });

    it('refuses a delivery aimed at a different game than the job owns', async () => {
      // The token is minted per job. An agent that has been associated with one game must
      // not be able to write into another game's history by asking to.
      const store = new InMemoryStore();
      await seedSubmission(store);
      await store.setSubmissionSlug(ISSUE, 'comet-courier');
      const { gamesStore, stored } = stubGamesStore();
      app = await createApp(store, { gamesStore });

      const response = await app.inject({
        method: 'POST',
        url: '/api/agent/build/sources',
        headers: agentHeaders(),
        payload: { slug: 'someone-elses-game', files: MINIMAL },
      });

      expect(response.statusCode).toBe(409);
      expect(stored).toHaveLength(0);
    });

    it('binds the job to the first slug it delivers, so a later one cannot switch games', async () => {
      // The test above seeds the slug, which is the case where the job already knows
      // what it is building. This is the case that does not: a job dispatched without a
      // slug learns it from its first delivery, and if that is never persisted the
      // check above can never fire — every delivery would find the job unbound and be
      // free to name a different game.
      const store = new InMemoryStore();
      await seedSubmission(store);
      const { gamesStore, stored } = stubGamesStore();
      app = await createApp(store, { gamesStore });

      const first = await app.inject({
        method: 'POST',
        url: '/api/agent/build/sources',
        headers: agentHeaders(),
        payload: { slug: 'comet-courier', files: MINIMAL },
      });
      expect(first.json()).toMatchObject({ accepted: true });
      expect((await store.getSubmission(ISSUE))?.slug).toBe('comet-courier');

      const second = await app.inject({
        method: 'POST',
        url: '/api/agent/build/sources',
        headers: agentHeaders(),
        payload: { slug: 'someone-elses-game', files: MINIMAL },
      });

      expect(second.statusCode).toBe(409);
      expect(stored).toHaveLength(1);
    });

    it('explains a rejected path instead of failing opaquely', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      const { gamesStore } = stubGamesStore();
      app = await createApp(store, { gamesStore });

      const response = await app.inject({
        method: 'POST',
        url: '/api/agent/build/sources',
        headers: agentHeaders(),
        payload: { slug: 'g', files: [...MINIMAL, { path: 'shared/modules/core.ts', content: 'x' }] },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toMatch(/belongs to the harness/);
    });

    it('requires a credential like every other channel verb', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      const { gamesStore } = stubGamesStore();
      app = await createApp(store, { gamesStore });

      const response = await app.inject({
        method: 'POST',
        url: '/api/agent/build/sources',
        payload: { slug: 'g', files: MINIMAL },
      });

      expect(response.statusCode).toBe(401);
    });

    it('stops accepting deliveries once the creator has stopped the build', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      await store.setSubmissionAbandoned(ISSUE, new Date().toISOString());
      const { gamesStore, stored } = stubGamesStore();
      app = await createApp(store, { gamesStore });

      const response = await app.inject({
        method: 'POST',
        url: '/api/agent/build/sources',
        headers: agentHeaders(),
        payload: { slug: 'g', files: MINIMAL },
      });

      expect(response.json()).toMatchObject({ accepted: false, rejected: 'stopped' });
      expect(stored).toHaveLength(0);
    });

    it('says so plainly when delivery is not configured', async () => {
      // Local development has no bucket. Reporting unavailability beats accepting work
      // and silently dropping it.
      const store = new InMemoryStore();
      await seedSubmission(store);
      app = await createApp(store);

      const response = await app.inject({
        method: 'POST',
        url: '/api/agent/build/sources',
        headers: agentHeaders(),
        payload: { slug: 'g', files: MINIMAL },
      });

      expect(response.statusCode).toBe(503);
    });

    it('notifies the job so the gate can pick the candidate up', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      const { gamesStore } = stubGamesStore();
      const delivered: Array<{ slug: string; version: string }> = [];
      app = await createApp(store, { gamesStore });
      // Re-create with the hook wired, since createApp builds options once.
      await app.close();
      app = await buildApp({
        store,
        sessionSecret,
        submissionRoutes: {
          githubClient: stubGitHub(),
          githubToken: 'gh-token',
          submissionTokenSecret: secret,
          translator: new NoopTranslator(),
          agentChannel: {
            gamesStore,
            onSourcesDelivered: ({ slug, version }) => {
              delivered.push({ slug, version });
            },
          },
        },
      });

      await app.inject({
        method: 'POST',
        url: '/api/agent/build/sources',
        headers: agentHeaders(),
        payload: { slug: 'comet-courier', files: MINIMAL },
      });

      expect(delivered).toEqual([{ slug: 'comet-courier', version: 'v1' }]);
    });
  });

  /**
   * Reading a delivery back. The channel was upload-only, which quietly made the
   * agent's branch the real home of a game — and a session that starts on a fresh
   * branch then "continues" from an empty directory, delivering a different game than
   * the one the creator gave feedback on.
   */
  describe('restoring a delivery', () => {
    function storeWithVersion(files: Record<string, string | null>) {
      return {
        putCandidateSources: async () => ({ version: 'v1', manifest: {} as never }),
        getManifest: async () => ({ sourceFiles: Object.keys(files) }),
        getSourceFile: async (_slug: string, _version: string, path: string) => files[path] ?? null,
        putGateResult: async () => {},
        putDerivedArtifact: async () => {},
        getDerivedArtifact: async () => null,
      } as unknown as GamesStore;
    }

    it('hands a build back the exact files it delivered', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      await store.setSubmissionSlug(ISSUE, 'comet-courier');
      await store.setSubmissionDeliveredVersion(ISSUE, 'v1');
      app = await createApp(store, {
        gamesStore: storeWithVersion({ 'SPEC.md': '# Comet Courier', 'game.ts': 'export const tick = () => {};' }),
      });

      const response = await app.inject({ method: 'GET', url: '/api/agent/build/sources', headers: agentHeaders() });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        delivery: { slug: 'comet-courier', version: 'v1' },
        files: [
          { path: 'SPEC.md', content: '# Comet Courier' },
          { path: 'game.ts', content: 'export const tick = () => {};' },
        ],
      });
    });

    it('says plainly that a first build has nothing to restore', async () => {
      // The ordinary state of every new game. An agent that runs restore by habit must
      // not be sent looking for a problem that does not exist.
      const store = new InMemoryStore();
      await seedSubmission(store);
      app = await createApp(store, { gamesStore: storeWithVersion({}) });

      const response = await app.inject({ method: 'GET', url: '/api/agent/build/sources', headers: agentHeaders() });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ delivery: null, files: [] });
    });

    it('restores the live publication for an improvement job that has not delivered yet', async () => {
      // An improvement is a *new* job on a published slug (job-state.ts: publishing is
      // terminal). That job inherits the slug before it has a deliveredVersion of its
      // own — without the publication fallback, restore reports nothing and the agent
      // rebuilds from the spec instead of revising the game the creator played.
      const IMPROVEMENT = 1000004;
      const store = new InMemoryStore();
      await seedSubmission(store, IMPROVEMENT);
      await store.setSubmissionSlug(IMPROVEMENT, 'global-thermonuclear-strategy');
      await store.setPublication({
        slug: 'global-thermonuclear-strategy',
        state: 'published',
        currentVersion: 'v3',
        publishedAt: '2026-07-01T00:00:00.000Z',
      });
      app = await createApp(store, {
        gamesStore: storeWithVersion({
          'SPEC.md': '# Global Thermonuclear Strategy',
          'game.ts': 'export const tick = () => {};',
        }),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/agent/build/sources',
        headers: agentHeaders(IMPROVEMENT),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        delivery: { slug: 'global-thermonuclear-strategy', version: 'v3' },
        files: [
          { path: 'SPEC.md', content: '# Global Thermonuclear Strategy' },
          { path: 'game.ts', content: 'export const tick = () => {};' },
        ],
      });
    });

    it('prefers this job’s own delivery over the publication when both exist', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      await store.setSubmissionSlug(ISSUE, 'comet-courier');
      await store.setSubmissionDeliveredVersion(ISSUE, 'v2');
      await store.setPublication({
        slug: 'comet-courier',
        state: 'published',
        currentVersion: 'v1',
        publishedAt: '2026-07-01T00:00:00.000Z',
      });
      app = await createApp(store, {
        gamesStore: storeWithVersion({ 'SPEC.md': '# Candidate v2' }),
      });

      const response = await app.inject({ method: 'GET', url: '/api/agent/build/sources', headers: agentHeaders() });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ delivery: { slug: 'comet-courier', version: 'v2' } });
    });

    it('does not restore a taken-down publication as if it were still live', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      await store.setSubmissionSlug(ISSUE, 'comet-courier');
      await store.setPublication({
        slug: 'comet-courier',
        state: 'disabled',
        currentVersion: 'v1',
        publishedAt: '2026-07-01T00:00:00.000Z',
        takedownAt: '2026-07-15T00:00:00.000Z',
        takedownReason: 'withdrawn',
      });
      app = await createApp(store, {
        gamesStore: storeWithVersion({ 'SPEC.md': '# Gone' }),
      });

      const response = await app.inject({ method: 'GET', url: '/api/agent/build/sources', headers: agentHeaders() });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ delivery: null, files: [] });
    });

    it('refuses a version with holes rather than restoring a game missing files', async () => {
      // A manifest listing a file the bucket does not have is a broken version, not a
      // partial one — handing it back would have the agent "restore" a deletion it
      // never made, then deliver the result as the creator's game.
      const store = new InMemoryStore();
      await seedSubmission(store);
      await store.setSubmissionSlug(ISSUE, 'comet-courier');
      await store.setSubmissionDeliveredVersion(ISSUE, 'v1');
      app = await createApp(store, {
        gamesStore: storeWithVersion({ 'SPEC.md': '# Comet Courier', 'game.ts': null }),
      });

      const response = await app.inject({ method: 'GET', url: '/api/agent/build/sources', headers: agentHeaders() });

      expect(response.statusCode).toBe(502);
    });

    it('rejects a request without a valid build token', async () => {
      const store = new InMemoryStore();
      await seedSubmission(store);
      await store.setSubmissionSlug(ISSUE, 'comet-courier');
      await store.setSubmissionDeliveredVersion(ISSUE, 'v1');
      app = await createApp(store, { gamesStore: storeWithVersion({ 'SPEC.md': 'x' }) });

      const response = await app.inject({
        method: 'GET',
        url: '/api/agent/build/sources',
        headers: { authorization: 'Bearer not-a-real-token' },
      });

      expect(response.statusCode).toBe(401);
    });
  });
});

describe('the delivery reminder on every channel call', () => {
  it('tells an undelivered build that pushing is not delivering', async () => {
    // The brief says this too, but the brief is read at the start of a session and the
    // omission happens at the end of one. A live session has been observed doing the
    // whole job, pushing its branch, and stopping — thousands of tokens after being
    // told. This rides along with something the agent is already doing.
    const store = new InMemoryStore();
    await seedSubmission(store);
    const app = await createApp(store);

    const response = await app.inject({
      method: 'POST',
      url: '/api/agent/build/progress',
      headers: agentHeaders(),
      payload: { text: 'Working on the maze.' },
    });

    expect(response.json().control.delivered).toBe(false);
    expect(response.json().control.mustDeliver).toContain('npm run submit');

    await app.close();
  });

  it('stops nagging once the build has actually delivered', async () => {
    // Derived from what we stored, not from anything the session claims about itself.
    const store = new InMemoryStore();
    await seedSubmission(store);
    await store.setSubmissionDeliveredVersion(ISSUE, 'v1');
    const app = await createApp(store);

    const response = await app.inject({
      method: 'POST',
      url: '/api/agent/build/progress',
      headers: agentHeaders(),
      payload: { text: 'Polishing.' },
    });

    expect(response.json().control.delivered).toBe(true);
    expect(response.json().control.mustDeliver).toBeUndefined();

    await app.close();
  });
});
