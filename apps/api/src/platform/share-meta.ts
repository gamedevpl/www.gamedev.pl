// Link previews for shared game links: unfurlers never run the SPA.

import { attachCatalogEnrichment } from '../catalog/catalog-enricher.js';
import { catalogEntryFromSpec, type CatalogGameEntry } from '../catalog/github-client.js';
import type { GamesStore } from '../delivery/games-store.js';
import { PLATFORM_HANDLE, RESERVED_HANDLES } from './creator-profile.js';
import { canonicalAppBaseUrl } from './canonical-app-url.js';
import { isPublished } from './publication-state.js';
import { normalizePathname } from './spa-paths.js';
import type { Store } from './store.js';

const SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*';
const PLAY_PATH = /^\/(?:play|ay|ai|draft)\/([^/]+)$/;
// Drafts are never published; "unpublished" says nothing about them.
const DRAFT_PATH = /^\/draft\//;

// No lane publishes the slug: boot with 404, not a soft 404.
export const GAME_NOT_FOUND: unique symbol = Symbol('game-not-found');
// Behind the beta wall: crawlers get noindex, never an existence oracle.
export const GAME_WALLED: unique symbol = Symbol('game-walled');
const SLUG_ONLY = new RegExp(`^${SLUG}$`);
// Same shape as GAME_PAGE_PATTERN in spa-paths.ts.
const GAME_PAGE_PATH = new RegExp(`^/([a-z][a-z0-9_]{2,23})/(${SLUG})(?:/(?:board|review|releases|sources))?$`);

const SITE_NAME = 'gamedev.pl';
const DESCRIPTION_MAX = 200;

function decodedSlug(segment: string): string | null {
  try {
    const slug = decodeURIComponent(segment);
    return SLUG_ONLY.test(slug) ? slug : null;
  } catch {
    return null;
  }
}

// The game a shareable path is about, else null.
export function shareableGameSlug(urlOrPath: string): string | null {
  const pathname = normalizePathname(urlOrPath);
  const play = pathname.match(PLAY_PATH);
  // Decoded before validation, as spa-paths.ts and the client router do.
  if (play?.[1]) return decodedSlug(play[1]);
  const page = pathname.match(GAME_PAGE_PATH);
  // `/studio/<token>` shares the shape; reserved words are never handles.
  if (!page?.[1] || !page[2]) return null;
  return page[1] === PLATFORM_HANDLE || !RESERVED_HANDLES.has(page[1]) ? page[2] : null;
}

