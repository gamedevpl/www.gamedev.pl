import { afterEach, expect, it, vi } from 'vitest';
import { createPublishedSlugGateFromEnv } from './published-slugs.js';

afterEach(() => vi.unstubAllEnvs());

it('admits snapshot publications without a live GitHub catalog', async () => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('GITHUB_TOKEN', '');
  vi.stubEnv('GAMES_REPO', '');
  const snapshot = {
    getCatalog: vi.fn().mockResolvedValue([
      { slug: 'apex-sprint', status: 'published' },
      { slug: 'draft-game', status: 'draft' },
    ]),
  };
  const gate = await createPublishedSlugGateFromEnv(undefined, snapshot);
  expect(await gate?.isPublished('apex-sprint')).toBe(true);
  expect(await gate?.isPublished('draft-game')).toBe(false);
  expect(await gate?.isPublished('unknown-game')).toBe(false);
  expect(snapshot.getCatalog).toHaveBeenCalledTimes(1);
});

it('fails closed when a configured snapshot has no catalog', async () => {
  vi.stubEnv('NODE_ENV', 'test');
  const gate = await createPublishedSlugGateFromEnv(undefined, {
    getCatalog: vi.fn().mockResolvedValue(null),
  });
  expect(await gate?.isPublished('apex-sprint')).toBe(false);
});
