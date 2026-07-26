import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { recentPartitions, summarizeGameHealth, type GameHealth } from './telemetry-health.js';
import { summarizeVisitFunnel, type VisitFunnel } from './visit-funnel.js';
import { summarizeCreatorMetrics, type CreatorMetrics } from './creator-metrics.js';
import { BOT_UID_PREFIX, type Store, type TelemetryEvent, type User, type VisitEvent } from './store.js';

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

export interface VisitsResponse {
  /** Partitions actually scanned, most recent first — same contract as `HealthResponse`. */
  days: string[];
  truncated: boolean;
  funnel: VisitFunnel;
}

export interface CreatorsResponse {
  /** Published submissions sampled, newest first. Bounded like every other read here. */
  sampled: number;
  metrics: CreatorMetrics;
}

/**
 * How many recently published submissions the creator view reads.
 *
 * Each one costs a user lookup on top of its own document, so this is the knob that
 * keeps an operator page view a few dozen reads rather than unbounded.
 */
const MAX_SUBMISSIONS_SAMPLED = 100;

export function isAdmin(uid: string | undefined, adminUids: Set<string> | undefined): boolean {
  return uid !== undefined && adminUids !== undefined && adminUids.has(uid);
}

/**
 * Admin *and* signed in with a browser session rather than a personal access token.
 *
 * Every operator surface takes this stricter test. A PAT is a long-lived credential that
 * lives in CI config and agent VMs — environments where a human is not watching — so it
 * may act as its user but never see across other people's games, and never mint another
 * token. That keeps the blast radius of a leaked token inside one account, which is the
 * property the whole design rests on (docs/agent-access-tokens.md).
 */
export function isAdminSession(request: FastifyRequest, adminUids: Set<string> | undefined): boolean {
  return request.authMethod === 'session' && isAdmin(request.user?.uid, adminUids);
}

/**
 * Reads a window of daily partitions under one shared document budget.
 *
 * Both telemetry streams need the identical walk — newest day first, per-day cap, and a
 * total cap so the widest window (exactly the one someone reaches for when something
 * looks wrong) cannot turn one click into tens of thousands of reads. Sharing it means
 * the two views cannot drift into reporting truncation differently.
 */
async function scanPartitions<T>(
  days: string[],
  read: (dateStr: string, limit: number) => Promise<T[]>,
): Promise<{ events: T[]; scanned: string[]; truncated: boolean }> {
  const events: T[] = [];
  const scanned: string[] = [];
  let truncated = false;

  for (const dateStr of days) {
    const remaining = MAX_EVENTS_PER_REQUEST - events.length;
    if (remaining <= 0) {
      // Out of budget with days still unread: the window really scanned is narrower
      // than the one asked for, and `days` reports the narrower one so the range shown
      // to the reader is never wider than the range measured.
      truncated = true;
      break;
    }
    const limit = Math.min(MAX_EVENTS_PER_DAY, remaining);
    const dayEvents = await read(dateStr, limit);
    // A day at its cap means events were left unread, so every count is a floor.
    if (dayEvents.length >= limit) truncated = true;
    events.push(...dayEvents);
    scanned.push(dateStr);
  }

  return { events, scanned, truncated };
}

export async function registerAdminRoutes(app: FastifyInstance, options: AdminRoutesOptions): Promise<void> {
  const { store, adminUids } = options;
  const now = options.now ?? Date.now;

  app.get('/api/admin/telemetry/health', async (request, reply) => {
    // 404 rather than 403 for a signed-in non-admin: the existence of an operator
    // surface is not something a beta tester needs confirmed. An unauthenticated
    // request gets the same answer, so probing tells nobody anything.
    if (!isAdminSession(request, adminUids)) {
      return reply.status(404).send({ error: 'not found' });
    }

    const parsed = QuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid query' });
    }

    // Newest day first, so exhausting the budget drops the oldest history rather than
    // the data most likely to be asked about.
    const requested = recentPartitions(parsed.data.days ?? DEFAULT_DAYS, now());
    const { events, scanned, truncated } = await scanPartitions<TelemetryEvent>(requested, (dateStr, limit) =>
      store.listTelemetryEvents(dateStr, { limit }),
    );

    const body: HealthResponse = { days: scanned, truncated, games: summarizeGameHealth(events) };
    return reply.status(200).send(body);
  });

  /**
   * The visit funnel — the read half of the stream captured since 2026-07-25.
   *
   * Same operator gate as game health, and for a stronger reason: this view is about
   * how people arrive rather than how one game behaves, so it is the closest thing the
   * service has to a business dashboard. It still returns only aggregates, and the
   * underlying rows carry no identity to leak.
   */
  app.get('/api/admin/telemetry/visits', async (request, reply) => {
    if (!isAdminSession(request, adminUids)) {
      return reply.status(404).send({ error: 'not found' });
    }

    const parsed = QuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid query' });
    }

    const requested = recentPartitions(parsed.data.days ?? DEFAULT_DAYS, now());
    const { events, scanned, truncated } = await scanPartitions<VisitEvent>(requested, (dateStr, limit) =>
      store.listVisitEvents(dateStr, { limit }),
    );

    const body: VisitsResponse = { days: scanned, truncated, funnel: summarizeVisitFunnel(events) };
    return reply.status(200).send(body);
  });

  /**
   * Creator return and build economics — the two numbers Stage 0 gates on.
   *
   * Unlike the other two reads this one is not windowed by day: it samples the most
   * recently published submissions, because a D7 question is about what happened after
   * a publish, not about what happened inside a chosen week.
   */
  app.get('/api/admin/telemetry/creators', async (request, reply) => {
    if (!isAdminSession(request, adminUids)) {
      return reply.status(404).send({ error: 'not found' });
    }

    // Automation accounts are excluded: these two numbers are about whether *people*
    // come back and what their builds cost, and a bot account driven by a test suite
    // would report flawless retention for a creator who does not exist.
    const submissions = (await store.listRecentlyPublished(MAX_SUBMISSIONS_SAMPLED)).filter(
      (submission) => !submission.ownerUid.startsWith(BOT_UID_PREFIX),
    );

    // One lookup per distinct owner, not per submission: a prolific creator would
    // otherwise be fetched once per game they published.
    const usersByUid = new Map<string, User>();
    for (const uid of new Set(submissions.map((submission) => submission.ownerUid))) {
      const user = await store.getUser(uid);
      if (user) usersByUid.set(uid, user);
    }

    const body: CreatorsResponse = {
      sampled: submissions.length,
      metrics: summarizeCreatorMetrics(submissions, usersByUid, now()),
    };
    return reply.status(200).send(body);
  });
}
