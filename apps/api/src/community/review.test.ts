import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { InMemoryStore } from '../store.js';
import type { ContentChecker } from '../moderation.js';

const allowAll: ContentChecker = {
  async check() {
    return { allowed: true };
  },
  async checkFields() {
    return { allowed: true };
  },
};

async function sessionCookie(app: Awaited<ReturnType<typeof buildApp>>, uid = 'local'): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/dev',
    payload: { uid },
  });
  expect(res.statusCode).toBe(200);
  const cookie = res.cookies.find((c) => c.name === 'gamedev_session');
  expect(cookie?.value).toBeTruthy();
  return `gamedev_session=${cookie!.value}`;
}

const sampleChecklist = {
  graphics: 'ok',
  gameplay: 'weak',
  fun: 'ok',
  sound: 'bad',
  controls: 'ok',
} as const;

describe('reviewer assessment desk', () => {
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

  afterEach(async () => {
    while (apps.length) {
      await apps.pop()!.close();
    }
  });

  const defaultCatalog = [
    {
      slug: 'sky-dodge',
      title: 'Sky Dodge',
      creatorHandle: null as string | null,
      genre: 'arcade',
      media: {
        screenshots: [
          { name: 'opening', file: 'opening.png' },
          { name: 'mid', file: 'mid.png' },
        ],
        video: 'gameplay.mp4' as string | null,
      },
    },
    {
      slug: 'neon-courier',
      title: 'Neon Courier',
      creatorHandle: 'ada' as string | null,
      genre: 'racing',
      media: { screenshots: [{ name: 'opening', file: 'opening.png' }], video: null as string | null },
    },
  ];

  async function seedOpenSweep(
    store: InMemoryStore,
    slugs: string[],
    opts: { releasePerDay?: number | null; releasedCount?: number } = {},
  ) {
    const now = new Date().toISOString();
    await store.createReviewSweep({
      id: 'swp-test',
      status: 'active',
      source: 'catalog',
      slugs,
      releasedCount: opts.releasedCount ?? slugs.length,
      releasePerDay: opts.releasePerDay === undefined ? null : opts.releasePerDay,
      startedAt: now,
      note: null,
      createdAt: now,
      createdBy: 'dev:boss',
      updatedAt: now,
      updatedBy: 'dev:boss',
      notifiedAt: null,
      notifiedCount: 0,
    });
  }

  async function makeApp(
    opts: {
      reviewerUids?: string;
      adminUids?: string;
      catalog?: typeof defaultCatalog;
      seedSweep?: boolean;
    } = {},
  ) {
    const store = new InMemoryStore();
    const catalog = opts.catalog ?? defaultCatalog;
    const app = await buildApp({
      store,
      contentChecker: allowAll,
      reviewerUids: opts.reviewerUids ?? 'dev:reviewer',
      adminUids: opts.adminUids ?? 'dev:boss',
      reviewRoutes: {
        listCatalog: async () => catalog,
      },
    });
    if (opts.seedSweep !== false) {
      await seedOpenSweep(
        store,
        catalog.map((entry) => entry.slug),
      );
    }
    apps.push(app);
    return { app, store };
  }

  it('404s the queue for non-reviewers and exposes reviewer on the session', async () => {
    const { app } = await makeApp();
    const stranger = await sessionCookie(app, 'stranger');
    expect(
      (await app.inject({ method: 'GET', url: '/api/review/queue', headers: { cookie: stranger } })).statusCode,
    ).toBe(404);

    const reviewer = await sessionCookie(app, 'reviewer');
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: reviewer } });
    expect(me.statusCode).toBe(200);
    expect(JSON.parse(me.body).user.reviewer).toBe(true);
    expect(JSON.parse(me.body).user.admin).toBeUndefined();

    const queue = await app.inject({ method: 'GET', url: '/api/review/queue', headers: { cookie: reviewer } });
    expect(queue.statusCode).toBe(200);
    const body = JSON.parse(queue.body) as {
      remaining: number;
      items: Array<{ slug: string; media: { video: string | null; screenshots: unknown[] } | null }>;
    };
    expect(body.remaining).toBe(2);
    expect(body.items.map((i) => i.slug)).toEqual(['sky-dodge', 'neon-courier']);
    expect(body.items[0].media).toEqual(
      expect.objectContaining({
        video: 'gameplay.mp4',
        screenshots: expect.arrayContaining([expect.objectContaining({ file: 'mid.png' })]),
      }),
    );
  });

  it('exposes remaining count for the Review nav badge', async () => {
    const { app } = await makeApp({ seedSweep: false });
    const reviewer = await sessionCookie(app, 'reviewer');
    const stranger = await sessionCookie(app, 'stranger');

    expect(
      (await app.inject({ method: 'GET', url: '/api/review/status', headers: { cookie: stranger } })).statusCode,
    ).toBe(404);

    const idle = await app.inject({ method: 'GET', url: '/api/review/status', headers: { cookie: reviewer } });
    expect(idle.statusCode).toBe(200);
    expect(JSON.parse(idle.body)).toEqual({ remaining: 0, sweep: null });

    const boss = await sessionCookie(app, 'boss');
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/review-sweeps',
      headers: { cookie: boss },
      payload: { source: 'catalog', maxGames: 2, releasePerDay: null, notify: false },
    });
    expect(created.statusCode).toBe(200);

    const open = await app.inject({ method: 'GET', url: '/api/review/status', headers: { cookie: reviewer } });
    expect(open.statusCode).toBe(200);
    expect(JSON.parse(open.body).remaining).toBe(2);
    expect(JSON.parse(open.body).sweep.status).toBe('active');

    await app.inject({
      method: 'POST',
      url: '/api/review/assessments',
      headers: { cookie: reviewer },
      payload: {
        slug: 'sky-dodge',
        source: 'catalog',
        verdict: 'keep',
        note: 'One down.',
        checklist: sampleChecklist,
      },
    });

    const after = await app.inject({ method: 'GET', url: '/api/review/status', headers: { cookie: reviewer } });
    expect(JSON.parse(after.body).remaining).toBe(1);
  });

  it('lets admins review without being listed in REVIEWER_UIDS', async () => {
    const { app } = await makeApp({ reviewerUids: '', adminUids: 'dev:boss' });
    const boss = await sessionCookie(app, 'boss');
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: boss } });
    expect(JSON.parse(me.body).user.reviewer).toBe(true);
    expect(JSON.parse(me.body).user.admin).toBe(true);
    expect((await app.inject({ method: 'GET', url: '/api/review/queue', headers: { cookie: boss } })).statusCode).toBe(
      200,
    );
  });

  it('keeps the desk empty until an operator opens a sweep, then rates releases', async () => {
    const { app } = await makeApp({ seedSweep: false });
    const reviewer = await sessionCookie(app, 'reviewer');
    const empty = await app.inject({ method: 'GET', url: '/api/review/queue', headers: { cookie: reviewer } });
    expect(JSON.parse(empty.body).emptyReason).toBe('no_active_sweep');
    expect(JSON.parse(empty.body).remaining).toBe(0);

    const boss = await sessionCookie(app, 'boss');
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/review-sweeps',
      headers: { cookie: boss },
      payload: { source: 'catalog', maxGames: 2, releasePerDay: 1, notify: false },
    });
    expect(created.statusCode).toBe(200);
    const createdBody = JSON.parse(created.body) as {
      sweep: { id: string; progress: { released: number; total: number } };
    };
    expect(createdBody.sweep.progress).toEqual(expect.objectContaining({ released: 1, total: 2 }));

    const first = await app.inject({ method: 'GET', url: '/api/review/queue', headers: { cookie: reviewer } });
    expect(JSON.parse(first.body).items.map((i: { slug: string }) => i.slug)).toEqual(['sky-dodge']);

    const released = await app.inject({
      method: 'POST',
      url: `/api/admin/review-sweeps/${createdBody.sweep.id}`,
      headers: { cookie: boss },
      payload: { releaseMore: 1, notify: false },
    });
    expect(released.statusCode).toBe(200);
    expect(JSON.parse(released.body).sweep.progress.released).toBe(2);

    const second = await app.inject({ method: 'GET', url: '/api/review/queue', headers: { cookie: reviewer } });
    expect(JSON.parse(second.body).items.map((i: { slug: string }) => i.slug)).toEqual(['sky-dodge', 'neon-courier']);
  });

  it('rejects new assessments outside the active released sweep', async () => {
    const { app } = await makeApp({ seedSweep: false });
    const boss = await sessionCookie(app, 'boss');
    const reviewer = await sessionCookie(app, 'reviewer');
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/review-sweeps',
      headers: { cookie: boss },
      payload: { source: 'catalog', maxGames: 2, releasePerDay: 1, notify: false },
    });
    expect(created.statusCode).toBe(200);

    const blocked = await app.inject({
      method: 'POST',
      url: '/api/review/assessments',
      headers: { cookie: reviewer },
      payload: {
        slug: 'neon-courier',
        source: 'catalog',
        verdict: 'keep',
        note: 'Not released yet.',
        checklist: sampleChecklist,
      },
    });
    expect(blocked.statusCode).toBe(409);
    expect(JSON.parse(blocked.body).error).toBe('slug_not_in_sweep');

    const ok = await app.inject({
      method: 'POST',
      url: '/api/review/assessments',
      headers: { cookie: reviewer },
      payload: {
        slug: 'sky-dodge',
        source: 'catalog',
        verdict: 'keep',
        note: 'Released and fine.',
        checklist: sampleChecklist,
      },
    });
    expect(ok.statusCode).toBe(200);

    // Re-edit still works even if the sweep later pauses.
    const pause = await app.inject({
      method: 'POST',
      url: `/api/admin/review-sweeps/${JSON.parse(created.body).sweep.id}`,
      headers: { cookie: boss },
      payload: { status: 'paused' },
    });
    expect(pause.statusCode).toBe(200);
    const reedit = await app.inject({
      method: 'POST',
      url: '/api/review/assessments',
      headers: { cookie: reviewer },
      payload: {
        slug: 'sky-dodge',
        source: 'catalog',
        verdict: 'cut',
        note: 'Changed my mind after pause.',
        checklist: sampleChecklist,
      },
    });
    expect(reedit.statusCode).toBe(200);
  });

  it('snapshots drip progress when pausing a sweep', async () => {
    const { app, store } = await makeApp({ seedSweep: false });
    const boss = await sessionCookie(app, 'boss');
    const startedAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    await store.createReviewSweep({
      id: 'swp-drip',
      status: 'active',
      source: 'catalog',
      slugs: ['sky-dodge', 'neon-courier'],
      releasedCount: 1,
      releasePerDay: 1,
      startedAt,
      note: null,
      createdAt: startedAt,
      createdBy: 'dev:boss',
      updatedAt: startedAt,
      updatedBy: 'dev:boss',
      notifiedAt: null,
      notifiedCount: 0,
    });

    const paused = await app.inject({
      method: 'POST',
      url: '/api/admin/review-sweeps/swp-drip',
      headers: { cookie: boss },
      payload: { status: 'paused' },
    });
    expect(paused.statusCode).toBe(200);
    const body = JSON.parse(paused.body) as { sweep: { releasedCount: number; progress: { released: number } } };
    expect(body.sweep.releasedCount).toBe(2);
    expect(body.sweep.progress.released).toBe(2);

    const stored = await store.getReviewSweep('swp-drip');
    expect(stored?.releasedCount).toBe(2);
  });

  it('records a keep/cut with a note and drops the game from the queue', async () => {
    const { app } = await makeApp();
    const cookie = await sessionCookie(app, 'reviewer');

    const cut = await app.inject({
      method: 'POST',
      url: '/api/review/assessments',
      headers: { cookie },
      payload: {
        slug: 'sky-dodge',
        source: 'catalog',
        title: 'Sky Dodge',
        verdict: 'cut',
        note: 'Controls feel mushy on mobile and the goal is unclear.',
        noteOrigin: 'speech',
        checklist: sampleChecklist,
      },
    });
    expect(cut.statusCode).toBe(200);
    const assessment = JSON.parse(cut.body).assessment;
    expect(assessment.verdict).toBe('cut');
    expect(assessment.noteOrigin).toBe('speech');
    expect(assessment.note).toContain('mushy');
    expect(assessment.checklist).toEqual(sampleChecklist);
    expect(assessment.clientContext).toBeNull();

    const queue = await app.inject({ method: 'GET', url: '/api/review/queue', headers: { cookie } });
    const body = JSON.parse(queue.body) as { remaining: number; assessed: number; items: Array<{ slug: string }> };
    expect(body.assessed).toBe(1);
    expect(body.remaining).toBe(1);
    expect(body.items.map((i) => i.slug)).toEqual(['neon-courier']);
  });

  it('stores reviewer client context with the verdict', async () => {
    const { app } = await makeApp();
    const cookie = await sessionCookie(app, 'reviewer');
    const res = await app.inject({
      method: 'POST',
      url: '/api/review/assessments',
      headers: { cookie },
      payload: {
        slug: 'sky-dodge',
        source: 'catalog',
        verdict: 'keep',
        note: 'Plays clean on a phone.',
        checklist: sampleChecklist,
        clientContext: {
          viewportW: 390,
          viewportH: 844,
          screenW: 390,
          screenH: 844,
          dpr: 3,
          input: 'touch',
          platform: 'ios',
          lang: 'en-US',
          ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
        },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).assessment.clientContext).toEqual(
      expect.objectContaining({
        viewportW: 390,
        viewportH: 844,
        input: 'touch',
        platform: 'ios',
        dpr: 3,
      }),
    );
  });

  it('requires note and checklist', async () => {
    const { app } = await makeApp();
    const cookie = await sessionCookie(app, 'reviewer');

    const missing = await app.inject({
      method: 'POST',
      url: '/api/review/assessments',
      headers: { cookie },
      payload: { slug: 'sky-dodge', source: 'catalog', verdict: 'skip' },
    });
    expect(missing.statusCode).toBe(400);

    const noChecklist = await app.inject({
      method: 'POST',
      url: '/api/review/assessments',
      headers: { cookie },
      payload: {
        slug: 'sky-dodge',
        source: 'catalog',
        verdict: 'skip',
        note: 'Need more time with this one.',
      },
    });
    expect(noChecklist.statusCode).toBe(400);
  });

  it('includes shared creator drafts and exposes an admin aggregate', async () => {
    // Seed a creator sweep; default catalog seed hides drafts.
    const { app, store } = await makeApp({ seedSweep: false });
    await store.upsertUser({ uid: 'g:creator', email: 'c@example.com', name: 'Creator' });
    await store.claimHandle('g:creator', 'pixel', new Date().toISOString());
    await store.createSubmission(42, 'g:creator', 'Draft Runner');
    await store.setSubmissionSlug(42, 'draft-runner');
    await store.setSubmissionDeliveredVersion(42, 'v1');
    await store.setDraftShared(42, new Date().toISOString());

    const boss = await sessionCookie(app, 'boss');
    const sweep = await app.inject({
      method: 'POST',
      url: '/api/admin/review-sweeps',
      headers: { cookie: boss },
      payload: { source: 'creator', notify: false },
    });
    expect(sweep.statusCode).toBe(200);

    const cookie = await sessionCookie(app, 'reviewer');
    const creatorQueue = await app.inject({
      method: 'GET',
      url: '/api/review/queue?source=creator',
      headers: { cookie },
    });
    expect(creatorQueue.statusCode).toBe(200);
    const creatorBody = JSON.parse(creatorQueue.body) as {
      items: Array<{ slug: string; title: string; source: string; creatorHandle: string | null }>;
    };
    expect(creatorBody.items).toEqual([
      expect.objectContaining({
        slug: 'draft-runner',
        title: 'Draft Runner',
        source: 'creator',
        creatorHandle: 'pixel',
      }),
    ]);

    await app.inject({
      method: 'POST',
      url: '/api/review/assessments',
      headers: { cookie },
      payload: {
        slug: 'draft-runner',
        source: 'creator',
        title: 'draft-runner',
        creatorHandle: 'pixel',
        verdict: 'keep',
        note: 'Solid loop, ship it.',
        noteOrigin: 'text',
        checklist: sampleChecklist,
      },
    });

    const summary = await app.inject({
      method: 'GET',
      url: '/api/admin/assessments',
      headers: { cookie: boss },
    });
    expect(summary.statusCode).toBe(200);
    const adminBody = JSON.parse(summary.body) as {
      total: number;
      games: Array<{ slug: string; keep: number }>;
    };
    expect(adminBody.total).toBe(1);
    expect(adminBody.games[0]).toEqual(expect.objectContaining({ slug: 'draft-runner', keep: 1 }));

    // Non-admins (even reviewers) cannot read the operator aggregate.
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/admin/assessments',
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(404);
  });

  it('aggregates every assessment while paginating detailed rows', async () => {
    const { app, store } = await makeApp({ catalog: [] });
    for (let i = 0; i < 210; i += 1) {
      const slug = `game-${String(i).padStart(3, '0')}`;
      await store.upsertGameAssessment({
        slug,
        title: `Game ${i}`,
        source: 'catalog',
        creatorHandle: null,
        reviewerUid: 'dev:reviewer',
        verdict: i % 2 === 0 ? 'keep' : 'cut',
        note: 'seed',
        noteOrigin: 'text',
        checklist: { ...sampleChecklist },
        clientContext: null,
      });
    }

    const boss = await sessionCookie(app, 'boss');
    const summary = await app.inject({
      method: 'GET',
      url: '/api/admin/assessments?offset=40&limit=200',
      headers: { cookie: boss },
    });
    expect(summary.statusCode).toBe(200);
    const body = JSON.parse(summary.body) as {
      total: number;
      games: Array<{ slug: string; keep: number; cut: number }>;
      recent: unknown[];
    };
    expect(body).toEqual(expect.objectContaining({ total: 210, offset: 40, limit: 200, nextOffset: null }));
    expect(body.games).toHaveLength(210);
    expect(body.games.reduce((sum, g) => sum + g.keep + g.cut, 0)).toBe(210);
    expect(body.recent).toHaveLength(170);
  });
});

