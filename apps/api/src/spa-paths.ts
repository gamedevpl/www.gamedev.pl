/**
 * Which request paths are real SPA deep links (serve `index.html` with 200) vs
 * unknown (serve `index.html` with **404**).
 *
 * Kept as a pure pathname check so the Cloud Run static fallback and Vite's
 * dev server can share the same grammar. Must stay aligned with
 * `apps/web/src/router.ts` (`parsePathRoute`) — except `/join/<code>`, which is
 * treated as known here even without a fragment: the join token lives in the
 * hash and never reaches the server (see docs/path-routing-plan.md § Join).
 */

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PLAY_PREFIX_PATTERN = /^\/(play|ay|ai)\/([^/]+)$/;
const DRAFT_PATTERN = /^\/draft\/([^/]+)$/;
const STATUS_PATTERN = /^\/status\/([^/]+)$/;
const JOIN_PATTERN = /^\/join\/([A-Z0-9]{6})$/;
/** `/studio`, `/studio/:token`, `/studio/:token/:tab` — keep aligned with router.ts. */
const STUDIO_PATTERN = /^\/studio(?:\/[^/]+(?:\/(?:overview|build|playtest|stats|improve))?)?$/;
// The operator console. Its sections are listed rather than matched loosely, so the
// shell and the client's router agree about what is a real page and what is a typo —
// the same contract the studio tabs above keep.
const ADMIN_PATTERN = /^\/admin(?:\/(?:queue|costs|telemetry|limits|tokens|suggestions))?$/;
/** Last path segment looks like a file (`sw.js`, `icon.png`, `foo.woff2`). */
const STATIC_ASSET_PATTERN = /\/[^/]+\.[a-zA-Z0-9]+$/;

export function normalizePathname(urlOrPath: string): string {
  const withoutQuery = urlOrPath.split('?')[0] ?? urlOrPath;
  const pathname = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
  // Trailing slash (other than `/`) is not a known route shape.
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

/**
 * True when a missing static file should stay a hard JSON/plain 404 rather than
 * the HTML shell. `/play/foo` has no extension; `/assets/missing.js` does.
 */
export function looksLikeStaticAsset(urlOrPath: string): boolean {
  return STATIC_ASSET_PATTERN.test(normalizePathname(urlOrPath));
}

/**
 * True when this path is a first-class SPA route that should boot with HTTP 200.
 * Everything else that still wants the shell boots with HTTP 404 (proper 404,
 * not a soft 200).
 */
export function isKnownSpaShellPath(urlOrPath: string): boolean {
  const pathname = normalizePathname(urlOrPath);

  if (pathname === '/') return true;
  if (pathname === '/privacy' || pathname === '/terms' || pathname === '/health' || pathname === '/contact') {
    return true;
  }

  if (STUDIO_PATTERN.test(pathname)) return true;
  if (ADMIN_PATTERN.test(pathname)) return true;

  const statusMatch = pathname.match(STATUS_PATTERN);
  if (statusMatch?.[1]) return true;

  const playMatch = pathname.match(PLAY_PREFIX_PATTERN);
  if (playMatch?.[2]) {
    try {
      return SLUG_PATTERN.test(decodeURIComponent(playMatch[2]));
    } catch {
      return false;
    }
  }

  const draftMatch = pathname.match(DRAFT_PATTERN);
  if (draftMatch?.[1]) {
    try {
      return SLUG_PATTERN.test(decodeURIComponent(draftMatch[1]));
    } catch {
      return false;
    }
  }

  // Fragment is not on the request line; `/join/ABC123` alone must still 200.
  if (JOIN_PATTERN.test(pathname)) return true;

  return false;
}
