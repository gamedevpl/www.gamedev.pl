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
      orientation: 'any',
      submittedBy: null,
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

/** An open, in-progress PR — the submission stays in the active set across sweeps. */
function buildingGithubClient(): GitHubClient {
  const openPr: LinkedPullRequest = {
    number: 5,
    state: 'OPEN',
    merged: false,
    isDraft: true,
    titleHasWip: true,
    headRefName: 'agent/sky',
    changedFiles: ['games/sky-dodge/index.html'],
  };
  return {
    createIssue: async () => ({ number: 42 }),
    getIssueState: async () => ({ state: 'open' }),
    findLinkedPR: async () => openPr,
    getGameSources: async () => null,
    getGameMedia: async () => null,
    getCatalog: async () => [],
  };
}

async function buildSweepApp(
  store: InMemoryStore,
  verifier: InternalAuthVerifier,
  overrides: { githubClient?: GitHubClient; now?: () => number } = {},
) {
  return buildApp({
    store,
    sessionSecret: 'dev-session-secret-change-me',
    submissionRoutes: {
      githubToken: 'token',
      submissionTokenSecret: secret,
      gamesRepo: 'gamedevpl/www.gamedev.pl-games',
      githubClient: overrides.githubClient ?? publishedGithubClient(),
      internalAuthVerifier: verifier,
      ...(overrides.now ? { now: overrides.now } : {}),
    },
  });
}

const HOUR_MS = 60 * 60 * 1000;

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
    expect(first.json()).toEqual({ scanned: 1, emitted: 1, alerts: 0, alerted: 0, stalled: 0 });

    const list = await store.listNotifications('g:owner');
    expect(list).toHaveLength(1);
    expect(list[0].type).toBe('submission.published');
    expect(list[0].link).toBe('/play/sky-dodge');

    // Published is terminal — the submission drops out of the active set, so a
    // second sweep scans nothing and emits nothing.
    const second = await app.inject({
      method: 'POST',
      url: '/api/internal/notify-sweep',
      headers: { authorization: 'Bearer scheduler-token' },
    });
    expect(second.json()).toEqual({ scanned: 0, emitted: 0, alerts: 0, alerted: 0, stalled: 0 });
    await app.close();
  });

  // The games-repo workflow that re-posts creator feedback as an `@copilot` mention
  // is the only thing that can wake a stopped agent, and it fails silently when it
  // fails at all. These cover the detector that makes that visible.
  describe('creator feedback relay stall detection', () => {
    async function sweep(app: Awaited<ReturnType<typeof buildSweepApp>>) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/internal/notify-sweep',
        headers: { authorization: 'Bearer scheduler-token' },
      });
      expect(res.statusCode).toBe(200);
      return res.json();
    }

    it('flags a change request no agent has collected within the threshold', async () => {
      const store = new InMemoryStore();
      await store.createSubmission(42, 'g:owner', 'Sky Dodge');
      await store.appendCreatorMessage(42, 'make the ship slower');

      // The message is written with the real clock; advancing the route's clock past
      // the threshold ages it without fake timers, matching how the rest of the API
      // tests time (an injected `now`, never vi.useFakeTimers).
      const app = await buildSweepApp(store, acceptAll, {
        githubClient: buildingGithubClient(),
        now: () => Date.now() + 2 * HOUR_MS,
      });

      expect(await sweep(app)).toMatchObject({ scanned: 1, stalled: 1 });
      await app.close();
    });

    it('leaves a recent change request alone', async () => {
      const store = new InMemoryStore();
      await store.createSubmission(42, 'g:owner', 'Sky Dodge');
      await store.appendCreatorMessage(42, 'make the ship slower');

      // Inside the hour: an agent that has not acked yet is working, not stalled.
      const app = await buildSweepApp(store, acceptAll, {
        githubClient: buildingGithubClient(),
        now: () => Date.now() + 5 * 60 * 1000,
      });

      expect(await sweep(app)).toMatchObject({ scanned: 1, stalled: 0 });
      await app.close();
    });

    it('does not flag a message the agent already collected, however old', async () => {
      const store = new InMemoryStore();
      await store.createSubmission(42, 'g:owner', 'Sky Dodge');
      const message = await store.appendCreatorMessage(42, 'make the ship slower');
      await store.markCreatorMessagesDelivered(42, [message.id]);

      const app = await buildSweepApp(store, acceptAll, {
        githubClient: buildingGithubClient(),
        now: () => Date.now() + 48 * HOUR_MS,
      });

      // Delivery is the whole signal: the relay demonstrably worked here, so age
      // means the agent is thinking, not that the hand-off was lost.
      expect(await sweep(app)).toMatchObject({ scanned: 1, stalled: 0 });
      await app.close();
    });

    it('counts stalled submissions once each, not once per queued message', async () => {
      const store = new InMemoryStore();
      await store.createSubmission(42, 'g:owner', 'Sky Dodge');
      await store.createSubmission(43, 'g:other', 'Cave Run');
      await store.appendCreatorMessage(42, 'make the ship slower');
      await store.appendCreatorMessage(42, 'and add a pause button');

      const app = await buildSweepApp(store, acceptAll, {
        githubClient: buildingGithubClient(),
        now: () => Date.now() + 2 * HOUR_MS,
      });

      expect(await sweep(app)).toMatchObject({ scanned: 2, stalled: 1 });
      await app.close();
    });
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

