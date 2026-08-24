import { cosineSimilarity } from './embedding-service.js';

export interface IndexedGameVector {
  slug: string;
  title: string;
  genre: string;
  tagline?: { en?: string; pl?: string } | null;
  shortControls?: { en?: string; pl?: string } | null;
  searchKeywords?: string[] | null;
  embedding: number[];
}

export interface VectorSearchResult {
  game: IndexedGameVector;
  score: number;
}

// In-memory vector store for fast similarity search.
export class CatalogVectorIndex {
  private games = new Map<string, IndexedGameVector>();

  // Add or update game vector in memory.
  upsert(game: IndexedGameVector): void {
    this.games.set(game.slug, { ...game });
  }

  // Remove a game by slug.
  remove(slug: string): boolean {
    return this.games.delete(slug);
  }

  // Count of indexed games in memory.
  size(): number {
    return this.games.size;
  }

  // Clear all indexed games.
  clear(): void {
    this.games.clear();
  }

  // Search indexed games sorted by cosine similarity.
  search(queryVector: number[], topK = 5): VectorSearchResult[] {
    if (!queryVector || queryVector.length === 0 || this.games.size === 0) {
      return [];
    }

    const results: VectorSearchResult[] = [];
    for (const game of this.games.values()) {
      const score = cosineSimilarity(queryVector, game.embedding);
      results.push({ game, score });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  // Find best match if above similarity threshold.
  findBestMatch(queryVector: number[], threshold = 0.65): VectorSearchResult | null {
    const results = this.search(queryVector, 1);
    const best = results[0];
    if (best && best.score >= threshold) {
      return best;
    }
    return null;
  }
}
