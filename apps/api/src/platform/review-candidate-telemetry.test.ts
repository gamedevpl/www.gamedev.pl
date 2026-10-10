import { expect, it } from 'vitest';
import { buildApp } from './app.js';
import { InMemoryStore } from './store.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './auth.js';
import { createPublishedSlugGate } from '../catalog/published-slugs.js';

it.each([
  ['g:reviewer', 'shared', 2],
  ['g:admin', 'shared', 2],
  ['g:player', 'shared', 0],
  [null, 'shared', 0],
  ['g:reviewer', 'unshared', 0],
  ['g:reviewer', 'undelivered', 0],
  ['g:reviewer', 'abandoned', 0],
  ['g:reviewer', 'unknown', 0],
] as const)('accepts candidate telemetry only for authorized review: %s, %s', async (uid, state, accepted) => {
  const store = new InMemoryStore();
  for (const user of ['g:reviewer', 'g:admin', 'g:player']) await store.upsertUser({ uid: user });
  const date = new Date().toISOString().slice(0, 10);
  const at = new Date().toISOString();
  if (state !== 'unknown') {
    await store.createSubmission(42, 'g:player', 'Candidate');
    await store.setSubmissionSlug(42, 'candidate-game');
    if (state !== 'undelivered') await store.setSubmissionDeliveredVersion(42, 'v1');
    if (state !== 'unshared') await store.setDraftShared(42, at);
    if (state === 'abandoned') await store.setSubmissionAbandoned(42, at);
  }
  const secret = 'dev-session-secret-change-me';
  const app = await buildApp({
    store,
    sessionSecret: secret,
    reviewerUids: 'g:reviewer',
    adminUids: 'g:admin',
    telemetryRoutes: { publishedSlugs: createPublishedSlugGate({ client: { getCatalog: async () => [] } }) },
  });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/telemetry',
      headers: uid ? { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, secret)}` } : {},
      payload: {
        slug: 'candidate-game',
        sessionId: '00000000-0000-4000-8000-000000000123',
        reviewer: true,
        events: [
          { type: 'game_opened', artifactVersion: 'a'.repeat(64) },
          { type: 'alive', frames: 300 },
        ],
      },
    });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ accepted });
    const events = await store.listTelemetryEvents(date);
    expect(events).toHaveLength(accepted);
    if (accepted) {
      expect(events.every((event) => event.reviewer === true)).toBe(true);
      expect(events[0].artifactVersion).toBe('a'.repeat(64));
      expect(JSON.stringify(events)).not.toMatch(/g:reviewer|g:admin|g:player/);
    }
  } finally {
    await app.close();
  }
});
