import { describe, expect, it } from "vitest";
import { findMatchingGame } from "./findMatchingGame.js";
import type { CatalogEntry } from "./catalog.js";

describe("findMatchingGame", () => {
  const mockCatalog: CatalogEntry[] = [
    {
      slug: "carjack-city",
      title: "Carjack City",
      genre: "action",
      controls: "WASD",
      media: null,
      multiplayer: null,
      saves: null,
      world: null,
      sensing: null,
      orientation: "landscape" as const,
      editor: null,
      status: "published" as const,
      submittedBy: null,
      tagline: { en: "Top-down driving.", pl: "Jazda samochodem." },
      searchKeywords: ["driving", "car", "cars"],
    },
    {
      slug: "mexico-86",
      title: "Mexico '86 Arcade Football",
      genre: "sports",
      controls: "Arrows / Enter",
      media: null,
      multiplayer: null,
      saves: null,
      world: null,
      sensing: null,
      orientation: "landscape" as const,
      editor: null,
      status: "published" as const,
      submittedBy: null,
      tagline: { en: "Tournament football.", pl: "Turniej piłkarski." },
      searchKeywords: ["football", "soccer", "piłka", "mundial"],
    },
    {
      slug: "checker-champ",
      title: "Checker Champ",
      genre: "board",
      controls: "Mouse",
      media: null,
      multiplayer: null,
      saves: null,
      world: null,
      sensing: null,
      orientation: "landscape" as const,
      editor: null,
      status: "published" as const,
      submittedBy: null,
      tagline: { en: "Classic checkers.", pl: "Klasyczne warcaby." },
      searchKeywords: ["checkers", "warcaby"],
    },
    {
      slug: "classic-solitaire",
      title: "Classic Solitaire",
      genre: "cards",
      controls: "Mouse",
      media: null,
      multiplayer: null,
      saves: null,
      world: null,
      sensing: null,
      orientation: "landscape" as const,
      editor: null,
      status: "published" as const,
      submittedBy: null,
      tagline: { en: "Klondike card solitaire.", pl: "Pasjans karciany." },
      searchKeywords: ["cards", "solitaire", "karty", "pasjans"],
    },
  ];

  it("matches Polish sports intent query to mexico-86", () => {
    const match = findMatchingGame("chcę pograć w piłkę", mockCatalog);
    expect(match?.slug).toBe("mexico-86");
  });

  it("matches card game intent query to classic-solitaire", () => {
    const match = findMatchingGame("I want to play a card game", mockCatalog);
    expect(match?.slug).toBe("classic-solitaire");
  });

  it("matches Polish cards intent to classic-solitaire", () => {
    const match = findMatchingGame("chcę pograć w karty", mockCatalog);
    expect(match?.slug).toBe("classic-solitaire");
  });

  it("does not false-match negative control queries", () => {
    expect(findMatchingGame("gold rush", mockCatalog)).toBeNull();
    expect(findMatchingGame("author", mockCatalog)).toBeNull();
    expect(findMatchingGame("autumn leaves", mockCatalog)).toBeNull();
    expect(findMatchingGame("chess", mockCatalog)).toBeNull();
    expect(findMatchingGame("szachy", mockCatalog)).toBeNull();
    expect(findMatchingGame("web", mockCatalog)).toBeNull();
    expect(findMatchingGame("car", [{ ...mockCatalog[3] }])).toBeNull();
  });
});
