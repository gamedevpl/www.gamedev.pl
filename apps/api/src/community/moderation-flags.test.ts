// Abuse needs no consensus: one credible report, one operator, one takedown.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../platform/app.js';
import { InMemoryStore } from '../platform/store.js';
import { SESSION_COOKIE_NAME } from '../platform/auth.js';
import type { ContentChecker } from '../platform/moderation.js';
import { mintToken } from '../platform/submission-token.js';
import { mintSessionToken } from '../platform/auth.js';
import type { CatalogGameEntry, GitHubClient } from '../catalog/github-client.js';

const secret = 'submission-secret';
const sessionSecret = 'dev-session-secret-change-me';

function githubStub(published: string[]): GitHubClient {
  const catalog: CatalogGameEntry[] = published.map(
    (slug) => ({ slug, title: slug, status: 'published' }) as unknown as CatalogGameEntry,
  );
  return {
    getIssueState: async () => ({ state: 'open' as const }),
    findLinkedPR: async () => null,
    createIssueComment: async () => ({ id: 1 }),
    updateIssueBody: async () => {},
    closeIssue: async () => {},
    getGameSources: async () => null,
    getGameMedia: async () => null,
    getCatalog: async () => catalog,
    getProgressNotes: async () => null,
    getRefSha: async () => null,
  } as unknown as GitHubClient;
}

const allowAll: ContentChecker = {
  async check() {
    return { allowed: true };
  },
  async checkFields() {
    return { allowed: true };
  },
};

