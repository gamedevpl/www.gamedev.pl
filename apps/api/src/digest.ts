import type { FastifyInstance } from 'fastify';
import type { InternalAuthVerifier } from './internal-auth.js';
import { emitDigestNotification, type EmitDeps } from './notify.js';
import { BOT_UID_PREFIX, type Scorecard, type Store } from './store.js';

/**
 * The weekly creator digest (docs/improvement-loop-plan.md IL-2).
 *
 * "Did anything happen with my games this week?" — answered without the creator having to
 * come and look. It rides the notification seam that already exists, so it reaches the
 * in-app bell, email, and Web Push with no new delivery machinery.
 *
 * **Built from scorecards, not from raw events.** The nightly sweep has already done the
 * expensive aggregation, so a digest is a handful of document reads per creator rather
 * than a telemetry scan per creator. It also means the digest and the studio cannot
 * disagree about how many sessions a game had: both read the same document.
 *
 * Two silences are deliberate, and they are the whole design:
 *
 * - **No scorecards, no digest.** A creator whose games nobody played gets nothing, not a
 *   message full of zeros. Zeros here would be manufactured evidence of the kind the rest
 *   of this system takes care never to produce — and a weekly "0 sessions" is a reason to
 *   stop reading digests entirely.
 * - **Nothing changed, no digest.** A rolling 28-day window barely moves week to week, so
 *   re-sending identical numbers every Monday would train creators to ignore it. The
 *   previous digest's own params are the comparison, which needs no new storage.
 *
 * **No feedback themes.** The digest carries counts only. Themes are player-written text
 * summarized by a model — safe to render to a signed-in creator in the studio, where they
 * are labelled as such, and not something to push into an inbox where it is stripped of
 * that context and forwarded onward. The digest says how many notes arrived and links to
 * the place built to show them.
 */

/** Published games sampled per sweep. A ceiling, not an expectation. */
const MAX_SUBMISSIONS_SAMPLED = 500;

/**
 * Where a digest sends the creator.
 *
 * A digest spans every game they own, so it cannot deep-link to one. Today that means the
 * home page, which carries the "my games" rail; when the creator studio lands this becomes
 * `/studio`, and this constant is the only line that changes.
 */
const DIGEST_LINK = '/';

export interface DigestTotals {
  /** Games with a scorecard — i.e. games with evidence, not games owned. */
  games: number;
  sessions: number;
  votesUp: number;
  votesDown: number;
  /** Written notes players left, across those games. */
  feedback: number;
}

/**
 * Sums a creator's scorecards into the numbers a digest reports.
 *
 * Pure, so the judgement calls are testable without a database — in particular that a
 * creator with scorecards but no activity in them still counts as "nothing happened".
 */
export function buildDigestTotals(scorecards: Scorecard[]): DigestTotals {
  return scorecards.reduce<DigestTotals>(
    (totals, card) => ({
      games: totals.games + 1,
      sessions: totals.sessions + card.sessions.count,
      votesUp: totals.votesUp + card.votes.up,
      votesDown: totals.votesDown + card.votes.down,
      feedback: totals.feedback + card.feedback.count,
    }),
    { games: 0, sessions: 0, votesUp: 0, votesDown: 0, feedback: 0 },
  );
}

/** True when there is genuinely nothing to tell the creator about. */
export function isEmptyDigest(totals: DigestTotals): boolean {
  return totals.sessions === 0 && totals.votesUp === 0 && totals.votesDown === 0 && totals.feedback === 0;
}

/**
 * ISO-8601 week key, e.g. `2026-W31`.
 *
 * The digest's identity, which is what makes emission idempotent: a sweep that runs twice
 * on Monday — or retries after a partial failure — produces one notification, because
 * `createNotification` is keyed by this id.
 */
export function isoWeekKey(at: number): string {
  const date = new Date(at);
  // Shift to the Thursday of this week: ISO weeks are numbered by the year that owns
  // their Thursday, which is what makes the turn of the year come out right.
  const thursday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const isoDay = (thursday.getUTCDay() + 6) % 7;
  thursday.setUTCDate(thursday.getUTCDate() - isoDay + 3);

  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const firstIsoDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstIsoDay + 3);

  const week = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function digestId(weekKey: string): string {
  return `digest-${weekKey}`;
}

/** Notification params are strings; this is the one place that shape is defined. */
export function digestParams(totals: DigestTotals): Record<string, string> {
  return {
    games: String(totals.games),
    sessions: String(totals.sessions),
    votesUp: String(totals.votesUp),
    votesDown: String(totals.votesDown),
    feedback: String(totals.feedback),
  };
}

/**
 * True when this week's numbers are the same as the ones the last digest reported.
 *
 * Compares the previous digest's stored params rather than keeping a separate ledger:
 * the notification already *is* the record of what the creator was last told, and a second
 * copy of that fact is a second thing that can disagree with it.
 */
