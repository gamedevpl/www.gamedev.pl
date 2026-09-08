// Cached AI enrichment for one catalog game.
export interface CatalogEnrichmentRecord {
  slug: string;
  // SHA-256 hash of the SPEC.md content.
  contentHash: string;
  // Punchy summary in English and Polish.
  tagline: {
    en: string;
    pl: string;
  };
  // Concise keybindings in English and Polish.
  shortControls: {
    en: string;
    pl: string;
  };
  // Search keywords and tags.
  searchKeywords: string[];
  // Precomputed document embedding vector.
  embedding?: number[];
  // Hash of the document text that was embedded.
  embeddingDocTextHash?: string;
  // ISO-8601 timestamp.
  updatedAt: string;
}
