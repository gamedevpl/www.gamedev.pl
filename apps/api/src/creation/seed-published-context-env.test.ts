import { afterEach, expect, it, vi } from 'vitest';
import type { GameSnapshotReader, SnapshotPointer } from '../catalog/game-snapshot.js';
import type { SeedContextSource } from './seed-context.js';

const fixtures = vi.hoisted(() => ({
  refs: [] as string[],
  context: null as SeedContextSource | null,
  archiveWait: new Map<string, Promise<void>>(),
}));
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
    await fixtures.archiveWait.get(ref);
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
  fixtures.archiveWait.clear();
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

function latch() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
it('coalesces concurrent cold loads of one publication', async () => {
  const archive = latch();
  fixtures.archiveWait.set(sha, archive.promise);
  const context = configure({ getPointer: async () => pointer(), getCatalog: async () => catalog });
  const loads = [context.load(), context.load()];
  try {
    await vi.waitFor(() => expect(fixtures.refs).toEqual([sha]));
  } finally {
    archive.release();
  }
  const results = await Promise.all(loads);
  expect(results[0]).toBe(results[1]);
  expect(fixtures.refs).toEqual([sha]);
});
it('shares an older snapshot load across overlapping publication initialization', async () => {
  const older = latch();
  const newer = latch();
  const heldPointer = latch();
  const pointerEntered = latch();
  const nextSha = 'b'.repeat(40);
  fixtures.archiveWait.set(sha, older.promise);
  fixtures.archiveWait.set(nextSha, newer.promise);
  let published = pointer();
  let pointerReads = 0;
  const context = configure({
    getPointer: async () => {
      const captured = published;
      if (++pointerReads === 4) {
        pointerEntered.release();
        await heldPointer.promise;
      }
      return captured;
    },
    getCatalog: async () => catalog,
  });
  const loads = [context.load()];
  try {
    await vi.waitFor(() => expect(fixtures.refs).toEqual([sha]));
    loads.push(context.load());
    await pointerEntered.promise;
    published = pointer('published-2', nextSha);
    loads.push(context.load());
    await vi.waitFor(() => expect(fixtures.refs).toEqual([sha, nextSha]));
    heldPointer.release();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(fixtures.refs).toEqual([sha, nextSha]);
  } finally {
    heldPointer.release();
    older.release();
    newer.release();
  }
  const results = await Promise.all(loads);
  expect(results[0]).toBe(results[1]);
  expect(results[2]?.renderReferences(['reference'], 1000)).toContain(nextSha);
});

it('reuses a coherent cached context when catalog reads later fail', async () => {
  const readCatalog = vi.fn().mockResolvedValue(catalog);
  const context = configure({ getPointer: async () => pointer(), getCatalog: readCatalog });
  const first = await context.load();
  readCatalog.mockRejectedValue(new Error('storage unavailable'));
  expect(await context.load()).toBe(first);
  expect(readCatalog).toHaveBeenCalledTimes(1);
  expect(fixtures.refs).toEqual([sha]);
});
