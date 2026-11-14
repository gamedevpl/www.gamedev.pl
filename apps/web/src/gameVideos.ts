import type { CatalogLinks } from '@gamedevpl/contract';

// Here, not in the footer: the play bundle cannot load svg.
export const YOUTUBE_URL = 'https://www.youtube.com/@gamedev_pl';
export const X_URL = 'https://x.com/plgamedev';

// Where the link was clicked; becomes `utm_medium`.
export type SocialLinkPlacement = 'beta_splash' | 'game_page' | 'player_menu';

// Tags an outbound link so its clicks are countable.
export function withUtm(url: string, placement: SocialLinkPlacement, campaign?: string): string {
  const out = new URL(url);
  out.searchParams.set('utm_source', 'gamedev.pl');
  out.searchParams.set('utm_medium', placement);
  if (campaign) out.searchParams.set('utm_campaign', campaign);
  return out.toString();
}

export const splashYouTubeUrl = withUtm(YOUTUBE_URL, 'beta_splash');
export const splashXUrl = withUtm(X_URL, 'beta_splash');

// SPEC links, tagged; X falls back to the brand account.
export function gameSocialLinks(
  slug: string,
  links: CatalogLinks | null | undefined,
  placement: SocialLinkPlacement,
): { youtube: string | null; x: string } | null {
  if (!links?.youtube && !links?.x) return null;
  return {
    youtube: links.youtube ? withUtm(links.youtube, placement, slug) : null,
    x: withUtm(links.x ?? X_URL, placement, slug),
  };
}
