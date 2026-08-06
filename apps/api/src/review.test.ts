import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { InMemoryStore } from './store.js';
import type { ContentChecker } from './moderation.js';

const allowAll: ContentChecker = {
  async check() {
    return { allowed: true };
  },
  async checkFields() {
    return { allowed: true };
  },
};

const rejectAll: ContentChecker = {
  async check() {
    return { allowed: false, category: 'other' };
  },
  async checkFields() {
    return { allowed: false, category: 'other' };
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
      contentChecker?: ContentChecker;
      catalog?: typeof defaultCatalog;
      seedSweep?: boolean;
    } = {},
  ) {
    const store = new InMemoryStore();
    const catalog = opts.catalog ?? defaultCatalog;
    const app = await buildApp({
      store,
      contentChecker: opts.contentChecker ?? allowAll,
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

  it('requires note and checklist, and rejects moderated notes', async () => {
    const { app } = await makeApp({ contentChecker: rejectAll });
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

    const blocked = await app.inject({
      method: 'POST',
      url: '/api/review/assessments',
      headers: { cookie },
      payload: {
        slug: 'neon-courier',
        source: 'catalog',
        verdict: 'cut',
        note: 'this would be rejected',
        checklist: sampleChecklist,
      },
    });
    expect(blocked.statusCode).toBe(422);
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

  it('aggregates every assessment even when the recent list is capped', async () => {
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
      url: '/api/admin/assessments',
      headers: { cookie: boss },
    });
    expect(summary.statusCode).toBe(200);
    const body = JSON.parse(summary.body) as {
      total: number;
      games: Array<{ slug: string; keep: number; cut: number }>;
      recent: unknown[];
    };
    expect(body.total).toBe(210);
    expect(body.games).toHaveLength(210);
    expect(body.games.reduce((sum, g) => sum + g.keep + g.cut, 0)).toBe(210);
    expect(body.recent.length).toBeLessThanOrEqual(40);
  });
});
