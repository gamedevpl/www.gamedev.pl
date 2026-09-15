import { describe, expect, it } from 'vitest';
import { buildApp } from '../platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import type { GamesStore } from '../delivery/games-store.js';
import { buildJobQueue } from './job-admin-routes.js';
import { InMemoryStore, type SubmissionRecord } from '../platform/store.js';

const NOW = Date.parse('2026-07-30T12:00:00Z');
const MINUTE = 60_000;
const ago = (ms: number) => new Date(NOW - ms).toISOString();

function record(overrides: Partial<SubmissionRecord> & { jobId: number }): SubmissionRecord {
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
        record({ jobId: 1, state: 'building', stateSince: ago(90 * MINUTE), lastAgentSignalAt: ago(MINUTE) }),
        record({ jobId: 2, state: 'queued', stateSince: ago(20 * MINUTE) }),
      ],
      NOW,
    );

    expect(queue.jobs.map((job) => job.jobId)).toEqual([2, 1]);
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
          jobId: 1,
          createdAt: ago(10 * 60 * MINUTE),
          state: 'building',
          stateSince: ago(2 * MINUTE),
          lastAgentSignalAt: ago(MINUTE),
        }),
        record({
          jobId: 2,
          createdAt: ago(60 * MINUTE),
          state: 'building',
          stateSince: ago(10 * MINUTE),
          lastAgentSignalAt: ago(MINUTE),
        }),
      ],
      NOW,
    );

    expect(queue.jobs.map((job) => job.jobId)).toEqual([2, 1]);
  });

  it('drops finished jobs — the queue is what still needs attention', () => {
    const queue = buildJobQueue(
      [
        record({ jobId: 1, state: 'published', stateSince: ago(MINUTE) }),
        record({ jobId: 2, state: 'canceled', stateSince: ago(MINUTE) }),
        record({ jobId: 3, state: 'building', stateSince: ago(MINUTE), lastAgentSignalAt: ago(MINUTE) }),
      ],
      NOW,
    );

    expect(queue.jobs.map((job) => job.jobId)).toEqual([3]);
  });

  it('includes jobs that predate adoption by falling back to the derived status', () => {
    // Otherwise the queue would fill in gradually as each job happened to be polled,
    // and would be misleadingly short exactly when it is first looked at.
    const queue = buildJobQueue([record({ jobId: 7, lastStatus: 'building' })], NOW);

    expect(queue.jobs).toHaveLength(1);
    expect(queue.jobs[0].state).toBe('building');
    expect(queue.jobs[0].timeInStateMs).toBe(30 * MINUTE);
  });

  it('shows both the internal state and what the creator is being told', () => {
    const queue = buildJobQueue([record({ jobId: 1, state: 'submitted', stateSince: ago(MINUTE) })], NOW);

    expect(queue.jobs[0].state).toBe('submitted');
    expect(queue.jobs[0].creatorStatus).toBe('building');
  });

  it('counts by state so the shape of the queue is answerable at a glance', () => {
    const queue = buildJobQueue(
      [
        record({ jobId: 1, state: 'queued', stateSince: ago(MINUTE) }),
        record({ jobId: 2, state: 'queued', stateSince: ago(MINUTE) }),
        record({ jobId: 3, state: 'building', stateSince: ago(MINUTE), lastAgentSignalAt: ago(MINUTE) }),
      ],
      NOW,
    );

    expect(queue.byState).toEqual({ queued: 2, building: 1 });
  });

  it('surfaces the recent history newest first', () => {
    const queue = buildJobQueue(
      [
        record({
          jobId: 1,
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
          jobId: 1,
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

describe('GET /api/admin/jobs/:jobId/preview', () => {
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
