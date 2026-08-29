import type { AppRoute } from './core/router.js';

/** Brand suffix used on every non-home tab title. */
export const SITE_BRAND = 'Gamedev.pl';

/**
 * Build a tab title as `{page} — Gamedev.pl`. Empty/whitespace falls back to the
 * brand alone so we never emit a dangling em dash.
 */
export function brandedPageTitle(page: string): string {
  const trimmed = page.trim();
  return trimmed ? `${trimmed} — ${SITE_BRAND}` : SITE_BRAND;
}

/**
 * Apply a `{{title}}` template then brand it. User-supplied names (game titles)
 * must go through a prefixed template — never `brandedPageTitle(rawName)` alone —
 * so a game called "Privacy Policy" cannot spoof the legal tab title.
 */
export function brandedNamedTitle(template: string, title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return SITE_BRAND;
  return brandedPageTitle(template.replace(/\{\{\s*title\s*\}\}/g, trimmed));
}

export type DocumentTitleCopy = {
  /** Full home title, e.g. "Gamedev.pl — Describe a game, play it". */
  home: string;
  join: string;
  invite: string;
  health: string;
  review: string;
  studio: string;
  privacy: string;
  terms: string;
  contact: string;
  create: string;
  party: string;
  proposals: string;
  notFound: string;
  /** Prefixed template for a playable game name, e.g. "Play {{title}}". */
  playNamed: string;
  /** Prefixed template when studio is deep-linked to a named game. */
  studioNamed: string;
  /** Prefixed template for a creator profile, e.g. "{{title}}" (same placeholder as playNamed). */
  creatorNamed: string;
  /** Prefixed template for a public game page, e.g. "{{title}}". */
  gameNamed: string;
};

export type DocumentTitleContext = {
  copy: DocumentTitleCopy;
  /** Known title for the game on a `/play/<slug>` route (catalog, draft, or humanized slug). */
  playTitle?: string | null;
  /** Known title for a `/studio/<token>` (or legacy `/status/<token>`) submission. */
  studioTitle?: string | null;
  /** Title of an ephemeral theater open on the home route (generated / party). */
  stageTitle?: string | null;
  /** Display name for `/:handle` once the profile loads. */
  creatorName?: string | null;
  /** Real game title for `/:handle/:slug` once the page loads. */
  gameTitle?: string | null;
};

/**
 * Map the current SPA route (+ optional known titles) to a `document.title` string.
 * Pure so unit tests don't need to mount React.
 */
export function resolveDocumentTitle(route: AppRoute, ctx: DocumentTitleContext): string {
  switch (route.view) {
    case 'home':
      return ctx.stageTitle ? brandedNamedTitle(ctx.copy.playNamed, ctx.stageTitle) : ctx.copy.home;
    case 'play':
      return brandedNamedTitle(ctx.copy.playNamed, ctx.playTitle?.trim() || humanizeSlug(route.slug));
    case 'join':
      return brandedPageTitle(ctx.copy.join);
    case 'invite':
      return brandedPageTitle(ctx.copy.invite);
    case 'admin':
      return brandedPageTitle(ctx.copy.health);
    case 'review':
      return brandedPageTitle(ctx.copy.review);
    case 'studio':
    case 'studioWelcome':
    case 'studioConnect':
      return ctx.studioTitle?.trim()
        ? brandedNamedTitle(ctx.copy.studioNamed, ctx.studioTitle)
        : brandedPageTitle(ctx.copy.studio);
    case 'legal':
      return brandedPageTitle(route.doc === 'privacy' ? ctx.copy.privacy : ctx.copy.terms);
    case 'contact':
      return brandedPageTitle(ctx.copy.contact);
    case 'create':
      return brandedPageTitle(ctx.copy.create);
    case 'party':
      return brandedPageTitle(ctx.copy.party);
    case 'proposals':
      return brandedPageTitle(ctx.copy.proposals);
    case 'creator':
      return brandedNamedTitle(ctx.copy.creatorNamed, ctx.creatorName?.trim() || route.handle);
    case 'game':
      return brandedNamedTitle(ctx.copy.gameNamed, ctx.gameTitle?.trim() || humanizeSlug(route.slug));
    case 'notFound':
      return brandedPageTitle(ctx.copy.notFound);
    default: {
      const _exhaustive: never = route;
      return _exhaustive;
    }
  }
}

/** Default name when keeping a remix — handle when claimed, otherwise a clear remix label. */
export function suggestedKeepTitle(slug: string, handle?: string): string {
  const base = humanizeSlug(slug);
  const title = handle ? `${base} (edit by @${handle})` : `Remix of ${base}`;
  return title.slice(0, 80);
}

/** Turn `sky-dodge` into `Sky Dodge` when the catalog hasn't loaded yet. */
export function humanizeSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
