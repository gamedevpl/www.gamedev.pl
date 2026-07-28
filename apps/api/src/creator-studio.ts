import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { recentPartitions, summarizeGameHealth, type GameHealth } from './telemetry-health.js';
import type { Store, TelemetryEvent } from './store.js';

/**
 * Creator control panel reads (docs/improvement-loop-plan.md IL-2 creator surface).
 *
 * The operator health view covers every published game; this one is scoped to the
 * signed-in creator's own submissions. Attribution runs through `ownerUid` + `slug`,
 * so a game never commissioned here (no submission document) correctly stays out —
 * the creator has nothing to manage for it.
 *
 * Aggregates only. Error message samples are the one attacker-controlled field; they
 * are safe to render as text in the studio and unsafe to feed to an agent unfenced.
 */

const MAX_DAYS = 30;
const DEFAULT_DAYS = 7;
const MAX_EVENTS_PER_DAY = 1000;
const MAX_EVENTS_PER_REQUEST = 5_000;
/** Studio list ceiling — a creator's shelf, not a catalog. */
const MAX_STUDIO_GAMES = 50;

const QuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(MAX_DAYS).optional(),
});

export interface CreatorStudioRoutesOptions {
  store: Store;
  /** Mints status tokens so the studio can deep-link into the build page. */
  mintStatusToken?: (issueNumber: number) => string;
  now?: () => number;
}

export interface CreatorStudioGame {
  token: string;
  title: string;
  createdAt: string;
  lastKnownStatus: string | null;
  slug?: string;
  publishedAt?: string;
}

export interface CreatorHealthResponse {
  days: string[];
  truncated: boolean;
  games: GameHealth[];
}

/**
 * The parts of a game's scorecard the health route cannot produce.
 *
 * Deliberately **not** the whole scorecard. Health recomputes over a window the creator
 * picks (7/14/30d); a scorecard is a fixed 28-day roll. Returning its session counts too
 * would put two numbers labelled "sessions" on one screen, disagreeing, with nothing
 * saying why — so this carries only what recomputation genuinely cannot supply, and the
 * window it was measured over travels with it.
 */
export interface CreatorScorecardSummary {
  slug: string;
  computedAt: string;
  /** Days the sweep actually read — the window these numbers describe. */
  windowDays: number;
  truncated: boolean;
  votes: { up: number; down: number };
  feedbackCount: number;
  /**
   * Recurring themes distilled from written feedback.
   *
   * Player-written text, summarized by a model that read player-written text: safe to
   * render to the creator as text, never safe to hand an agent as instruction. It reaches
   * the client under a name that says so.
   */
  untrustedThemes: Array<{ theme: string; count: number }>;
}

export interface CreatorScorecardsResponse {
  scorecards: CreatorScorecardSummary[];
}

/**
 * Reads play events for a fixed set of slugs under one shared document budget.
 *
 * Per-slug queries (not a full-partition scan) so a quiet creator's niche game is not
 * crowded out of the budget by everyone else's traffic — the opposite problem from the
 * operator view, which deliberately covers the whole catalog.
 */
async function scanOwnedSlugs(
  store: Store,
  slugs: string[],
  days: string[],
): Promise<{ events: TelemetryEvent[]; scanned: string[]; truncated: boolean }> {
  const events: TelemetryEvent[] = [];
  const scanned: string[] = [];
  let truncated = false;

  for (const dateStr of days) {
    let dayHadRoom = false;
    for (const slug of slugs) {
      const remaining = MAX_EVENTS_PER_REQUEST - events.length;
      if (remaining <= 0) {
        truncated = true;
        break;
      }
      const limit = Math.min(MAX_EVENTS_PER_DAY, remaining);
      const dayEvents = await store.listTelemetryEvents(dateStr, { slug, limit });
      if (dayEvents.length >= limit) truncated = true;
      events.push(...dayEvents);
      dayHadRoom = true;
    }
    if (!dayHadRoom && events.length >= MAX_EVENTS_PER_REQUEST) {
      truncated = true;
      break;
    }
    if (dayHadRoom) scanned.push(dateStr);
    if (events.length >= MAX_EVENTS_PER_REQUEST) {
      truncated = true;
      break;
    }
  }

  return { events, scanned, truncated };
}

