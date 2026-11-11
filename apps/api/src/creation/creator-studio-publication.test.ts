import { afterEach, expect, it, vi } from 'vitest';
import { buildApp } from '../platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import { InMemoryStore } from '../platform/store.js';
import type { StudioGame } from '@gamedevpl/contract';
import type { FastifyInstance } from 'fastify';

const sessionSecret = 'dev-session-secret-change-me';
const submissionTokenSecret = 'test-submission-secret';
const today = '2026-11-10';
const apps: FastifyInstance[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});
function authHeaders(uid: string) {
  return { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}` };
}

it.each(['published', 'archived', 'disabled'] as const)(
  'reports only the current public registry version: %s',
  async (state) => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:creator' });
    await store.createSubmission(22, 'g:creator', 'Cozycraft');
    await store.setSubmissionSlug(22, 'cozycraft');
    await store.setSubmissionPublishedAt(22, `${today}T10:00:00.000Z`);
    await store.setSubmissionDeliveredVersion(22, 'newer-candidate');
    await store.setPublication({
      slug: 'cozycraft',
      state,
      currentVersion: 'public-version',
      publishedAt: `${today}T10:00:00.000Z`,
    });
    const getPublication = vi.spyOn(store, 'getPublication');
    const app = await buildApp({ store, sessionSecret, submissionRoutes: { submissionTokenSecret } });
    apps.push(app);
    const res = await app.inject({ method: 'GET', url: '/api/me/studio', headers: authHeaders('g:creator') });
    expect(res.statusCode).toBe(200);
    const [game] = (res.json() as { games: StudioGame[] }).games;
    expect(game?.publishedVersion).toBe(state === 'published' ? 'public-version' : undefined);
    expect(game?.live).toBe(state === 'published' ? undefined : false);
    expect(getPublication).toHaveBeenCalledTimes(1);
  },
);
