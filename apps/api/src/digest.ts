import type { FastifyInstance } from 'fastify';
import type { InternalAuthVerifier } from './internal-auth.js';
import { emitDigestNotification, type EmitDeps } from './notifications/notify.js';
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

/**
 * Scorecards sampled per sweep. A ceiling, not an expectation — and reported when it binds.
 *
 * The sweep starts from scorecards rather than from recently-published submissions, because
 * a scorecard *is* the evidence this digest reports on. Enumerating creators by recent
 * publication instead would silently drop the creator of an older game that is still being
 * played — exactly the person a "your games are still being played" message is for — and
 * would contradict this module's own "no scorecards, no digest" contract in the direction
 * that loses digests rather than the one that stops sending them.
 */
const MAX_SCORECARDS_SAMPLED = 1_000;

/**
 * How far back to look for the creator's last digest.
 *
 * Bounded, so a long-lived account is not read in full every week. The bound's failure mode
 * is worth stating because it decides the size: overrunning it makes an unchanged week look
 * like a first digest, so the creator receives one duplicate — never a missed one. Between
 * two digests a creator accumulates at most a few notifications per submission, so passing
 * this would take dozens of builds in a single week.
 */
const NOTIFICATION_SCAN_LIMIT = 200;

/**
 * Where a digest sends the creator.
 *
 * A digest spans every game they own, so it cannot deep-link to one — it links to the
 * shelf. `/studio` is where the numbers behind the digest actually live: the same
 * scorecards, per game, with the feedback themes the digest deliberately does not carry.
 * Sending someone to the home page instead would make them hunt for what the message was
 * about.
 */
const DIGEST_LINK = '/studio';

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
  /** Overrides `MAX_SCORECARDS_SAMPLED`; exists so the ceiling's boundary is testable. */
  scorecardSampleLimit?: number;
  /** Called per creator whose digest could not be emitted, so a failure has a cause. */
  onError?: (uid: string, error: unknown) => void;
}

export interface DigestSweepResult {
  weekKey: string;
  /** True when `MAX_SCORECARDS_SAMPLED` bound before every scorecard was read. */
  truncated: boolean;
  /** Distinct creators considered. */
  creators: number;
  /** Digests actually created. */
  sent: number;
  /** Creators who asked not to receive the digest. */
  optedOut: number;
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

  // Evidence first: every game the nightly sweep had something to say about, then back to
  // who owns it. A game with no scorecard cannot produce a digest line, so it never needs
  // to be enumerated.
  // One over the ceiling, so `truncated` distinguishes "there were more" from "there were
  // exactly this many". Asking for exactly the limit makes a full page indistinguishable
  // from an overflowing one, and reporting truncation that did not happen is a false alarm
  // about missing digests — the opposite error from a silent cap, and still an error.
  const sampleLimit = deps.scorecardSampleLimit ?? MAX_SCORECARDS_SAMPLED;
  const sampled = await store.listScorecards({ limit: sampleLimit + 1 });
  const truncated = sampled.length > sampleLimit;

  const cardsByOwner = new Map<string, Scorecard[]>();
  for (const card of sampled.slice(0, sampleLimit)) {
    const submission = await store.getSubmissionBySlug(card.slug);
    // No submission means no creator on the platform to write to — most of the catalog
    // predates the submission flow. Unpublished and abandoned games are not theirs to hear
    // about either: a draft's numbers belong on the status page.
    if (!submission?.publishedAt || submission.abandonedAt) continue;
    // Automation accounts are excluded for the same reason the creator metrics exclude
    // them: a digest addressed to a test harness is noise with a delivery cost.
    if (submission.ownerUid.startsWith(BOT_UID_PREFIX)) continue;

    const owned = cardsByOwner.get(submission.ownerUid) ?? [];
    owned.push(card);
    cardsByOwner.set(submission.ownerUid, owned);
  }

  let sent = 0;
  let optedOut = 0;
  let skippedEmpty = 0;
  let skippedUnchanged = 0;
  let failed = 0;

  for (const [uid, cards] of cardsByOwner) {
    try {
      // Checked before any work: an opted-out creator costs no reads, and the sweep's
      // counters describe who was actually considered.
      const user = await store.getUser(uid);
      if (user?.digestOptOutAt) {
        optedOut += 1;
        continue;
      }

      const totals = buildDigestTotals(cards);
      if (isEmptyDigest(totals)) {
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

  return { weekKey, truncated, creators: cardsByOwner.size, sent, optedOut, skippedEmpty, skippedUnchanged, failed };
}

/** The params of the most recent digest this creator received, or null if they have none. */
async function findPreviousDigest(store: Store, uid: string): Promise<Record<string, string> | null> {
  const recent = await store.listNotifications(uid, { limit: NOTIFICATION_SCAN_LIMIT });
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
