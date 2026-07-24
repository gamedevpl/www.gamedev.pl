import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import type { CatalogGameEntry, GitHubClient, LinkedPullRequest } from './github-client.js';
import type { InternalAuthVerifier } from './internal-auth.js';
import { InMemoryStore } from './store.js';

const secret = 'submission-secret';
const acceptAll: InternalAuthVerifier = { verify: async () => true };

function publishedGithubClient(): GitHubClient {
  const mergedPr: LinkedPullRequest = {
    number: 5,
    state: 'MERGED',
    merged: true,
    isDraft: false,
    titleHasWip: false,
    headRefName: 'agent/sky',
    changedFiles: ['games/sky-dodge/index.html'],
  };
  const catalog: CatalogGameEntry[] = [
    {
      slug: 'sky-dodge',
      title: 'Sky Dodge',
      genre: 'arcade',
      controls: 'arrows',
      status: 'published',
      media: null,
      multiplayer: null,
    },
  ];
  return {
    createIssue: async () => ({ number: 42 }),
    getIssueState: async () => ({ state: 'open' }),
    findLinkedPR: async () => mergedPr,
    getGameSources: async () => null,
    getGameMedia: async () => null,
    getCatalog: async () => catalog,
  };
}

async function buildSweepApp(store: InMemoryStore, verifier: InternalAuthVerifier) {
  return buildApp({
    store,
    sessionSecret: 'dev-session-secret-change-me',
    submissionRoutes: {
      githubToken: 'token',
      submissionTokenSecret: secret,
      gamesRepo: 'gamedevpl/www.gamedev.pl-games',
      githubClient: publishedGithubClient(),
      internalAuthVerifier: verifier,
    },
  });
}

describe('POST /api/internal/notify-sweep', () => {
  it('rejects callers that fail OIDC verification with 401', async () => {
    const store = new InMemoryStore();
    const app = await buildSweepApp(store, { verify: async () => false });
    const res = await app.inject({ method: 'POST', url: '/api/internal/notify-sweep' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('emits notifications for transitioned active submissions and is idempotent', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(42, 'g:owner', 'Sky Dodge');
    const app = await buildSweepApp(store, acceptAll);

    const first = await app.inject({
      method: 'POST',
      url: '/api/internal/notify-sweep',
      headers: { authorization: 'Bearer scheduler-token' },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ scanned: 1, emitted: 1 });

    const list = await store.listNotifications('g:owner');
    expect(list).toHaveLength(1);
    expect(list[0].type).toBe('submission.published');
    expect(list[0].link).toBe('#/play/sky-dodge');

    // Published is terminal — the submission drops out of the active set, so a
    // second sweep scans nothing and emits nothing.
    const second = await app.inject({
      method: 'POST',
      url: '/api/internal/notify-sweep',
      headers: { authorization: 'Bearer scheduler-token' },
    });
    expect(second.json()).toEqual({ scanned: 0, emitted: 0 });
    await app.close();
  });

  it('is walled off from anonymous callers only by OIDC, not a session (private beta)', async () => {
    // With the deny-all default verifier and no session, the beta wall must NOT be
    // what answers — the handler's own 401 is (the wall exempts /api/internal/).
    const store = new InMemoryStore();
    const app = await buildApp({
      store,
      sessionSecret: 'dev-session-secret-change-me',
      betaAllowedUids: 'g:owner',
      submissionRoutes: {
        githubToken: 'token',
        submissionTokenSecret: secret,
        gamesRepo: 'gamedevpl/www.gamedev.pl-games',
        githubClient: publishedGithubClient(),
        // default env verifier → deny-all
      },
    });
    const res = await app.inject({ method: 'POST', url: '/api/internal/notify-sweep' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
