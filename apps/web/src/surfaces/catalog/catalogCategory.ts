import type { CatalogEntry } from '../../catalog.js';

// Coarse shelves, distinct from genre — free text can't group itself.
export const CATALOG_CATEGORY_IDS = [
  'arcade_racing',
  'rpg_adventure',
  'strategy_sim',
  'puzzle_story',
  'multiplayer_party',
  'more_to_explore',
] as const;

export type CatalogCategoryId = (typeof CATALOG_CATEGORY_IDS)[number];

export function isCatalogCategoryId(value: unknown): value is CatalogCategoryId {
  return typeof value === 'string' && (CATALOG_CATEGORY_IDS as readonly string[]).includes(value);
}

// Checked in order; first keyword match wins. multiplayer_party is granted separately.
const GENRE_KEYWORDS: ReadonlyArray<[Exclude<CatalogCategoryId, 'multiplayer_party' | 'more_to_explore'>, string[]]> = [
  [
    'arcade_racing',
    ['arcade', 'racing', 'shmup', 'shooter', 'runner', 'platformer', 'pinball', 'brawler', 'stealth', 'rhythm'],
  ],
  ['rpg_adventure', ['rpg', 'adventure', 'roguelike', 'soulslike', 'dungeon', 'horror', 'metroidvania']],
  [
    'strategy_sim',
    ['strategy', 'sim', 'builder', 'tycoon', 'trading', 'management', 'sandbox', 'farming', 'tower defense'],
  ],
  [
    'puzzle_story',
    ['puzzle', 'match-3', 'match 3', 'visual novel', 'narrative', 'word', 'trivia', 'quiz', 'collecting'],
  ],
];

// Genre gives one shelf; multiplayer_party is additive on top.
export function categorizeCatalogEntry(entry: Pick<CatalogEntry, 'genre' | 'multiplayer'>): CatalogCategoryId[] {
  const categories: CatalogCategoryId[] = [];
  const genre = entry.genre?.toLowerCase() ?? '';
  const fromGenre = GENRE_KEYWORDS.find(([, keywords]) => keywords.some((keyword) => genre.includes(keyword)));
  categories.push(fromGenre ? fromGenre[0] : 'more_to_explore');
  if (entry.multiplayer) categories.push('multiplayer_party');
  return categories;
}

// Entries carrying a given shelf, in the caller's own order.
export function entriesInCategory<T extends Pick<CatalogEntry, 'genre' | 'multiplayer'>>(
  entries: T[],
  category: CatalogCategoryId,
): T[] {
  return entries.filter((entry) => categorizeCatalogEntry(entry).includes(category));
}
