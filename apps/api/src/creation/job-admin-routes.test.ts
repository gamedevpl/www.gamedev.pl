import { describe, expect, it } from 'vitest';
import { buildApp } from '../platform/app.js';
import { opsHeaders, opsTestVerifier, opsUrl } from '../platform/ops-console.fixture.js';
import type { GamesStore } from '../delivery/games-store.js';
import { InMemoryStore } from '../platform/store.js';

describe('GET /api/admin/jobs/:jobId/preview', () => {
  const sessionSecret = 'dev-session-secret-change-me';
  const adminHeaders = opsHeaders('g:boss');

  function gamesStoreWith(bundleHtml: string | null) {
    return {
      getDerivedArtifact: async (_slug: string, _version: string, artifact: string) => {
        if (!bundleHtml) return null;
        if (artifact === 'bundle.html') return Buffer.from(bundleHtml, 'utf8');
        return null;
      },
    } as unknown as GamesStore;
  }

  async function appWithJob(gamesStore: GamesStore) {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:boss' });
    await store.createSubmission(1_000_001, 'g:boss', 'Comet Courier');
    await store.setSubmissionSlug(1_000_001, 'comet-courier');
    await store.setSubmissionDeliveredVersion(1_000_001, 'v1');
    const app = await buildApp({
      store,
      sessionSecret,
      adminUids: 'g:boss',
      opsConsole: { verifier: opsTestVerifier },
      submissionRoutes: { agentChannel: { gamesStore } },
    });
    return { app, store };
  }

  it('serves the game preview HTML for an admin', async () => {
    const { app } = await appWithJob(gamesStoreWith('<!doctype html><html><body>Game Preview</body></html>'));

    const response = await app.inject({
      method: 'GET',
      url: opsUrl('/api/admin/jobs/1000001/preview'),
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.slug).toBe('comet-courier');
    expect(body.title).toBe('Comet Courier');
    expect(body.version).toBe('v1');
    expect(body.html).toContain('Game Preview');

    await app.close();
  });

  it('returns 404 for a non-admin operator', async () => {
    const { app, store } = await appWithJob(gamesStoreWith('<html>preview</html>'));
    await store.upsertUser({ uid: 'g:regular' });

    const response = await app.inject({
      method: 'GET',
      url: opsUrl('/api/admin/jobs/1000001/preview'),
      headers: opsHeaders('g:regular'),
    });

    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('returns 409 if no version is delivered or previewable', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:boss' });
    await store.createSubmission(1_000_002, 'g:boss', 'Empty Job');
    const app = await buildApp({
      store,
      sessionSecret,
      adminUids: 'g:boss',
      opsConsole: { verifier: opsTestVerifier },
      submissionRoutes: { agentChannel: { gamesStore: gamesStoreWith('<html>preview</html>') } },
    });

    const response = await app.inject({
      method: 'GET',
      url: opsUrl('/api/admin/jobs/1000002/preview'),
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('no_preview_available');
    await app.close();
  });
});
