import { expect, it } from 'vitest';
import { buildApp } from '../platform/app.js';
import { InMemoryStore } from '../platform/store.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import type { GamesStore } from '../delivery/games-store.js';

const checklist = { graphics: 'ok', gameplay: 'ok', fun: 'ok', sound: 'ok', controls: 'ok' };
async function setup(mode: 'creator' | 'unshared' | 'published', targeted = false) {
  const store = new InMemoryStore();
  const at = new Date().toISOString();
  await store.upsertUser({ uid: 'owner' });
  await store.upsertUser({ uid: 'reviewer' });
  await store.createSubmission(1, 'owner', 'Public game');
  await store.setSubmissionSlug(1, 'public-game');
  await store.setSubmissionDeliveredVersion(1, 'v1');
  if (mode !== 'unshared') await store.setDraftShared(1, at);
  if (mode === 'published') await store.setSubmissionPublishedAt(1, at);
  await store.createReviewSweep({
    id: 'sweep',
    status: 'active',
    source: mode === 'creator' ? 'creator' : 'catalog',
    slugs: ['public-game'],
    releasedCount: 1,
    releasePerDay: null,
    startedAt: at,
    note: null,
    createdAt: at,
    createdBy: 'admin',
    updatedAt: at,
    updatedBy: 'admin',
    notifiedAt: null,
    notifiedCount: 0,
  });
  if (targeted)
    await store.upsertReReviewRequests([
      { slug: 'public-game', reviewerUid: 'reviewer', gameVersion: 'v1', reason: 'Another pass', createdBy: 'admin' },
    ]);
  const app = await buildApp({
    store,
    sessionSecret: 'secret',
    reviewerUids: 'reviewer',
    contentChecker: { check: async () => ({ allowed: true }), checkFields: async () => ({ allowed: true }) },
    reviewRoutes: {
      listCatalog: async () =>
        mode === 'creator' ? [] : [{ slug: 'public-game', title: 'Public game', creatorHandle: null }],
    },
    submissionRoutes: {
      agentChannel: {
        gamesStore: {
          getManifest: async () => ({ gate: { green: true } }),
          getDerivedArtifact: async (_slug: string, version: string) => Buffer.from(`<title>${version}</title>`),
        } as unknown as GamesStore,
      },
    },
  });
  const headers = { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken('reviewer', 'secret')}` };
  return { store, app, headers };
}

it.each(['unshared', 'published'] as const)('can assess a catalog game with a %s sibling', async (mode) => {
  const { app, headers, store } = await setup(mode);
  try {
    const queue = await app.inject({ method: 'GET', url: '/api/review/queue', headers });
    expect(queue.json().items[0]).toMatchObject({ source: 'catalog', slug: 'public-game' });
    const assessment = await app.inject({
      method: 'POST',
      url: '/api/review/assessments',
      headers,
      payload: { slug: 'public-game', source: 'catalog', verdict: 'keep', note: 'Public game reviewed.', checklist },
    });
    expect(assessment.statusCode).toBe(200);
    expect((await store.listGameAssessmentsBySlug('public-game'))[0].source).toBe('catalog');
  } finally {
    await app.close();
  }
});

it.each([false, true])('refreshes a cached candidate after redelivery (targeted: %s)', async (targeted) => {
  const { app, headers, store } = await setup('creator', targeted);
  try {
    const first = await app.inject({ method: 'GET', url: '/api/review/queue', headers });
    expect(first.json().items[0].gameVersion).toBe('v1');
    await store.setSubmissionDeliveredVersion(1, 'v2');
    const refreshed = await app.inject({ method: 'GET', url: '/api/review/queue', headers });
    expect(refreshed.json().items[0]).toMatchObject({ jobId: 1, gameVersion: 'v2' });
    const preview = await app.inject({ method: 'GET', url: '/api/review/games/public-game?version=v2', headers });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().html).toBe('<title>v2</title>');
    const assessment = await app.inject({
      method: 'POST',
      url: '/api/review/assessments',
      headers,
      payload: {
        slug: 'public-game',
        source: 'creator',
        gameVersion: 'v2',
        verdict: 'keep',
        note: 'Updated game reviewed.',
        checklist,
      },
    });
    expect(assessment.statusCode).toBe(200);
  } finally {
    await app.close();
  }
});