export function matchesPrevious(previousParams: Record<string, string> | null, totals: DigestTotals): boolean {
  if (!previousParams) return false;
  const current = digestParams(totals);
  return Object.keys(current).every((key) => previousParams[key] === current[key]);
}

export interface DigestSweepDeps extends EmitDeps {
  store: Store;
  now?: () => number;
  /** Called per creator whose digest could not be emitted, so a failure has a cause. */
  onError?: (uid: string, error: unknown) => void;
}

export interface DigestSweepResult {
  weekKey: string;
  /** Distinct creators considered. */
  creators: number;
  /** Digests actually created. */
  sent: number;
  /** Skipped because their games had no evidence this window. */
  skippedEmpty: number;
  /** Skipped because the numbers had not moved since their last digest. */
  skippedUnchanged: number;
  failed: number;
}

/**
 * Emits one digest per creator with something to report.
 *
 * Scoped to creators who have published something: a submission that never shipped has no
 * scorecard behind it, and a digest about a game that does not exist yet would be a
 * progress report the status page already gives better.
 */
export async function runDigestSweep(deps: DigestSweepDeps): Promise<DigestSweepResult> {
  const { store } = deps;
  const now = deps.now ?? Date.now;
  const currentTime = now();
  const weekKey = isoWeekKey(currentTime);

  const published = (await store.listRecentlyPublished(MAX_SUBMISSIONS_SAMPLED)).filter(
    // Automation accounts are excluded for the same reason the creator metrics exclude
    // them: a digest addressed to a test harness is noise with a delivery cost.
    (submission) => !submission.ownerUid.startsWith(BOT_UID_PREFIX),
  );

  const slugsByOwner = new Map<string, Set<string>>();
  for (const submission of published) {
    if (!submission.slug || submission.abandonedAt) continue;
    const owned = slugsByOwner.get(submission.ownerUid) ?? new Set<string>();
    owned.add(submission.slug);
    slugsByOwner.set(submission.ownerUid, owned);
  }

  let sent = 0;
  let skippedEmpty = 0;
  let skippedUnchanged = 0;
  let failed = 0;

  for (const [uid, slugs] of slugsByOwner) {
    try {
      const cards = (await Promise.all([...slugs].map((slug) => store.getScorecard(slug)))).filter(
        (card): card is Scorecard => card !== null,
      );

      const totals = buildDigestTotals(cards);
      if (cards.length === 0 || isEmptyDigest(totals)) {
        skippedEmpty += 1;
        continue;
      }

      const previous = await findPreviousDigest(store, uid);
      if (matchesPrevious(previous, totals)) {
        skippedUnchanged += 1;
        continue;
      }

      const { created } = await emitDigestNotification(deps, {
        uid,
        id: digestId(weekKey),
        params: digestParams(totals),
        link: DIGEST_LINK,
        createdAt: new Date(currentTime).toISOString(),
      });
      if (created) sent += 1;
    } catch (error) {
      // One creator's failure must not cost every later creator their digest — the same
      // rule the scorecard and notification sweeps follow. Reported, never swallowed.
      failed += 1;
      deps.onError?.(uid, error);
    }
  }

  return { weekKey, creators: slugsByOwner.size, sent, skippedEmpty, skippedUnchanged, failed };
}

/** The params of the most recent digest this creator received, or null if they have none. */
async function findPreviousDigest(store: Store, uid: string): Promise<Record<string, string> | null> {
  const recent = await store.listNotifications(uid, { limit: 50 });
  const previous = recent.find((notification) => notification.type === 'creator.digest');
  return previous?.params ?? null;
}

export interface DigestRoutesOptions {
  store: Store;
  /** OIDC verifier for the scheduler; deny-all when the sweep is not configured. */
  internalAuthVerifier: InternalAuthVerifier;
  now?: () => number;
}

export async function registerDigestRoutes(app: FastifyInstance, options: DigestRoutesOptions): Promise<void> {
  const { store, internalAuthVerifier } = options;

  // Cloud Scheduler POSTs here weekly with an OIDC token, exactly as the scorecard and
  // notification sweeps do. The rate ceiling is a runaway guard, not the access control.
  app.post(
    '/api/internal/digest-sweep',
    { config: { rateLimit: { max: 12, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (!(await internalAuthVerifier.verify(request.headers.authorization))) {
        return reply.status(401).send({ error: 'unauthorized' });
      }

      try {
        const result = await runDigestSweep({
          store,
          now: options.now,
          logError: (err, msg) => request.log.error({ err }, msg),
          onError: (uid, error) => request.log.error({ err: error, uid }, 'digest emit failed'),
        });
        const log = result.failed > 0 ? request.log.error.bind(request.log) : request.log.info.bind(request.log);
        log({ ...result }, 'digest sweep complete');
        return reply.send(result);
      } catch (error) {
        request.log.error({ err: error }, 'digest sweep failed');
        return reply.status(500).send({ error: 'digest sweep failed' });
      }
    },
  );
}
