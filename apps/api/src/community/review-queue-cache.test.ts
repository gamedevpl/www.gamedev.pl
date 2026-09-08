// What a badge poll costs, and whose answer it is.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../platform/app.js';
import { InMemoryStore } from '../platform/store.js';
import { SESSION_COOKIE_NAME } from '../platform/auth.js';
import type { ContentChecker } from '../platform/moderation.js';

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
