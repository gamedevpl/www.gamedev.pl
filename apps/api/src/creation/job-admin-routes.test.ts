import { describe, expect, it } from 'vitest';
import { buildApp } from '../platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import type { GamesStore } from '../delivery/games-store.js';
import { buildJobQueue } from './job-admin-routes.js';
import { InMemoryStore, type SubmissionRecord } from '../platform/store.js';

const NOW = Date.parse('2026-07-30T12:00:00Z');
const MINUTE = 60_000;
const ago = (ms: number) => new Date(NOW - ms).toISOString();

function record(overrides: Partial<SubmissionRecord> & { issueNumber: number }): SubmissionRecord {
  return {
    ownerUid: 'g:1',
    title: 'A game',
    createdAt: ago(30 * MINUTE),
    ...overrides,
  };
}

describe('buildJobQueue', () => {
  it('puts stalled jobs first, however long the healthy ones have been running', () => {
    // The whole point of the view: one broken build must not be buried under nineteen
    // healthy ones that happen to be older.
    const queue = buildJobQueue(
      [
        record({ issueNumber: 1, state: 'building', stateSince: ago(90 * MINUTE), lastAgentSignalAt: ago(MINUTE) }),
        record({ issueNumber: 2, state: 'queued', stateSince: ago(20 * MINUTE) }),
      ],
      NOW,
    );

    expect(queue.jobs.map((job) => job.issueNumber)).toEqual([2, 1]);
    expect(queue.jobs[0].stall).toBe('not_dispatched');
    expect(queue.jobs[1].stall).toBeNull();
    expect(queue.stalled).toBe(1);
  });

  it('sorts healthy jobs by time in state, not by age', () => {
    // An old submission that only just entered `building` is less interesting than a
    // newer one that has been building far longer.
    const queue = buildJobQueue(
      [
        record({
          issueNumber: 1,
          createdAt: ago(10 * 60 * MINUTE),
          state: 'building',
          stateSince: ago(2 * MINUTE),
          lastAgentSignalAt: ago(MINUTE),
        }),
        record({
          issueNumber: 2,
          createdAt: ago(60 * MINUTE),
          state: 'building',
          stateSince: ago(10 * MINUTE),
          lastAgentSignalAt: ago(MINUTE),
        }),
      ],
      NOW,
    );

    expect(queue.jobs.map((job) => job.issueNumber)).toEqual([2, 1]);
  });

  it('drops finished jobs — the queue is what still needs attention', () => {
    const queue = buildJobQueue(
      [
        record({ issueNumber: 1, state: 'published', stateSince: ago(MINUTE) }),
        record({ issueNumber: 2, state: 'canceled', stateSince: ago(MINUTE) }),
        record({ issueNumber: 3, state: 'building', stateSince: ago(MINUTE), lastAgentSignalAt: ago(MINUTE) }),
      ],
      NOW,
    );

    expect(queue.jobs.map((job) => job.issueNumber)).toEqual([3]);
  });

  it('includes jobs that predate adoption by falling back to the derived status', () => {
    // Otherwise the queue would fill in gradually as each job happened to be polled,
    // and would be misleadingly short exactly when it is first looked at.
    const queue = buildJobQueue([record({ issueNumber: 7, lastStatus: 'building' })], NOW);

    expect(queue.jobs).toHaveLength(1);
    expect(queue.jobs[0].state).toBe('building');
    expect(queue.jobs[0].timeInStateMs).toBe(30 * MINUTE);
  });

  it('shows both the internal state and what the creator is being told', () => {
    const queue = buildJobQueue([record({ issueNumber: 1, state: 'gating', stateSince: ago(MINUTE) })], NOW);

    expect(queue.jobs[0].state).toBe('gating');
    expect(queue.jobs[0].creatorStatus).toBe('building');
  });

  it('counts by state so the shape of the queue is answerable at a glance', () => {
    const queue = buildJobQueue(
      [
        record({ issueNumber: 1, state: 'queued', stateSince: ago(MINUTE) }),
        record({ issueNumber: 2, state: 'queued', stateSince: ago(MINUTE) }),
        record({ issueNumber: 3, state: 'building', stateSince: ago(MINUTE), lastAgentSignalAt: ago(MINUTE) }),
      ],
      NOW,
    );

    expect(queue.byState).toEqual({ queued: 2, building: 1 });
  });

  it('surfaces the recent history newest first', () => {
    const queue = buildJobQueue(
      [
        record({
          issueNumber: 1,
          state: 'building',
          stateSince: ago(MINUTE),
          lastAgentSignalAt: ago(MINUTE),
          transitions: [
            { to: 'queued', at: ago(20 * MINUTE), by: 'creator' },
            { to: 'dispatched', at: ago(10 * MINUTE), by: 'reconciler' },
            { to: 'building', at: ago(MINUTE), by: 'reconciler' },
          ],
        }),
      ],
      NOW,
    );

    expect(queue.jobs[0].recentTransitions.map((t) => t.to)).toEqual(['building', 'dispatched', 'queued']);
  });

  it('prefers what the agent reports over inference', () => {
    const queue = buildJobQueue(
      [
        record({
          issueNumber: 1,
          state: 'building',
          stateSince: ago(MINUTE),
          lastAgentSignalAt: ago(MINUTE),
          agentState: 'waiting_for_user',
        }),
      ],
      NOW,
    );

    expect(queue.jobs[0].stall).toBe('awaiting_input');
  });
});

