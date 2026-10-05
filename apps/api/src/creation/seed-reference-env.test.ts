import { afterEach, expect, it, vi } from 'vitest';
import { createGameSeederFromEnv } from './seed-provider-env.js';

const { constructed } = vi.hoisted(() => ({ constructed: vi.fn() }));
vi.mock('./game-seed.js', async (original) => ({
  ...(await original<typeof import('./game-seed.js')>()),
  ModelGameSeeder: class {
    constructor(options: unknown) {
      constructed(options);
    }
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

it.each([undefined, 'off', 'on'])('only enables paid file selection with an explicit on flag (%s)', (flag) => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('GAMES_REPO_TOKEN', 'fixture-token');
  vi.stubEnv('SEED_REFERENCE_FILTER', flag);
  expect(createGameSeederFromEnv()).toBeDefined();
  expect(constructed).toHaveBeenCalledOnce();
  expect(typeof constructed.mock.calls[0][0].referenceFilter).toBe(flag === 'on' ? 'function' : 'undefined');
});
