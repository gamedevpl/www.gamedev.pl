import type { AppRoute } from './router';

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

export type DocumentTitleCopy = {
  /** Full home title, e.g. "Gamedev.pl — Describe a game, play it". */
  home: string;
  status: string;
  draft: string;
  join: string;
  health: string;
  privacy: string;
  terms: string;
};

export type DocumentTitleContext = {
  copy: DocumentTitleCopy;
  /** Known title for the game on a `/play/<slug>` route (catalog or humanized slug). */
  playTitle?: string | null;
  /** Known title for a `/status/<token>` submission (from localStorage, if any). */
  statusTitle?: string | null;
  /** Title of an ephemeral theater open on the home route (generated / party). */
  stageTitle?: string | null;
};

/**
 * Map the current SPA route (+ optional known titles) to a `document.title` string.
 * Pure so unit tests don't need to mount React.
 */
export function resolveDocumentTitle(route: AppRoute, ctx: DocumentTitleContext): string {
  switch (route.view) {
    case 'home':
      return ctx.stageTitle ? brandedPageTitle(ctx.stageTitle) : ctx.copy.home;
    case 'play':
      return brandedPageTitle(ctx.playTitle?.trim() || humanizeSlug(route.slug));
    case 'draft':
      return brandedPageTitle(ctx.copy.draft);
    case 'status':
      return brandedPageTitle(ctx.statusTitle?.trim() || ctx.copy.status);
    case 'join':
      return brandedPageTitle(ctx.copy.join);
    case 'health':
      return brandedPageTitle(ctx.copy.health);
    case 'legal':
      return brandedPageTitle(route.doc === 'privacy' ? ctx.copy.privacy : ctx.copy.terms);
  }
}

/** Turn `sky-dodge` into `Sky Dodge` when the catalog hasn't loaded yet. */
export function humanizeSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
