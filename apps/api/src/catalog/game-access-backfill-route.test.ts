import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../platform/app.js';
import { InMemoryStore } from '../platform/store.js';
import { SESSION_COOKIE_NAME } from '../platform/auth.js';
import type { CatalogGameEntry, GitHubClient } from './github-client.js';

const secret = 'dev-session-secret-change-me';

const repoEntry = (slug: string): CatalogGameEntry => ({ slug, title: slug, description: '' }) as CatalogGameEntry;

describe('game access backfill route', () => {
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

  afterEach(async () => {
    while (apps.length) await apps.pop()!.close();
  });

  async function makeApp(catalog: CatalogGameEntry[] | Error) {
    const store = new InMemoryStore();
    const app = await buildApp({
      store,
      sessionSecret: secret,
      adminUids: 'dev:boss',
      submissionRoutes: {
        githubToken: 'token',
        submissionTokenSecret: 'test-submission-secret',
        snapshotReader: null,
        githubClient: {
          getCatalog: async () => {
            if (catalog instanceof Error) throw catalog;
            return catalog;
          },
        } as unknown as GitHubClient,
      },
    });
    apps.push(app);

    // Admin needs a session, not a token.
    const session = await app.inject({ method: 'POST', url: '/api/auth/dev', payload: { uid: 'boss' } });
    const cookie = `${SESSION_COOKIE_NAME}=${session.cookies.find((c) => c.name === SESSION_COOKIE_NAME)!.value}`;
    return { app, store, cookie };
  }

  it('covers a repo-lane game with no submission, publication or community data', async () => {
    const { app, cookie } = await makeApp([repoEntry('repo-only')]);

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/game-access-backfill?dryRun=1',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ scanned: 1, quarantined: ['repo-only'] });
  });

  it('refuses rather than reporting coverage it cannot establish', async () => {
    const { app, cookie } = await makeApp(new Error('catalog down'));

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/game-access-backfill?dryRun=1',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ error: 'catalog_unavailable' });
  });

  it('scans a private draft alongside the repo catalog', async () => {
    const { app, store, cookie } = await makeApp([repoEntry('repo-only')]);
    await store.upsertUser({ uid: 'g:ada', name: 'Ada' });
    await store.createSubmission(1, 'g:ada', 'Orbital Dogfight');
    await store.setSubmissionSlug(1, 'orbital-dogfight');

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/game-access-backfill?dryRun=1',
      headers: { cookie },
    });

    expect(response.json()).toMatchObject({ scanned: 2, quarantined: ['repo-only'] });
  });

  it('stays admin-only', async () => {
    const { app } = await makeApp([]);

    const response = await app.inject({ method: 'POST', url: '/api/admin/game-access-backfill' });

    expect(response.statusCode).toBe(404);
  });
});
