import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCatalog } from './catalog';

const DEFAULT_GAMES_ORIGIN = 'https://gamedevpl.github.io/www.gamedev.pl-games';

describe('catalog helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('filters out non-published catalog entries', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify([
          { slug: 'sky-dodge', title: 'Sky Dodge', genre: 'Arcade', controls: 'Arrow keys', status: 'published' },
          { slug: 'draft-game', title: 'Draft Game', genre: 'Puzzle', controls: 'Mouse', status: 'draft' },
        ]),
      ),
    );

    await expect(fetchCatalog()).resolves.toEqual([
      { slug: 'sky-dodge', title: 'Sky Dodge', genre: 'Arcade', controls: 'Arrow keys', status: 'published' },
    ]);
    expect(globalThis.fetch).toHaveBeenCalledWith(`${DEFAULT_GAMES_ORIGIN}/catalog.json`);
  });
});
