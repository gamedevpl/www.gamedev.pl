import { afterEach, describe, expect, it, vi } from 'vitest';
import { catalogMediaUrl, fetchCatalog } from './catalog';

describe('catalog helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('filters out non-published catalog entries', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            slug: 'sky-dodge',
            title: 'Sky Dodge',
            genre: 'Arcade',
            controls: 'Arrow keys',
            status: 'published',
            media: {
              screenshots: [{ name: 'opening', file: 'opening.png' }],
              video: 'gameplay.mp4',
            },
          },
          { slug: 'draft-game', title: 'Draft Game', genre: 'Puzzle', controls: 'Mouse', status: 'draft' },
        ]),
      ),
    );

    await expect(fetchCatalog()).resolves.toEqual([
      {
        slug: 'sky-dodge',
        title: 'Sky Dodge',
        genre: 'Arcade',
        controls: 'Arrow keys',
        status: 'published',
        media: {
          screenshots: [{ name: 'opening', file: 'opening.png' }],
          video: 'gameplay.mp4',
        },
        multiplayer: null,
        orientation: 'any',
      },
    ]);
    // The catalog is served by our own API, not public GitHub Pages.
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/catalog');
  });

  it('keeps a declared orientation and treats anything else as no preference', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify([
          { slug: 'a', title: 'A', genre: '', controls: '', status: 'published', orientation: 'landscape' },
          { slug: 'b', title: 'B', genre: '', controls: '', status: 'published', orientation: 'portrait' },
          { slug: 'c', title: 'C', genre: '', controls: '', status: 'published', orientation: 'sideways' },
          // An API older than this field must not make the player nag anyone.
          { slug: 'd', title: 'D', genre: '', controls: '', status: 'published' },
        ]),
      ),
    );

    const entries = await fetchCatalog();
    expect(entries.map((entry) => entry.orientation)).toEqual(['landscape', 'portrait', 'any', 'any']);
  });

  it('keeps well-formed multiplayer metadata and drops malformed metadata', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            slug: 'arena-tag',
            title: 'Arena Tag',
            genre: 'party',
            controls: 'D-pad',
            status: 'published',
            multiplayer: { mode: 'controllers', minPlayers: 2, maxPlayers: 4 },
          },
          {
            slug: 'broken',
            title: 'Broken',
            genre: 'party',
            controls: 'D-pad',
            status: 'published',
            multiplayer: { mode: 'lockstep', minPlayers: 2, maxPlayers: 4 },
          },
        ]),
      ),
    );

    const entries = await fetchCatalog();
    expect(entries[0].multiplayer).toEqual({ mode: 'controllers', minPlayers: 2, maxPlayers: 4 });
    expect(entries[1].multiplayer).toBeNull();
  });

  it('builds same-origin media URLs with encoded path segments', () => {
    expect(catalogMediaUrl('space runner', 'opening image.png')).toBe(
      '/api/games/space%20runner/media/opening%20image.png',
    );
  });
});
