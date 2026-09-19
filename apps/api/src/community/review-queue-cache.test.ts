// What a badge poll costs, and whose answer it is.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../platform/app.js';
import { InMemoryStore } from '../platform/store.js';
import { SESSION_COOKIE_NAME } from '../platform/auth.js';
import type { ContentChecker } from '../platform/moderation.js';
import { createReviewQueueCache } from './review-queue-cache.js';

const allowAll: ContentChecker = {
  async check() {
    return { allowed: true };
  },
  async checkFields() {
    return { allowed: true };
  },
};

const checklist = { graphics: 'ok', gameplay: 'ok', fun: 'ok', sound: 'ok', controls: 'ok' } as const;

const catalog = [
  { slug: 'sky-dodge', title: 'Sky Dodge', creatorHandle: null, genre: 'arcade', media: null },
  { slug: 'neon-courier', title: 'Neon Courier', creatorHandle: 'ada', genre: 'racing', media: null },
];

describe('reviewer badge read windows', () => {
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

  afterEach(async () => {
    while (apps.length) await apps.pop()!.close();
    vi.restoreAllMocks();
  });

  async function cookie(app: Awaited<ReturnType<typeof buildApp>>, uid: string): Promise<string> {
    const res = await app.inject({ method: 'POST', url: '/api/auth/dev', payload: { uid } });
    const value = res.cookies.find((c) => c.name === SESSION_COOKIE_NAME)!.value;
    return `${SESSION_COOKIE_NAME}=${value}`;
  }

  async function makeApp(opts: { now?: () => number } = {}) {
    const store = new InMemoryStore();
    const app = await buildApp({
      store,
      contentChecker: allowAll,
      reviewerUids: 'dev:reviewer,dev:other',
      adminUids: 'dev:boss',
      reviewRoutes: { listCatalog: async () => catalog, ...(opts.now ? { now: opts.now } : {}) },
    });
    apps.push(app);
    const at = new Date().toISOString();
    await store.createReviewSweep({
      id: 'swp-1',
      status: 'active',
      source: 'catalog',
      slugs: catalog.map((entry) => entry.slug),
      releasedCount: catalog.length,
      releasePerDay: null,
      startedAt: at,
      note: null,
      createdAt: at,
      createdBy: 'dev:boss',
      updatedAt: at,
      updatedBy: 'dev:boss',
      notifiedAt: null,
      notifiedCount: 0,
    });
    return { app, store };
  }

  function counters(store: InMemoryStore) {
    return {
      sweep: vi.spyOn(store, 'getOpenReviewSweep'),
      assessments: vi.spyOn(store, 'listGameAssessmentsByReviewer'),
      requests: vi.spyOn(store, 'listOpenReReviewRequestsForReviewer'),
      submissions: vi.spyOn(store, 'listSubmissionsWithDelivery'),
    };
  }

  async function poll(app: Awaited<ReturnType<typeof buildApp>>, cookieHeader: string) {
    const res = await app.inject({ method: 'GET', url: '/api/review/status', headers: { cookie: cookieHeader } });
    expect(res.statusCode).toBe(200);
    return JSON.parse(res.body) as { remaining: number };
  }

  it('reads each collection once across a window of polls, not once per poll', async () => {
    const { app, store } = await makeApp();
    const reviewer = await cookie(app, 'reviewer');
    const spies = counters(store);

    for (let i = 0; i < 5; i += 1) await poll(app, reviewer);

    expect(spies.sweep).toHaveBeenCalledTimes(1);
    expect(spies.assessments).toHaveBeenCalledTimes(1);
    expect(spies.requests).toHaveBeenCalledTimes(1);
  });

  it('scans submissions once per window when a re-review is outstanding', async () => {
    // A targeted slug used to cost a full `submissions` scan per poll.
    const { app, store } = await makeApp();
    const reviewer = await cookie(app, 'reviewer');
    await store.upsertReReviewRequests([
      { slug: 'sky-dodge', reviewerUid: 'dev:reviewer', gameVersion: null, reason: null, createdBy: 'dev:boss' },
    ]);
    const spies = counters(store);

    for (let i = 0; i < 5; i += 1) await poll(app, reviewer);

    expect(spies.submissions).toHaveBeenCalledTimes(1);
    expect(spies.requests).toHaveBeenCalledTimes(1);
  });

  it('still hits at the two-minute poll interval the badge actually uses', async () => {
    // The window this replaced was 60s: expired before the same tab returned.
    let clock = 1_700_000_000_000;
    const { app, store } = await makeApp({ now: () => clock });
    const reviewer = await cookie(app, 'reviewer');
    const spies = counters(store);

    for (let i = 0; i < 4; i += 1) {
      await poll(app, reviewer);
      clock += 120_000;
    }

    expect(spies.sweep).toHaveBeenCalledTimes(1);
    expect(spies.assessments).toHaveBeenCalledTimes(1);
  });

  it('re-reads once the window is over', async () => {
    let clock = 1_700_000_000_000;
    const { app, store } = await makeApp({ now: () => clock });
    const reviewer = await cookie(app, 'reviewer');
    const spies = counters(store);

    await poll(app, reviewer);
    clock += 11 * 60_000;
    await poll(app, reviewer);

    expect(spies.sweep).toHaveBeenCalledTimes(2);
    expect(spies.assessments).toHaveBeenCalledTimes(2);
  });

  it('keys the window per reviewer rather than serving one queue to another', async () => {
    const { app, store } = await makeApp();
    const reviewer = await cookie(app, 'reviewer');
    const other = await cookie(app, 'other');

    await store.upsertGameAssessment({
      slug: 'sky-dodge',
      title: 'Sky Dodge',
      source: 'catalog',
      creatorHandle: null,
      reviewerUid: 'dev:reviewer',
      verdict: 'keep',
      note: 'fine',
      noteOrigin: 'text',
      checklist,
      clientContext: null,
      gameVersion: null,
    });
    await store.upsertReReviewRequests([
      { slug: 'neon-courier', reviewerUid: 'dev:other', gameVersion: null, reason: null, createdBy: 'dev:boss' },
    ]);

    // Warming one reviewer's window first is the shape a leak takes.
    const mine = await poll(app, reviewer);
    const theirs = await poll(app, other);

    expect(mine.remaining).toBe(1);
    expect(theirs.remaining).toBe(2);
    expect((await poll(app, reviewer)).remaining).toBe(1);
  });

  it('shows a reviewer their own verdict on the next poll, inside the window', async () => {
    const { app } = await makeApp();
    const reviewer = await cookie(app, 'reviewer');
    expect((await poll(app, reviewer)).remaining).toBe(2);

    const posted = await app.inject({
      method: 'POST',
      url: '/api/review/assessments',
      headers: { cookie: reviewer },
      payload: { slug: 'sky-dodge', source: 'catalog', verdict: 'keep', note: 'plays well', checklist },
    });
    expect(posted.statusCode).toBe(200);

    expect((await poll(app, reviewer)).remaining).toBe(1);
  });

  it('shows an operator requeue to the targeted reviewer inside the window', async () => {
    const { app } = await makeApp();
    const reviewer = await cookie(app, 'reviewer');
    const boss = await cookie(app, 'boss');

    const posted = await app.inject({
      method: 'POST',
      url: '/api/review/assessments',
      headers: { cookie: reviewer },
      payload: { slug: 'sky-dodge', source: 'catalog', verdict: 'keep', note: 'plays well', checklist },
    });
    expect(posted.statusCode).toBe(200);
    expect((await poll(app, reviewer)).remaining).toBe(1);

    // Already judged, so it can only return as a targeted re-review.
    const requeue = await app.inject({
      method: 'POST',
      url: '/api/admin/review-requeue',
      headers: { cookie: boss },
      payload: { slugs: ['sky-dodge'], reviewerUids: ['dev:reviewer'], notify: false },
    });
    expect(requeue.statusCode).toBe(200);

    expect((await poll(app, reviewer)).remaining).toBe(2);
  });

  it('does not leave a resolved re-review targeted by a poll between the two writes', async () => {
    const { app, store } = await makeApp();
    const reviewer = await cookie(app, 'reviewer');
    const boss = await cookie(app, 'boss');
    const requeue = await app.inject({
      method: 'POST',
      url: '/api/admin/review-requeue',
      headers: { cookie: boss },
      payload: { slugs: ['sky-dodge'], reviewerUids: ['dev:reviewer'], notify: false },
    });
    expect(requeue.statusCode).toBe(200);

    let release = () => {};
    let reached = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const arrived = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const real = store.resolveReReviewRequest.bind(store);
    // Verdict written, request not yet resolved: a poll lands here.
    const spy = vi.spyOn(store, 'resolveReReviewRequest').mockImplementation(async (slug, uid) => {
      reached();
      await gate;
      return real(slug, uid);
    });

    const posted = app.inject({
      method: 'POST',
      url: '/api/review/assessments',
      headers: { cookie: reviewer },
      payload: { slug: 'sky-dodge', source: 'catalog', verdict: 'keep', note: 'plays well', checklist },
    });
    await arrived;
    await poll(app, reviewer);
    release();
    expect((await posted).statusCode).toBe(200);
    spy.mockRestore();

    expect((await poll(app, reviewer)).remaining).toBe(1);
  });

  it('never lets an in-flight read restore a window a write dropped', async () => {
    const { app, store } = await makeApp();
    const reviewer = await cookie(app, 'reviewer');
    const boss = await cookie(app, 'boss');

    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const real = store.getOpenReviewSweep.bind(store);
    const spy = vi.spyOn(store, 'getOpenReviewSweep').mockImplementation(async () => {
      const sweep = await real();
      await gate;
      return sweep;
    });

    // The poll reads the active sweep; the operator pauses it mid-read.
    const inflight = app.inject({ method: 'GET', url: '/api/review/status', headers: { cookie: reviewer } });
    const paused = await app.inject({
      method: 'POST',
      url: '/api/admin/review-sweeps/swp-1',
      headers: { cookie: boss },
      payload: { status: 'paused' },
    });
    expect(paused.statusCode).toBe(200);
    release();
    await inflight;
    spy.mockRestore();

    expect((await poll(app, reviewer)).remaining).toBe(0);
  });

  it('shows an operator sweep change inside the window', async () => {
    const { app } = await makeApp();
    const reviewer = await cookie(app, 'reviewer');
    const boss = await cookie(app, 'boss');
    expect((await poll(app, reviewer)).remaining).toBe(2);

    const paused = await app.inject({
      method: 'POST',
      url: '/api/admin/review-sweeps/swp-1',
      headers: { cookie: boss },
      payload: { status: 'paused' },
    });
    expect(paused.statusCode).toBe(200);

    expect((await poll(app, reviewer)).remaining).toBe(0);
  });
});

