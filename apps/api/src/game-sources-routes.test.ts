import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import type { GamesStore, VersionManifest } from './games-store.js';
import { languageOf, MAX_VIEWABLE_FILE_BYTES } from './game-sources-routes.js';
import { InMemoryStore } from './store.js';

const sessionSecret = 'dev-session-secret-change-me';

const SOURCES: Record<string, string> = {
  'SPEC.md': '---\ntitle: Neon Courier\n---\n\nDeliver packages.',
  'GAME.json': '{"engine":{"modules":["gfx"]}}',
  'game.ts': 'export function run() {\n  return 1;\n}\n',
};

function sourcesStore(overrides: Partial<GamesStore> = {}): GamesStore {
  return {
    getManifest: async (_slug: string, version: string) =>
      version === 'v-live'
        ? ({
            slug: 'neon-courier',
            version: 'v-live',
            createdAt: '2026-08-01T12:00:00.000Z',
            issueNumber: 1,
            sourceFiles: Object.keys(SOURCES),
          } satisfies VersionManifest)
        : null,
    getSourceFile: async (_slug: string, version: string, path: string) =>
      version === 'v-live' ? (SOURCES[path] ?? null) : null,
    ...overrides,
  } as unknown as GamesStore;
}

async function publish(store: InMemoryStore): Promise<void> {
  await store.setPublication({
    slug: 'neon-courier',
    state: 'published',
    currentVersion: 'v-live',
    publishedAt: '2026-08-01T12:00:00.000Z',
  });
}

describe('game sources routes', () => {
  const apps: Array<{ close: () => Promise<void> }> = [];
  afterEach(async () => {
    while (apps.length) await apps.pop()!.close();
  });

  async function appWith(store: InMemoryStore, gamesStore?: GamesStore, betaAllowedUids?: string) {
    const app = await buildApp({
      store,
      sessionSecret,
      betaAllowedUids,
      gameSourcesRoutes: { cacheTtlMs: 0 },
      submissionRoutes: gamesStore ? { agentChannel: { gamesStore } } : undefined,
    });
    apps.push(app);
    return app;
  }

  it('lists the live version’s files to anyone, with sizes and languages', async () => {
    const store = new InMemoryStore();
    await publish(store);
    const app = await appWith(store, sourcesStore());

    const response = await app.inject({ method: 'GET', url: '/api/games/neon-courier/sources' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.version).toBe('v-live');
    // Case-insensitive order, so GAME.json and game.ts sit together rather than being
    // split by an uppercase-first comparison.
    expect(body.files).toEqual([
      { path: 'GAME.json', bytes: Buffer.byteLength(SOURCES['GAME.json']), language: 'json' },
      { path: 'game.ts', bytes: Buffer.byteLength(SOURCES['game.ts']), language: 'typescript' },
      { path: 'SPEC.md', bytes: Buffer.byteLength(SOURCES['SPEC.md']), language: 'markdown' },
    ]);
    expect(body.totalBytes).toBe(Object.values(SOURCES).reduce((sum, content) => sum + Buffer.byteLength(content), 0));
  });

  it('serves one file’s text to anyone, and only files the manifest names', async () => {
    const store = new InMemoryStore();
    await publish(store);
    const app = await appWith(store, sourcesStore());

    const file = await app.inject({ method: 'GET', url: '/api/games/neon-courier/sources/file?path=game.ts' });
    expect(file.statusCode).toBe(200);
    expect(file.json()).toEqual({
      path: 'game.ts',
      version: 'v-live',
      bytes: Buffer.byteLength(SOURCES['game.ts']),
      language: 'typescript',
      content: SOURCES['game.ts'],
    });

    // Not in the manifest → does not exist. No prefix join, so nothing to escape from.
    for (const path of ['../../etc/passwd', 'secrets.env', '/etc/passwd', 'game.ts.map']) {
      const denied = await app.inject({
        method: 'GET',
        url: `/api/games/neon-courier/sources/file?path=${encodeURIComponent(path)}`,
      });
      expect(denied.statusCode).toBe(404);
    }
  });

  it('shows nothing for an unpublished, taken-down, or repo-only game', async () => {
    const store = new InMemoryStore();
    const app = await appWith(store, sourcesStore());

    // Never published.
    expect((await app.inject({ method: 'GET', url: '/api/games/neon-courier/sources' })).statusCode).toBe(404);

    await publish(store);
    expect((await app.inject({ method: 'GET', url: '/api/games/neon-courier/sources' })).statusCode).toBe(200);

    // Taken down — the code goes with the game.
    await store.takedownPublication('neon-courier', 'reported', '2026-08-05T00:00:00.000Z');
    expect((await app.inject({ method: 'GET', url: '/api/games/neon-courier/sources' })).statusCode).toBe(404);
    expect(
      (await app.inject({ method: 'GET', url: '/api/games/neon-courier/sources/file?path=game.ts' })).statusCode,
    ).toBe(404);
  });

  it('refuses to inline a file past the viewer ceiling', async () => {
    const store = new InMemoryStore();
    await publish(store);
    const huge = 'x'.repeat(MAX_VIEWABLE_FILE_BYTES + 1);
    const app = await appWith(
      store,
      sourcesStore({
        getManifest: async () =>
          ({
            slug: 'neon-courier',
            version: 'v-live',
            createdAt: '2026-08-01T12:00:00.000Z',
            issueNumber: 1,
            sourceFiles: ['huge.ts'],
          }) as VersionManifest,
        getSourceFile: async () => huge,
      }),
    );

    const response = await app.inject({ method: 'GET', url: '/api/games/neon-courier/sources/file?path=huge.ts' });

    expect(response.statusCode).toBe(413);
    expect(response.json()).toMatchObject({ error: 'too_large', limit: MAX_VIEWABLE_FILE_BYTES });
  });

  it('stays readable through the private-beta wall', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:creator' });
    await publish(store);
    const app = await appWith(store, sourcesStore(), 'g:creator');

    expect((await app.inject({ method: 'GET', url: '/api/games/neon-courier/sources' })).statusCode).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: '/api/games/neon-courier/sources/file?path=SPEC.md' })).statusCode,
    ).toBe(200);
    // The playable document itself stays walled — only reading the code opened up.
    expect((await app.inject({ method: 'GET', url: '/api/games/neon-courier' })).statusCode).toBe(401);
  });
});

describe('languageOf', () => {
  it('tags the file kinds a delivered game contains', () => {
    expect(languageOf('game.ts')).toBe('typescript');
    expect(languageOf('sim.tsx')).toBe('typescript');
    expect(languageOf('GAME.json')).toBe('json');
    expect(languageOf('style.css')).toBe('css');
    expect(languageOf('index.html')).toBe('html');
    expect(languageOf('SPEC.md')).toBe('markdown');
    expect(languageOf('LICENSE')).toBe('text');
  });
});
