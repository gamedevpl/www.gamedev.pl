import { describe, expect, it, vi } from 'vitest';
import type { CreatorHealthResponse } from './creator-studio.js';
import { buildApp } from '../platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import { InMemoryStore } from '../platform/store.js';
import { MAX_STUDIO_HEALTH_QUERIES } from './studio-health-scan.js';

const sessionSecret = 'dev-session-secret-change-me';
const submissionTokenSecret = 'test-submission-secret';
const today = new Date().toISOString().slice(0, 10);
const authHeaders = () => ({ cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken('g:creator', sessionSecret)}` });

describe('GET /api/me/studio/health workload limits', () => {
  it('bounds empty telemetry partition queries', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:creator' });
    for (let game = 0; game < 50; game++) {
      const jobId = game + 1;
      await store.createSubmission(jobId, 'g:creator', `Game ${game}`);
      await store.setSubmissionSlug(jobId, `game-${game}`);
      await store.setSubmissionPublishedAt(jobId, `${today}T12:00:00.000Z`);
    }
    const scan = vi.spyOn(store, 'listTelemetryEvents');
    const app = await buildApp({ store, sessionSecret, submissionRoutes: { submissionTokenSecret } });
    const res = await app.inject({ method: 'GET', url: '/api/me/studio/health?days=30', headers: authHeaders() });

    expect(res.statusCode).toBe(200);
    expect(scan).toHaveBeenCalledTimes(MAX_STUDIO_HEALTH_QUERIES);
    expect((res.json() as CreatorHealthResponse).truncated).toBe(true);
    await app.close();
  });

  it('rate-limits repeated health requests', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:creator' });
    const app = await buildApp({ store, sessionSecret, submissionRoutes: { submissionTokenSecret } });
    const responses = [];
    for (let request = 0; request < 13; request++) {
      responses.push(await app.inject({ method: 'GET', url: '/api/me/studio/health', headers: authHeaders() }));
    }

    expect(responses.filter((response) => response.statusCode === 200)).toHaveLength(12);
    expect(responses.filter((response) => response.statusCode === 429)).toHaveLength(1);
    await app.close();
  });
});
