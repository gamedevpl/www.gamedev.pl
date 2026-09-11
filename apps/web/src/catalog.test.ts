import { afterEach, describe, expect, it, vi } from 'vitest';
import { catalogMediaUrl, fetchCatalog } from './catalog.js';

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
        saves: null,
        world: null,
        sensing: null,
        editor: null,
        orientation: 'any',
        touch: null,
        submittedBy: null,
        creatorHandle: null,
      },
    ]);
    // The catalog is served by our own API, not public GitHub Pages.
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/catalog');
  });

  it('keeps a valid creatorHandle and drops malformed ones', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            slug: 'a',
            title: 'A',
            genre: '',
            controls: '',
            status: 'published',
            submittedBy: 'Ada',
            creatorHandle: 'ada',
          },
          {
            slug: 'b',
            title: 'B',
            genre: '',
            controls: '',
            status: 'published',
            creatorHandle: 'Ada',
          },
          {
            slug: 'c',
            title: 'C',
            genre: '',
            controls: '',
            status: 'published',
            creatorHandle: 'nope!',
          },
        ]),
      ),
    );

    const entries = await fetchCatalog();
    expect(entries.map((entry) => entry.creatorHandle)).toEqual(['ada', 'ada', null]);
  });

  it('keeps a submitted_by byline and treats nullish values as absent', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify([
          { slug: 'a', title: 'A', genre: '', controls: '', status: 'published', submittedBy: 'alice' },
          { slug: 'b', title: 'B', genre: '', controls: '', status: 'published', submitted_by: 'bob' },
          { slug: 'c', title: 'C', genre: '', controls: '', status: 'published', submittedBy: 'null' },
          { slug: 'd', title: 'D', genre: '', controls: '', status: 'published' },
        ]),
      ),
    );

    const entries = await fetchCatalog();
    expect(entries.map((entry) => entry.submittedBy)).toEqual(['alice', 'bob', null, null]);
  });

  it('keeps a declared orientation and treats anything else as no preference', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify([
          { slug: 'a', title: 'A', genre: '', controls: '', status: 'published', orientation: 'landscape' },
          { slug: 'b', title: 'B', genre: '', controls: '', status: 'published', orientation: 'portrait' },
          { slug: 'c', title: 'C', genre: '', controls: '', status: 'published', orientation: 'adaptive' },
          { slug: 'd', title: 'D', genre: '', controls: '', status: 'published', orientation: 'sideways' },
          // An API older than this field must not make the player nag anyone.
          { slug: 'e', title: 'E', genre: '', controls: '', status: 'published' },
        ]),
      ),
    );

    const entries = await fetchCatalog();
    expect(entries.map((entry) => entry.orientation)).toEqual(['landscape', 'portrait', 'adaptive', 'any', 'any']);
  });

  it('keeps the content editor flag and treats anything else as no editor', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify([
          { slug: 'editable', title: 'Editable', genre: '', controls: '', status: 'published', editor: 'content' },
          { slug: 'legacy', title: 'Legacy', genre: '', controls: '', status: 'published', editor: 'CONTENT' },
          { slug: 'missing', title: 'Missing', genre: '', controls: '', status: 'published' },
        ]),
      ),
    );

    const entries = await fetchCatalog();
    expect(entries.map((entry) => entry.editor)).toEqual(['content', null, null]);
  });

  it('keeps a known touch class and treats anything else as unknown', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify([
          { slug: 'a', title: 'A', genre: '', controls: '', status: 'published', touch: 'gamekit' },
          { slug: 'b', title: 'B', genre: '', controls: '', status: 'published', touch: 'native' },
          { slug: 'c', title: 'C', genre: '', controls: '', status: 'published', touch: 'controllers' },
          { slug: 'd', title: 'D', genre: '', controls: '', status: 'published', touch: 'none' },
          { slug: 'e', title: 'E', genre: '', controls: '', status: 'published', touch: 'swipe' },
          // A catalog served from the SPEC-derived fallback has no touch at all. It
          // must read as unknown, never as 'none' — that would badge every card with
          // a keyboard-only warning the moment the fast path is unavailable.
          { slug: 'f', title: 'F', genre: '', controls: '', status: 'published' },
        ]),
      ),
    );

    const entries = await fetchCatalog();
    expect(entries.map((entry) => entry.touch)).toEqual(['gamekit', 'native', 'controllers', 'none', null, null]);
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

  it('asks for a baked width with ?w= when one is given', () => {
    expect(catalogMediaUrl('sky-dodge', 'mid.png', 640)).toBe('/api/games/sky-dodge/media/mid.png?w=640');
    expect(catalogMediaUrl('sky-dodge', 'mid.png', 96)).toBe('/api/games/sky-dodge/media/mid.png?w=96');
  });

  it('surfaces the API error body when the catalog request fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'failed to load catalog' }), { status: 502, statusText: '' }),
    );

    await expect(fetchCatalog()).rejects.toThrow('failed to load catalog');
  });
});

describe('shared-world metadata', () => {
  it('reads `world: shared` and refuses anything else', async () => {
    const entry = (slug: string, world: unknown) => ({
      slug,
      title: slug,
      genre: '',
      controls: '',
      status: 'published',
      world,
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify([
          entry('a', 'shared'),
          entry('b', 'Shared'),
          entry('c', 'private'),
          entry('d', true),
          entry('e', undefined),
        ]),
      ),
    );

    const parsed = await fetchCatalog();

    expect(parsed.map((game) => [game.slug, game.world])).toEqual([
      ['a', 'shared'],
      // Anything unrecognised degrades to "no world", the same direction `saves`
      // degrades in: over-claiming badges a game as shared when nothing is there,
      // which is a worse first visit than no badge at all.
      ['b', null],
      ['c', null],
      ['d', null],
      ['e', null],
    ]);
  });
});
