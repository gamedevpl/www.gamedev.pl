import { describe, expect, it } from 'vitest';
import { createLocalGamesClient, FIXTURE_GAMES_DIR } from './local-games-repo.js';
import { createLocalSnapshotReader } from './local-snapshot-reader.js';

const reader = createLocalSnapshotReader(createLocalGamesClient({ rootDir: FIXTURE_GAMES_DIR }), 'main');

describe('local snapshot reader', () => {
  it('bakes a fixture game with the strict published CSP', async () => {
    const game = await reader.getGame('pixel-dodge');

    expect(game?.title).toBe('Pixel Dodge');
    expect(game?.html).toContain("default-src 'none'");
    expect(game?.html).toContain('requestAnimationFrame');
  });

  it('lists only published fixtures and misses unknown slugs', async () => {
    const catalog = await reader.getCatalog();

    expect(catalog?.map((entry) => entry.slug).sort()).toEqual(['odd-one-out', 'pixel-dodge', 'range-squad']);
    expect(await reader.getGame('no-such-game')).toBeNull();
  });

  it('has no baked size variants', async () => {
    expect(await reader.getMedia('pixel-dodge', 'opening.png', 480)).toBeNull();
  });
});
