/**
 * Turning a creator's title into the name a game is addressed by, for its whole life.
 *
 * A slug used to be the agent's to choose, learned the first time it delivered or the
 * first time a pull request touched `games/<something>/`. That left every build with a
 * stretch — minutes at best, an hour at worst — during which the game we were building
 * had no name we could put in a URL, which is why the creator's own studio addressed it
 * by an HMAC capability token instead. Minting it here, at submission, from the title
 * the creator just confirmed, is what lets the slug be the address from the first second.
 *
 * Pure except for the caller-supplied `isTaken` probe, so the shape of a slug can be
 * tested without a store, a catalog, or a network.
 */

/**
 * Long enough to stay recognisable as the creator's title, short enough to be a URL a
 * person can read out. The delivery contract's own ceiling is 64, and a collision
 * suffix has to fit under it.
 */
const MAX_SLUG_LENGTH = 48;

/** What a title reduces to when it has no ASCII-able characters at all. */
const FALLBACK_SLUG = 'game';

/**
 * Path segments the app itself uses. None of them can currently collide — a game slug
 * is always addressed under `/play/` or `/studio/` — but a game called
 * "admin" is a trap laid for the next person who adds a route, and the cost of not
 * laying it is this list.
 */
const RESERVED_SLUGS = new Set([
  'admin',
  'api',
  'contact',
  'draft',
  'health',
  'join',
  'new',
  'play',
  'privacy',
  'studio',
  'status',
  'terms',
]);

/**
 * Letters that survive Unicode decomposition unchanged and would otherwise be dropped.
 *
 * `NFD` splits "ó" into an o and a combining accent, so stripping the accents leaves the
 * letter — but Polish "ł" is a single indivisible codepoint, and so are these others.
 * Without the map, "Łódź" slugs to "d", which is not a name anybody would recognise as
 * theirs. Polish is the second language this site is written in, so this is not an edge
 * case here.
 */
const INDIVISIBLE_LETTERS: Array<[RegExp, string]> = [
  [/ł/g, 'l'],
  [/đ/g, 'd'],
  [/ð/g, 'd'],
  [/ø/g, 'o'],
  [/þ/g, 'th'],
  [/ß/g, 'ss'],
  [/æ/g, 'ae'],
  [/œ/g, 'oe'],
];

/**
 * The slug a title wants, before uniqueness is considered.
 *
 * Always a valid slug: lowercase, `[a-z0-9-]`, no leading, trailing or doubled dashes,
 * never empty, never a reserved word. A title of pure emoji or pure punctuation is a
 * real thing a creator can type, and it lands on the fallback rather than on ''.
 */
export function slugifyTitle(title: string): string {
  let working = title.toLowerCase();
  for (const [pattern, replacement] of INDIVISIBLE_LETTERS) {
    working = working.replace(pattern, replacement);
  }

  const base = working
    .normalize('NFD')
    // Combining marks left behind by the decomposition above.
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!base) return FALLBACK_SLUG;

  // Cut at a dash rather than mid-word, the same courtesy the title suggestion gets.
  let clipped = base.slice(0, MAX_SLUG_LENGTH);
  if (base.length > MAX_SLUG_LENGTH) {
    const lastDash = clipped.lastIndexOf('-');
    if (lastDash > 0) clipped = clipped.slice(0, lastDash);
  }
  clipped = clipped.replace(/^-+|-+$/g, '');

  if (!clipped) return FALLBACK_SLUG;
  // A reserved word is suffixed rather than replaced: the creator called it "Play",
  // and "play-2" still reads as theirs where "game" would not.
  return RESERVED_SLUGS.has(clipped) ? `${clipped}-2` : clipped;
}

/**
 * A slug for this title that nothing else is using.
 *
 * `isTaken` is asked about each candidate in turn; the caller decides what taken means
 * (another build, a published game, a name that has been taken down and should not be
 * reused). Numbered rather than randomised because the numbers are for humans: the
 * second "space miner" being `space-miner-2` is a fact a creator can hold in their head.
 *
 * **Not atomic**, and it cannot be: the probe is a read and the write happens later, so
 * two submissions racing on the same title can both be told a name is free. The window
 * is small and the consequence is bounded — two jobs pointing at one slug, where the
 * newest wins on lookup — but a hard guarantee would need a claim document keyed by the
 * slug itself, and that is worth building only if it ever actually bites.
 */
export async function mintGameSlug(
  title: string,
  isTaken: (slug: string) => Promise<boolean>,
  options: { maxAttempts?: number } = {},
): Promise<string> {
  const base = slugifyTitle(title);
  const maxAttempts = options.maxAttempts ?? 20;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const candidate = attempt === 1 ? base : `${base}-${attempt}`;
    if (!(await isTaken(candidate))) return candidate;
  }

  // Twenty games of one name is not a collision pattern, it is either a very popular
  // title or a probe that answers "taken" to everything. Either way the build must not
  // be refused over its address, so it gets one that cannot collide.
  return `${base}-${Date.now().toString(36)}`;
}
