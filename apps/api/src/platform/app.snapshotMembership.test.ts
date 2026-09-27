import { afterEach, expect, it, vi } from 'vitest';
import type { GameSnapshotReader } from '../catalog/game-snapshot.js';
import { buildApp } from './app.js';
import { InMemoryStore } from './store.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './auth.js';

const fixtures = vi.hoisted(() => ({ envReader: null as GameSnapshotReader | null }));
vi.mock('../catalog/game-snapshot.js', async (original) => ({
  ...(await original<typeof import('../catalog/game-snapshot.js')>()),
  createSnapshotReaderFromEnv: () => fixtures.envReader,
}));
afterEach(() => {
  fixtures.envReader = null;
});

function reader(slug: string): GameSnapshotReader {
  return { getCatalog: async () => [{ slug, status: 'published' }] } as unknown as GameSnapshotReader;
}

async function voteStatus(snapshotReader: GameSnapshotReader | null, slug: string) {
  const store = new InMemoryStore();
  await store.upsertUser({ uid: 'g:snapshot-player' });
  const sessionSecret = 'fixture-session-secret';
  const app = await buildApp({ store, sessionSecret, submissionRoutes: { snapshotReader } });
  try {
    return (
      await app.inject({
        method: 'GET',
        url: `/api/games/${slug}/votes`,
        headers: { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken('g:snapshot-player', sessionSecret)}` },
      })
    ).statusCode;
  } finally {
    await app.close();
  }
}

it('authorizes injected snapshot games without an environment reader', async () => {
  expect(await voteStatus(reader('injected-game'), 'injected-game')).toBe(200);
});

it('does not authorize an environment snapshot explicitly disabled for play', async () => {
  fixtures.envReader = reader('env-game');
  expect(await voteStatus(null, 'env-game')).toBe(404);
});
