import { afterEach, expect, it, vi } from 'vitest';
import type { GameSnapshotReader, SnapshotPointer } from '../catalog/game-snapshot.js';
import type { SeedContextSource } from './seed-context.js';

const fixtures = vi.hoisted(() => ({ refs: [] as string[], context: null as SeedContextSource | null }));
vi.mock('./game-seed.js', async (original) => ({
  ...(await original<typeof import('./game-seed.js')>()),
  ModelGameSeeder: class {
    constructor(options: { context: SeedContextSource }) {
      fixtures.context = options.context;
    }
  },
}));
vi.mock('../platform/games-repo-archive.js', () => ({
  fetchGamesRepoArchive: async ({ ref }: { ref: string }) => {
    fixtures.refs.push(ref);
    return {
      listPaths: () => ['games/reference/game.ts'],
      readText: async () => `export const publishedRef = '${ref}';`,
    };
  },
}));
import { createGameSeederFromEnv } from './seed-provider-env.js';

const sha = 'a'.repeat(40);
function pointer(snapshotId = 'published-1', commitSha: string | null = sha): SnapshotPointer {
  return { snapshotId, commitSha, publishedAt: 'now', gameCount: 1 };
}
const catalog = [{ slug: 'reference', title: 'Reference', genre: 'arcade' }];
function configure(reader: Partial<GameSnapshotReader>) {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('GAMES_REPO_TOKEN', 'fixture-token');
  vi.stubEnv('GAMES_PUBLISHED_REF', 'main');
  createGameSeederFromEnv(undefined, undefined, reader as GameSnapshotReader);
  return fixtures.context!;
}
afterEach(() => {
  vi.unstubAllEnvs();
  fixtures.refs.length = 0;
  fixtures.context = null;
});

it('uses the published commit for catalog references instead of the mutable branch', async () => {
  const context = configure({ getPointer: async () => pointer(), getCatalog: async () => catalog });
  const loaded = await context.load();
  expect(fixtures.refs).toEqual([sha]);
  expect(loaded?.renderReferences(['reference'], 1000)).toContain(sha);
  expect(loaded?.catalogIndex).toBe('reference — Reference — arcade');
});
it('refreshes references when the publication changes inside the archive cache TTL', async () => {
  let published = pointer();
  const context = configure({ getPointer: async () => published, getCatalog: async () => catalog });
  await context.load();
  published = pointer('published-2', 'b'.repeat(40));
  const loaded = await context.load();
  expect(fixtures.refs).toEqual([sha, 'b'.repeat(40)]);
  expect(loaded?.renderReferences(['reference'], 1000)).toContain('b'.repeat(40));
});
it('skips seeding when the publication lacks an immutable commit', async () => {
  const context = configure({ getPointer: async () => pointer('old', null), getCatalog: async () => catalog });
  expect(await context.load()).toBeNull();
  expect(fixtures.refs).toEqual([]);
});
it('does not combine a catalog with a pointer that changes during its read', async () => {
  let revision = 0;
  const context = configure({
    getPointer: async () => pointer(`moving-${revision++}`),
    getCatalog: async () => catalog,
  });
  expect(await context.load()).toBeNull();
  expect(fixtures.refs).toEqual([]);
});