describe('POST /api/admin/jobs/:issueNumber/publish', () => {
  const sessionSecret = 'dev-session-secret-change-me';
  const adminHeaders = { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken('g:boss', sessionSecret)}` };

  /** A store holding one delivered version, gated as told. */
  function gamesStoreWith(
    gate: { green: boolean } | null,
    bundle = '<!doctype html>assembled',
    deliveryMode?: 'preview' | 'publish' | 'proposal',
  ) {
    return {
      getManifest: async () => ({
        slug: 'comet-courier',
        version: 'v1',
        createdAt: '2026-07-30T10:00:00Z',
        issueNumber: 1_000_001,
        sourceFiles: ['SPEC.md'],
        ...(deliveryMode ? { deliveryMode } : {}),
        ...(gate ? { gate: { ...gate, ranAt: '2026-07-30T11:00:00Z' } } : {}),
      }),
      getSourceFile: async () => '---\ntitle: Comet Courier\n---\n',
      getDerivedArtifact: async () => Buffer.from(bundle, 'utf8'),
      putCandidateSources: async () => ({ version: 'v1', manifest: {} }),
      putGateResult: async () => {},
      putDerivedArtifact: async () => {},
    } as unknown as GamesStore;
  }

  async function appWithJob(gamesStore: GamesStore, opts?: { claimProfile?: boolean }) {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:boss' });
    // Publish requires a creator profile unless the owner is a bot account.
    if (opts?.claimProfile !== false) {
      await store.claimHandle('g:boss', 'boss', '2026-07-01T00:00:00.000Z');
    }
    await store.createSubmission(1_000_001, 'g:boss', 'Comet Courier');
    await store.setSubmissionSlug(1_000_001, 'comet-courier');
    await store.setSubmissionDeliveredVersion(1_000_001, 'v1');
    const app = await buildApp({
      store,
      sessionSecret,
      adminUids: 'g:boss',
      submissionRoutes: { agentChannel: { gamesStore } },
    });
    return { app, store };
  }

  it('refuses to publish a proposal version, however green its gate', async () => {
    // The load-bearing refusal for the proposals feature. A proposal is somebody else's
    // change, and a green gate on one says only that it runs — it becomes publishable when
    // the game's owner accepts it, which rewrites the mode. Read off the manifest rather
    // than from the proposal registry on purpose: this must hold for a caller who has
    // never heard of proposals.
    const { app, store } = await appWithJob(gamesStoreWith({ green: true }, undefined, 'proposal'));

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/jobs/1000001/publish',
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: 'not_publishable' });
    expect(await store.getPublication('comet-courier')).toBeNull();
  });

  it('refuses to publish a preview version for the same reason', async () => {
    const { app, store } = await appWithJob(gamesStoreWith({ green: true }, undefined, 'preview'));

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/jobs/1000001/publish',
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(409);
    expect(await store.getPublication('comet-courier')).toBeNull();
  });

  it('publishes a gate-green build and records how it got there', async () => {
    const { app, store } = await appWithJob(gamesStoreWith({ green: true }));

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/jobs/1000001/publish',
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(200);
    expect(await store.getPublication('comet-courier')).toMatchObject({
      slug: 'comet-courier',
      state: 'published',
      currentVersion: 'v1',
    });
    // Through `publishing`, not straight to `published`: the intermediate state is what
    // a failed publish has to fall back from, and skipping it leaves no record it existed.
    const record = await store.getSubmission(1_000_001);
    expect(record?.state).toBe('published');
    expect(record?.transitions?.map((entry) => entry.to)).toEqual(['publishing', 'published']);
    expect(record?.publishedAt).toBeTruthy();
    // The creator rail reads `lastStatus`, not `state` — without this a published game
    // also kept rendering as an in-progress "yours" card.
    expect(record?.lastStatus).toBe('published');

    await app.close();
  });

  it('supersedes older active submissions for the same slug when publishing', async () => {
    const { app, store } = await appWithJob(gamesStoreWith({ green: true }));
    // Create an older submission for the same slug
    await store.createSubmission(1_000_000, 'g:boss', 'Comet Courier v0');
    await store.setSubmissionSlug(1_000_000, 'comet-courier');
    await store.setSubmissionDeliveredVersion(1_000_000, 'v0');

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/jobs/1000001/publish',
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(200);
    const older = await store.getSubmission(1_000_000);
    expect(older?.lastStatus).toBe('abandoned');
    const transitions = older?.transitions ?? [];
    expect(transitions[transitions.length - 1]).toMatchObject({
      to: 'abandoned',
      reason: 'superseded_by_publish',
    });

    await app.close();
  });

  it('refuses to publish when the creator has no profile', async () => {
    const { app, store } = await appWithJob(gamesStoreWith({ green: true }), { claimProfile: false });

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/jobs/1000001/publish',
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('profile_required');
    expect(await store.getPublication('comet-courier')).toBeNull();

    await app.close();
  });

  it('refuses to publish a version our own gate failed', async () => {
    const { app, store } = await appWithJob(gamesStoreWith({ green: false }));

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/jobs/1000001/publish',
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('gate_red');
    expect(await store.getPublication('comet-courier')).toBeNull();

    await app.close();
  });

  it('refuses a version nothing has gated yet', async () => {
    const { app, store } = await appWithJob(gamesStoreWith(null));

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/jobs/1000001/publish',
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('not_gated');
    expect(await store.getPublication('comet-courier')).toBeNull();

    await app.close();
  });

  it('is invisible to a non-admin, like the rest of the operator surface', async () => {
    const { app, store } = await appWithJob(gamesStoreWith({ green: true }));
    await store.upsertUser({ uid: 'g:someone' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/jobs/1000001/publish',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken('g:someone', sessionSecret)}` },
    });

    // 404 rather than 403: the operator surface does not confirm its own existence.
    expect(response.statusCode).toBe(404);
    expect(await store.getPublication('comet-courier')).toBeNull();

    await app.close();
  });
});

