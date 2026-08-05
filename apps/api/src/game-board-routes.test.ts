import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './auth.js';
import { InMemoryStore, type SuggestionRecord } from './store.js';

const sessionSecret = 'dev-session-secret-change-me';

function authCookie(uid: string): string {
  return `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}`;
}

function suggestion(overrides: Partial<SuggestionRecord> = {}): SuggestionRecord {
  return {
    id: 'sug-neon-courier-defect-1',
    slug: 'neon-courier',
    ownerUid: 'g:creator',
    class: 'defect',
    priority: 8,
    evidence: [{ finding: 'Crashes for 12% of sessions', metrics: { errorRate: 0.12 } }],
    status: 'proposed',
    computedFrom: '2026-08-04T00:00:00.000Z',
    createdAt: '2026-08-04T01:00:00.000Z',
    updatedAt: '2026-08-04T01:00:00.000Z',
    ...overrides,
  };
}

/**
 * A published game plus three later rounds, one per live column: an improvement the
 * agent opened and is building, a delivered round waiting on review, and a shipped one.
 */
async function seedBoard(store: InMemoryStore): Promise<void> {
  await store.upsertUser({ uid: 'g:creator' });
  await store.claimHandle('g:creator', 'nightshift', '2026-07-01T00:00:00.000Z');

  await store.createSubmission(1_000_001, 'g:creator', 'Neon Courier');
  await store.setSubmissionSlug(1_000_001, 'neon-courier');
  await store.setSubmissionPublishedAt(1_000_001, '2026-08-01T12:00:00.000Z');
  await store.recordJobTransition(1_000_001, { to: 'published', by: 'admin' });
  await store.setPublication({
    slug: 'neon-courier',
    state: 'published',
    currentVersion: 'v3',
    publishedAt: '2026-08-01T12:00:00.000Z',
  });

  await store.createSubmission(1_000_002, 'g:creator', 'Improve Neon Courier');
  await store.setSubmissionSlug(1_000_002, 'neon-courier');
  await store.recordJobTransition(1_000_002, { to: 'queued', by: 'agent', reason: 'agent_open_round' });
  await store.recordJobTransition(1_000_002, { to: 'dispatched', by: 'agent' });
  await store.recordJobTransition(1_000_002, { to: 'building', by: 'agent' });

  await store.createSubmission(1_000_003, 'g:creator', 'Touch controls on phones');
  await store.setSubmissionSlug(1_000_003, 'neon-courier');
  await store.recordJobTransition(1_000_003, { to: 'queued', by: 'creator', reason: 'improvement_requested' });
  await store.recordJobTransition(1_000_003, { to: 'dispatched', by: 'platform' });
  await store.recordJobTransition(1_000_003, { to: 'building', by: 'agent' });
  await store.recordJobTransition(1_000_003, { to: 'submitted', by: 'agent', reason: 'sources_delivered' });
  await store.recordJobTransition(1_000_003, { to: 'ready_for_review', by: 'platform', reason: 'gate_green' });

  // Abandoned work is not work; it must not sit in a column forever.
  await store.createSubmission(1_000_004, 'g:creator', 'Abandoned idea');
  await store.setSubmissionSlug(1_000_004, 'neon-courier');
  await store.recordJobTransition(1_000_004, { to: 'building', by: 'agent' });
  await store.setSubmissionAbandoned(1_000_004, '2026-08-02T00:00:00.000Z');
}

