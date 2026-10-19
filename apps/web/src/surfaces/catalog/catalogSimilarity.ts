import type { CatalogEntry } from '../../catalog.js';

const GENRE_FAMILIES = [
  /\b(racing|racer|rally|driving|kart(?:ing)?s?)\b/,
  /\b(platformer|platforming|metroidvania)\b/,
  /\b(shooter|shmup|shoot em up|run and gun)\b/,
  /\b(brawler|brawl|fighting|beat em up)\b/,
  /\b(roguelike|roguelite|roguelight)\b/,
  /\b(rpg|jrpg|role playing|dungeon crawler)\b/,
  /\b(adventure|point and click)\b/,
  /\b(strategy|tactics|tactical|squad command|tower defen[cs]e|rts|4x)\b/,
  /\b(builder|building|construction|management|tycoon)\b/,
  /\b(farming|farm|life sim(?:ulation)?)\b/,
  /\b(puzzle|match 3|sokoban)\b/,
  /\b(narrative|visual novel|story)\b/,
  /\b(word|trivia|quiz)\b/,
  /\b(cards?|solitaire|ccg|deckbuilder|deckbuilding)\b/,
  /\b(stealth|immersive sim)\b/,
  /\b(horror)\b/,
  /\b(rhythm|music)\b/,
  /\b(flight|flying)\b/,
  /\b(photography|photo)\b/,
  /\b(artillery)\b/,
  /\b(pinball)\b/,
  /\b(idle|incremental|clicker)\b/,
  /\b(survivors? like|bullet heaven)\b/,
] as const;

function normalizeGenre(genre: string): string {
  return genre
    .toLowerCase()
    .replace(/\b[23]d\b/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

const GENERIC_GENRES = new Set([
  '',
  'arcade',
  'action',
  'casual',
  'simulation',
  'sim',
  'other',
  'game',
  'party',
  'sports',
  'sandbox',
]);

// A shared shelf or generic label alone cannot establish similarity.
export function similarCatalogEntries(featured: CatalogEntry, entries: CatalogEntry[]): CatalogEntry[] {
  const genre = normalizeGenre(featured.genre);
  if (genre.split(' ').every((word) => GENERIC_GENRES.has(word))) return [];
  const families = GENRE_FAMILIES.filter((pattern) => pattern.test(genre));
  return entries
    .filter((entry) => entry.slug !== featured.slug)
    .map((entry) => {
      const candidateGenre = normalizeGenre(entry.genre);
      const sharedFamilies = families.filter((pattern) => pattern.test(candidateGenre)).length;
      return { entry, score: candidateGenre === genre ? 100 : sharedFamilies };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ entry }) => entry);
}
