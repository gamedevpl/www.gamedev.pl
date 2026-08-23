import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './auth.js';
import type { GamesStore } from './delivery/games-store.js';
import type { CatalogGameEntry, GitHubClient } from './catalog/github-client.js';
import { InMemoryStore } from './store.js';

const sessionSecret = 'dev-session-secret-change-me';

function authCookie(uid: string): string {
  return `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}`;
}

describe('creator profile routes', () => {
  const apps: Array<{ close: () => Promise<void> }> = [];
  afterEach(async () => {
    while (apps.length) await apps.pop()!.close();
  });

  async function appWith(store: InMemoryStore, gamesStore?: GamesStore, repoCatalog?: CatalogGameEntry[]) {
    const app = await buildApp({
      store,
      sessionSecret,
      submissionRoutes:
        gamesStore || repoCatalog
          ? {
              agentChannel: { gamesStore },
              ...(repoCatalog
                ? {
                    githubToken: 'test-github-token',
                    submissionTokenSecret: 'test-submission-secret',
                    snapshotReader: null,
                    githubClient: {
                      getCatalog: async () => repoCatalog,
                    } as unknown as GitHubClient,
                  }
                : {}),
            }
          : undefined,
    });
    apps.push(app);
    return app;
  }

  function daysAgo(days: number): string {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  }

  it('claims a handle, edits the profile, and serves the public page', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:creator', name: 'Secret Google', picture: 'https://g/p.jpg' });
    const app = await appWith(store);

    const claim = await app.inject({
      method: 'POST',
      url: '/api/me/profile/handle',
      headers: { cookie: authCookie('g:creator') },
      payload: { handle: 'ada' },
    });
    expect(claim.statusCode).toBe(200);
    expect(claim.json()).toMatchObject({
      publishReady: true,
      // Lettermark by default — Google picture stays private until opted in.
      profile: { handle: 'ada', profileName: 'ada', avatarUrl: null },
    });

    const update = await app.inject({
      method: 'PUT',
      url: '/api/me/profile',
      headers: { cookie: authCookie('g:creator') },
      payload: { profileName: 'Ada Lovelace', bio: 'Builds tiny worlds.', avatarMode: 'google' },
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().profile).toMatchObject({
      handle: 'ada',
      profileName: 'Ada Lovelace',
      bio: 'Builds tiny worlds.',
      avatarUrl: 'https://g/p.jpg',
    });

    await store.createSubmission(42, 'g:creator', 'Sky Dodge');
    await store.setSubmissionSlug(42, 'sky-dodge');
    await store.setSubmissionPublishedAt(42, '2026-08-01T12:00:00.000Z');
    await store.setPublication({
      slug: 'sky-dodge',
      state: 'published',
      currentVersion: 'v1',
      publishedAt: '2026-08-01T12:00:00.000Z',
    });
    await store.createSubmission(43, 'g:creator', 'Archived Asteroids');
    await store.setSubmissionSlug(43, 'archived-asteroids');
    await store.setSubmissionPublishedAt(43, '2026-07-01T12:00:00.000Z');
    await store.setPublication({
      slug: 'archived-asteroids',
      state: 'archived',
      currentVersion: 'v1',
      publishedAt: '2026-07-01T12:00:00.000Z',
    });

    const publicPage = await app.inject({ method: 'GET', url: '/api/creators/ada' });
    expect(publicPage.statusCode).toBe(200);
    const body = publicPage.json();
    expect(body.profile.profileName).toBe('Ada Lovelace');
    expect(body.games).toEqual([
      expect.objectContaining({
        slug: 'sky-dodge',
        title: 'Sky Dodge',
        submittedBy: 'Ada Lovelace',
        creatorHandle: 'ada',
      }),
    ]);
    // Archived / disabled publications stay off the public profile.
    expect(body.games.map((game: { slug: string }) => game.slug)).not.toContain('archived-asteroids');
    // Never leak the Google account name on the public page.
    expect(JSON.stringify(body)).not.toContain('Secret Google');
  });

  it('lists one card per slug when a published improvement shares the slug', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:creator' });
    await store.claimHandle('g:creator', 'ada', '2026-07-01T00:00:00.000Z');
    await store.createSubmission(42, 'g:creator', 'TV Tycoon');
    await store.setSubmissionSlug(42, 'tv-tycoon');
    await store.setSubmissionPublishedAt(42, '2026-07-01T12:00:00.000Z');
    // Improvement job: same slug, newer, also published — the Studio shelf collapses
    // these; the public profile must too.
    await store.createSubmission(43, 'g:creator', 'TV Tycoon');
    await store.setSubmissionSlug(43, 'tv-tycoon');
    await store.setSubmissionPublishedAt(43, '2026-08-01T12:00:00.000Z');
    await store.setPublication({
      slug: 'tv-tycoon',
      state: 'published',
      currentVersion: 'v2',
      publishedAt: '2026-08-01T12:00:00.000Z',
    });
    const app = await appWith(store);

    const publicPage = await app.inject({ method: 'GET', url: '/api/creators/ada' });
    expect(publicPage.statusCode).toBe(200);
    expect(publicPage.json().games).toEqual([
      expect.objectContaining({ slug: 'tv-tycoon', title: 'TV Tycoon', creatorHandle: 'ada' }),
    ]);
  });

  it('includes gate screenshots in published game cards', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:creator' });
    await store.claimHandle('g:creator', 'ada', '2026-07-01T00:00:00.000Z');
    await store.createSubmission(42, 'g:creator', 'Sky Dodge');
    await store.setSubmissionSlug(42, 'sky-dodge');
    await store.setSubmissionPublishedAt(42, '2026-08-01T12:00:00.000Z');
    await store.setPublication({
      slug: 'sky-dodge',
      state: 'published',
      currentVersion: 'v1',
      publishedAt: '2026-08-01T12:00:00.000Z',
    });
    const gamesStore = {
      getSourceFile: async (_slug: string, _version: string, path: string) =>
        path === 'SPEC.md' ? '---\ntitle: Sky Dodge\ngenre: arcade\n---\n' : null,
      getDerivedArtifact: async (_slug: string, _version: string, path: string) =>
        path === 'media/metadata.json'
          ? Buffer.from(JSON.stringify({ captures: { opening: { file: 'opening.png' } }, video: null }))
          : null,
    } as unknown as GamesStore;
    const app = await appWith(store, gamesStore);

    const publicPage = await app.inject({ method: 'GET', url: '/api/creators/ada' });

    expect(publicPage.statusCode).toBe(200);
    expect(publicPage.json().games[0]).toMatchObject({
      slug: 'sky-dodge',
      media: { screenshots: [{ name: 'opening', file: 'opening.png' }], video: null },
    });
  });

  it('uses repo catalog media when a migrated game also exists in the delivery store', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:creator' });
    await store.claimHandle('g:creator', 'ada', '2026-07-01T00:00:00.000Z');
    await store.createSubmission(42, 'g:creator', 'Store Title');
    await store.setSubmissionSlug(42, 'sky-dodge');
    await store.setSubmissionPublishedAt(42, '2026-08-01T12:00:00.000Z');
    await store.setPublication({
      slug: 'sky-dodge',
      state: 'published',
      currentVersion: 'v1',
      publishedAt: '2026-08-01T12:00:00.000Z',
    });
    const gamesStore = {
      getSourceFile: async () => '---\ntitle: Store Title\ngenre: arcade\n---\n',
      getDerivedArtifact: async () =>
        Buffer.from(JSON.stringify({ captures: { opening: { file: 'store-opening.png' } }, video: null })),
    } as unknown as GamesStore;
    const repoEntry: CatalogGameEntry = {
      slug: 'sky-dodge',
      title: 'Repo Title',
      genre: 'arcade',
      controls: '',
      status: 'published',
      media: { screenshots: [{ name: 'opening', file: 'repo-opening.png' }], video: null },
      multiplayer: null,
      saves: null,
      world: null,
      sensing: null,
      orientation: 'any',
      submittedBy: null,
    };
    const app = await appWith(store, gamesStore, [repoEntry]);

    const publicPage = await app.inject({ method: 'GET', url: '/api/creators/ada' });

    expect(publicPage.statusCode).toBe(200);
    expect(publicPage.json().games[0]).toMatchObject({
      slug: 'sky-dodge',
      title: 'Repo Title',
      media: { screenshots: [{ name: 'opening', file: 'repo-opening.png' }], video: null },
    });
  });

  it('reports availability and refuses reserved handles', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:a' });
    await store.upsertUser({ uid: 'g:b' });
    await store.claimHandle('g:a', 'taken_one', '2026-08-01T00:00:00.000Z');
    const app = await appWith(store);

    const reserved = await app.inject({
      method: 'GET',
      url: '/api/creators/admin/availability',
      headers: { cookie: authCookie('g:b') },
    });
    expect(reserved.json()).toMatchObject({ available: false, reason: 'reserved' });

    const taken = await app.inject({
      method: 'GET',
      url: '/api/creators/taken_one/availability',
      headers: { cookie: authCookie('g:b') },
    });
    expect(taken.json()).toMatchObject({ available: false, reason: 'taken' });

    const free = await app.inject({
      method: 'GET',
      url: '/api/creators/lovelace/availability',
      headers: { cookie: authCookie('g:b') },
    });
    expect(free.json()).toMatchObject({ available: true });
  });

  it('treats rename-cooldown handles as unavailable', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:a' });
    await store.upsertUser({ uid: 'g:b' });
    // First claim long enough ago to allow a rename; rename yesterday so the old
    // handle is still inside the 30-day hold for everyone else.
    await store.claimHandle('g:a', 'old_name', daysAgo(40));
    await store.claimHandle('g:a', 'new_name', daysAgo(1));
    const app = await appWith(store);

    const cooling = await app.inject({
      method: 'GET',
      url: '/api/creators/old_name/availability',
      headers: { cookie: authCookie('g:b') },
    });
    expect(cooling.json()).toMatchObject({ available: false, reason: 'taken' });

    const oldPage = await app.inject({ method: 'GET', url: '/api/creators/old_name' });
    expect(oldPage.statusCode).toBe(308);
    expect(oldPage.headers.location).toBe('/api/creators/new_name');
  });

  it('404s unknown creators', async () => {
    const app = await appWith(new InMemoryStore());
    const response = await app.inject({ method: 'GET', url: '/api/creators/nobody_here' });
    expect(response.statusCode).toBe(404);
  });
});
