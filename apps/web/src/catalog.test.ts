import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCatalog } from './catalog';

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
    // The catalog is served by our own API, not public GitHub Pages.
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/catalog');
  });
});
