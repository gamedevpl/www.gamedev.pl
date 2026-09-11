import type { CatalogEntry } from "./catalog.js";

export const STOP_WORDS = new Set([
  "chce",
  "chcę",
  "chcialbym",
  "chciałbym",
  "pograc",
  "pograć",
  "zagrac",
  "zagrać",
  "gra",
  "gre",
  "grę",
  "grac",
  "grać",
  "gry",
  "gier",
  "jakas",
  "jakaś",
  "fajna",
  "fajne",
  "fajną",
  "super",
  "dla",
  "mnie",
  "w",
  "z",
  "na",
  "do",
  "o",
  "i",
  "oraz",
  "lub",
  "albo",
  "po",
  "od",
  "jak",
  "play",
  "game",
  "games",
  "want",
  "to",
  "a",
  "an",
  "the",
  "in",
  "on",
  "with",
  "for",
  "like",
  "some",
]);

// Token-boundary synonyms mapping specific query words to matching catalog game concepts.
export const INTENT_TOKENS: Record<string, string[]> = {
  // Football / Soccer
  piłka: ["mexico-86", "soccer", "football"],
  pilka: ["mexico-86", "soccer", "football"],
  piłkę: ["mexico-86", "soccer", "football"],
  pilke: ["mexico-86", "soccer", "football"],
  piłkarski: ["mexico-86", "soccer", "football"],
  pilkarski: ["mexico-86", "soccer", "football"],
  piłkarskie: ["mexico-86", "soccer", "football"],
  pilkarskie: ["mexico-86", "soccer", "football"],
  futbol: ["mexico-86", "soccer", "football"],
  football: ["mexico-86", "soccer", "football"],
  soccer: ["mexico-86", "soccer", "football"],
  mundial: ["mexico-86", "soccer", "football"],
  mecz: ["mexico-86", "soccer", "football"],

  // Cars / Racing
  auto: ["carjack-city", "racer", "karts"],
  auta: ["carjack-city", "racer", "karts"],
  samochód: ["carjack-city", "racer", "karts"],
  samochod: ["carjack-city", "racer", "karts"],
  samochody: ["carjack-city", "racer", "karts"],
  wyścigi: ["carjack-city", "racer", "karts"],
  wyscigi: ["carjack-city", "racer", "karts"],
  wyścig: ["carjack-city", "racer", "karts"],
  wyscig: ["carjack-city", "racer", "karts"],
  racing: ["carjack-city", "racer", "karts"],
  racer: ["carjack-city", "racer", "karts"],
  driving: ["carjack-city", "racer", "karts"],

  // Snake
  wąż: ["serpent-loop", "snake"],
  waz: ["serpent-loop", "snake"],
  snake: ["serpent-loop", "snake"],
  serpent: ["serpent-loop", "snake"],

  // Cards / Pasjans
  karty: ["cards", "solitaire", "blackjack", "poker", "card"],
  karta: ["cards", "solitaire", "blackjack", "poker", "card"],
  karciane: ["cards", "solitaire", "blackjack", "poker", "card"],
  karciana: ["cards", "solitaire", "blackjack", "poker", "card"],
  cards: ["cards", "solitaire", "blackjack", "poker", "card"],
  card: ["cards", "solitaire", "blackjack", "poker", "card"],
  pasjans: ["cards", "solitaire", "blackjack", "poker", "card"],
  solitaire: ["cards", "solitaire", "blackjack", "poker", "card"],

  // Farm
  farma: ["farm"],
  farm: ["farm"],
  farming: ["farm"],
  rolnik: ["farm"],

  // Tanks / Cannon
  czołg: ["cannon", "tank"],
  czolg: ["cannon", "tank"],
  czołgi: ["cannon", "tank"],
  czolgi: ["cannon", "tank"],
  tank: ["cannon", "tank"],
  tanks: ["cannon", "tank"],
  cannon: ["cannon", "tank"],

  // Checkers
  warcaby: ["checker"],
  warcab: ["checker"],
  checkers: ["checker"],
  draughts: ["checker"],

  // Pinball / Flipper
  flipper: ["pinball"],
  pinball: ["pinball"],

  // Mario / Plumber
  mario: ["plumber"],

  // Space
  kosmos: ["starweb", "asteroid", "space"],
  space: ["starweb", "asteroid", "space"],
  asteroids: ["starweb", "asteroid", "space"],
  asteroidy: ["starweb", "asteroid", "space"],
};

export function findMatchingGame(query: string, catalog: CatalogEntry[]): CatalogEntry | null {
  const normalized = query.trim().toLowerCase();
  if (!normalized || normalized.length < 2) return null;

  const rawTokens = normalized
    .replace(/[^a-ząćęłńóśźż0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);
  const meaningfulTokens = rawTokens.filter((t) => !STOP_WORDS.has(t) && t.length > 1);
  const queryTokens = meaningfulTokens.length > 0 ? meaningfulTokens : rawTokens;

  for (const entry of catalog) {
    const title = entry.title.toLowerCase();
    const slug = entry.slug.toLowerCase();
    const genre = entry.genre.toLowerCase();
    const titleTokens = title.split(/[\s-]+/);
    const slugTokens = slug.split(/[\s-]+/);
    const genreTokens = genre.split(/[\s-]+/);

    // 1. Direct exact or whole-word token match in title or slug
    if (
      title === normalized ||
      slug === normalized ||
      titleTokens.includes(normalized) ||
      slugTokens.includes(normalized)
    ) {
      return entry;
    }

    // 2. Keyword exact token match
    if (entry.searchKeywords?.some((k) => queryTokens.includes(k.toLowerCase().trim()))) {
      return entry;
    }

    // 3. Exact intent token matching (avoids substring false positives)
    for (const token of queryTokens) {
      const targets = INTENT_TOKENS[token];
      if (targets) {
        if (
          targets.some(
            (target) =>
              slugTokens.includes(target) ||
              slug.includes(target) ||
              titleTokens.includes(target) ||
              title.includes(target) ||
              genreTokens.includes(target) ||
              entry.searchKeywords?.some((k) => k.toLowerCase().includes(target)),
          )
        ) {
          return entry;
        }
      }
    }

    // 4. Word-boundary token match against title / keywords / genre
    const keywordTokens = (entry.searchKeywords || []).map((k) => k.toLowerCase());
    const matchedTokenCount = queryTokens.filter(
      (t) => titleTokens.includes(t) || slugTokens.includes(t) || genreTokens.includes(t) || keywordTokens.includes(t),
    ).length;

    if (matchedTokenCount > 0 && matchedTokenCount >= Math.ceil(queryTokens.length / 2)) {
      return entry;
    }
  }

  return null;
}