describe('targeted re-review', () => {
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

  afterEach(async () => {
    while (apps.length) {
      await apps.pop()!.close();
    }
  });

  const catalog = [
    {
      slug: 'sky-dodge',
      title: 'Sky Dodge',
      creatorHandle: null as string | null,
      genre: 'arcade',
      media: { screenshots: [], video: null as string | null },
    },
    {
      slug: 'neon-courier',
      title: 'Neon Courier',
      creatorHandle: 'ada' as string | null,
      genre: 'racing',
      media: { screenshots: [], video: null as string | null },
    },
  ];

  async function makeApp() {
    const store = new InMemoryStore();
    const app = await buildApp({
      store,
      contentChecker: allowAll,
      reviewerUids: 'dev:reviewer,dev:second',
      adminUids: 'dev:boss',
      reviewRoutes: {
        listCatalog: async () => catalog,
      },
    });
    apps.push(app);
    return { app, store };
  }

  async function assess(app: Awaited<ReturnType<typeof buildApp>>, cookie: string, payload: Record<string, unknown>) {
    const res = await app.inject({ method: 'POST', url: '/api/review/assessments', headers: { cookie }, payload });
    expect(res.statusCode).toBe(200);
    return JSON.parse(res.body).assessment;
  }

  it('re-surfaces an already-assessed slug only for the targeted reviewer, and resolves once re-assessed', async () => {
    const { app, store } = await makeApp();
    const reviewer = await sessionCookie(app, 'reviewer');
    const second = await sessionCookie(app, 'second');
    const boss = await sessionCookie(app, 'boss');

    // First pass, via a normal sweep.
    await store.createReviewSweep({
      id: 'swp-first',
      status: 'active',
      source: 'catalog',
      slugs: ['sky-dodge'],
      releasedCount: 1,
      releasePerDay: null,
      startedAt: new Date().toISOString(),
      note: null,
      createdAt: new Date().toISOString(),
      createdBy: 'dev:boss',
      updatedAt: new Date().toISOString(),
      updatedBy: 'dev:boss',
      notifiedAt: null,
      notifiedCount: 0,
    });
    await assess(app, reviewer, {
      slug: 'sky-dodge',
      source: 'catalog',
      verdict: 'cut',
      note: 'Controls are broken.',
      checklist: sampleChecklist,
      gameVersion: 'v1',
    });

    // Once assessed, the slug drops out of this reviewer's queue.
    const gone = await app.inject({ method: 'GET', url: '/api/review/queue', headers: { cookie: reviewer } });
    expect(JSON.parse(gone.body).items.map((i: { slug: string }) => i.slug)).not.toContain('sky-dodge');

    // Close out the sweep so only the targeted request drives the queue.
    await app.inject({
      method: 'POST',
      url: '/api/admin/review-sweeps/swp-first',
      headers: { cookie: boss },
      payload: { status: 'completed' },
    });

    // A fix lands; requeue that one slug for that one reviewer.
    const requeue = await app.inject({
      method: 'POST',
      url: '/api/admin/review-requeue',
      headers: { cookie: boss },
      payload: {
        slugs: ['sky-dodge'],
        reviewerUids: ['dev:reviewer'],
        gameVersion: 'v2',
        reason: 'Controls fix shipped.',
        notify: false,
      },
    });
    expect(requeue.statusCode).toBe(200);
    const requeueBody = JSON.parse(requeue.body) as { requests: Array<{ slug: string; reviewerUid: string }> };
    expect(requeueBody.requests).toEqual([
      expect.objectContaining({ slug: 'sky-dodge', reviewerUid: 'dev:reviewer', status: 'open' }),
    ]);

    // The targeted reviewer sees it again, flagged as a re-review.
    const targetedQueue = await app.inject({ method: 'GET', url: '/api/review/queue', headers: { cookie: reviewer } });
    const targetedBody = JSON.parse(targetedQueue.body) as {
      items: Array<{ slug: string; reReview: { reason: string | null; gameVersion: string | null } | null }>;
    };
    expect(targetedBody.items).toEqual([
      expect.objectContaining({
        slug: 'sky-dodge',
        reReview: expect.objectContaining({ reason: 'Controls fix shipped.', gameVersion: 'v2' }),
      }),
    ]);

    // A different reviewer, not named in the request, does not see it.
    const otherQueue = await app.inject({ method: 'GET', url: '/api/review/queue', headers: { cookie: second } });
    expect(JSON.parse(otherQueue.body).items).toEqual([]);

    // Re-assessing archives the original verdict instead of overwriting it.
    const second_assessment = await assess(app, reviewer, {
      slug: 'sky-dodge',
      source: 'catalog',
      verdict: 'keep',
      note: 'Controls feel great now.',
      checklist: sampleChecklist,
    });
    expect(second_assessment.verdict).toBe('keep');
    expect(second_assessment.gameVersion).toBe('v2'); // inherited from the re-review request

    const history = await app.inject({
      method: 'GET',
      url: '/api/admin/assessments/history?slug=sky-dodge&reviewerUid=dev:reviewer',
      headers: { cookie: boss },
    });
    expect(history.statusCode).toBe(200);
    const historyBody = JSON.parse(history.body) as {
      current: { verdict: string };
      history: Array<{ verdict: string; note: string; gameVersion: string | null }>;
    };
    expect(historyBody.current.verdict).toBe('keep');
    expect(historyBody.history).toEqual([
      expect.objectContaining({ verdict: 'cut', note: 'Controls are broken.', gameVersion: 'v1' }),
    ]);

    // Resolved: it drops back out of the queue.
    const resolved = await app.inject({ method: 'GET', url: '/api/review/queue', headers: { cookie: reviewer } });
    expect(JSON.parse(resolved.body).items).toEqual([]);
  });

  it('lets an explicit gameVersion on the submission override the re-review request default', async () => {
    const { app, store } = await makeApp();
    const reviewer = await sessionCookie(app, 'reviewer');
    const boss = await sessionCookie(app, 'boss');
    await store.upsertGameAssessment({
      slug: 'neon-courier',
      title: 'Neon Courier',
      source: 'catalog',
      creatorHandle: 'ada',
      reviewerUid: 'dev:reviewer',
      verdict: 'cut',
      note: 'first pass',
      noteOrigin: 'text',
      checklist: sampleChecklist,
      clientContext: null,
      gameVersion: 'v1',
    });
    await app.inject({
      method: 'POST',
      url: '/api/admin/review-requeue',
      headers: { cookie: boss },
      payload: { slugs: ['neon-courier'], reviewerUids: ['dev:reviewer'], gameVersion: 'v2', notify: false },
    });
    const assessment = await assess(app, reviewer, {
      slug: 'neon-courier',
      source: 'catalog',
      verdict: 'keep',
      note: 'Better now.',
      checklist: sampleChecklist,
      gameVersion: 'v3',
    });
    expect(assessment.gameVersion).toBe('v3');
  });

  it('rejects a requeue naming a uid that is not a reviewer, and caps slug x reviewer pairs', async () => {
    const { app } = await makeApp();
    const boss = await sessionCookie(app, 'boss');

    const badReviewer = await app.inject({
      method: 'POST',
      url: '/api/admin/review-requeue',
      headers: { cookie: boss },
      payload: { slugs: ['sky-dodge'], reviewerUids: ['dev:stranger'], notify: false },
    });
    expect(badReviewer.statusCode).toBe(400);

    const tooManyPairs = await app.inject({
      method: 'POST',
      url: '/api/admin/review-requeue',
      headers: { cookie: boss },
      payload: {
        slugs: Array.from({ length: 41 }, (_, i) => `game-${i}`),
        reviewerUids: ['dev:reviewer', 'dev:second', 'dev:boss', 'dev:boss', 'dev:boss'],
        notify: false,
      },
    });
    expect(tooManyPairs.statusCode).toBe(400);

    // Only admins can requeue.
    const reviewer = await sessionCookie(app, 'reviewer');
    const asReviewer = await app.inject({
      method: 'POST',
      url: '/api/admin/review-requeue',
      headers: { cookie: reviewer },
      payload: { slugs: ['sky-dodge'], reviewerUids: ['dev:reviewer'], notify: false },
    });
    expect(asReviewer.statusCode).toBe(404);
  });

  it('counts a targeted re-review in the nav badge with no active sweep', async () => {
    const { app } = await makeApp();
    const reviewer = await sessionCookie(app, 'reviewer');
    const boss = await sessionCookie(app, 'boss');

    const idle = await app.inject({ method: 'GET', url: '/api/review/status', headers: { cookie: reviewer } });
    expect(JSON.parse(idle.body)).toEqual({ remaining: 0, sweep: null });

    await app.inject({
      method: 'POST',
      url: '/api/admin/review-requeue',
      headers: { cookie: boss },
      payload: { slugs: ['sky-dodge'], reviewerUids: ['dev:reviewer'], notify: false },
    });

    const targeted = await app.inject({ method: 'GET', url: '/api/review/status', headers: { cookie: reviewer } });
    expect(JSON.parse(targeted.body).remaining).toBe(1);
  });

  it('rejects a slug that is neither in the catalog nor a reviewable draft', async () => {
    const { app } = await makeApp();
    const boss = await sessionCookie(app, 'boss');

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/review-requeue',
      headers: { cookie: boss },
      payload: { slugs: ['does-not-exist'], reviewerUids: ['dev:reviewer'], notify: false },
    });
    expect(res.statusCode).toBe(400);

    // No phantom request was left behind for the valid slug either.
    const list = await app.inject({ method: 'GET', url: '/api/admin/review-requeue', headers: { cookie: boss } });
    expect(JSON.parse(list.body).requests).toEqual([]);
  });
});

