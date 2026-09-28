// Link previews for shared game links: unfurlers never run the SPA.

import type { CatalogGameEntry } from '../catalog/github-client.js';
import { PLATFORM_HANDLE, RESERVED_HANDLES } from './creator-profile.js';
import { normalizePathname } from './spa-paths.js';

const SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*';
const PLAY_PATH = new RegExp(`^/play/(${SLUG})$`);
// Same shape as GAME_PAGE_PATTERN in spa-paths.ts.
const GAME_PAGE_PATH = new RegExp(`^/([a-z][a-z0-9_]{2,23})/(${SLUG})(?:/(?:board|review|releases|sources))?$`);

const SITE_NAME = 'gamedev.pl';
const DESCRIPTION_MAX = 200;

// The game a shareable path is about, else null.
export function shareableGameSlug(urlOrPath: string): string | null {
  const pathname = normalizePathname(urlOrPath);
  const play = pathname.match(PLAY_PATH);
  if (play?.[1]) return play[1];
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
  // Becomes og:url.
  pathname: string;
}

// Title and meta tags for one game, every value escaped.
export function renderShareMeta({ entry, origin, pathname }: ShareMetaInput): { title: string; tags: string } {
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
    ['property', 'og:url', `${origin}${normalizePathname(pathname)}`],
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
  // Only games a stranger can open; others would leak past the wall.
  isShareable: (slug: string) => Promise<boolean>;
  // Canonical host; the request's own host when unset.
  canonicalHost?: string;
}

// The game's shell, or null for plain index.html. Never throws.
export function createSharePreviewShell(options: SharePreviewShellOptions) {
  let shell: Promise<string> | null = null;
  const canonicalHost = options.canonicalHost?.trim() || null;

  return async (request: { url: string; host: string; protocol: string }): Promise<string | null> => {
    const slug = shareableGameSlug(request.url);
    if (!slug) return null;
    try {
      if (!(await options.isShareable(slug))) return null;
      const entry = await options.getCatalogEntry(slug);
      if (!entry) return null;
      shell ??= options.readIndexHtml().catch((error: unknown) => {
        shell = null;
        throw error;
      });
      const origin = canonicalHost ? `https://${canonicalHost}` : `${request.protocol}://${request.host}`;
      return injectShareMeta(await shell, renderShareMeta({ entry, origin, pathname: request.url }));
    } catch {
      return null;
    }
  };
}