describe('moderation flags', () => {
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

  afterEach(async () => {
    while (apps.length) await apps.pop()!.close();
  });

  async function cookie(app: Awaited<ReturnType<typeof buildApp>>, handle: string): Promise<string> {
    const res = await app.inject({ method: 'POST', url: '/api/auth/dev', payload: { uid: handle } });
    return `${SESSION_COOKIE_NAME}=${res.cookies.find((c) => c.name === SESSION_COOKIE_NAME)!.value}`;
  }

  async function makeApp(opts: { published?: string[] } = {}) {
    const store = new InMemoryStore();
    const app = await buildApp({
      store,
      contentChecker: allowAll,
      reviewerUids: 'dev:reviewer',
      adminUids: 'dev:boss',
      submissionRoutes: {
        githubToken: 'token',
        githubClient: githubStub(opts.published ?? []),
        submissionTokenSecret: secret,
        gamesRepo: 'gamedevpl/www.gamedev.pl-games',
      },
    });
    apps.push(app);
    return { app, store };
  }

  async function raise(app: Awaited<ReturnType<typeof buildApp>>, cookieHeader: string, slug = 'sky-dodge') {
    return app.inject({
      method: 'POST',
      url: '/api/review/flags',
      headers: { cookie: cookieHeader },
      payload: { slug, reason: 'hate', note: 'a slur is painted on the title screen' },
    });
  }

  it('takes a reviewer report and shows it to the operator, and nobody else', async () => {
    const { app } = await makeApp();
    const reviewer = await cookie(app, 'reviewer');

    const raised = await raise(app, reviewer);
    expect(raised.statusCode).toBe(200);
    expect(raised.json().flag).toMatchObject({ slug: 'sky-dodge', reason: 'hate', status: 'open' });

    // An ordinary signed-in account cannot report, and cannot read the queue.
    const stranger = await cookie(app, 'nobody');
    expect((await raise(app, stranger, 'neon-courier')).statusCode).toBe(404);
    const peeked = await app.inject({
      method: 'GET',
      url: '/api/admin/moderation-flags',
      headers: { cookie: stranger },
    });
    expect(peeked.statusCode).toBe(404);

    const queue = await app.inject({
      method: 'GET',
      url: '/api/admin/moderation-flags',
      headers: { cookie: await cookie(app, 'boss') },
    });
    expect(queue.statusCode).toBe(200);
    expect(queue.json().flags).toHaveLength(1);
  });

  it('pulls a published game and closes the flag in one operator call', async () => {
    const { app, store } = await makeApp();
    await store.setPublication({
      slug: 'sky-dodge',
      state: 'published',
      currentVersion: 'v3',
      publishedAt: '2026-09-01T00:00:00.000Z',
    });

    const raised = await raise(app, await cookie(app, 'reviewer'));
    const flagId = raised.json().flag.id as string;

    const resolved = await app.inject({
      method: 'POST',
      url: `/api/admin/moderation-flags/${encodeURIComponent(flagId)}/resolve`,
      headers: { cookie: await cookie(app, 'boss') },
      payload: { action: 'taken_down', note: 'removed, creator told' },
    });
    expect(resolved.statusCode).toBe(200);
    expect(resolved.json()).toMatchObject({ unpublished: true });
    expect(resolved.json().flag).toMatchObject({ status: 'resolved', action: 'taken_down' });

    const publication = await store.getPublication('sky-dodge');
    expect(publication?.state).toBe('archived');
    expect(publication?.takedownReason).toBe('moderation: hate');
  });

  it('also closes the public link on a shared draft that was never published', async () => {
    // A draft link distributes with no publication to archive.
    const { app, store } = await makeApp();
    const jobId = 4_242;
    await store.upsertUser({ uid: 'dev:creator' });
    await store.createSubmission(jobId, 'dev:creator', 'Sky Dodge');
    await store.setSubmissionSlug(jobId, 'sky-dodge');
    await store.setDraftShared(jobId, '2026-09-01T00:00:00.000Z');

    const raised = await raise(app, await cookie(app, 'reviewer'));
    const resolved = await app.inject({
      method: 'POST',
      url: `/api/admin/moderation-flags/${encodeURIComponent(raised.json().flag.id as string)}/resolve`,
      headers: { cookie: await cookie(app, 'boss') },
      payload: { action: 'taken_down' },
    });
    expect(resolved.statusCode).toBe(200);
    expect(resolved.json()).toMatchObject({ unpublished: false, unshared: true });
    expect((await store.getSubmission(jobId))?.draftSharedAt).toBeFalsy();
  });

  it('tells the operators a report landed, without making the reviewer wait on it', async () => {
    // The queue waits to be found, so raising pages instead.
    const { app, store } = await makeApp();
    await store.upsertUser({ uid: 'dev:boss' });

    const raised = await raise(app, await cookie(app, 'reviewer'));
    expect(raised.statusCode).toBe(200);

    const notifications = await store.listNotifications('dev:boss');
    const alert = notifications.find((row) => row.type === 'operator.moderation_flag');
    expect(alert).toBeTruthy();
    expect(alert?.params).toMatchObject({ title: 'sky-dodge', detail: 'hate' });
    expect(alert?.link).toBe('/admin/moderation');
  });

  it('still records the report when notifying the operators fails', async () => {
    const { app, store } = await makeApp();
    await store.upsertUser({ uid: 'dev:boss' });
    vi.spyOn(store, 'createNotification').mockRejectedValue(new Error('mailer down'));

    const raised = await raise(app, await cookie(app, 'reviewer'));
    expect(raised.statusCode).toBe(200);
    expect((await store.listModerationFlags()).length).toBe(1);
  });

  it('keeps a taken-down game down when the creator flips sharing back on', async () => {
    // The creator holds the token; unsharing alone is undoable.
    const { app, store } = await makeApp();
    const jobId = 4_243;
    await store.upsertUser({ uid: 'dev:creator' });
    await store.createSubmission(jobId, 'dev:creator', 'Sky Dodge');
    await store.setSubmissionSlug(jobId, 'sky-dodge');
    await store.setSubmissionDeliveredVersion(jobId, 'v1');
    await store.setDraftShared(jobId, '2026-09-01T00:00:00.000Z');

    const raised = await raise(app, await cookie(app, 'reviewer'));
    await app.inject({
      method: 'POST',
      url: `/api/admin/moderation-flags/${encodeURIComponent(raised.json().flag.id as string)}/resolve`,
      headers: { cookie: await cookie(app, 'boss') },
      payload: { action: 'taken_down' },
    });

    const back = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(jobId, secret)}/share`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken('dev:creator', sessionSecret)}` },
      payload: { shared: true },
    });
    expect(back.statusCode).toBe(409);
    expect(back.json()).toMatchObject({ error: 'moderation_blocked' });
    expect((await store.getSubmission(jobId))?.draftSharedAt).toBeFalsy();
  });

  it('says so when the game stays public because it is not the store lane', async () => {
    // Repo-lane games serve from the snapshot, not the store.
    const { app, store } = await makeApp({ published: ['sky-dodge'] });
    const raised = await raise(app, await cookie(app, 'reviewer'));

    const resolved = await app.inject({
      method: 'POST',
      url: `/api/admin/moderation-flags/${encodeURIComponent(raised.json().flag.id as string)}/resolve`,
      headers: { cookie: await cookie(app, 'boss') },
      payload: { action: 'taken_down' },
    });
    expect(resolved.json()).toMatchObject({ unpublished: false, stillPublic: true });
    expect(await store.getPublication('sky-dodge')).toBeNull();
  });

  it('refuses a second resolve rather than taking the game down twice', async () => {
    const { app } = await makeApp();
    const raised = await raise(app, await cookie(app, 'reviewer'));
    const id = encodeURIComponent(raised.json().flag.id as string);
    const url = `/api/admin/moderation-flags/${id}/resolve`;
    const boss = await cookie(app, 'boss');

    expect(
      (await app.inject({ method: 'POST', url, headers: { cookie: boss }, payload: { action: 'dismissed' } }))
        .statusCode,
    ).toBe(200);
    const again = await app.inject({
      method: 'POST',
      url,
      headers: { cookie: boss },
      payload: { action: 'taken_down' },
    });
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ error: 'already_resolved' });
  });

  it('records a dismissal without touching the game', async () => {
    const { app, store } = await makeApp();
    await store.setPublication({
      slug: 'sky-dodge',
      state: 'published',
      currentVersion: 'v3',
      publishedAt: '2026-09-01T00:00:00.000Z',
    });
    const raised = await raise(app, await cookie(app, 'reviewer'));

    const resolved = await app.inject({
      method: 'POST',
      url: `/api/admin/moderation-flags/${encodeURIComponent(raised.json().flag.id as string)}/resolve`,
      headers: { cookie: await cookie(app, 'boss') },
      payload: { action: 'dismissed', note: 'looked, it is a cartoon explosion' },
    });
    expect(resolved.statusCode).toBe(200);
    expect(resolved.json()).toMatchObject({ unpublished: false, unshared: false });
    expect((await store.getPublication('sky-dodge'))?.state).toBe('published');

    const open = await app.inject({
      method: 'GET',
      url: '/api/admin/moderation-flags',
      headers: { cookie: await cookie(app, 'boss') },
    });
    expect(open.json().flags).toHaveLength(0);
  });
});