export async function registerCreatorStudioRoutes(
  app: FastifyInstance,
  options: CreatorStudioRoutesOptions,
): Promise<void> {
  const { store } = options;
  const now = options.now ?? Date.now;

  function requireUser(
    request: { user?: { uid: string; tier?: string } | null },
    reply: {
      status: (code: number) => { send: (body: unknown) => unknown };
    },
  ): boolean {
    if (!request.user) {
      reply.status(401).send({ error: 'authentication required' });
      return false;
    }
    if (request.user.tier === 'blocked') {
      reply.status(403).send({ error: 'account is blocked' });
      return false;
    }
    return true;
  }

  /**
   * The creator's shelf: every non-abandoned submission, with the fields the studio
   * needs to render without a follow-up status poll (slug + publishedAt). Tokens are
   * re-minted so a fresh device recovers access.
   */
  app.get('/api/me/studio', async (request, reply) => {
    if (!requireUser(request, reply)) return;
    if (!options.mintStatusToken) {
      return reply.status(503).send({ error: 'submissions are not configured' });
    }

    const records = await store.listSubmissionsByOwner(request.user!.uid, { limit: MAX_STUDIO_GAMES });
    const games: CreatorStudioGame[] = records
      .filter((record) => !record.abandonedAt)
      .map((record) => ({
        token: options.mintStatusToken!(record.issueNumber),
        title: record.title,
        createdAt: record.createdAt,
        lastKnownStatus: record.lastNotifiedStatus ?? null,
        ...(record.slug ? { slug: record.slug } : {}),
        ...(record.publishedAt ? { publishedAt: record.publishedAt } : {}),
      }));

    return reply.send({ games });
  });

  /**
   * Per-game play health for the creator's own published slugs only.
   *
   * Same aggregator as the operator view — one definition of "sessions / bounces /
   * stalls" — filtered to games this uid owns and has published. Draft-only slugs
   * are playable via share links but are not yet "live" funnel subjects, so they
   * stay out of the scorecard.
   */
  app.get('/api/me/studio/health', async (request, reply) => {
    if (!requireUser(request, reply)) return;

    const parsed = QuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid query' });
    }

    const records = await store.listSubmissionsByOwner(request.user!.uid, { limit: MAX_STUDIO_GAMES });
    const slugs = [
      ...new Set(
        records
          .filter((record) => !record.abandonedAt && record.slug && record.publishedAt)
          .map((record) => record.slug as string),
      ),
    ];

    if (slugs.length === 0) {
      const body: CreatorHealthResponse = { days: [], truncated: false, games: [] };
      return reply.send(body);
    }

    const requested = recentPartitions(parsed.data.days ?? DEFAULT_DAYS, now());
    const { events, scanned, truncated } = await scanOwnedSlugs(store, slugs, requested);
    const owned = new Set(slugs);
    const games = summarizeGameHealth(events).filter((game) => owned.has(game.slug));

    const body: CreatorHealthResponse = { days: scanned, truncated, games };
    return reply.send(body);
  });

  /**
   * Votes and feedback themes for the creator's own published games.
   *
   * The third of IL-2's exit questions — "what do they say" — which the health route above
   * cannot answer at any window size, because votes, feedback and themes are not derived
   * from play events at all. Reads the scorecards the nightly sweep already wrote: cheap
   * (one document per game), and it means the studio and the weekly digest cannot report
   * different numbers, since both read the same document.
   *
   * A game with no scorecard is simply absent from the list rather than present with
   * zeros — it has not been measured, which is not the same as having been measured as
   * nothing.
   */
  app.get('/api/me/studio/scorecards', async (request, reply) => {
    if (!requireUser(request, reply)) return;

    const records = await store.listSubmissionsByOwner(request.user!.uid, { limit: MAX_STUDIO_GAMES });
    const slugs = [
      ...new Set(
        records
          .filter((record) => !record.abandonedAt && record.slug && record.publishedAt)
          .map((record) => record.slug as string),
      ),
    ];

    const cards = await Promise.all(slugs.map((slug) => store.getScorecard(slug)));
    const scorecards: CreatorScorecardSummary[] = cards
      .filter((card): card is NonNullable<typeof card> => card !== null)
      .map((card) => ({
        slug: card.slug,
        computedAt: card.computedAt,
        windowDays: card.window.days.length,
        truncated: card.window.truncated,
        votes: card.votes,
        feedbackCount: card.feedback.count,
        untrustedThemes: card.untrusted.feedbackThemes ?? [],
      }));

    const body: CreatorScorecardsResponse = { scorecards };
    return reply.send(body);
  });
}
