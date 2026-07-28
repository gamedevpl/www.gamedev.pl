import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { mintAgentToken } from './agent-token.js';
import { buildApp } from './app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './auth.js';
import type { CatalogGameEntry, GameSources, GitHubClient, LinkedPullRequest } from './github-client.js';
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
    getGameSources: async (): Promise<GameSources | null> => null,
    getGameMedia: async () => null,
    getCatalog: async (): Promise<CatalogGameEntry[]> => [],
    getProgressNotes: async () => null,
    ...overrides,
  };
}

const sessionSecret = 'dev-session-secret-change-me';

async function createApp(store: InMemoryStore, agentChannel?: { maxEventsPerWindow?: number }) {
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

function agentHeaders(issueNumber = ISSUE) {
  return { authorization: `Bearer ${mintAgentToken(issueNumber, secret)}` };
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
});
