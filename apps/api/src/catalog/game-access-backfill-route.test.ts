import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../platform/app.js';
import { InMemoryStore } from '../platform/store.js';
import { opsHeaders, opsTestVerifier, opsUrl } from '../platform/ops-console.fixture.js';
import type { CatalogGameEntry, GitHubClient } from './github-client.js';
import type { GameSnapshotReader } from './game-snapshot.js';

const secret = 'dev-session-secret-change-me';

const repoEntry = (slug: string): CatalogGameEntry => ({ slug, title: slug, description: '' }) as CatalogGameEntry;

describe('game access backfill route', () => {
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

  afterEach(async () => {
    failCatalog = false;
    while (apps.length) await apps.pop()!.close();
  });

  let failCatalog = false;

  async function makeApp(catalog: CatalogGameEntry[] | Error, onCatalogRead?: () => void) {
    const store = new InMemoryStore();
    const app = await buildApp({
      store,
      sessionSecret: secret,
      adminUids: 'dev:boss',
      opsConsole: { verifier: opsTestVerifier },
      submissionRoutes: {
        githubToken: 'token',
        submissionTokenSecret: 'test-submission-secret',
        snapshotReader: null,
        githubClient: {
          getCatalog: async () => {
            onCatalogRead?.();
            if (failCatalog) throw new Error('catalog refresh failed');
            if (catalog instanceof Error) throw catalog;
            return catalog;
          },
        } as unknown as GitHubClient,
      },
    });
    apps.push(app);

    // Operator routes answer only through the ops console door.
    await store.upsertUser({ uid: 'dev:boss' });
    return { app, store, headers: opsHeaders('dev:boss') };
  }

  it('covers a repo-lane game with no submission, publication or community data', async () => {
    const { app, headers } = await makeApp([repoEntry('repo-only')]);

    const response = await app.inject({
      method: 'POST',
      url: opsUrl('/api/admin/game-access-backfill?dryRun=1'),
      headers,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ scanned: 1, quarantined: ['repo-only'] });
  });

  it('refuses rather than reporting coverage it cannot establish', async () => {
    const { app, headers } = await makeApp(new Error('catalog down'));

    const response = await app.inject({
      method: 'POST',
      url: opsUrl('/api/admin/game-access-backfill?dryRun=1'),
      headers,
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ error: 'catalog_unavailable' });
  });

  it('scans a private draft alongside the repo catalog', async () => {
    const { app, store, headers } = await makeApp([repoEntry('repo-only')]);
    await store.upsertUser({ uid: 'g:ada', name: 'Ada' });
    await store.createSubmission(1, 'g:ada', 'Orbital Dogfight');
    await store.setSubmissionSlug(1, 'orbital-dogfight');

    const response = await app.inject({
      method: 'POST',
      url: opsUrl('/api/admin/game-access-backfill?dryRun=1'),
      headers,
    });

    expect(response.json()).toMatchObject({ scanned: 2, quarantined: ['repo-only'] });
  });

  it('stays admin-only', async () => {
    const { app } = await makeApp([]);

    const response = await app.inject({ method: 'POST', url: '/api/admin/game-access-backfill' });

    expect(response.statusCode).toBe(404);
  });

  it('reads the catalog itself rather than trusting a warm cache', async () => {
    let reads = 0;
    const { app, headers } = await makeApp([repoEntry('repo-only')], () => {
      reads += 1;
    });

    // Warm the shared cache the way ordinary traffic does.
    await app.inject({ method: 'GET', url: '/api/catalog' });
    const warmed = reads;

    await app.inject({ method: 'POST', url: opsUrl('/api/admin/game-access-backfill?dryRun=1'), headers });

    expect(reads).toBe(warmed + 1);
  });

  it('bypasses the snapshot pointer cache, not just its own cache', async () => {
    let freshReads = 0;
    let cachedReads = 0;
    const pointerHealthy = true;
    const reader: GameSnapshotReader = {
      getPointer: async () => (pointerHealthy ? { snapshotId: 's1' } : null),
      getCatalog: async () => {
        cachedReads += 1;
        return [{ slug: 'repo-only', title: 'repo-only', description: '' } as CatalogGameEntry];
      },
      getCatalogFresh: async () => {
        freshReads += 1;
        // A fresh read must not reuse a cached pointer.
        return pointerHealthy ? [{ slug: 'repo-only', title: 'repo-only', description: '' } as CatalogGameEntry] : null;
      },
      getGame: async () => null,
      getMedia: async () => null,
    };

    const store = new InMemoryStore();
    const app = await buildApp({
      store,
      sessionSecret: secret,
      adminUids: 'dev:boss',
      opsConsole: { verifier: opsTestVerifier },
      submissionRoutes: {
        githubToken: 'token',
        submissionTokenSecret: 'test-submission-secret',
        snapshotReader: reader,
      },
    });
    apps.push(app);
    await store.upsertUser({ uid: 'dev:boss' });
    const headers = opsHeaders('dev:boss');

    // Warm the app-level cache the way ordinary traffic does.
    await app.inject({ method: 'GET', url: '/api/catalog' });
    expect(cachedReads).toBe(1);
    expect(freshReads).toBe(0);

    const response = await app.inject({
      method: 'POST',
      url: opsUrl('/api/admin/game-access-backfill?dryRun=1'),
      headers,
    });

    expect(response.statusCode).toBe(200);
    expect(freshReads).toBe(1);
    expect(cachedReads).toBe(1);
  });

  it('refuses once refreshes fail, even while the cache still serves', async () => {
    const { app, headers } = await makeApp([repoEntry('repo-only')]);

    // The warm cache keeps serving; only a fresh read sees the failure.
    await app.inject({ method: 'GET', url: '/api/catalog' });
    failCatalog = true;
    expect((await app.inject({ method: 'GET', url: '/api/catalog' })).statusCode).toBe(200);

    const response = await app.inject({
      method: 'POST',
      url: opsUrl('/api/admin/game-access-backfill?dryRun=1'),
      headers,
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ error: 'catalog_unavailable' });
  });
});
