import { describe, expect, it, vi } from 'vitest';
import { normalizeCatalogEntry, type CatalogEntry } from './catalog.js';
import { createSiteAssistantTools, searchCatalog, SITE_ASSISTANT_TOOL_NAMES } from './siteAssistantTools.js';

const game = (slug: string, title: string, extra: Record<string, unknown> = {}): CatalogEntry =>
  normalizeCatalogEntry({ slug, title, genre: 'arcade', controls: 'keys', status: 'published', ...extra })!;

const CATALOG = [
  game('neon-canal', 'Neon Canal', {
    genre: 'racing',
    tagline: { en: 'Boat racing at night', pl: 'Nocne wyścigi łodzi' },
  }),
  game('tv-tycoon', 'TV Tycoon', { genre: 'strategy', creatorHandle: 'ala' }),
  game('zolw', 'Żółw w kosmosie', { genre: 'puzzle' }),
];

function fixture(semantic: string | null = null) {
  const navigate = vi.fn();
  const semanticSlug = vi.fn(async () => semantic);
  const tools = createSiteAssistantTools({ loadCatalog: async () => CATALOG, navigate, semanticSlug, locale: 'pl' });
  const run = (name: string, args: Record<string, unknown>) => tools.find((tool) => tool.name === name)!.run(args);
  return { tools, navigate, semanticSlug, run };
}

describe('site assistant page tools', () => {
  it('offers exactly the tools the server pins, none of them a write', () => {
    const { tools } = fixture();
    expect(tools.map((tool) => tool.name)).toEqual([...SITE_ASSISTANT_TOOL_NAMES]);
    expect(tools.some((tool) => tool.write)).toBe(false);
  });

  it('finds games by title, genre and tagline, title first', () => {
    expect(searchCatalog('neon racing', CATALOG).map((entry) => entry.slug)).toEqual(['neon-canal']);
    expect(searchCatalog('wyścigi', CATALOG).map((entry) => entry.slug)).toEqual(['neon-canal']);
    expect(searchCatalog('strategy', CATALOG).map((entry) => entry.slug)).toEqual(['tv-tycoon']);
    expect(searchCatalog('zolw', CATALOG).map((entry) => entry.slug)).toEqual(['zolw']);
    expect(searchCatalog('a', CATALOG)).toEqual([]);
  });

  it('answers a search in the visitor language, and falls back to the semantic match', async () => {
    const f = fixture('tv-tycoon');
    expect(await f.run('search_games', { query: 'neon' })).toEqual({
      games: [{ slug: 'neon-canal', title: 'Neon Canal', genre: 'racing', about: 'Nocne wyścigi łodzi' }],
    });
    expect(f.semanticSlug).not.toHaveBeenCalled();
    expect(await f.run('search_games', { query: 'run a television company' })).toMatchObject({
      games: [{ slug: 'tv-tycoon' }],
    });
  });

  it('says so when nothing matches', async () => {
    const f = fixture(null);
    expect(await f.run('search_games', { query: 'chess' })).toMatchObject({ games: [] });
  });

  it('opens only a listed game, under its creator handle', async () => {
    const f = fixture();
    await f.run('open_game', { slug: 'tv-tycoon' });
    expect(f.navigate).toHaveBeenCalledWith('/ala/tv-tycoon');
    await expect(f.run('open_game', { slug: '../studio' })).rejects.toThrow(/No game has the slug/);
    expect(f.navigate).toHaveBeenCalledTimes(1);
  });

  it('opens only the pages it names', async () => {
    const f = fixture();
    await f.run('open_page', { page: 'create' });
    expect(f.navigate).toHaveBeenCalledWith('/create');
    expect(() => f.run('open_page', { page: 'constructor' })).toThrow(/Unknown page/);
    expect(() => f.run('open_page', { page: 'https://evil.example' })).toThrow(/Unknown page/);
    expect(f.navigate).toHaveBeenCalledTimes(1);
  });
});