// The operator half of the same sweep. It runs over the set of jobs already being
// scanned, so the cost is a pure function and whatever the alerts themselves cost.
describe('operator alerts on the notify sweep', () => {
  async function sweep(app: Awaited<ReturnType<typeof buildSweepApp>>) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/internal/notify-sweep',
      headers: { authorization: 'Bearer scheduler-token' },
    });
    expect(res.statusCode).toBe(200);
    return res.json();
  }

  async function appWithOperator(store: InMemoryStore, adminUids: string | undefined) {
    return buildApp({
      store,
      sessionSecret: 'dev-session-secret-change-me',
      ...(adminUids ? { adminUids } : {}),
      submissionRoutes: {
        githubToken: 'token',
        submissionTokenSecret: secret,
        gamesRepo: 'gamedevpl/www.gamedev.pl-games',
        githubClient: buildingGithubClient(),
        internalAuthVerifier: acceptAll,
      },
    });
  }

  it('tells the operator about a build waiting on the publish decision', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:boss' });
    await store.createSubmission(1_000_001, 'g:creator', 'Comet Courier');
    await store.recordJobTransition(1_000_001, {
      to: 'ready_for_review',
      at: new Date().toISOString(),
      by: 'gate',
      reason: 'gate_green',
    });
    const app = await appWithOperator(store, 'g:boss');

    expect(await sweep(app)).toMatchObject({ alerts: 1, alerted: 1 });
    const [notification] = await store.listNotifications('g:boss');
    expect(notification).toMatchObject({ type: 'operator.review_ready', link: '/admin/queue' });

    // Twice through the scheduler is one notification: the situation has not changed.
    expect(await sweep(app)).toMatchObject({ alerts: 1, alerted: 0 });
    expect(await store.listNotifications('g:boss')).toHaveLength(1);
    await app.close();
  });

  it('counts the alert but tells nobody when no operator is configured', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(1_000_002, 'g:creator', 'Comet Courier');
    await store.recordJobTransition(1_000_002, {
      to: 'ready_for_review',
      at: new Date().toISOString(),
      by: 'gate',
      reason: 'gate_green',
    });
    const app = await appWithOperator(store, undefined);

    expect(await sweep(app)).toMatchObject({ alerts: 1, alerted: 0 });
    await app.close();
  });

  it('does not alert on a build that is merely slow', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:boss' });
    await store.createSubmission(1_000_003, 'g:creator', 'Comet Courier');
    await store.recordJobTransition(1_000_003, {
      to: 'building',
      at: new Date().toISOString(),
      by: 'reconciler',
      reason: 'task_in_progress',
    });
    const app = await appWithOperator(store, 'g:boss');

    expect(await sweep(app)).toMatchObject({ alerts: 0, alerted: 0 });
    expect(await store.listNotifications('g:boss')).toEqual([]);
    await app.close();
  });
});
