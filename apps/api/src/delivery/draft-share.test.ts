// A shared draft is public. Nothing red may stand behind that link.

import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../platform/app.js';
import { InMemoryStore } from '../platform/store.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import { mintToken } from '../platform/submission-token.js';
import type { ContentChecker } from '../platform/moderation.js';
import type { GitHubClient } from '../catalog/github-client.js';
import type { GamesStore } from './games-store.js';

const githubClient = {
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

const secret = 'submission-secret';
const sessionSecret = 'dev-session-secret-change-me';
const SLUG = 'tv-tycoon';
const OWNER = 'g:test-user';

const allowAll: ContentChecker = {
  async check() {
    return { allowed: true };
  },
  async checkFields() {
    return { allowed: true };
  },
};

function headers(uid = OWNER) {
  return { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}` };
}

describe('sharing a draft', () => {
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

  afterEach(async () => {
    while (apps.length) await apps.pop()!.close();
  });

  async function draftApp(opts: { verdict?: { green: boolean } | null; shared?: boolean } = {}) {
    const verdict = opts.verdict === undefined ? { green: true } : opts.verdict;
    const store = new InMemoryStore();
    const jobId = 1_000_077;
    await store.upsertUser({ uid: OWNER });
    await store.createSubmission(jobId, OWNER, 'TV Tycoon');
    await store.setSubmissionSlug(jobId, SLUG);
    await store.setSubmissionDeliveredVersion(jobId, 'v1');
    if (opts.shared) await store.setDraftShared(jobId, '2026-09-01T00:00:00.000Z');

    let green = verdict?.green ?? false;
    const gamesStore = {
      getDerivedArtifact: async (_s: string, _v: string, name: string) =>
        name === 'bundle.html' ? Buffer.from('<!doctype html><title>TV Tycoon</title>') : null,
      getManifest: async (_s: string, version: string) => ({
        version,
        deliveryMode: 'publish',
        ...(verdict ? { gate: { green, ranAt: '2026-09-01T00:00:00.000Z' } } : {}),
      }),
    } as unknown as GamesStore;

    const app = await buildApp({
      store,
      sessionSecret,
      contentChecker: allowAll,
      submissionRoutes: {
        githubToken: 'token',
        githubClient,
        submissionTokenSecret: secret,
        gamesRepo: 'gamedevpl/www.gamedev.pl-games',
        agentChannel: { gamesStore },
      },
    });
    apps.push(app);
    return { app, store, jobId, goRed: () => (green = false) };
  }

  function share(app: Awaited<ReturnType<typeof buildApp>>, jobId: number, shared: boolean) {
    return app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(jobId, secret)}/share`,
      headers: headers(),
      payload: { shared },
    });
  }

  it('refuses to open a public link onto a red or unjudged build', async () => {
    const red = await draftApp({ verdict: { green: false } });
    const refusedRed = await share(red.app, red.jobId, true);
    expect(refusedRed.statusCode).toBe(409);
    expect(refusedRed.json()).toMatchObject({ error: 'gate_red' });
    expect((await red.app.inject({ method: 'GET', url: `/api/games/${SLUG}` })).statusCode).toBe(404);

    const pending = await draftApp({ verdict: null });
    const refusedPending = await share(pending.app, pending.jobId, true);
    expect(refusedPending.statusCode).toBe(409);
    expect(refusedPending.json()).toMatchObject({ error: 'gate_pending' });
  });

  it('keeps a stranger out when a red build lands after the link was shared', async () => {
    // Only the serve side sees both the flip and what follows.
    const { app, store, jobId, goRed } = await draftApp({ shared: true });
    expect((await app.inject({ method: 'GET', url: `/api/games/${SLUG}` })).statusCode).toBe(200);

    goRed();
    await store.setSubmissionDeliveredVersion(jobId, 'v2');
    expect((await app.inject({ method: 'GET', url: `/api/games/${SLUG}` })).statusCode).toBe(404);
    // The creator still sees what they broke.
    expect((await app.inject({ method: 'GET', url: `/api/games/${SLUG}`, headers: headers() })).statusCode).toBe(200);
  });

  it('always lets the creator close the link again', async () => {
    const { app, jobId, goRed } = await draftApp({ shared: true });
    goRed();
    const off = await share(app, jobId, false);
    expect(off.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/api/games/${SLUG}` })).statusCode).toBe(404);
  });
});
