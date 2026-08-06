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

describe('reviewer assessment desk', () => {
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

  afterEach(async () => {
    while (apps.length) {
      await apps.pop()!.close();
    }
  });

  async function makeApp(
    opts: {
      reviewerUids?: string;
      adminUids?: string;
      contentChecker?: ContentChecker;
      catalog?: Array<{ slug: string; title: string; creatorHandle: string | null; genre?: string }>;
    } = {},
  ) {
    const store = new InMemoryStore();
    const app = await buildApp({
      store,
      contentChecker: opts.contentChecker ?? allowAll,
      reviewerUids: opts.reviewerUids ?? 'dev:reviewer',
      adminUids: opts.adminUids ?? 'dev:boss',
      reviewRoutes: {
        listCatalog: async () =>
          opts.catalog ?? [
            {
              slug: 'sky-dodge',
              title: 'Sky Dodge',
              creatorHandle: null,
              genre: 'arcade',
              media: {
                screenshots: [
                  { name: 'opening', file: 'opening.png' },
                  { name: 'mid', file: 'mid.png' },
                ],
                video: 'gameplay.mp4',
              },
            },
            {
              slug: 'neon-courier',
              title: 'Neon Courier',
              creatorHandle: 'ada',
              genre: 'racing',
              media: { screenshots: [{ name: 'opening', file: 'opening.png' }], video: null },
            },
          ],
      },
    });
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
      },
    });
    expect(cut.statusCode).toBe(200);
    const assessment = JSON.parse(cut.body).assessment;
    expect(assessment.verdict).toBe('cut');
    expect(assessment.noteOrigin).toBe('speech');
    expect(assessment.note).toContain('mushy');
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

  it('allows skip without a note and rejects moderated notes', async () => {
    const { app } = await makeApp({ contentChecker: rejectAll });
    const cookie = await sessionCookie(app, 'reviewer');

    const skip = await app.inject({
      method: 'POST',
      url: '/api/review/assessments',
      headers: { cookie },
      payload: { slug: 'sky-dodge', source: 'catalog', verdict: 'skip' },
    });
    expect(skip.statusCode).toBe(200);
    expect(JSON.parse(skip.body).assessment.noteOrigin).toBe('none');

    const blocked = await app.inject({
      method: 'POST',
      url: '/api/review/assessments',
      headers: { cookie },
      payload: {
        slug: 'neon-courier',
        source: 'catalog',
        verdict: 'cut',
        note: 'this would be rejected',
      },
    });
    expect(blocked.statusCode).toBe(422);
  });

  it('includes shared creator drafts and exposes an admin aggregate', async () => {
    const { app, store } = await makeApp();
    await store.upsertUser({ uid: 'g:creator', email: 'c@example.com', name: 'Creator' });
    await store.claimHandle('g:creator', 'pixel', new Date().toISOString());
    await store.createSubmission(42, 'g:creator', 'Draft Runner');
    await store.setSubmissionSlug(42, 'draft-runner');
    await store.setSubmissionDeliveredVersion(42, 'v1');
    await store.setDraftShared(42, new Date().toISOString());

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
      },
    });

    const boss = await sessionCookie(app, 'boss');
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
        note: '',
        noteOrigin: 'none',
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