describe('review queue attribution after a transfer', () => {
  it('shows the creator who owns the game now, not the row author', async () => {
    const store = new InMemoryStore();
    const at = '2026-01-01T00:00:00.000Z';
    await store.upsertUser({ uid: 'g:ada' });
    await store.upsertUser({ uid: 'g:grace' });
    await store.claimHandle('g:ada', 'ada', at);
    await store.claimHandle('g:grace', 'grace', at);

    const jobId = await store.allocateJobId();
    await store.createSubmission(jobId, 'g:ada', 'Sky Dodge');
    await store.setSubmissionSlug(jobId, 'sky-dodge');
    await store.setSubmissionDeliveredVersion(jobId, 'v1');
    await store.setDraftShared(jobId, at);
    await store.ensureGameAccess('sky-dodge', 'g:ada', at, at);

    const later = new Date(Date.now() + 1000).toISOString();
    const code = (await store.ensureRecipientCode('g:grace', later))!;
    const revision = (await store.getGameAccess('sky-dodge'))!.accessRevision;
    await store.createGameTransferInvitation('sky-dodge', 'g:ada', 'g:grace', revision, later, code);
    const invite = (await store.getActiveGameTransfer('sky-dodge', later))!;
    await store.acceptGameTransferInvitation('sky-dodge', 'g:grace', later, invite.invitationId);

    const cache = createReviewQueueCache({ store, listCatalog: async () => [], now: () => Date.now() });
    const item = await cache.findQueueItem('sky-dodge', await cache.loadReviewPools());

    expect(item?.creatorHandle).toBe('grace');
  });

  it('drops the cached owner when the game changes hands', async () => {
    // The handle is persisted, so a stale window sticks.
    const store = new InMemoryStore();
    const at = '2026-01-01T00:00:00.000Z';
    await store.upsertUser({ uid: 'g:ada' });
    await store.upsertUser({ uid: 'g:grace' });
    await store.claimHandle('g:ada', 'ada', at);
    await store.claimHandle('g:grace', 'grace', at);

    const jobId = await store.allocateJobId();
    await store.createSubmission(jobId, 'g:ada', 'Sky Dodge');
    await store.setSubmissionSlug(jobId, 'sky-dodge');
    await store.setSubmissionDeliveredVersion(jobId, 'v1');
    await store.setDraftShared(jobId, at);
    await store.ensureGameAccess('sky-dodge', 'g:ada', at, at);

    const cache = createReviewQueueCache({ store, listCatalog: async () => [], now: () => Date.now() });
    // Warm the window while ada still owns it.
    expect((await cache.findQueueItem('sky-dodge', await cache.loadReviewPools()))?.creatorHandle).toBe('ada');

    const later = new Date(Date.now() + 1000).toISOString();
    const code = (await store.ensureRecipientCode('g:grace', later))!;
    const revision = (await store.getGameAccess('sky-dodge'))!.accessRevision;
    await store.createGameTransferInvitation('sky-dodge', 'g:ada', 'g:grace', revision, later, code);
    const invite = (await store.getActiveGameTransfer('sky-dodge', later))!;
    await store.acceptGameTransferInvitation('sky-dodge', 'g:grace', later, invite.invitationId);
    cache.invalidateGameOwner('sky-dodge');

    const after = await cache.findQueueItem('sky-dodge', await cache.loadReviewPools());
    expect(after?.creatorHandle).toBe('grace');
  });
});

