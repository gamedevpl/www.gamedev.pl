import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { recentPartitions, summarizeGameHealth, type GameHealth } from './telemetry-health.js';
import type { Store, TelemetryEvent } from './store.js';

/**
 * Operator-only reads over play telemetry (docs/improvement-loop-plan.md IL-2).
 *
 * The first read path for data IL-1 has been capturing since 2026-07-25. Scoped to
 * operators rather than creators for a reason worth keeping: a creator-facing scorecard
 * has to attribute a game to a person, attribution runs through `submissions.ownerUid`,
 * and most catalog games have no submission document — so a per-creator view would cover
 * a fraction of the catalog while claiming to answer "is my game working". The operator
 * view sidesteps attribution entirely and covers every published game.
 *
 * Raw events are never returned, only aggregates. That is the same rule the plan sets
 * for what agents may read, and it holds here for the same reason: an `error` message or
 * a `progress` label is game-controlled text, and a view that echoed it verbatim would
 * be an injection channel into whatever reads this next.
 */

/** Widest window one request may ask for. Each day is a separate Firestore query. */
const MAX_DAYS = 30;
const DEFAULT_DAYS = 7;
/** Per-partition read cap, matching the store's own default. */
const MAX_EVENTS_PER_DAY = 1000;
/**
 * Documents one request may read in total, across every partition it touches.
 *
 * The window alone does not bound cost: 30 days at the per-day cap is 30,000 document
 * reads for one click, and the widest window is exactly the one someone reaches for when
 * a game looks wrong. Budgeting the total keeps a quiet month cheap — at a few dozen
 * events a day the whole window costs about a thousand reads — and makes a busy one
 * degrade by narrowing the window rather than by silently costing thirty times more.
 */
const MAX_EVENTS_PER_REQUEST = 5_000;

const QuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(MAX_DAYS).optional(),
});

export interface AdminRoutesOptions {
  store: Store;
  /** Uids permitted to read. Empty means the routes exist but admit nobody. */
  adminUids?: Set<string>;
  now?: () => number;
}

export interface HealthResponse {
  /**
   * Partitions actually scanned, most recent first — not necessarily the ones asked
   * for. A request that runs out of read budget reports the narrower window it really
   * measured, so a range shown to a reader is never wider than the range behind it.
   */
  days: string[];
  /** True when any partition hit a cap, so every count below is a floor. */
  truncated: boolean;
  games: GameHealth[];
}

export function isAdmin(uid: string | undefined, adminUids: Set<string> | undefined): boolean {
  return uid !== undefined && adminUids !== undefined && adminUids.has(uid);
}

export async function registerAdminRoutes(app: FastifyInstance, options: AdminRoutesOptions): Promise<void> {
  const { store, adminUids } = options;
  const now = options.now ?? Date.now;

  app.get('/api/admin/telemetry/health', async (request, reply) => {
    // 404 rather than 403 for a signed-in non-admin: the existence of an operator
    // surface is not something a beta tester needs confirmed. An unauthenticated
    // request gets the same answer, so probing tells nobody anything.
    if (!isAdmin(request.user?.uid, adminUids)) {
      return reply.status(404).send({ error: 'not found' });
    }

    const parsed = QuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid query' });
    }

    const requested = recentPartitions(parsed.data.days ?? DEFAULT_DAYS, now());
    const events: TelemetryEvent[] = [];
    const scanned: string[] = [];
    let truncated = false;

    // Newest day first, so exhausting the budget drops the oldest history rather than
    // the data most likely to be asked about.
    for (const dateStr of requested) {
      const remaining = MAX_EVENTS_PER_REQUEST - events.length;
      if (remaining <= 0) {
        // Out of budget with days still unread: the window really scanned is narrower
        // than the one asked for, and `days` below reports the narrower one so the
        // range shown to the reader is never wider than the range measured.
        truncated = true;
        break;
      }
      const limit = Math.min(MAX_EVENTS_PER_DAY, remaining);
      const dayEvents = await store.listTelemetryEvents(dateStr, { limit });
      // A day at its cap means events were left unread, so every count is a floor.
      // Said out loud in the response rather than quietly under-reporting.
      if (dayEvents.length >= limit) truncated = true;
      events.push(...dayEvents);
      scanned.push(dateStr);
    }

    const body: HealthResponse = { days: scanned, truncated, games: summarizeGameHealth(events) };
    return reply.status(200).send(body);
  });
}