// A gameplay capture beats the opening, as on the game page.
export function previewScreenshotFile(entry: Pick<CatalogGameEntry, 'media'>): string | null {
  const screenshots = entry.media?.screenshots ?? [];
  return (screenshots.find((shot) => shot.name !== 'opening') ?? screenshots[0])?.file ?? null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function clip(value: string, max: number): string {
  const flat = value.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

export interface ShareMetaInput {
  entry: Pick<CatalogGameEntry, 'slug' | 'title' | 'genre' | 'tagline' | 'media'>;
  // `https://host`, no trailing slash.
  origin: string;
}

// Title and meta tags for one game, every value escaped.
export function renderShareMeta({ entry, origin }: ShareMetaInput): { title: string; tags: string } {
  // Title and tagline are agent-authored: escape, never trust.
  const title = clip(`${entry.title} — ${SITE_NAME}`, 120);
  const description = clip(
    entry.tagline?.en || entry.tagline?.pl || `${entry.genre} · play in your browser`,
    DESCRIPTION_MAX,
  );
  const screenshot = previewScreenshotFile(entry);
  const image = screenshot
    ? `${origin}/api/games/${encodeURIComponent(entry.slug)}/media/${encodeURIComponent(screenshot)}`
    : null;

  const tags: Array<[attr: 'property' | 'name', key: string, value: string]> = [
    ['property', 'og:type', 'website'],
    ['property', 'og:site_name', SITE_NAME],
    ['property', 'og:title', entry.title],
    ['property', 'og:description', description],
    // Page-URL handles are unverified; /play/<slug> never goes stale.
    ['property', 'og:url', `${origin}/play/${encodeURIComponent(entry.slug)}`],
    ['name', 'description', description],
    ['name', 'twitter:card', image ? 'summary_large_image' : 'summary'],
    ['name', 'twitter:title', entry.title],
    ['name', 'twitter:description', description],
  ];
  if (image) {
    tags.push(['property', 'og:image', image], ['property', 'og:image:alt', `${entry.title} gameplay`]);
    tags.push(['name', 'twitter:image', image]);
  }

  return {
    title,
    tags: tags.map(([attr, key, value]) => `<meta ${attr}="${key}" content="${escapeHtml(value)}" />`).join('\n    '),
  };
}

// Replaces the shell title with the game's, then adds tags.
export function injectShareMeta(indexHtml: string, meta: { title: string; tags: string }): string {
  const block = `<title>${escapeHtml(meta.title)}</title>\n    ${meta.tags}`;
  if (/<title>[\s\S]*?<\/title>/.test(indexHtml)) {
    return indexHtml.replace(/<title>[\s\S]*?<\/title>/, () => block);
  }
  if (indexHtml.includes('</head>')) return indexHtml.replace('</head>', () => `${block}\n  </head>`);
  return indexHtml;
}

export interface SharePreviewShellOptions {
  // The built shell, read once on first use.
  readIndexHtml: () => Promise<string>;
  getCatalogEntry: (slug: string) => Promise<CatalogGameEntry | null>;
  // Store-lane publications, used when the repo catalog lacks the slug.
  store?: Store;
  gamesStore?: Pick<GamesStore, 'getSourceFile' | 'getDerivedArtifact'>;
  // Only games a stranger can open; others would leak past the wall.
  isShareable: (slug: string) => Promise<boolean>;
  // False when the beta wall, not load shedding, hides the slug.
  isPastWall?: (slug: string) => Promise<boolean>;
  // Never the request Host header: a spoofed Host must not reach previews.
  origin?: string;
  now?: () => number;
}

// A store-lane game's entry from its published SPEC and media.
async function storePublishedEntry(
  { store, gamesStore }: Pick<SharePreviewShellOptions, 'store' | 'gamesStore'>,
  slug: string,
): Promise<CatalogGameEntry | typeof GAME_NOT_FOUND | null> {
  if (!store || !gamesStore) return null;
  const publication = await store.getPublication(slug);
  if (!isPublished(publication)) return GAME_NOT_FOUND;
  const [spec, media] = await Promise.all([
    gamesStore.getSourceFile(slug, publication.currentVersion, 'SPEC.md'),
    gamesStore.getDerivedArtifact(slug, publication.currentVersion, 'media/metadata.json'),
  ]);
  if (!spec) return null;
  return catalogEntryFromSpec(slug, spec, (name) =>
    name === 'media/metadata.json' && media ? media.toString('utf8') : null,
  );
}

export type SharePreview = string | typeof GAME_NOT_FOUND | typeof GAME_WALLED | null;

const PREVIEW_TTL_MS = 60_000;
const PREVIEW_CACHE_MAX = 256;
// Cache misses read storage; rotating slugs must not buy more reads.
const PREVIEW_MISS_BUDGET = 60;

// The game's shell, a not-found or walled marker, or null.
export function createSharePreviewShell(options: SharePreviewShellOptions) {
  let shell: Promise<string> | null = null;
  const origin = options.origin ?? canonicalAppBaseUrl();
  const now = options.now ?? Date.now;
  // Bounds storage reads on this public path; misses are cached too.
  const cache = new Map<string, { html: SharePreview; expiresAt: number }>();
  let missesLeft = 0;
  let missWindowEndsAt = 0;
  const inFlight = new Map<string, Promise<SharePreview>>();

  // Repo misses fall through to storage, which the budget bounds.
  function spendMiss(): boolean {
    if (now() >= missWindowEndsAt) {
      missWindowEndsAt = now() + PREVIEW_TTL_MS;
      missesLeft = PREVIEW_MISS_BUDGET;
    }
    if (missesLeft <= 0) return false;
    missesLeft -= 1;
    return true;
  }

  async function lookup(slug: string): Promise<CatalogGameEntry | typeof GAME_NOT_FOUND | null | undefined> {
    // Repo first, as the catalog, game page and media route resolve it.
    let repoFailed = false;
    const repo = await options.getCatalogEntry(slug).catch(() => {
      repoFailed = true;
      return null;
    });
    if (repo) return repo;
    // Undefined means over budget: answered plainly, never cached.
    if (!spendMiss()) return undefined;
    const stored = await storePublishedEntry(options, slug);
    // A failed repo read is not a "no".
    return stored === GAME_NOT_FOUND && repoFailed ? null : stored;
  }

  async function render(slug: string): Promise<SharePreview | undefined> {
    const raw = await lookup(slug);
    if (!raw || raw === GAME_NOT_FOUND) return raw;
    // One game's tagline: one document, not the whole collection.
    const entry = await attachCatalogEnrichment(raw, options.store);
    shell ??= options.readIndexHtml().catch((error: unknown) => {
      shell = null;
      throw error;
    });
    return injectShareMeta(await shell, renderShareMeta({ entry, origin }));
  }

  async function preview(slug: string): Promise<SharePreview> {
    try {
      if (!(await options.isShareable(slug))) {
        return (await options.isPastWall?.(slug)) === false ? GAME_WALLED : null;
      }
      const cached = cache.get(slug);
      if (cached && cached.expiresAt > now()) return cached.html;
      // Concurrent requests for one slug share a render and one budget unit.
      const pending = inFlight.get(slug);
      if (pending) return await pending;
      const rendering = render(slug).then((html) => {
        if (html === undefined) return null;
        cache.delete(slug);
        if (cache.size >= PREVIEW_CACHE_MAX) cache.delete(cache.keys().next().value as string);
        cache.set(slug, { html, expiresAt: now() + PREVIEW_TTL_MS });
        return html;
      });
      inFlight.set(slug, rendering);
      try {
        return await rendering;
      } finally {
        inFlight.delete(slug);
      }
    } catch {
      return null;
    }
  }

  return async (request: { url: string }): Promise<SharePreview> => {
    const slug = shareableGameSlug(request.url);
    if (!slug) return null;
    const result = await preview(slug);
    return result === GAME_NOT_FOUND && DRAFT_PATH.test(normalizePathname(request.url)) ? null : result;
  };
}
