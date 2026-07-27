import type { AppRoute } from './router.js';

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
  status: string;
  draft: string;
  join: string;
  health: string;
  privacy: string;
  terms: string;
  contact: string;
  notFound: string;
  /** Prefixed template for a playable game name, e.g. "Play {{title}}". */
  playNamed: string;
  /** Prefixed template for a draft's real name, e.g. "Draft {{title}}". */
  draftNamed: string;
  /** Prefixed template for a tracked submission name, e.g. "Status · {{title}}". */
  statusNamed: string;
};

export type DocumentTitleContext = {
  copy: DocumentTitleCopy;
  /** Known title for the game on a `/play/<slug>` route (catalog or humanized slug). */
  playTitle?: string | null;
  /** Known title for a `/status/<token>` submission (from localStorage, if any). */
  statusTitle?: string | null;
  /** Real draft name once `/draft/<slug>` finishes loading; null while pending. */
  draftTitle?: string | null;
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
      return ctx.stageTitle ? brandedNamedTitle(ctx.copy.playNamed, ctx.stageTitle) : ctx.copy.home;
    case 'play':
      return brandedNamedTitle(ctx.copy.playNamed, ctx.playTitle?.trim() || humanizeSlug(route.slug));
    case 'draft':
      return ctx.draftTitle?.trim()
        ? brandedNamedTitle(ctx.copy.draftNamed, ctx.draftTitle)
        : brandedPageTitle(ctx.copy.draft);
    case 'status':
      return ctx.statusTitle?.trim()
        ? brandedNamedTitle(ctx.copy.statusNamed, ctx.statusTitle)
        : brandedPageTitle(ctx.copy.status);
    case 'join':
      return brandedPageTitle(ctx.copy.join);
    case 'health':
      return brandedPageTitle(ctx.copy.health);
    case 'legal':
      return brandedPageTitle(route.doc === 'privacy' ? ctx.copy.privacy : ctx.copy.terms);
    case 'contact':
      return brandedPageTitle(ctx.copy.contact);
    case 'notFound':
      return brandedPageTitle(ctx.copy.notFound);
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
