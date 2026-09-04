import type { FastifyInstance } from 'fastify';
import type { CatalogGameEntry, GitHubClient } from './github-client.js';
import { VertexEmbeddingService } from './embedding-service.js';
import { CatalogVectorIndex } from './catalog-vector-index.js';
import { CatalogIndexer } from './catalog-indexer.js';
import type { Store } from '../platform/store.js';

// Structural: catalog does not import creation (N1 module map).
export interface CatalogSearchGate {
  checkAndSpend(uid: string | null, dateStr: string): Promise<{ allowed: boolean }>;
}

// Stops one account draining the platform's day.
export const DEFAULT_DAILY_SEARCH_QUOTA = 500;

export interface CatalogSearchRoutesOptions {
  store?: Store;
  githubClient: GitHubClient | null;
  publishedRef: string;
  getCatalogEntries: () => Promise<CatalogGameEntry[]>;
  // No gate degrades to no search, never to uncounted spend.
  searchGate?: CatalogSearchGate | null;
  dailySearchQuota?: number;
  now?: () => number;
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

  const searchGate = options.searchGate ?? null;

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

      // Every refusal returns a miss: search only enhances the local match.
      if (!searchGate) {
        return reply.send({ match: null, score: 0 });
      }

      const nowMs = (options.now ?? Date.now)();
      const dateStr = new Date(nowMs).toISOString().slice(0, 10);
      // Anonymous is first-class: the hero prompt outlives the beta wall.
      const uid = request.user?.uid ?? null;

      // Before ensureIndex too: that embeds the whole catalog.
      const gate = await searchGate.checkAndSpend(uid, dateStr);
      if (!gate.allowed) {
        return reply.send({ match: null, score: 0 });
      }

      // After the global gate, as elsewhere; overcounts by one at worst.
      if (uid && store) {
        const quota = await store.checkAndIncrementQuota(
          uid,
          dateStr,
          options.dailySearchQuota ?? Number(process.env.DAILY_SEARCH_QUOTA ?? DEFAULT_DAILY_SEARCH_QUOTA),
          'searchQueries',
        );
        if (!quota.allowed) {
          return reply.send({ match: null, score: 0 });
        }
      }

      try {
        if (catalogVectorIndex.size() === 0) {
          await indexer.ensureIndex();
        } else {
          void indexer.ensureIndex();
        }

        const queryVector = await embeddingService.embedQuery(query);
        if (queryVector.length === 0) {
          return reply.send({ match: null, score: 0 });
        }
        const best = catalogVectorIndex.findBestMatch(queryVector, 0.55);
        if (best) {
          return reply.send({
            match: best.game,
            score: best.score,
          });
        }
        return reply.send({ match: null, score: 0 });
      } catch (error) {
        // A miss and a broken lane must not look identical outside.
        request.log.warn({ err: error, queryLength: query.length }, 'catalog search failed');
        return reply.send({ match: null, score: 0 });
      }
    },
  );
}
