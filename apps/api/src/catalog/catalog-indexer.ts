import type { CatalogGameEntry, GitHubClient } from './github-client.js';
import { attachCatalogEnrichments, createDefaultEnricherClient, getOrEnrichCatalogGame } from './catalog-enricher.js';
import { VertexEmbeddingService } from './embedding-service.js';
import { CatalogVectorIndex, type IndexedGameVector } from './catalog-vector-index.js';
import type { Store } from '../platform/store.js';
import { isPublishedEntry } from '@gamedevpl/contract';

export interface CatalogIndexerOptions {
  store?: Store;
  githubClient: GitHubClient | null;
  publishedRef: string;
  getCatalogEntries: () => Promise<CatalogGameEntry[]>;
  embeddingService: VertexEmbeddingService;
  vectorIndex: CatalogVectorIndex;
  log?: (message: string) => void;
}

// Builds and maintains in-memory vector index for catalog games.
export class CatalogIndexer {
  private store?: Store;
  private githubClient: GitHubClient | null;
  private publishedRef: string;
  private getCatalogEntries: () => Promise<CatalogGameEntry[]>;
  private embeddingService: VertexEmbeddingService;
  private vectorIndex: CatalogVectorIndex;
  private log?: (message: string) => void;

  private indexBuildPromise: Promise<void> | null = null;
  private isEnrichingInBackground = false;
  // Bounds re-enrichment when the store write keeps failing.
  private enrichmentAttempted = new Set<string>();
  private lastIndexBuildAttemptTime = 0;
  private lastIndexBuildSuccessTime = 0;
  private static readonly INDEX_TTL_MS = 10 * 60 * 1000;
  private static readonly RETRY_BACKOFF_MS = 60 * 1000;
  private static readonly CHUNK_SIZE = 10;

  constructor(options: CatalogIndexerOptions) {
    this.store = options.store;
    this.githubClient = options.githubClient;
    this.publishedRef = options.publishedRef;
    this.getCatalogEntries = options.getCatalogEntries;
    this.embeddingService = options.embeddingService;
    this.vectorIndex = options.vectorIndex;
    this.log = options.log;
  }

  // Build or refresh vector index from current catalog population.
  async buildIndex(): Promise<void> {
    if (!this.githubClient) return;
    this.lastIndexBuildAttemptTime = Date.now();
    try {
      const entries = await this.getCatalogEntries();
      const published = entries.filter(isPublishedEntry);
      const enriched = await attachCatalogEnrichments(published, this.store);

      const indexed: IndexedGameVector[] = [];

      for (let i = 0; i < enriched.length; i += CatalogIndexer.CHUNK_SIZE) {
        const chunk = enriched.slice(i, i + CatalogIndexer.CHUNK_SIZE);
        await Promise.all(
          chunk.map(async (entry) => {
            const docText = `${entry.title}. ${entry.genre || ''}. ${entry.tagline?.en || ''} ${entry.tagline?.pl || ''} ${(entry.searchKeywords || []).join(', ')}`;
            const vec = await this.embeddingService.embedDocument(docText, entry.title);
            if (vec.length > 0) {
              indexed.push({
                slug: entry.slug,
                title: entry.title,
                genre: entry.genre,
                tagline: entry.tagline,
                shortControls: entry.shortControls,
                searchKeywords: entry.searchKeywords,
                embedding: vec,
              });
            }
          }),
        );
      }

      // Atomically replace all vectors so unpublished/removed games are cleared.
      this.vectorIndex.replaceAll(indexed);
      this.lastIndexBuildSuccessTime = Date.now();

      // Trigger background enrichment for entries that still lack metadata.
      this.triggerBackgroundEnrichment(enriched);
    } catch (err) {
      this.log?.(`failed to build catalog vector index: ${String(err)}`);
    }
  }

  private triggerBackgroundEnrichment(enrichedEntries: CatalogGameEntry[]): void {
    if (!this.store || !this.githubClient || this.isEnrichingInBackground) return;

    // Filter against enriched entries so store metadata is preserved.
    const unEnriched = enrichedEntries.filter(
      (entry) =>
        !entry.tagline?.en && !entry.tagline?.pl && (!entry.searchKeywords || entry.searchKeywords.length === 0),
    );
    const pending = unEnriched.filter((entry) => !this.enrichmentAttempted.has(entry.slug));
    if (pending.length === 0) return;

    this.isEnrichingInBackground = true;
    const client = this.githubClient;
    const store = this.store;
    const enricherClient = createDefaultEnricherClient();

    void (async () => {
      try {
        for (const entry of pending) {
          this.enrichmentAttempted.add(entry.slug);
          try {
            const spec = await client.getGameFile(this.publishedRef, entry.slug, 'SPEC.md');
            if (spec) {
              const enrichedRecord = await getOrEnrichCatalogGame(entry, spec, {
                store,
                genAIClient: enricherClient,
                log: this.log,
              });
              const docText = `${entry.title}. ${entry.genre || ''}. ${enrichedRecord.tagline?.en || ''} ${enrichedRecord.tagline?.pl || ''} ${(enrichedRecord.searchKeywords || []).join(', ')}`;
              const vec = await this.embeddingService.embedDocument(docText, entry.title);
              if (vec.length > 0) {
                this.vectorIndex.upsert({
                  slug: entry.slug,
                  title: entry.title,
                  genre: entry.genre,
                  tagline: enrichedRecord.tagline,
                  shortControls: enrichedRecord.shortControls,
                  searchKeywords: enrichedRecord.searchKeywords,
                  embedding: vec,
                });
              }
            }
          } catch {
            // Non-blocking per-game enrichment error
          }
        }
      } finally {
        this.isEnrichingInBackground = false;
      }
    })();
  }

  // Ensure index is ready, building if empty or stale.
  ensureIndex(): Promise<void> {
    const isStale = Date.now() - this.lastIndexBuildSuccessTime > CatalogIndexer.INDEX_TTL_MS;
    const isRecentAttempt = Date.now() - this.lastIndexBuildAttemptTime < CatalogIndexer.RETRY_BACKOFF_MS;
    const isFresh = this.vectorIndex.size() > 0 && !isStale;
    // Backoff covers a stale non-empty index, not just an empty one.
    if (isFresh || isRecentAttempt) {
      return Promise.resolve();
    }
    if (!this.indexBuildPromise) {
      this.indexBuildPromise = this.buildIndex().finally(() => {
        this.indexBuildPromise = null;
      });
    }
    return this.indexBuildPromise;
  }
}