describe('cached review attribution cannot outlive a handover', () => {
  async function sharedDraft(store: InMemoryStore, at: string): Promise<number> {
    await store.upsertUser({ uid: 'g:ada' });
    await store.upsertUser({ uid: 'g:grace' });
    await store.claimHandle('g:ada', 'ada', at);
    await store.claimHandle('g:grace', 'grace', at);
    const jobId = await store.allocateJobId();
    await store.createSubmission(jobId, 'g:ada', 'Sky Dodge');
    await store.setSubmissionSlug(jobId, 'sky-dodge');
    await store.setSubmissionDeliveredVersion(jobId, 'v1');
    await store.setDraftShared(jobId, at);
    await store.ensureGameAccess('sky-dodge', 'g:ada', at, at);
    return jobId;
  }

  async function handOver(store: InMemoryStore): Promise<void> {
    const later = new Date(Date.now() + 1000).toISOString();
    const code = (await store.ensureRecipientCode('g:grace', later))!;
    const revision = (await store.getGameAccess('sky-dodge'))!.accessRevision;
    await store.createGameTransferInvitation('sky-dodge', 'g:ada', 'g:grace', revision, later, code);
    const invite = (await store.getActiveGameTransfer('sky-dodge', later))!;
    await store.acceptGameTransferInvitation('sky-dodge', 'g:grace', later, invite.invitationId);
  }

  it('drops a targeted queue item holding the previous owner handle', async () => {
    const store = new InMemoryStore();
    await sharedDraft(store, '2026-01-01T00:00:00.000Z');
    await store.upsertReReviewRequests([
      { slug: 'sky-dodge', reviewerUid: 'g:rev', gameVersion: 'v1', reason: 'look again', createdBy: 'g:boss' },
    ]);
    const cache = createReviewQueueCache({ store, listCatalog: async () => [], now: () => Date.now() });

    // The materialised item carries the handle, not just the uid.
    const warm = await cache.targetedQueueItems('g:rev', 'all');
    expect(warm.items[0]?.creatorHandle).toBe('ada');

    await handOver(store);
    cache.invalidateGameOwner('sky-dodge');

    const after = await cache.targetedQueueItems('g:rev', 'all');
    expect(after.items[0]?.creatorHandle).toBe('grace');
  });

  it('refuses to cache an owner read that began before the handover', async () => {
    const store = new InMemoryStore();
    await sharedDraft(store, '2026-01-01T00:00:00.000Z');
    const cache = createReviewQueueCache({ store, listCatalog: async () => [], now: () => Date.now() });
    const pools = await cache.loadReviewPools();

    let release = (): void => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const real = store.getGameAccess.bind(store);
    let held = true;
    vi.spyOn(store, 'getGameAccess').mockImplementation(async (slug: string) => {
      const row = await real(slug);
      if (!held) return row;
      held = false;
      await gate;
      return row;
    });

    // Started under ada, lands after the game is grace's.
    const inFlight = cache.findQueueItem('sky-dodge', pools);
    await handOver(store);
    cache.invalidateGameOwner('sky-dodge');
    release();
    expect((await inFlight)?.creatorHandle).toBe('ada');

    const after = await cache.findQueueItem('sky-dodge', pools);
    expect(after?.creatorHandle).toBe('grace');
  });
});