describe('game board routes', () => {
  const apps: Array<{ close: () => Promise<void> }> = [];
  afterEach(async () => {
    while (apps.length) await apps.pop()!.close();
  });

  async function appWith(store: InMemoryStore, betaAllowedUids?: string) {
    const app = await buildApp({ store, sessionSecret, betaAllowedUids });
    apps.push(app);
    return app;
  }

  it('projects the job state machine onto the public columns', async () => {
    const store = new InMemoryStore();
    await seedBoard(store);
    const app = await appWith(store);

    const response = await app.inject({ method: 'GET', url: '/api/games/neon-courier/board' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.building).toEqual([
      { title: 'Improve Neon Courier', state: 'building', since: expect.any(String), agentOpened: true },
    ]);
    expect(body.review).toEqual([
      { title: 'Touch controls on phones', state: 'ready_for_review', since: expect.any(String) },
    ]);
    expect(body.released).toEqual([{ title: 'Neon Courier', state: 'published', since: '2026-08-01T12:00:00.000Z' }]);
    // Abandoned rounds are gone from every column.
    expect(JSON.stringify(body)).not.toContain('Abandoned idea');
    // A visitor never learns job ids.
    expect(body.building[0].jobId).toBeUndefined();
    expect(body.released[0].jobId).toBeUndefined();
  });

  it('withholds the open column from everyone but the owner', async () => {
    const store = new InMemoryStore();
    await seedBoard(store);
    await store.putSuggestion(suggestion());
    await store.upsertUser({ uid: 'g:stranger' });
    const app = await appWith(store);

    const anonymous = await app.inject({ method: 'GET', url: '/api/games/neon-courier/board' });
    expect(anonymous.json()).toMatchObject({ open: [], openVisibility: 'private', viewerIsOwner: false });
    // The finding is scorecard-derived; it must not reach a visitor at all.
    expect(anonymous.body).not.toContain('Crashes for 12%');

    const stranger = await app.inject({
      method: 'GET',
      url: '/api/games/neon-courier/board',
      headers: { cookie: authCookie('g:stranger') },
    });
    expect(stranger.json()).toMatchObject({ open: [], openVisibility: 'private', viewerIsOwner: false });

    const owner = await app.inject({
      method: 'GET',
      url: '/api/games/neon-courier/board',
      headers: { cookie: authCookie('g:creator') },
    });
    const body = owner.json();
    expect(body).toMatchObject({ openVisibility: 'owner', viewerIsOwner: true });
    expect(body.open).toEqual([
      {
        id: 'sug-neon-courier-defect-1',
        taskClass: 'defect',
        priority: 8,
        findings: ['Crashes for 12% of sessions'],
        createdAt: '2026-08-04T01:00:00.000Z',
      },
    ]);
    // The owner does get job ids — they address the work in the Studio.
    expect(body.building[0].jobId).toBe(1_000_002);
  });

  it('shows the owner only open tasks for this game, and only proposed ones', async () => {
    const store = new InMemoryStore();
    await seedBoard(store);
    await store.putSuggestion(suggestion());
    await store.putSuggestion(suggestion({ id: 'sug-other-game', slug: 'other-game' }));
    await store.putSuggestion(suggestion({ id: 'sug-dispatched', status: 'dispatched' }));
    const app = await appWith(store);

    const response = await app.inject({
      method: 'GET',
      url: '/api/games/neon-courier/board',
      headers: { cookie: authCookie('g:creator') },
    });

    expect(response.json().open.map((task: { id: string }) => task.id)).toEqual(['sug-neon-courier-defect-1']);
  });

  it('404s an unpublished game and 400s a bad slug', async () => {
    const store = new InMemoryStore();
    const app = await appWith(store);

    expect((await app.inject({ method: 'GET', url: '/api/games/never-was/board' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/games/Not%20A%20Slug/board' })).statusCode).toBe(400);
  });

  it('404s after a takedown, even though the job that shipped it stays published', async () => {
    const store = new InMemoryStore();
    await seedBoard(store);
    // The job keeps `publishedAt` — publication state is what withdraws a game, and
    // the board must not outlive the page that stops serving it.
    await store.takedownPublication('neon-courier', 'reported', '2026-08-05T00:00:00.000Z');

    const app = await appWith(store);
    const response = await app.inject({ method: 'GET', url: '/api/games/neon-courier/board' });

    expect(response.statusCode).toBe(404);
  });

  it('stays reachable through the private-beta wall', async () => {
    const store = new InMemoryStore();
    await seedBoard(store);
    const app = await appWith(store, 'g:creator');

    const anonymous = await app.inject({ method: 'GET', url: '/api/games/neon-courier/board' });
    expect(anonymous.statusCode).toBe(200);

    // The owner column still works through the wall for the owner's own session.
    await store.putSuggestion(suggestion());
    const owner = await app.inject({
      method: 'GET',
      url: '/api/games/neon-courier/board',
      headers: { cookie: authCookie('g:creator') },
    });
    expect(owner.json().open).toHaveLength(1);
  });
});
