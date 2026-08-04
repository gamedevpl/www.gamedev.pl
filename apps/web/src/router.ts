import type { LegalDocId } from './legal/types.js';

/**
 * Creator Studio work surface. Persisted in the URL so a refresh or shared link
 * reopens the same surface on the same game.
 *
 * Three, where there were five. Making a game is a conversation with an agent, and the
 * studio was five tabs across the top of it — with the same act (say what to change)
 * living in three of them, so which box a creator was allowed depended on a lifecycle
 * state they had to know to find it. Now: the thread, the things beside the thread, and
 * the one surface that genuinely takes over the screen.
 */
export type StudioTab = 'thread' | 'details' | 'playtest' | 'edit';

/**
 * Every name a surface has answered to, including the five-tab vocabulary that came
 * before. Old names resolve to the surface that absorbed them and the studio rewrites
 * the URL, so a bookmark or a notification link from months ago lands somewhere real
 * and quietly becomes current.
 */
const STUDIO_TAB_ALIASES: Record<string, StudioTab> = {
  thread: 'thread',
  build: 'thread',
  improve: 'thread',
  details: 'details',
  overview: 'details',
  stats: 'details',
  playtest: 'playtest',
  // The content editor (EditorKit). Only games whose delivered version ships an
  // editor definition render the surface; for every other game the studio
  // resolves the URL and falls back to the thread.
  edit: 'edit',
  editor: 'edit',
};

/** The surface this URL segment names, or null when it names nothing. */
export function parseStudioTab(value: string): StudioTab | null {
  return STUDIO_TAB_ALIASES[value] ?? null;
}

export function isStudioTab(value: string): value is StudioTab {
  return parseStudioTab(value) !== null;
}

/**
 * Public game page tabs — the "repo page" layout at `/:handle/:slug`. The default
 * surface (the playable game) carries no URL segment, so only the four secondary
 * tabs appear here. Keep the vocabulary aligned with `GAME_PAGE_PATTERN` in
 * apps/api/src/spa-paths.ts.
 */
export const GAME_PAGE_TABS = ['board', 'review', 'releases', 'sources'] as const;
export type GamePageTab = (typeof GAME_PAGE_TABS)[number];

export function isGamePageTab(value: string): value is GamePageTab {
  return (GAME_PAGE_TABS as readonly string[]).includes(value);
}

/**
 * Operator console sections, in the order they are offered.
 *
 * `queue` leads because it is the only one with something to do in it; the rest are
 * things to look at. In the URL so a refresh, a bookmark, or the link in an alert
 * notification lands on the section it meant rather than on whichever one is first.
 */
export const ADMIN_SECTIONS = [
  'queue',
  'costs',
  'telemetry',
  'limits',
  'tokens',
  'suggestions',
  // Proposals against platform-owned catalog games. Beside `suggestions` because both are
  // inbound work the operator decides on, rather than something to look at.
  'proposals',
  'waitlist',
] as const;
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
  //
  // `game` addresses one game on the creator's shelf. It is a **slug** — games are
  // given one at submission now, so there is no window where a build has no readable
  // address — but it is deliberately left opaque here, because the same segment used to
  // carry a capability token and those URLs are in notification emails and browser
  // histories. The studio resolves it against the shelf by either, then rewrites the
  // URL to the slug, which is how an old token link upgrades itself on first use.
  //
  // Nothing is fetched by this value: the shelf comes from the signed-in creator's own
  // games, so a slug belonging to somebody else resolves to nothing at all.
  //
  // `/status/:token` is accepted as an alias and resolves here too. Optional `tab`
  // deep-links into a work surface (`/studio/tv-tycoon/build`).
  | { view: 'studio'; game?: string; tab?: StudioTab }
  // Privacy policy and terms. Reachable without a session — someone deciding whether
  // to sign in has to be able to read what signing in would mean first.
  | { view: 'legal'; doc: LegalDocId }
  // Public contact form. Same early-exit posture as legal: a contact point behind
  // sign-in is not a published contact point.
  | { view: 'contact' }
  // The proposer's tracker: changes this person has proposed to other people's games,
  // and what happened to them. Signed-in only, and deliberately its own address rather
  // than a Studio tab — a proposal is not one of your games, and the shelf is.
  | { view: 'proposals' }
  // Public creator profile. Reachable without a session — the byline destination for
  // published games. The canonical address is `/:handle`; `/creators/:handle` remains
  // an alias for links minted before profiles moved to the root namespace. Handle shape
  // matches the API (`^[a-z][a-z0-9_]{2,23}$`).
  | { view: 'creator'; handle: string }
  // Public game page — the "repo page" nested under the creator profile, GitHub-style
  // (`/:handle/:slug`). Reachable without a session, same as the profile above: the
  // page is a landing page, and only *playing* is gated during closed beta. `tab`
  // absent is the default surface (the playable game); the named tabs are the
  // board / review / releases / sources secondary surfaces.
  | { view: 'game'; handle: string; slug: string; tab?: GamePageTab }
  // Unknown / invalid path. Kept as its own view so a typo or stale bookmark shows a
  // real 404 instead of silently dumping the visitor on the home catalog.
  | { view: 'notFound' };

