import { describe, it, expect, vi } from 'vitest';
import {
  extractShortControls,
  extractFallbackKeywords,
  getOrEnrichCatalogGame,
  enrichCatalogEntries,
} from './catalog-enricher.js';
import { InMemoryStore } from '../platform/store.js';
import type { CatalogGameEntry } from './github-client.js';
import type { GenAIClient } from 'genaicode';

const MOCK_ENTRY: CatalogGameEntry = {
  slug: 'mexico-86',
  title: "Mexico '86 Arcade Football",
  genre: 'Sports',
  controls: 'Arrows / Enter / Tap to navigate; 1–4 to pick action; Z/X/C/V for tactics; M to mute',
  status: 'published',
  media: null,
  multiplayer: null,
  saves: null,
  world: null,
  sensing: null,
  editor: null,
  orientation: 'landscape',
  submittedBy: 'platform',
};

const MOCK_SPEC = `---
title: "Mexico '86 Arcade Football"
genre: Sports
controls: Arrows / Enter / Tap to navigate; 1–4 to pick action; Z/X/C/V for tactics
---

# Concept

Mexico '86 Arcade Football is an original pixel-art, 11-versus-11 game built around a lively physical ball.
`;

describe('catalog-enricher', () => {
  it('extracts concise controls from multi-clause control text', () => {
    expect(extractShortControls('Arrows / Enter / Tap to navigate; 1–4 to pick action')).toBe('Arrows / Enter / Tap');
    expect(extractShortControls('WASD or Arrows to move. Space to jump.')).toBe('WASD or Arrows');
    expect(extractShortControls('')).toBe('');
  });

  it('extracts fallback keywords from entry fields', () => {
    const keywords = extractFallbackKeywords(MOCK_ENTRY);
    expect(keywords).toContain('mexico');
    expect(keywords).toContain('arcade');
    expect(keywords).toContain('football');
    expect(keywords).toContain('sports');
  });

  it('enriches game using mock LLM client and caches in Store', () => {
    const store = new InMemoryStore();
    const mockJson = vi.fn().mockImplementation(async (parser) => {
      const data = {
        tagline: {
          en: 'Retro 11v11 arcade football with lively physics.',
          pl: 'Zręcznościowa piłka nożna 11v11 w klimacie retro z dynamiczną fizyką.',
        },
        shortControls: {
          en: 'Arrows + Enter / Tap',
          pl: 'Strzałki + Enter / Dotyk',
        },
        searchKeywords: ['football', 'piłka nożna', 'soccer', 'mexico', 'arcade'],
      };
      return typeof parser === 'function' ? parser(data) : data;
    });

    const mockBuilder = {
      temperature: vi.fn().mockReturnThis(),
      signal: vi.fn().mockReturnThis(),
      json: mockJson,
    };
    const mockGenAIClient = vi.fn().mockReturnValue(mockBuilder) as unknown as GenAIClient;

    return getOrEnrichCatalogGame(MOCK_ENTRY, MOCK_SPEC, {
      store,
      genAIClient: mockGenAIClient,
    }).then(async (record) => {
      expect(record.slug).toBe('mexico-86');
      expect(record.tagline.en).toBe('Retro 11v11 arcade football with lively physics.');
      expect(record.tagline.pl).toBe('Zręcznościowa piłka nożna 11v11 w klimacie retro z dynamiczną fizyką.');
      expect(record.shortControls.pl).toBe('Strzałki + Enter / Dotyk');
      expect(record.searchKeywords).toContain('football');
      expect(mockGenAIClient).toHaveBeenCalledTimes(1);

      // Verify cached in store
      const inStore = await store.getCatalogEnrichment('mexico-86');
      expect(inStore).not.toBeNull();
      expect(inStore?.tagline.en).toBe('Retro 11v11 arcade football with lively physics.');

      // Second call should hit cache without calling LLM
      const cachedRecord = await getOrEnrichCatalogGame(MOCK_ENTRY, MOCK_SPEC, {
        store,
        genAIClient: mockGenAIClient,
      });
      expect(cachedRecord.tagline.en).toBe('Retro 11v11 arcade football with lively physics.');
      expect(mockGenAIClient).toHaveBeenCalledTimes(1);
    });
  });

  it('falls back gracefully to heuristic extraction when LLM is unavailable', async () => {
    const store = new InMemoryStore();
    const record = await getOrEnrichCatalogGame(MOCK_ENTRY, MOCK_SPEC, {
      store,
      genAIClient: null,
    });

    expect(record.slug).toBe('mexico-86');
    expect(record.tagline.en).toContain("Mexico '86 Arcade Football is an original pixel-art");
    expect(record.shortControls.en).toBe('Arrows / Enter / Tap');
    expect(record.searchKeywords).toContain('football');
  });

  it('enriches multiple catalog entries with spec resolver', async () => {
    const store = new InMemoryStore();
    const entries = [MOCK_ENTRY];
    const getSpec = async (slug: string) => (slug === 'mexico-86' ? MOCK_SPEC : null);

    const enriched = await enrichCatalogEntries(entries, getSpec, {
      store,
      genAIClient: null,
    });

    expect(enriched).toHaveLength(1);
    expect(enriched[0].tagline?.en).toContain("Mexico '86 Arcade Football");
    expect(enriched[0].shortControls?.en).toBe('Arrows / Enter / Tap');
    expect(enriched[0].searchKeywords).toContain('football');
  });
});
