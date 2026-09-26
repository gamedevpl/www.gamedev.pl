import { describe, expect, it, vi } from 'vitest';
import type { CreatorHealthResponse } from './creator-studio.js';
import { buildApp } from '../platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import { FirestoreStore, InMemoryStore, type Store } from '../platform/store.js';
import { fakeFirestore } from '../store/fake-firestore.js';
import { MAX_STUDIO_HEALTH_QUERIES, MAX_STUDIO_HEALTH_SCANS_PER_HOUR } from './studio-health-scan.js';
import { clearStudioHealthCache } from './studio-health-cache.js';

const sessionSecret = 'dev-session-secret-change-me';
const submissionTokenSecret = 'test-submission-secret';
const today = new Date().toISOString().slice(0, 10);
const authHeaders = () => ({ cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken('g:creator', sessionSecret)}` });

async function publishGames(store: InMemoryStore, count: number): Promise<void> {
  for (let game = 0; game < count; game++) {
    const jobId = game + 1;
    await store.createSubmission(jobId, 'g:creator', `Game ${game}`);
    await store.setSubmissionSlug(jobId, `game-${game}`);
    await store.setSubmissionPublishedAt(jobId, `${today}T12:00:00.000Z`);
  }
}

describe('GET /api/me/studio/health workload limits', () => {
  it('bounds empty telemetry partition queries', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:creator' });
    await publishGames(store, 50);
    const scan = vi.spyOn(store, 'listTelemetryEvents');
    const app = await buildApp({ store, sessionSecret, submissionRoutes: { submissionTokenSecret } });
    const res = await app.inject({ method: 'GET', url: '/api/me/studio/health?days=30', headers: authHeaders() });

    expect(res.statusCode).toBe(200);
    expect(scan).toHaveBeenCalledTimes(MAX_STUDIO_HEALTH_QUERIES);
    expect((res.json() as CreatorHealthResponse).truncated).toBe(true);
    await app.close();
  });

  it('does not limit cache hits or empty shelves', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:creator' });
    const app = await buildApp({ store, sessionSecret, submissionRoutes: { submissionTokenSecret } });
    const statuses = [];
    for (let request = 0; request < 15; request++) {
      statuses.push(
        (await app.inject({ method: 'GET', url: '/api/me/studio/health', headers: authHeaders() })).statusCode,
      );
    }
    await publishGames(store, 1);
    const scan = vi.spyOn(store, 'listTelemetryEvents');
    for (let request = 0; request < MAX_STUDIO_HEALTH_SCANS_PER_HOUR + 10; request++) {
      statuses.push(
        (await app.inject({ method: 'GET', url: '/api/me/studio/health', headers: authHeaders() })).statusCode,
      );
    }

    expect(statuses.every((status) => status === 200)).toBe(true);
    expect(scan).toHaveBeenCalledTimes(7);
    await app.close();
  });

  it('shares the uncached scan budget across instances', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${today}T12:30:00.000Z`));
    try {
      const store = new InMemoryStore();
      await store.upsertUser({ uid: 'g:creator' });
      await publishGames(store, 1);
      const apps = [
        await buildApp({ store, sessionSecret, submissionRoutes: { submissionTokenSecret } }),
        await buildApp({ store, sessionSecret, submissionRoutes: { submissionTokenSecret } }),
      ];
      const responses = [];
      for (let request = 0; request <= MAX_STUDIO_HEALTH_SCANS_PER_HOUR; request++) {
        clearStudioHealthCache(store);
        const app = apps[request % 2]!;
        responses.push(await app.inject({ method: 'GET', url: '/api/me/studio/health', headers: authHeaders() }));
      }

      expect(responses.slice(0, -1).every((response) => response.statusCode === 200)).toBe(true);
      const refused = responses.at(-1)!;
      expect(refused.statusCode).toBe(429);
      expect(refused.headers['retry-after']).toBe('1800');
      await Promise.all(apps.map((app) => app.close()));
    } finally {
      vi.useRealTimers();
    }
  });
});

describe.each<[string, () => Store]>([
  ['InMemoryStore', () => new InMemoryStore()],
  ['FirestoreStore(fake)', () => new FirestoreStore(fakeFirestore().db)],
])('%s studio health scan counter', (_name, makeStore) => {
  it('counts per creator per hour up to the limit', async () => {
    const store = makeStore();
    expect(await store.checkAndIncrementStudioHealthScans('g:a', '2026-09-26T12', 2)).toEqual({
      allowed: true,
      current: 1,
    });
    expect(await store.checkAndIncrementStudioHealthScans('g:a', '2026-09-26T12', 2)).toEqual({
      allowed: true,
      current: 2,
    });
    expect(await store.checkAndIncrementStudioHealthScans('g:a', '2026-09-26T12', 2)).toEqual({
      allowed: false,
      current: 2,
    });
    expect((await store.checkAndIncrementStudioHealthScans('g:a', '2026-09-26T13', 2)).allowed).toBe(true);
    expect((await store.checkAndIncrementStudioHealthScans('g:b', '2026-09-26T12', 2)).allowed).toBe(true);
    expect((await store.getUsage('g:a', '2026-09-26')).submissions).toBe(0);
  });
});