// Game slugs are lowercase kebab-case (matches the games-repo catalog); keep the
// route pattern strict so arbitrary path segments can't masquerade as a play route.
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Creator handles — keep aligned with apps/api/src/creator-profile.ts HANDLE_PATTERN. */
const CREATOR_HANDLE_PATTERN = /^[a-z][a-z0-9_]{2,23}$/;

/**
 * Where games with no creator to name live — keep aligned with `PLATFORM_HANDLE` in
 * apps/api/src/creator-profile.ts. Reserved against claiming, but a real address.
 */
export const PLATFORM_HANDLE = 'gamedevpl';

/**
 * Handles nobody can claim — keep aligned with `RESERVED_HANDLES` in
 * apps/api/src/creator-profile.ts (same duplication contract as spa-paths.ts).
 * The game-page matcher checks it so `/health/<slug>`-shaped typos stay 404s on
 * the client exactly as the API's shell allowlist answers them.
 */
const RESERVED_HANDLE_SEGMENTS = new Set([
  'admin',
  'administrator',
  'anonymous',
  'api',
  'auth',
  'contact',
  'creator',
  'creators',
  'dev',
  'draft',
  'gamedev',
  'gamedevpl',
  'health',
  'help',
  'join',
  'me',
  'null',
  'official',
  'play',
  'platform',
  'privacy',
  'root',
  'status',
  'studio',
  'support',
  'system',
  'terms',
  'undefined',
  'www',
]);

// Canonical play prefix is `/play`. `/ay` and `/ai` are accepted aliases (same view);
// the app rewrites them to `/play/<slug>` so shared URLs stay consistent.
const PLAY_PREFIX_PATTERN = /^\/(play|ay|ai)\/([^/]+)$/;

/**
 * Percent-decode one path segment, or null when it is not decodable.
 *
 * `decodeURIComponent` throws on malformed encoding — `/play/%E0` is a URIError, not a
 * bad slug — and a throw here takes the whole app down on a route parse, which is the
 * one function in the client that must never fail. A segment that cannot be decoded is
 * a segment that cannot match anything, so null flows into the same `notFound` every
 * other unrecognised path takes. The API's shell allowlist has always guarded these the
 * same way (see spa-paths.ts); the client simply did not.
 */
function decodeSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

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

  const creatorMatch = normalizedPath.match(/^\/creators\/([^/]+)$/);
  if (creatorMatch?.[1]) {
    const handle = decodeSegment(creatorMatch[1]);
    if (handle && CREATOR_HANDLE_PATTERN.test(handle)) {
      return { view: 'creator', handle };
    }
    return { view: 'notFound' };
  }

  const statusMatch = normalizedPath.match(/^\/status\/([^/]+)$/);
  if (statusMatch?.[1]) {
    // Legacy status URLs land in Creator Studio — the draft Build tab is the
    // former status / "dev studio" page, now unified with playtest + improve.
    const token = decodeSegment(statusMatch[1]);
    if (token) return { view: 'studio', game: token };
  }

  const playMatch = normalizedPath.match(PLAY_PREFIX_PATTERN);
  if (playMatch?.[2]) {
    const slug = decodeSegment(playMatch[2]);
    if (slug && SLUG_PATTERN.test(slug)) {
      return { view: 'play', slug };
    }
  }

  const draftMatch = normalizedPath.match(/^\/draft\/([^/]+)$/);
  if (draftMatch?.[1]) {
    const slug = decodeSegment(draftMatch[1]);
    if (slug && SLUG_PATTERN.test(slug)) {
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
    // Matched raw rather than decoded: every section name is fixed lowercase ASCII, so
    // an encoded one is not a section by definition and there is nothing to decode.
    const section = adminMatch[1];
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

  if (normalizedPath === '/proposals') {
    return { view: 'proposals' };
  }

  // `/studio/:game` or `/studio/:game/:tab`. A third segment that is not a known
  // tab is a 404 rather than a silent fallback to the game-only view: it keeps the
  // client in step with the API's shell allowlist, which serves those paths a real 404.
  const studioMatch = normalizedPath.match(/^\/studio\/([^/]+)(?:\/([^/]+))?$/);
  if (studioMatch?.[1]) {
    const game = decodeSegment(studioMatch[1]);
    const tabSegment = studioMatch[2] ? decodeSegment(studioMatch[2]) : undefined;
    if (game === null || tabSegment === null) {
      return { view: 'notFound' };
    }
    if (!tabSegment) {
      return { view: 'studio', game };
    }
    // Resolved, not passed through: the route carries the surface, and an old name for
    // it stops existing the moment it is parsed.
    const tab = parseStudioTab(tabSegment);
    if (!tab) {
      return { view: 'notFound' };
    }
    return { view: 'studio', game, tab };
  }

  // Hybrid join: /join/<code>#<token> — credential stays out of the request line.
  const joinMatch = normalizedPath.match(/^\/join\/([A-Z0-9]{6})$/);
  if (joinMatch?.[1] && fragment && /^[A-Za-z0-9_-]+$/.test(fragment)) {
    return { view: 'join', code: joinMatch[1], token: fragment };
  }

  // Root creator profile. This comes after every first-class product route so `/play`,
  // `/studio`, `/privacy`, etc. keep their meaning. Those segments are also reserved at
  // handle-claim time; the ordering here is defense in depth for old data and typos.
  const rootHandle = decodeSegment(normalizedPath.slice(1));
  if (!normalizedPath.slice(1).includes('/') && rootHandle && CREATOR_HANDLE_PATTERN.test(rootHandle)) {
    return { view: 'creator', handle: rootHandle };
  }

  // Public game page: `/:handle/:slug` (+ optional tab). Last for the same reason the
  // root profile is late — every first-class segment above keeps its meaning, and the
  // product segments are additionally reserved at handle-claim time, so a real handle
  // can never collide with them. An unknown tab segment is a 404, not a fallback,
  // matching the studio tabs and the API's shell allowlist.
  const gameMatch = normalizedPath.match(/^\/([^/]+)\/([^/]+)(?:\/([^/]+))?$/);
  if (gameMatch?.[1] && gameMatch[2]) {
    const handle = decodeSegment(gameMatch[1]);
    const slug = decodeSegment(gameMatch[2]);
    const tabSegment = gameMatch[3] ? decodeSegment(gameMatch[3]) : undefined;
    if (
      handle &&
      CREATOR_HANDLE_PATTERN.test(handle) &&
      // The platform handle is reserved against claiming but *is* an address: it is
      // where games with no creator to name live. Keep aligned with spa-paths.ts.
      (handle === PLATFORM_HANDLE || !RESERVED_HANDLE_SEGMENTS.has(handle)) &&
      slug &&
      SLUG_PATTERN.test(slug) &&
      tabSegment !== null
    ) {
      if (!tabSegment) {
        return { view: 'game', handle, slug };
      }
      if (isGamePageTab(tabSegment)) {
        return { view: 'game', handle, slug, tab: tabSegment };
      }
    }
  }

  return { view: 'notFound' };
}

/** @deprecated Prefer {@link studioPath}. Kept so old `/status/` links and call sites still resolve. */
export function statusPath(token: string): string {
  return studioPath(token);
}

/**
 * Whether a studio path segment names a game the way we now write them.
 *
 * Used to decide when a URL is already canonical. A capability token is base64url and
 * can, rarely, be all-lowercase and dash-free — so this is a test of shape, not proof
 * of which kind of address it is; the studio resolves it against the shelf either way.
 */
export function looksLikeSlug(segment: string): boolean {
  return SLUG_PATTERN.test(segment);
}

/** Canonical play URL. Emit this; `/ay/<slug>` and `/ai/<slug>` only as inbound aliases. */
export function playPath(slug: string): string {
  return `/play/${encodeURIComponent(slug)}`;
}

/**
 * The current address for a path that has more than one, or null when the path given is
 * already it.
 *
 * Aliases accumulate as surfaces move. `/ay` and `/ai` are short forms of `/play`;
 * `/status/:token` is where the build page lived before Creator Studio absorbed it;
 * `/health` is where the operator console lived before it had sections. Every one of
 * them still resolves, and that is not negotiable — links live in bookmarks, in old
 * emails, in notifications sent months ago, and breaking them to tidy a route table
 * would be a strange kind of housekeeping.
 *
 * What this adds is the second half: the browser is put back on the current address, so
 * a URL copied out of the bar is one that will still make sense next year, and a page
 * someone reports as broken names something that still exists. The rewrite is a
 * `replaceState`, so the alias does not become a history entry to go Back through.
 */
export function canonicalPath(pathname: string): string | null {
  const route = parsePathRoute(pathname);
  const canonical = ((): string | null => {
    switch (route.view) {
      case 'play':
        return playPath(route.slug);
      // Including a bare `/admin`, which lands on the queue: the section a page is
      // showing belongs in the URL, or a refresh is a different page than a reload.
      case 'admin':
        return adminPath(route.section);
      // Only the addressed form. `/studio` itself is canonical, and a tab is added by
      // the view once it knows which game it is showing rather than here. Rewriting a
      // token to its slug also happens there, for the same reason: it takes the shelf.
      case 'studio':
        return route.game ? studioPath(route.game, route.tab) : null;
      case 'creator':
        return creatorPath(route.handle);
      case 'game':
        return gamePath(route.handle, route.slug, route.tab);
      default:
        return null;
    }
  })();
  return canonical && canonical !== pathname ? canonical : null;
}

/**
 * @deprecated Prefer {@link canonicalPath}, which covers every alias rather than only
 * the play prefixes. Kept as its own export because the play aliases are the pair most
 * likely to be reached for by name.
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
 * Creator control panel. Optional `game` (a slug, or a legacy capability token)
 * deep-links into one game on the shelf; optional tab deep-links into a work surface
 * on that game.
 */
export function studioPath(game?: string, tab?: StudioTab): string {
  if (!game) return '/studio';
  const base = `/studio/${encodeURIComponent(game)}`;
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
  labelKey: 'upHome' | 'upStudio' | 'upCreator';
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
      // `/studio/:game`. CreatorStudioView canonicalizes a bare game URL onto the
      // default tab (Build for in-progress games), which would immediately undo an
      // Up that only stripped the tab and make the chevron look broken.
      if (route.game) {
        return { path: studioPath(), labelKey: 'upStudio' };
      }
      return { path: '/', labelKey: 'upHome' };
    case 'game':
      // The page is nested under the creator profile the way a repo nests under its
      // owner, so Up goes to that profile rather than to the homepage.
      return { path: creatorPath(route.handle), labelKey: 'upCreator' };
    case 'admin':
    case 'legal':
    case 'contact':
    case 'creator':
    case 'proposals':
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

/** URL for a public creator profile. */
export function creatorPath(handle: string): string {
  return `/${handle}`;
}

/** URL for a public game page, optionally deep-linked into a secondary tab. */
export function gamePath(handle: string, slug: string, tab?: GamePageTab): string {
  const base = `/${encodeURIComponent(handle)}/${encodeURIComponent(slug)}`;
  return tab ? `${base}/${tab}` : base;
}

/** The proposer's tracker. */
export function proposalsPath(): string {
  return '/proposals';
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
