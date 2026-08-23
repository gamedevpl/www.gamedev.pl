import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { PublishedSlugGate } from './published-slugs.js';
import { rankRecommendations, type RecommendGame, type RecommendScorecardSignals } from './recommend.js';
import type { Scorecard, Store } from '../platform/store.js';

/**
 * Home-page catalog sorting signals: community popularity from scorecards + personal
 * play affinity for signed-in players, plus helpers for newest / most-played /
 * last-played modes on the arcade grid.
 *
 * Affinity recording (`POST /api/games/:slug/played`) is identity-attached account
 * data, erased with the account. It never writes to the anonymous play/visit
 * telemetry streams and must not grow a join key between them.
 *
 * Community half (scorecards + newest) is process-local cached: those reads hit
 * Firestore on every home load otherwise, and scorecards only move on the nightly
 * sweep. Personal affinity stays per-request.
 */

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const ParamsSchema = z.object({
  slug: z.string().trim().min(1).max(80).regex(SLUG_PATTERN, 'invalid slug'),
});

const RecentQuerySchema = z.object({
  /** Comma-separated recent slugs from the browser — anonymous cold-start hints only. */
  recent: z.string().max(400).optional(),
  /** Defaults to the full published catalog so the home grid can sort end-to-end. */
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

const MAX_RECENT_HINTS = 8;
/** Shared community signals: scorecards are nightly; a few minutes of staleness is fine. */
export const RECOMMENDATION_SHARED_TTL_MS = 5 * 60_000;

export interface CatalogGenreSource {
  listPublished(): Promise<RecommendGame[]>;
}

export interface RecommendationRoutesOptions {
  store: Store;
  /** Absent (no games repo) makes every slug answer 404 / empty list. */
  publishedSlugs?: PublishedSlugGate | null;
  /** Published catalog with genres; tests inject a fixed list. */
  catalog?: CatalogGenreSource | null;
  /** Injectable clock for cache expiry tests. */
  now?: () => number;
  /** Override shared-signals TTL (defaults to {@link RECOMMENDATION_SHARED_TTL_MS}). */
  sharedSignalsTtlMs?: number;
}

type SharedCommunitySignals = {
  expiresAt: number;
  games: RecommendGame[];
  scorecards: Map<string, RecommendScorecardSignals>;
  popularity: Array<{ slug: string; sessions: number }>;
  newest: string[];
};

function parseRecentHints(raw: string | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const slug = part.trim().toLowerCase();
    if (!SLUG_PATTERN.test(slug) || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
    if (out.length >= MAX_RECENT_HINTS) break;
  }
  return out;
}

function scorecardSignals(card: Scorecard): RecommendScorecardSignals {
  return {
    sessions: card.sessions.count,
    votesUp: card.votes.up,
    votesDown: card.votes.down,
    finishRate: card.depth.finishRate,
    medianPlaySeconds: card.sessions.medianPlaySeconds,
  };
}

/** Automation accounts must not train the recommender (same rule as activeDays). */
function isBotUid(uid: string): boolean {
  return uid.startsWith('bot:');
}

function buildNewestOrder(games: RecommendGame[], publishedAtBySlug: Map<string, string>): string[] {
  const dated = games
    .filter((game) => publishedAtBySlug.has(game.slug))
    .sort(
      (a, b) =>
        (publishedAtBySlug.get(b.slug) ?? '').localeCompare(publishedAtBySlug.get(a.slug) ?? '') ||
        a.slug.localeCompare(b.slug),
    )
    .map((game) => game.slug);
  const datedSet = new Set(dated);
  const undatedNewestFirst = [...games]
    .reverse()
    .filter((game) => !datedSet.has(game.slug))
    .map((game) => game.slug);
  return [...dated, ...undatedNewestFirst];
}

export async function registerRecommendationRoutes(
  app: FastifyInstance,
  options: RecommendationRoutesOptions,
): Promise<void> {
  const { store, publishedSlugs, catalog } = options;
  const now = options.now ?? Date.now;
  const sharedTtlMs = options.sharedSignalsTtlMs ?? RECOMMENDATION_SHARED_TTL_MS;

  let sharedCache: SharedCommunitySignals | null = null;
  let sharedRefresh: Promise<SharedCommunitySignals> | null = null;

  async function isPublished(slug: string): Promise<boolean> {
    return (await publishedSlugs?.isPublished(slug)) ?? false;
  }

  async function refreshSharedSignals(): Promise<SharedCommunitySignals> {
    const games = (await catalog?.listPublished()) ?? [];
    if (games.length === 0) {
      return {
        expiresAt: now() + sharedTtlMs,
        games: [],
        scorecards: new Map(),
        popularity: [],
        newest: [],
      };
    }

    const published = new Set(games.map((game) => game.slug));
    const [scorecards, recentPublished] = await Promise.all([
      store.listScorecards({ limit: 500 }),
      store.listRecentlyPublished(500),
    ]);

    const scorecardMap = new Map(
      scorecards.filter((card) => published.has(card.slug)).map((card) => [card.slug, scorecardSignals(card)]),
    );
    const popularity = [...scorecardMap.entries()]
      .map(([slug, signals]) => ({ slug, sessions: signals.sessions }))
      .sort((a, b) => b.sessions - a.sessions || a.slug.localeCompare(b.slug));

    const publishedAtBySlug = new Map<string, string>();
    for (const submission of recentPublished) {
      if (!submission.slug || !submission.publishedAt || !published.has(submission.slug)) continue;
      const existing = publishedAtBySlug.get(submission.slug);
      if (!existing || submission.publishedAt > existing) {
        publishedAtBySlug.set(submission.slug, submission.publishedAt);
      }
    }

    const entry: SharedCommunitySignals = {
      expiresAt: now() + sharedTtlMs,
      games,
      scorecards: scorecardMap,
      popularity,
      newest: buildNewestOrder(games, publishedAtBySlug),
    };
    sharedCache = entry;
    return entry;
  }

  async function getSharedSignals(): Promise<SharedCommunitySignals> {
    if (sharedCache && sharedCache.expiresAt > now()) {
      return sharedCache;
    }
    if (sharedRefresh) {
      return sharedRefresh;
    }

    sharedRefresh = refreshSharedSignals()
      .catch((error: unknown) => {
        // Stale community signals beat a visitor-facing failure: scorecards move nightly.
        if (sharedCache) {
          app.log.warn({ err: error }, 'recommendation shared signals refresh failed; serving stale');
          return sharedCache;
        }
        throw error;
      })
      .finally(() => {
        sharedRefresh = null;
      });

    return sharedRefresh;
  }

  /**
   * Best-effort "I opened this game" signal for signed-in humans. Anonymous callers
   * get 204 with no write — the browser keeps its own recent list for cold start.
   * Failures must never block play, so the handler is narrow and side-effect only.
   */
  app.post('/api/games/:slug/played', async (request, reply) => {
    const params = ParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: params.error.issues[0]?.message ?? 'invalid slug' });
    }
    if (!(await isPublished(params.data.slug))) {
      return reply.status(404).send({ error: 'game not found' });
    }
    if (!request.user || isBotUid(request.user.uid)) {
      return reply.status(204).send();
    }
    await store.recordPlayAffinity(request.user.uid, params.data.slug);
    return reply.status(204).send();
  });

  app.get('/api/recommendations', async (request, reply) => {
    const query = RecentQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({ error: query.error.issues[0]?.message ?? 'invalid query' });
    }

    const shared = await getSharedSignals();
    if (shared.games.length === 0) {
      return reply.send({ items: [], popularity: [], lastPlayed: [], newest: [] });
    }

    const published = new Set(shared.games.map((game) => game.slug));
    const recentHints = parseRecentHints(query.data.recent).filter((slug) => published.has(slug));

    let affinity: Awaited<ReturnType<Store['listPlayAffinity']>> = [];
    if (request.user && !isBotUid(request.user.uid)) {
      affinity = await store.listPlayAffinity(request.user.uid);
    }

    const ranked = rankRecommendations({
      games: shared.games,
      scorecards: shared.scorecards,
      affinity,
      recentHints,
      limit: query.data.limit ?? shared.games.length,
    });

    const lastPlayed = affinity
      .filter((entry) => published.has(entry.slug))
      .map((entry) => ({ slug: entry.slug, lastPlayedAt: entry.lastPlayedAt }))
      .sort((a, b) => b.lastPlayedAt.localeCompare(a.lastPlayedAt) || a.slug.localeCompare(b.slug));

    return reply.send({
      items: ranked.map((item) => ({ slug: item.slug, reason: item.reason })),
      popularity: shared.popularity,
      lastPlayed,
      newest: shared.newest,
    });
  });
}
