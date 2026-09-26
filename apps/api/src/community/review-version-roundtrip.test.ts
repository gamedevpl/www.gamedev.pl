import type { GamesStore } from '../delivery/games-store.js';
import { expect, it } from 'vitest';
import { buildApp } from '../platform/app.js';
import { InMemoryStore } from '../platform/store.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import { decideEditorialClearance } from './editorial-clearance.js';

it('binds a normal creator review to its queued candidate and excludes later deliveries', async () => {
  const store = new InMemoryStore();
  await store.upsertUser({ uid: 'g:owner' });
  await store.upsertUser({ uid: 'g:reviewer' });
  await store.createSubmission(42, 'g:owner', 'Creator game');
  await store.setSubmissionSlug(42, 'creator-game');
  await store.setSubmissionDeliveredVersion(42, 'v1');
  await store.setDraftShared(42, new Date().toISOString());
  const at = new Date().toISOString();
  await store.createReviewSweep({
    id: 'version-sweep',
    status: 'active',
    source: 'creator',
    slugs: ['creator-game'],
    releasedCount: 1,
    releasePerDay: null,
    startedAt: at,
    note: null,
    createdAt: at,
    createdBy: 'g:admin',
    updatedAt: at,
    updatedBy: 'g:admin',
    notifiedAt: null,
    notifiedCount: 0,
  });
  const secret = 'review-fixture-secret';
  const app = await buildApp({
    store,
    sessionSecret: secret,
    reviewerUids: 'g:reviewer',
    contentChecker: { check: async () => ({ allowed: true }), checkFields: async () => ({ allowed: true }) },
    reviewRoutes: { listCatalog: async () => [] },
    submissionRoutes: {
      agentChannel: {
        gamesStore: {
          getManifest: async () => ({ gate: { green: true } }),
          getDerivedArtifact: async (_slug: string, version: string) => Buffer.from(`<title>${version}</title>`),
        } as unknown as GamesStore,
      },
    },
  });
  const headers = { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken('g:reviewer', secret)}` };
  try {
    const response = await app.inject({ method: 'GET', url: '/api/review/queue?source=creator', headers });
    expect(response.statusCode).toBe(200);
    const item = response.json().items[0] as { slug: string; source: string; gameVersion?: string };
    expect(item.gameVersion).toBe('v1');
    const preview = await app.inject({ method: 'GET', url: '/api/review/games/creator-game?version=v1', headers });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().html).toBe('<title>v1</title>');
    const owner = { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken('g:owner', secret)}` };
    expect(
      (await app.inject({ method: 'GET', url: '/api/review/games/creator-game?version=v1', headers: owner }))
        .statusCode,
    ).toBe(404);
    const posted = await app.inject({
      method: 'POST',
      url: '/api/review/assessments',
      headers,
      payload: {
        slug: item.slug,
        source: item.source,
        gameVersion: item.gameVersion,
        verdict: 'keep',
        note: 'Solid game.',
        checklist: { graphics: 'ok', gameplay: 'ok', fun: 'ok', sound: 'ok', controls: 'ok' },
      },
    });
    expect(posted.statusCode).toBe(200);
    const rows = await store.listGameAssessmentsBySlug('creator-game');
    expect(rows[0].gameVersion).toBe('v1');
    expect(decideEditorialClearance(rows, 'creator-game', 'v1').decision).toBe('clear');
    await store.setSubmissionDeliveredVersion(42, 'v2');
    const moved = await app.inject({ method: 'GET', url: '/api/review/games/creator-game?version=v1', headers });
    expect(moved.statusCode).toBe(409);
    expect(decideEditorialClearance(rows, 'creator-game', 'v2').decision).toBe('pending');
  } finally {
    await app.close();
  }
});
