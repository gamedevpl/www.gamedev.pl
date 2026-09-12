// Abuse needs no consensus: one credible report, one operator, one takedown.

import { afterEach, describe, expect, it } from 'vitest';
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

describe('moderation flags', () => {
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

  afterEach(async () => {
    while (apps.length) await apps.pop()!.close();
  });

  async function cookie(app: Awaited<ReturnType<typeof buildApp>>, handle: string): Promise<string> {
    const res = await app.inject({ method: 'POST', url: '/api/auth/dev', payload: { uid: handle } });
    return `${SESSION_COOKIE_NAME}=${res.cookies.find((c) => c.name === SESSION_COOKIE_NAME)!.value}`;
  }

  async function makeApp() {
    const store = new InMemoryStore();
    const app = await buildApp({
      store,
      contentChecker: allowAll,
      reviewerUids: 'dev:reviewer',
      adminUids: 'dev:boss',
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
