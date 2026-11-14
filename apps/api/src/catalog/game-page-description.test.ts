import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../platform/app.js';
import type { GamesStore } from '../delivery/games-store.js';
import { extractManifestDescription, resolveGamePageDescriptions } from './game-page-description.js';
import type { CatalogGameEntry, GitHubClient } from './github-client.js';
import { withSnapshot } from './local-snapshot-reader.js';
import { InMemoryStore } from '../platform/store.js';

const sessionSecret = 'dev-session-secret-change-me';

const SPEC = [
  '---',
  'title: Cozycraft',
  'genre: sandbox dollhouse',
  'controls: drag and tap',
  '---',
  '',
  '## Concept',
  '',
  'Cozycraft is an open digital playground for children.',
].join('\n');

const GAME_JSON = JSON.stringify({
  description: {
    en: 'A cozy digital dollhouse town.',
    pl: 'Przytulne cyfrowe miasteczko dla lalek.',
  },
});

describe('game-page-description', () => {
  const apps: Array<{ close: () => Promise<void> }> = [];
  afterEach(async () => {
    while (apps.length) await apps.pop()!.close();
  });

  it('extracts localized description from GAME.json safely', () => {
    expect(
      extractManifestDescription(JSON.stringify({ description: { en: '  Hello\nworld ', pl: ' Cześć  świecie ' } })),
    ).toEqual({ en: 'Hello world', pl: 'Cześć świecie' });
    expect(extractManifestDescription(JSON.stringify({ description: 'Single string' }))).toEqual({
      en: 'Single string',
    });
    expect(extractManifestDescription('{not json')).toBeNull();
    expect(extractManifestDescription(JSON.stringify({ description: {} }))).toBeNull();
    expect(extractManifestDescription(null)).toBeNull();
  });

  it('falls back to SPEC.md when GAME.json is absent or lacks English copy', () => {
    expect(resolveGamePageDescriptions(SPEC, null)).toEqual({
      description: 'Cozycraft is an open digital playground for children.',
    });
    expect(resolveGamePageDescriptions(SPEC, JSON.stringify({ description: { pl: 'Tylko polski opis.' } }))).toEqual({
      description: 'Cozycraft is an open digital playground for children.',
      localizedDescription: {
        en: 'Cozycraft is an open digital playground for children.',
        pl: 'Tylko polski opis.',
      },
    });
  });

  it('serves localizedDescription from GAME.json for store-published and repo-published games', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:creator', name: 'Creator' });
    await store.claimHandle('g:creator', 'gtanczyk', '2026-07-01T00:00:00.000Z');
    await store.createSubmission(42, 'g:creator', 'Cozycraft');
    await store.setSubmissionSlug(42, 'cozycraft');
    await store.setSubmissionPublishedAt(42, '2026-08-01T12:00:00.000Z');
    await store.setPublication({
      slug: 'cozycraft',
      state: 'published',
      currentVersion: 'v3',
      publishedAt: '2026-08-01T12:00:00.000Z',
    });

    const repoEntry: CatalogGameEntry = {
      slug: 'sky-dodge',
      title: 'Sky Dodge',
      genre: 'arcade',
      controls: '',
      status: 'published',
      media: null,
      multiplayer: null,
      saves: null,
      world: null,
      sensing: null,
      editor: null,
      orientation: 'any',
      submittedBy: 'gamedev-platform',
    };

    const gamesStore = {
      getSourceFile: async (_slug: string, _version: string, path: string) =>
        path === 'SPEC.md' ? SPEC : path === 'GAME.json' ? GAME_JSON : null,
      getDerivedArtifact: async () => null,
    } as unknown as GamesStore;

    const app = await buildApp({
      store,
      sessionSecret,
      gamePageRoutes: { cacheTtlMs: 0 },
      submissionRoutes: {
        agentChannel: { gamesStore },
        githubToken: 'test-github-token',
        submissionTokenSecret: 'test-submission-secret',
        ...withSnapshot({
          getCatalog: async () => [repoEntry],
          getGameFile: async (_ref: string, _slug: string, path: string) =>
            path === 'SPEC.md' ? SPEC : path === 'GAME.json' ? GAME_JSON : null,
        } as unknown as GitHubClient),
      },
    });
    apps.push(app);

    for (const slug of ['cozycraft', 'sky-dodge']) {
      const res = await app.inject({ method: 'GET', url: `/api/games/${slug}/page` });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        description: 'A cozy digital dollhouse town.',
        localizedDescription: {
          en: 'A cozy digital dollhouse town.',
          pl: 'Przytulne cyfrowe miasteczko dla lalek.',
        },
      });
    }
  });
});
