import { createHash } from 'node:crypto';
import type { CatalogGameEntry } from './github-client.js';
import type { Store } from '../platform/store.js';
import type { CatalogEnrichmentRecord } from '../store/records/catalog-enrichment.js';
import { extractSpecDescription } from './game-page-routes.js';
import type { GenAIClient } from 'genaicode';
import { createVertexClient } from '../platform/genai.js';

export const GEMINI_ENRICHMENT_MODEL = 'gemini-3.5-flash-lite';

export interface CatalogEnricherOptions {
  store: Store;
  genAIClient?: GenAIClient | null;
  log?: (message: string) => void;
}

// Derives a 1-clause summary from raw controls text.
export function extractShortControls(controlsText: string): string {
  if (!controlsText) return '';
  const firstClause = controlsText.split(/[;.]/)[0]?.trim() || controlsText.trim();
  return firstClause.replace(/\s+to\s+[a-z\s]+$/i, '');
}

// Extracts fallback keywords from entry fields.
export function extractFallbackKeywords(entry: CatalogGameEntry): string[] {
  const words = new Set<string>();
  const addTokens = (str: string) => {
    if (!str) return;
    str
      .toLowerCase()
      .split(/[^a-z0-9ąćęłńóśźż]+/i)
      .filter((t) => t.length > 2)
      .forEach((t) => words.add(t));
  };
  addTokens(entry.slug);
  addTokens(entry.title);
  addTokens(entry.genre || '');
  return Array.from(words);
}

// Generates or retrieves cached AI enrichment for one game.
export async function getOrEnrichCatalogGame(
  entry: CatalogGameEntry,
  specMd: string,
  options: CatalogEnricherOptions,
): Promise<CatalogEnrichmentRecord> {
  const { store, log } = options;
  const contentHash = createHash('sha256').update(specMd).digest('hex');

  try {
    const cached = await store.getCatalogEnrichment(entry.slug);
    if (cached && cached.contentHash === contentHash) {
      return cached;
    }
  } catch (err) {
    log?.(`Could not read catalog enrichment cache for ${entry.slug}: ${String(err)}`);
  }

  // Cache miss: attempt LLM enrichment if client is available
  let record: CatalogEnrichmentRecord | null = null;
  const client = options.genAIClient;

  if (client) {
    try {
      const prompt = `You are a video game catalog editor. Analyze this game specification and generate concise, engaging metadata.
Title: "${entry.title}"
Genre: "${entry.genre}"
Controls: "${entry.controls}"

SPEC.md:
${specMd.slice(0, 4000)}

Respond with STRICT JSON only, matching this schema:
{
  "tagline": {
    "en": "Punchy 1-sentence marketing hook (max 18 words)",
    "pl": "Chwytliwe 1-zdaniowe podsumowanie po polsku (max 18 słów)"
  },
  "shortControls": {
    "en": "Super concise keybindings (max 8 words, e.g. Arrows + Space / Tap)",
    "pl": "Super zwięzłe sterowanie po polsku (max 8 słów, np. Strzałki + Spacja / Dotyk)"
  },
  "searchKeywords": ["5-8 English and Polish search keywords, tags, themes, mechanics"]
}`;

      const parsed = await client(prompt)
        .temperature(0.2)
        .signal(AbortSignal.timeout(10_000))
        .json(
          (value) =>
            value as {
              tagline?: { en?: string; pl?: string };
              shortControls?: { en?: string; pl?: string };
              searchKeywords?: string[];
            },
        );

      if (parsed?.tagline?.en && parsed?.tagline?.pl) {
        record = {
          slug: entry.slug,
          contentHash,
          tagline: {
            en: parsed.tagline.en.trim(),
            pl: parsed.tagline.pl.trim(),
          },
          shortControls: {
            en: parsed.shortControls?.en?.trim() || extractShortControls(entry.controls),
            pl: parsed.shortControls?.pl?.trim() || extractShortControls(entry.controls),
          },
          searchKeywords: Array.isArray(parsed.searchKeywords)
            ? parsed.searchKeywords.map((k) => String(k).trim()).filter((k) => k.length > 2)
            : extractFallbackKeywords(entry),
          updatedAt: new Date().toISOString(),
        };
      }
    } catch (err) {
      log?.(`LLM enrichment failed for ${entry.slug}: ${String(err)}`);
    }
  }

  // Fallback if LLM was skipped or failed
  if (!record) {
    const fallbackDescription = extractSpecDescription(specMd) || entry.title;
    const shortControls = extractShortControls(entry.controls);
    record = {
      slug: entry.slug,
      contentHash,
      tagline: {
        en: fallbackDescription,
        pl: fallbackDescription,
      },
      shortControls: {
        en: shortControls,
        pl: shortControls,
      },
      searchKeywords: extractFallbackKeywords(entry),
      updatedAt: new Date().toISOString(),
    };
  }

  try {
    await store.setCatalogEnrichment(record);
  } catch (err) {
    log?.(`Could not persist catalog enrichment for ${entry.slug}: ${String(err)}`);
  }

  return record;
}

// Enriches an array of catalog game entries.
export async function enrichCatalogEntries(
  entries: CatalogGameEntry[],
  getSpec: (slug: string) => Promise<string | null>,
  options: CatalogEnricherOptions,
): Promise<CatalogGameEntry[]> {
  return Promise.all(
    entries.map(async (entry) => {
      try {
        const spec = await getSpec(entry.slug);
        if (!spec) return entry;
        const enrichment = await getOrEnrichCatalogGame(entry, spec, options);
        return {
          ...entry,
          tagline: enrichment.tagline,
          shortControls: enrichment.shortControls,
          searchKeywords: enrichment.searchKeywords,
        };
      } catch {
        return entry;
      }
    }),
  );
}

// Attaches cached enrichment to catalog entries from Store.
export async function attachCatalogEnrichments(
  entries: CatalogGameEntry[],
  store: Store | null | undefined,
): Promise<CatalogGameEntry[]> {
  if (!store) return entries;
  return Promise.all(
    entries.map(async (entry) => {
      try {
        const enrichment = await store.getCatalogEnrichment(entry.slug);
        if (enrichment) {
          return {
            ...entry,
            tagline: enrichment.tagline,
            shortControls: enrichment.shortControls,
            searchKeywords: enrichment.searchKeywords,
          };
        }
      } catch {
        // Non-blocking fallback
      }
      return entry;
    }),
  );
}

// Creates default Vertex AI client for enrichment.
export function createDefaultEnricherClient(): GenAIClient | null {
  try {
    return createVertexClient({
      defaultRegion: 'global',
      defaultModel: GEMINI_ENRICHMENT_MODEL,
    });
  } catch {
    return null;
  }
}
