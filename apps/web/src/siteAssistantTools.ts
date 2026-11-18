import type { PageTool } from 'genaicode/browser';
import { gamePageHandle, type CatalogEntry } from './catalog.js';
import { connectPath, createPath, gamePath } from './core/router.js';

// What the site mascot may do: find games, open pages.

// Pinned on the server too; an unlisted tool is never called.
export const SITE_ASSISTANT_TOOL_NAMES = ['search_games', 'open_game', 'open_page'] as const;

const MAX_RESULTS = 5;
const PAGES: Record<string, () => string> = {
  home: () => '/',
  create: createPath,
  agents: () => connectPath(),
};

export interface SiteAssistantToolDeps {
  loadCatalog: () => Promise<CatalogEntry[]>;
  navigate: (path: string) => void;
  // Semantic match for a query no keyword finds; may answer nothing.
  semanticSlug?: (query: string, signal?: AbortSignal) => Promise<string | null>;
  locale?: string;
}

const words = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2);

function haystack(entry: CatalogEntry): { title: string[]; rest: string[] } {
  const tagline = entry.tagline ? `${entry.tagline.en ?? ''} ${entry.tagline.pl ?? ''}` : '';
  const keywords = Array.isArray(entry.searchKeywords) ? entry.searchKeywords.join(' ') : '';
  return { title: words(`${entry.title} ${entry.slug}`), rest: words(`${entry.genre} ${tagline} ${keywords}`) };
}

// Plain keyword scoring: a title hit counts more than a tagline hit.
export function searchCatalog(query: string, catalog: readonly CatalogEntry[]): CatalogEntry[] {
  const wanted = words(query);
  if (wanted.length === 0) return [];
  const scored = catalog.map((entry) => {
    const text = haystack(entry);
    let score = 0;
    for (const word of wanted) {
      if (text.title.some((have) => have.startsWith(word) || word.startsWith(have))) score += 3;
      else if (text.rest.some((have) => have.startsWith(word) || word.startsWith(have))) score += 1;
    }
    return { entry, score };
  });
  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RESULTS)
    .map((item) => item.entry);
}

function describe(entry: CatalogEntry, locale: string | undefined) {
  const tagline = entry.tagline ? ((locale === 'pl' ? entry.tagline.pl : entry.tagline.en) ?? entry.tagline.en) : null;
  return { slug: entry.slug, title: entry.title, genre: entry.genre, ...(tagline ? { about: tagline } : {}) };
}

export function createSiteAssistantTools(deps: SiteAssistantToolDeps): PageTool[] {
  return [
    {
      name: 'search_games',
      description: 'Search the gamedev.pl catalog. Returns matching games with slug, title and a short description.',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string', description: 'What the visitor is looking for.' } },
        required: ['query'],
      },
      async run(args, signal) {
        const query = String(args.query ?? '').slice(0, 200);
        const catalog = await deps.loadCatalog();
        let found = searchCatalog(query, catalog);
        if (found.length === 0 && deps.semanticSlug) {
          const slug = await deps.semanticSlug(query, signal).catch(() => null);
          const match = slug ? catalog.find((entry) => entry.slug === slug) : undefined;
          if (match) found = [match];
        }
        if (found.length === 0) return { games: [], note: `No game matches. The catalog has ${catalog.length} games.` };
        return { games: found.map((entry) => describe(entry, deps.locale)) };
      },
    },
    {
      name: 'open_game',
      description: 'Open the page of one game, by the slug search_games returned.',
      inputSchema: { type: 'object', properties: { slug: { type: 'string' } }, required: ['slug'] },
      async run(args) {
        const slug = String(args.slug ?? '');
        // Only a listed game: the model never builds a path itself.
        const entry = (await deps.loadCatalog()).find((game) => game.slug === slug);
        if (!entry) throw new Error(`No game has the slug "${slug.slice(0, 60)}". Use search_games first.`);
        deps.navigate(gamePath(gamePageHandle(entry), entry.slug));
        return `Opened the page of ${entry.title}.`;
      },
    },
    {
      name: 'open_page',
      description:
        'Open a page of the site: home (the catalog), create (make a game), agents (connect a coding agent).',
      inputSchema: {
        type: 'object',
        properties: { page: { type: 'string', enum: Object.keys(PAGES) } },
        required: ['page'],
      },
      run(args) {
        const page = String(args.page ?? '');
        const path = Object.prototype.hasOwnProperty.call(PAGES, page) ? PAGES[page]!() : undefined;
        if (!path) throw new Error(`Unknown page. One of: ${Object.keys(PAGES).join(', ')}.`);
        deps.navigate(path);
        return `Opened ${page}.`;
      },
    },
  ];
}
