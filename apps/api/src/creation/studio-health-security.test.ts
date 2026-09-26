import { describe, expect, it, vi } from 'vitest';
import type { CreatorHealthResponse } from './creator-studio.js';
import { buildApp } from '../platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import { InMemoryStore } from '../platform/store.js';
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

  it('budgets uncached scans per creator', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:creator' });
    await publishGames(store, 1);
    const app = await buildApp({ store, sessionSecret, submissionRoutes: { submissionTokenSecret } });
    const responses = [];
    for (let request = 0; request <= MAX_STUDIO_HEALTH_SCANS_PER_HOUR; request++) {
      clearStudioHealthCache(store);
      responses.push(await app.inject({ method: 'GET', url: '/api/me/studio/health', headers: authHeaders() }));
    }

    expect(responses.slice(0, -1).every((response) => response.statusCode === 200)).toBe(true);
    const refused = responses.at(-1)!;
    expect(refused.statusCode).toBe(429);
    expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
    await app.close();
  });
});
