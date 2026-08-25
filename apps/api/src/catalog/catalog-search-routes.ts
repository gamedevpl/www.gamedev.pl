import type { FastifyInstance } from 'fastify';
import type { CatalogGameEntry, GitHubClient } from './github-client.js';
import { VertexEmbeddingService } from './embedding-service.js';
import { CatalogVectorIndex } from './catalog-vector-index.js';
import { CatalogIndexer } from './catalog-indexer.js';
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
  const indexer = new CatalogIndexer({
    store,
    githubClient,
    publishedRef,
    getCatalogEntries,
    embeddingService,
    vectorIndex: catalogVectorIndex,
    log: (msg) => app.log.warn(msg),
  });

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
          await indexer.ensureIndex();
        } else {
          void indexer.ensureIndex();
        }

        const queryVector = await embeddingService.embedText(query);
        if (queryVector.length === 0) {
          return reply.send({ match: null, score: 0 });
        }
        const best = catalogVectorIndex.findBestMatch(queryVector, 0.55);
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
