import type { FastifyInstance } from 'fastify';
import type { CatalogGameEntry, GitHubClient } from './github-client.js';
import { attachCatalogEnrichments, createDefaultEnricherClient, getOrEnrichCatalogGame } from './catalog-enricher.js';
import { VertexEmbeddingService } from './embedding-service.js';
import { CatalogVectorIndex } from './catalog-vector-index.js';
import type { Store } from '../platform/store.js';

export interface CatalogSearchRoutesOptions {
  store?: Store;
  githubClient: GitHubClient | null;
  publishedRef: string;
  getCatalogEntries: () => Promise<CatalogGameEntry[]>;
}

// Multimodal semantic vector search across catalog games.
export async function registerCatalogSearchRoutes(
  app: FastifyInstance,
  options: CatalogSearchRoutesOptions,
): Promise<void> {
  const { store, githubClient, publishedRef, getCatalogEntries } = options;

  const embeddingService = new VertexEmbeddingService({
    log: (msg) => app.log.warn(msg),
  });
  const catalogVectorIndex = new CatalogVectorIndex();
  let indexBuildPromise: Promise<void> | null = null;
  let lastIndexBuildAttemptTime = 0;
  let lastIndexBuildSuccessTime = 0;
  const INDEX_TTL_MS = 10 * 60 * 1000;
  const RETRY_BACKOFF_MS = 60 * 1000;

  async function buildCatalogVectorIndex(): Promise<void> {
    if (!githubClient) return;
    lastIndexBuildAttemptTime = Date.now();
    try {
      const entries = await getCatalogEntries();
      const published = entries.filter((entry) => entry.status === 'published');
      const enricherClient = createDefaultEnricherClient();

      if (store) {
        for (const entry of published) {
          try {
            const spec = await githubClient.getGameFile(publishedRef, entry.slug, 'SPEC.md');
            if (spec) {
              await getOrEnrichCatalogGame(entry, spec, {
                store,
                genAIClient: enricherClient,
                log: (msg) => app.log.warn(msg),
              });
            }
          } catch {
            // Non-blocking per-game enrichment
          }
        }
      }

      const enriched = await attachCatalogEnrichments(published, store);
      for (const entry of enriched) {
        const docText = `${entry.title}. ${entry.genre || ''}. ${entry.tagline?.en || ''} ${entry.tagline?.pl || ''} ${(entry.searchKeywords || []).join(', ')}`;
        const vec = await embeddingService.embedText(docText);
        if (vec.length > 0) {
          catalogVectorIndex.upsert({
            slug: entry.slug,
            title: entry.title,
            genre: entry.genre,
            tagline: entry.tagline,
            shortControls: entry.shortControls,
            searchKeywords: entry.searchKeywords,
            embedding: vec,
          });
        }
      }
      lastIndexBuildSuccessTime = Date.now();
    } catch (err) {
      app.log.warn({ err }, 'failed to build catalog vector index');
    }
  }

  function ensureCatalogVectorIndex(): Promise<void> {
    const isStale = Date.now() - lastIndexBuildSuccessTime > INDEX_TTL_MS;
    const isRecentAttempt = Date.now() - lastIndexBuildAttemptTime < RETRY_BACKOFF_MS;
    if ((catalogVectorIndex.size() > 0 && !isStale) || (catalogVectorIndex.size() === 0 && isRecentAttempt)) {
      return Promise.resolve();
    }
    if (!indexBuildPromise) {
      indexBuildPromise = buildCatalogVectorIndex().finally(() => {
        indexBuildPromise = null;
      });
    }
    return indexBuildPromise;
  }

  app.get(
    '/api/catalog/search',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const query =
        typeof request.query === 'object' && request.query !== null && 'q' in request.query
          ? String((request.query as { q: unknown }).q || '').trim()
          : '';
      if (!query || query.length < 2) {
        return reply.send({ match: null, score: 0 });
      }

      try {
        if (catalogVectorIndex.size() === 0) {
          void ensureCatalogVectorIndex();
          return reply.send({ match: null, score: 0 });
        }

        void ensureCatalogVectorIndex();

        const queryVector = await embeddingService.embedText(query);
        if (queryVector.length === 0) {
          return reply.send({ match: null, score: 0 });
        }
        const best = catalogVectorIndex.findBestMatch(queryVector, 0.65);
        if (best) {
          return reply.send({
            match: {
              slug: best.game.slug,
              title: best.game.title,
              genre: best.game.genre,
              tagline: best.game.tagline,
              shortControls: best.game.shortControls,
              searchKeywords: best.game.searchKeywords,
            },
            score: best.score,
          });
        }
        return reply.send({ match: null, score: 0 });
      } catch {
        return reply.send({ match: null, score: 0 });
      }
    },
  );
}