describe('GET /api/admin/jobs/:issueNumber/preview', () => {
  const sessionSecret = 'dev-session-secret-change-me';
  const adminHeaders = { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken('g:boss', sessionSecret)}` };

  function gamesStoreWith(bundleHtml: string | null) {
    return {
      getDerivedArtifact: async (_slug: string, _version: string, artifact: string) => {
        if (!bundleHtml) return null;
        if (artifact === 'bundle.html') return Buffer.from(bundleHtml, 'utf8');
        return null;
      },
    } as unknown as GamesStore;
  }

  async function appWithJob(gamesStore: GamesStore) {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:boss' });
    await store.createSubmission(1_000_001, 'g:boss', 'Comet Courier');
    await store.setSubmissionSlug(1_000_001, 'comet-courier');
    await store.setSubmissionDeliveredVersion(1_000_001, 'v1');
    const app = await buildApp({
      store,
      sessionSecret,
      adminUids: 'g:boss',
      submissionRoutes: { agentChannel: { gamesStore } },
    });
    return { app, store };
  }

  it('serves the game preview HTML for an admin', async () => {
    const { app } = await appWithJob(gamesStoreWith('<!doctype html><html><body>Game Preview</body></html>'));

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/jobs/1000001/preview',
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.slug).toBe('comet-courier');
    expect(body.title).toBe('Comet Courier');
    expect(body.version).toBe('v1');
    expect(body.html).toContain('Game Preview');

    await app.close();
  });

  it('returns 404 for non-admin session', async () => {
    const { app, store } = await appWithJob(gamesStoreWith('<html>preview</html>'));
    await store.upsertUser({ uid: 'g:regular' });

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/jobs/1000001/preview',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken('g:regular', sessionSecret)}` },
    });

    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('returns 409 if no version is delivered or previewable', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:boss' });
    await store.createSubmission(1_000_002, 'g:boss', 'Empty Job');
    const app = await buildApp({
      store,
      sessionSecret,
      adminUids: 'g:boss',
      submissionRoutes: { agentChannel: { gamesStore: gamesStoreWith('<html>preview</html>') } },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/jobs/1000002/preview',
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('no_preview_available');
    await app.close();
  });
});