describe('assessment resolution', () => {
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

  afterEach(async () => {
    while (apps.length) {
      await apps.pop()!.close();
    }
  });

  const catalog = [
    {
      slug: 'sky-dodge',
      title: 'Sky Dodge',
      creatorHandle: null as string | null,
      genre: 'arcade',
      media: { screenshots: [], video: null as string | null },
    },
  ];

  async function makeApp(opts: { reviewerUids?: string } = {}) {
    const store = new InMemoryStore();
    const app = await buildApp({
      store,
      contentChecker: allowAll,
      reviewerUids: opts.reviewerUids ?? 'dev:reviewer',
      adminUids: 'dev:boss',
      reviewRoutes: { listCatalog: async () => catalog },
    });
    const now = new Date().toISOString();
    await store.createReviewSweep({
      id: 'swp-resolution',
      status: 'active',
      source: 'catalog',
      slugs: catalog.map((entry) => entry.slug),
      releasedCount: catalog.length,
      releasePerDay: null,
      startedAt: now,
      note: null,
      createdAt: now,
      createdBy: 'dev:boss',
      updatedAt: now,
      updatedBy: 'dev:boss',
      notifiedAt: null,
      notifiedCount: 0,
    });
    apps.push(app);
    return { app, store };
  }

  async function assess(app: Awaited<ReturnType<typeof buildApp>>, cookie: string, payload: Record<string, unknown>) {
    const res = await app.inject({ method: 'POST', url: '/api/review/assessments', headers: { cookie }, payload });
    expect(res.statusCode).toBe(200);
    return JSON.parse(res.body).assessment;
  }

  it('records what an operator did about a verdict, and how', async () => {
    const { app, store } = await makeApp();
    const boss = await sessionCookie(app, 'boss');
    const reviewer = await sessionCookie(app, 'reviewer');
    await assess(app, reviewer, {
      slug: 'sky-dodge',
      source: 'catalog',
      verdict: 'cut',
      note: 'Controls are broken on touch.',
      checklist: sampleChecklist,
    });

    // Reviewers judge; only the operator console records the response.
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/admin/assessments/resolve',
          headers: { cookie: reviewer },
          payload: { slug: 'sky-dodge', reviewerUid: 'dev:reviewer', status: 'addressed', comment: 'done' },
        })
      ).statusCode,
    ).toBe(404);

    // An unexplained "addressed" is what this stops.
    const blank = await app.inject({
      method: 'POST',
      url: '/api/admin/assessments/resolve',
      headers: { cookie: boss },
      payload: { slug: 'sky-dodge', reviewerUid: 'dev:reviewer', status: 'addressed', comment: '   ' },
    });
    expect(blank.statusCode).toBe(400);
    expect(JSON.parse(blank.body).error).toBe('comment is required');

    const resolved = await app.inject({
      method: 'POST',
      url: '/api/admin/assessments/resolve',
      headers: { cookie: boss },
      payload: {
        slug: 'sky-dodge',
        reviewerUid: 'dev:reviewer',
        status: 'addressed',
        comment: 'Rebuilt the touch controls.',
        link: 'https://github.com/gamedevpl/www.gamedev.pl-games/pull/12',
      },
    });
    expect(resolved.statusCode).toBe(200);
    const resolvedBody = JSON.parse(resolved.body) as {
      resolved: boolean;
      assessments: Array<{ resolution: { status: string; comment: string; link: string; resolvedBy: string } }>;
    };
    expect(resolvedBody.resolved).toBe(true);
    expect(resolvedBody.assessments[0].resolution).toEqual(
      expect.objectContaining({
        status: 'addressed',
        comment: 'Rebuilt the touch controls.',
        link: 'https://github.com/gamedevpl/www.gamedev.pl-games/pull/12',
        resolvedBy: 'dev:boss',
      }),
    );
    expect(await store.getGameAssessment('sky-dodge', 'dev:reviewer')).toEqual(
      expect.objectContaining({ resolution: expect.objectContaining({ status: 'addressed' }) }),
    );

    // The aggregate counts, and can list, what is open.
    const summary = await app.inject({
      method: 'GET',
      url: '/api/admin/assessments',
      headers: { cookie: boss },
    });
    const summaryBody = JSON.parse(summary.body) as {
      resolved: number;
      open: number;
      games: Array<{ slug: string; resolved: number; open: number }>;
    };
    expect(summaryBody).toEqual(expect.objectContaining({ resolved: 1, open: 0 }));
    expect(summaryBody.games[0]).toEqual(expect.objectContaining({ slug: 'sky-dodge', resolved: 1, open: 0 }));

    const openOnly = await app.inject({
      method: 'GET',
      url: '/api/admin/assessments?resolution=open',
      headers: { cookie: boss },
    });
    expect(JSON.parse(openOnly.body)).toEqual(expect.objectContaining({ total: 1, matched: 0, recent: [] }));

    // Withdrawing a resolution filed by mistake.
    const cleared = await app.inject({
      method: 'POST',
      url: '/api/admin/assessments/resolve',
      headers: { cookie: boss },
      payload: { slug: 'sky-dodge', reviewerUid: 'dev:reviewer', status: null },
    });
    expect(cleared.statusCode).toBe(200);
    expect(JSON.parse(cleared.body).assessments[0].resolution).toBeNull();
  });

  it('refuses a resolution aimed at a verdict that has already moved', async () => {
    const { app, store } = await makeApp();
    const boss = await sessionCookie(app, 'boss');
    const reviewer = await sessionCookie(app, 'reviewer');
    const first = await assess(app, reviewer, {
      slug: 'sky-dodge',
      source: 'catalog',
      verdict: 'cut',
      note: 'Controls are broken on touch.',
      checklist: sampleChecklist,
    });

    // Reviewer re-assesses while the operator holds the old row.
    await app.inject({
      method: 'POST',
      url: '/api/admin/review-requeue',
      headers: { cookie: boss },
      payload: { slugs: ['sky-dodge'], reviewerUids: ['dev:reviewer'], notify: false },
    });
    await assess(app, reviewer, {
      slug: 'sky-dodge',
      source: 'catalog',
      verdict: 'keep',
      note: 'Fixed in the new build.',
      checklist: sampleChecklist,
    });

    // Fabricated: no reliance on millisecond clock granularity.
    const staleStamp = new Date(Date.parse(first.updatedAt) - 60_000).toISOString();
    const stale = await app.inject({
      method: 'POST',
      url: '/api/admin/assessments/resolve',
      headers: { cookie: boss },
      payload: {
        slug: 'sky-dodge',
        reviewerUid: 'dev:reviewer',
        expectedUpdatedAt: staleStamp,
        status: 'addressed',
        comment: 'Rebuilt the touch controls.',
      },
    });
    expect(stale.statusCode).toBe(409);
    expect(JSON.parse(stale.body).error).toBe('stale_verdict');
    expect((await store.getGameAssessment('sky-dodge', 'dev:reviewer'))?.resolution).toBeNull();

    // Aimed at the verdict actually on the row, it lands.
    const current = await store.getGameAssessment('sky-dodge', 'dev:reviewer');
    const fresh = await app.inject({
      method: 'POST',
      url: '/api/admin/assessments/resolve',
      headers: { cookie: boss },
      payload: {
        slug: 'sky-dodge',
        reviewerUid: 'dev:reviewer',
        expectedUpdatedAt: current!.updatedAt,
        status: 'addressed',
        comment: 'Rebuilt the touch controls.',
      },
    });
    expect(fresh.statusCode).toBe(200);
    expect(JSON.parse(fresh.body).stale).toEqual([]);
  });

  it('resolves every reviewer row for a slug when no reviewer is named, and a fresh verdict reopens it', async () => {
    const { app, store } = await makeApp({ reviewerUids: 'dev:reviewer,dev:second' });
    const boss = await sessionCookie(app, 'boss');
    const reviewer = await sessionCookie(app, 'reviewer');
    const second = await sessionCookie(app, 'second');
    for (const cookie of [reviewer, second]) {
      await assess(app, cookie, {
        slug: 'sky-dodge',
        source: 'catalog',
        verdict: 'cut',
        note: 'Too slow to start.',
        checklist: sampleChecklist,
      });
    }

    const resolved = await app.inject({
      method: 'POST',
      url: '/api/admin/assessments/resolve',
      headers: { cookie: boss },
      payload: { slug: 'sky-dodge', status: 'wont_fix', comment: 'Pacing is the point of this one.' },
    });
    expect(resolved.statusCode).toBe(200);
    expect(JSON.parse(resolved.body).assessments).toHaveLength(2);

    // A missing game is a 404, not a silent no-op.
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/admin/assessments/resolve',
          headers: { cookie: boss },
          payload: { slug: 'no-such-game', status: 'addressed', comment: 'nothing to do' },
        })
      ).statusCode,
    ).toBe(404);

    // A second pass archives the follow-up with the old row.
    await app.inject({
      method: 'POST',
      url: '/api/admin/review-requeue',
      headers: { cookie: boss },
      payload: { slugs: ['sky-dodge'], reviewerUids: ['dev:reviewer'], notify: false },
    });
    await assess(app, reviewer, {
      slug: 'sky-dodge',
      source: 'catalog',
      verdict: 'keep',
      note: 'The new opening fixes it.',
      checklist: sampleChecklist,
    });
    expect((await store.getGameAssessment('sky-dodge', 'dev:reviewer'))?.resolution).toBeNull();
    const history = await store.listGameAssessmentHistory('sky-dodge', 'dev:reviewer');
    expect(history[0].resolution).toEqual(expect.objectContaining({ status: 'wont_fix' }));
  });
});
