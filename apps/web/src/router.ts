import type { LegalDocId } from './legal/types.js';

export type AppRoute =
  | { view: 'home' }
  // A published game being played. The slug is a stable permalink, so refreshing
  // (or sharing the URL) reopens the same game instead of dropping back to the
  // catalog. Only published games are permalinkable — generated/party stages are
  // ephemeral and stay off the route.
  | { view: 'play'; slug: string }
  // An in-progress game, addressed exactly like a published one. This is the
  // shareable form of a build: it carries no status token, so it grants watching
  // rights only — no change requests, no quota spend.
  | { view: 'draft'; slug: string }
  // A phone that scanned a lobby QR. The room code is a path segment; the join
  // token rides in the fragment so it never hits access logs or Referer
  // (see docs/path-routing-plan.md § Join, docs/multiplayer-plan.md §4.3).
  | { view: 'join'; code: string; token: string }
  // The operator telemetry view. Unlisted rather than secret: reaching the route
  // renders nothing unless the API recognises the caller as an admin, and the API
  // answers 404 to everyone else.
  | { view: 'health' }
  // Creator control panel: own games, draft build (ex-status), playtest, improve.
  // `/status/:token` is accepted as an alias and resolves here too.
  | { view: 'studio'; token?: string }
  // Privacy policy and terms. Reachable without a session — someone deciding whether
  // to sign in has to be able to read what signing in would mean first.
  | { view: 'legal'; doc: LegalDocId }
  // Public contact form. Same early-exit posture as legal: a contact point behind
  // sign-in is not a published contact point.
  | { view: 'contact' }
  // Unknown / invalid path. Kept as its own view so a typo or stale bookmark shows a
  // real 404 instead of silently dumping the visitor on the home catalog.
  | { view: 'notFound' };

// Game slugs are lowercase kebab-case (matches the games-repo catalog); keep the
// route pattern strict so arbitrary path segments can't masquerade as a play route.
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Canonical play prefix is `/play`. `/ay` and `/ai` are accepted aliases (same view);
// the app rewrites them to `/play/<slug>` so shared URLs stay consistent.
const PLAY_PREFIX_PATTERN = /^\/(play|ay|ai)\/([^/]+)$/;

/**
 * Parse the SPA route from pathname (+ optional hash for the join credential).
 * Unknown / invalid paths become `notFound` (not home) so the URL stays visible.
 */
export function parsePathRoute(pathname: string, hash = ''): AppRoute {
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash;

  if (normalizedPath === '' || normalizedPath === '/') {
    return { view: 'home' };
  }

  if (normalizedPath === '/privacy') {
    return { view: 'legal', doc: 'privacy' };
  }

  if (normalizedPath === '/terms') {
    return { view: 'legal', doc: 'terms' };
  }

  if (normalizedPath === '/contact') {
    return { view: 'contact' };
  }

  const statusMatch = normalizedPath.match(/^\/status\/([^/]+)$/);
  if (statusMatch?.[1]) {
    // Legacy status URLs land in Creator Studio — the draft Build tab is the
    // former status / "dev studio" page, now unified with playtest + improve.
    return { view: 'studio', token: decodeURIComponent(statusMatch[1]) };
  }

  const playMatch = normalizedPath.match(PLAY_PREFIX_PATTERN);
  if (playMatch?.[2]) {
    const slug = decodeURIComponent(playMatch[2]);
    if (SLUG_PATTERN.test(slug)) {
      return { view: 'play', slug };
    }
  }

  const draftMatch = normalizedPath.match(/^\/draft\/([^/]+)$/);
  if (draftMatch?.[1]) {
    const slug = decodeURIComponent(draftMatch[1]);
    if (SLUG_PATTERN.test(slug)) {
      return { view: 'draft', slug };
    }
  }

  if (normalizedPath === '/health') {
    return { view: 'health' };
  }

  if (normalizedPath === '/studio') {
    return { view: 'studio' };
  }

  const studioMatch = normalizedPath.match(/^\/studio\/([^/]+)$/);
  if (studioMatch?.[1]) {
    return { view: 'studio', token: decodeURIComponent(studioMatch[1]) };
  }

  // Hybrid join: /join/<code>#<token> — credential stays out of the request line.
  const joinMatch = normalizedPath.match(/^\/join\/([A-Z0-9]{6})$/);
  if (joinMatch?.[1] && fragment && /^[A-Za-z0-9_-]+$/.test(fragment)) {
    return { view: 'join', code: joinMatch[1], token: fragment };
  }

  return { view: 'notFound' };
}

/** @deprecated Prefer {@link studioPath}. Kept so old `/status/` links and call sites still resolve. */
export function statusPath(token: string): string {
  return studioPath(token);
}

/** Canonical play URL. Emit this; `/ay/<slug>` and `/ai/<slug>` only as inbound aliases. */
export function playPath(slug: string): string {
  return `/play/${encodeURIComponent(slug)}`;
}

/**
 * If pathname is a play alias (`/ay/…` or `/ai/…`), return the canonical `/play/…`
 * path to rewrite to. Otherwise null (already canonical, or not a play route).
 */
export function canonicalPlayPath(pathname: string): string | null {
  const route = parsePathRoute(pathname);
  if (route.view !== 'play') return null;
  const canonical = playPath(route.slug);
  return pathname === canonical ? null : canonical;
}

export function draftPath(slug: string): string {
  return `/draft/${encodeURIComponent(slug)}`;
}

/** Creator control panel. Optional token deep-links into one game on the shelf. */
export function studioPath(token?: string): string {
  return token ? `/studio/${encodeURIComponent(token)}` : '/studio';
}

/** QR / share URL path+fragment for a multiplayer lobby guest. */
export function joinPath(code: string, token: string): string {
  return `/join/${code}#${token}`;
}

/**
 * Fired on `window` after an in-app navigation, with `detail.path` set to the new
 * path. `history.pushState` fires nothing, so without this the only way for code
 * outside the App component — analytics, most obviously — to notice that the route
 * changed is to monkey-patch `history.pushState`, which is a global side effect that
 * breaks confusingly and does not compose if two modules try it.
 *
 * Listeners should treat this as a hint to re-read `window.location`, not as the
 * source of truth. `popstate` still covers back/forward; this covers only the
 * programmatic pushes that the browser stays silent about.
 */
export const NAVIGATE_EVENT = 'gdpl:navigate';

export type NavigateEventDetail = { path: string };

/**
 * URL for a legal document, optionally pointing at one section:
 * `/terms#zglaszanie`. Legal documents get cited clause by clause — in a takedown
 * notice, in a reply to a user — so a link has to be able to land on one.
 */
export function legalPath(doc: LegalDocId, sectionId?: string): string {
  return sectionId ? `/${doc}#${sectionId}` : `/${doc}`;
}

/** URL for the public contact form. */
export function contactPath(): string {
  return '/contact';
}

/**
 * The section anchor carried by a legal URL's fragment.
 *
 * The browser will not do this scroll for us: the target section does not exist in
 * the DOM when the fragment is first parsed, because React has not rendered it yet.
 * Returns null for the join route's credential fragment shape — that one is a token,
 * not a heading, and must never be treated as a scroll target.
 */
export function legalAnchor(hash: string): string | null {
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash;
  return fragment ? fragment : null;
}
