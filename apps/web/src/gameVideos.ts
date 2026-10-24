// Kept here, not in the footer, so the svg-free play bundle can import it.
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

// X has no per-game page; covered games link the brand account.
export function gameXUrl(slug: string, placement: SocialLinkPlacement): string {
  return withUtm(X_URL, placement, slug);
}

// YouTube playlist per catalog slug, kept by hand.
const GAME_PLAYLISTS: Record<string, string> = {
  'apex-sprint': 'PLMhvPo98AAqU',
  'biplane-skirmish': 'PLCzEu2PKzyNw',
  'cessna-lite': 'PLfeG9VITXIog',
  'constantinople-siege': 'PLQIlqPK9n6Pc',
  'ink-and-fury': 'PLOfq3ovvIrtw',
  'neon-strike-cell': 'PLY7sPqQio92s',
  'transport-tycoon-remake': 'PLQNtzBpeENrE',
  'trenchline-command': 'PLOjEHsPPD9oQ',
  'unicorn-snap': 'PLf-DUgsT_lSc',
};

// Tagged playlist link, or null when the game has none.
export function gameVideosUrl(slug: string, placement: SocialLinkPlacement): string | null {
  const list = Object.hasOwn(GAME_PLAYLISTS, slug) ? GAME_PLAYLISTS[slug] : undefined;
  if (!list) return null;
  return withUtm(`https://www.youtube.com/playlist?list=${list}`, placement, slug);
}
