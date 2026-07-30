import type { LegalDocId } from './legal/types.js';

/** Creator Studio work surface. Persisted in the URL so a refresh or shared link
 * reopens the same tab on the same game. */
export type StudioTab = 'overview' | 'build' | 'playtest' | 'stats' | 'improve';

const STUDIO_TABS = new Set<StudioTab>(['overview', 'build', 'playtest', 'stats', 'improve']);

export function isStudioTab(value: string): value is StudioTab {
  return STUDIO_TABS.has(value as StudioTab);
}

/**
 * Operator console sections, in the order they are offered.
 *
 * `queue` leads because it is the only one with something to do in it; the rest are
 * things to look at. In the URL so a refresh, a bookmark, or the link in an alert
 * notification lands on the section it meant rather than on whichever one is first.
 */
export const ADMIN_SECTIONS = ['queue', 'costs', 'telemetry', 'limits', 'tokens', 'suggestions'] as const;
export type AdminSection = (typeof ADMIN_SECTIONS)[number];

export function isAdminSection(value: string): value is AdminSection {
  return (ADMIN_SECTIONS as readonly string[]).includes(value);
}

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
  // The operator console. Unlisted rather than secret: reaching the route renders
  // nothing unless the API recognises the caller as an admin, and the API answers 404
  // to everyone else. `/health` still resolves here (telemetry) — it was the whole
  // surface before there was a console, and links to it are in people's bookmarks.
  | { view: 'admin'; section: AdminSection }
  // Creator control panel: own games, draft build (ex-status), playtest, improve.
  // `/status/:token` is accepted as an alias and resolves here too.
  // Optional `tab` deep-links into a work surface (`/studio/:token/build`).
  | { view: 'studio'; token?: string; tab?: StudioTab }
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

  // The console's old address, kept working: it is what the operator has bookmarked.
  if (normalizedPath === '/health') {
    return { view: 'admin', section: 'telemetry' };
  }

  if (normalizedPath === '/admin') {
    return { view: 'admin', section: 'queue' };
  }

  const adminMatch = normalizedPath.match(/^\/admin\/([^/]+)$/);
  if (adminMatch?.[1]) {
    const section = decodeURIComponent(adminMatch[1]);
    // An unknown section is a 404 rather than a silent fall back to the queue — same
    // rule as the studio tabs, and for the same reason: a typo should be visible.
    if (isAdminSection(section)) {
      return { view: 'admin', section };
    }
    return { view: 'notFound' };
  }

  if (normalizedPath === '/studio') {
    return { view: 'studio' };
  }

  // `/studio/:token` or `/studio/:token/:tab`. A third segment that is not a known
  // tab is a 404 rather than a silent fallback to the token-only view: it keeps the
  // client in step with the API's shell allowlist, which serves those paths a real 404.
  const studioMatch = normalizedPath.match(/^\/studio\/([^/]+)(?:\/([^/]+))?$/);
  if (studioMatch?.[1]) {
    const token = decodeURIComponent(studioMatch[1]);
    const tabSegment = studioMatch[2] ? decodeURIComponent(studioMatch[2]) : undefined;
    if (!tabSegment) {
      return { view: 'studio', token };
    }
    if (!isStudioTab(tabSegment)) {
      return { view: 'notFound' };
    }
    return { view: 'studio', token, tab: tabSegment };
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

/**
 * Creator control panel. Optional token deep-links into one game on the shelf;
 * optional tab deep-links into a work surface on that game.
 */
export function studioPath(token?: string, tab?: StudioTab): string {
  if (!token) return '/studio';
  const base = `/studio/${encodeURIComponent(token)}`;
  return tab ? `${base}/${tab}` : base;
}

/**
 * Parent path for the NavHeader "Up" chevron — Android-style Up, not browser Back.
 *
 * Always a real in-app parent so a deep link still has somewhere safe to go.
 * Returns null when the surface owns its own escape (home, join, play/draft
 * theater, studio playtest overlay) or when Up would be meaningless.
 */
export type NavUpTarget = {
  path: string;
  /** i18n key under `header.*` for the button's accessible name. */
  labelKey: 'upHome' | 'upStudio';
};

export function navUpTarget(route: AppRoute): NavUpTarget | null {
  switch (route.view) {
    // Draft opens GameTheater inside DraftView without App `stageContent`, so the
    // header would otherwise keep an Up control behind the aria-modal. Close /
    // the error-page home link own escape here, same as `/play`.
    case 'home':
    case 'join':
    case 'play':
    case 'draft':
      return null;
    case 'studio':
      // Playtest is a full-viewport theater with its own Close back to overview.
      if (route.tab === 'playtest') return null;
      // Any selected-game URL (with or without a tab) goes to the shelf — not to
      // `/studio/:token`. CreatorStudioView canonicalizes a bare token URL onto the
      // default tab (Build for in-progress games), which would immediately undo an
      // Up that only stripped the tab and make the chevron look broken.
      if (route.token) {
        return { path: studioPath(), labelKey: 'upStudio' };
      }
      return { path: '/', labelKey: 'upHome' };
    case 'admin':
    case 'legal':
    case 'contact':
    case 'notFound':
      return { path: '/', labelKey: 'upHome' };
  }
}

/** Path for an operator console section. Used by the tabs and by alert deep links. */
export function adminPath(section: AdminSection = 'queue'): string {
  return `/admin/${section}`;
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
