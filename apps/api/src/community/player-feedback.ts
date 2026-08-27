import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ContentChecker } from '../platform/moderation.js';
import type { PublishedSlugGate } from '../catalog/published-slugs.js';
import { sanitizeCreatorText } from '../platform/submission-status.js';
import type { Store } from '../platform/store.js';
import { logModerationRejection } from '../platform/moderation-metrics.js';

/**
 * Written player feedback (docs/improvement-loop-plan.md, signal source #1) — free
 * text from someone who just played a **published** game, keyed by games-repo slug.
 *
 * This is the sibling of `POST /api/submissions/:token/feedback` in submissions.ts,
 * with three deliberate differences:
 *
 * 1. **Keyed by slug, gated by `PublishedSlugGate`** — like telemetry and votes, not
 *    like the creator route's per-submission token. Most of the catalog has no
 *    `submissions/{n}` document at all, so addressing by submission would silently
 *    drop the majority of real feedback, the exact bug telemetry and votes both hit
 *    and fixed. Storage follows suit: `games/{slug}/playerFeedback/{id}`, not
 *    `submissions/{jobId}/playerFeedback/{id}` (see store.ts `PlayerFeedbackRecord`
 *    for the full correction — the plan doc originally specified the submission path).
 * 2. **Requires a session.** Votes chose public-read/session-write; free text is a
 *    materially larger abuse surface than a thumb (moderation bypass attempts, spam
 *    volume, harassment aimed at a creator), so casting feedback needs `request.user`,
 *    same as casting a vote. This is a real cost: it excludes anonymous players, who
 *    are most of the funnel this loop exists to measure, and it is worth revisiting
 *    if that gap turns out to matter more than the abuse surface it closes.
 * 3. **Does not post to GitHub.** Creator feedback is rare (a build-time revision
 *    request) and always has somewhere to land (the open issue or PR). Player
 *    feedback is comparatively high-volume and, for most published games, has no
 *    open PR to comment on at all — so it is stored only, exactly as
 *    docs/improvement-loop-plan.md's "Abuse and safety notes" section specifies.
 *    It accumulates into the future per-game scorecard (IL-2); only the IL-3 router
 *    decides whether any of it ever reaches an agent, and even then only as
 *    aggregated/fenced evidence, never raw text (see the product-instrumentation
 *    skill's "Aggregates only leave the building" invariant).
 *
 * Everything paranoid about the creator route is load-bearing here too: moderation
 * before storage, sanitization, and the same 422 contract.
 */

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const ParamsSchema = z.object({
  slug: z.string().trim().min(1).max(80).regex(SLUG_PATTERN, 'invalid slug'),
});

/** Enforced twice: on the raw body, and again on the sanitized text actually stored. */
const MIN_FEEDBACK_LENGTH = 10;

const FeedbackRequestSchema = z.object({
  text: z
    .string()
    .trim()
    .min(MIN_FEEDBACK_LENGTH, `feedback must be at least ${MIN_FEEDBACK_LENGTH} characters`)
    .max(2000, 'feedback must be at most 2000 characters'),
});

export interface PlayerFeedbackRoutesOptions {
  store: Store;
  contentChecker: ContentChecker;
  /** Absent (no games repo configured) makes every slug answer 404, like votes/telemetry. */
  publishedSlugs?: PublishedSlugGate | null;
  dailyPlayerFeedbackQuota?: number;
  now?: () => number;
}

/** Sliding-window per-IP limiter, duplicated per route file by this codebase's own convention. */
function isRateLimited(
  buckets: Map<string, number[]>,
  ip: string,
  currentTime: number,
  maxRequests: number,
  windowMs: number,
): boolean {
  const requests = (buckets.get(ip) ?? []).filter((timestamp) => currentTime - timestamp < windowMs);
  if (requests.length >= maxRequests) {
    buckets.set(ip, requests);
    return true;
  }
  requests.push(currentTime);
  buckets.set(ip, requests);
  return false;
}

export async function registerPlayerFeedbackRoutes(
  app: FastifyInstance,
  options: PlayerFeedbackRoutesOptions,
): Promise<void> {
  const { store, contentChecker, publishedSlugs } = options;
  const now = options.now ?? Date.now;
  const dailyPlayerFeedbackQuota = options.dailyPlayerFeedbackQuota ?? 20;

  const rateLimitWindowMs = 60 * 60 * 1000;
  const maxPerWindow = 10;
  const feedbackByIp = new Map<string, number[]>();

  async function isPublished(slug: string): Promise<boolean> {
    return (await publishedSlugs?.isPublished(slug)) ?? false;
  }

  app.post(
    '/api/games/:slug/feedback',
    { config: { rateLimit: { max: maxPerWindow, timeWindow: rateLimitWindowMs } } },
    async (request, reply) => {
      if (!request.user) {
        return reply.status(401).send({ error: 'authentication required' });
      }
      if (request.user.tier === 'blocked') {
        return reply.status(403).send({ error: 'account is blocked' });
      }

      const params = ParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ error: params.error.issues[0]?.message ?? 'invalid slug' });
      }

      const body = FeedbackRequestSchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ error: body.error.issues[0]?.message ?? 'invalid request' });
      }

      if (!(await isPublished(params.data.slug))) {
        return reply.status(404).send({ error: 'game not found' });
      }

      // 1. Sanitize, then re-check the length of what would actually be stored.
      //
      // The schema's minimum runs on the raw text, and `sanitizeCreatorText` is
      // destructive — it strips HTML tags and markdown punctuation — so input that
      // clears the raw minimum can sanitize down to nothing. Ten asterisks are the
      // trivial case: they pass the schema, survive moderation, and would otherwise
      // spend a day's quota to store an empty row. Validating the sanitized result
      // is what makes the minimum a promise about the stored record rather than
      // about the request body.
      const sanitized = sanitizeCreatorText(body.data.text, { singleLine: false });
      if (sanitized.length < MIN_FEEDBACK_LENGTH) {
        return reply.status(400).send({ error: `feedback must be at least ${MIN_FEEDBACK_LENGTH} characters` });
      }

      // 2. Content moderation before spending any quota, on the raw text *and* on the
      // sanitized text when they differ.
      //
      // Both are needed, for opposite reasons. The raw text is the only one that still
      // carries markdown link targets, so it is what the URL-count check can see. The
      // sanitized text is what actually gets stored, and sanitization can *reveal*
      // content the raw form hid: markdown emphasis characters are stripped to nothing,
      // so `sh*it` passes a term check and is then stored in its matching form. (HTML
      // tags are not a vector — those become a space, which does not rejoin a word.)
      // Checking only one leaves the other's evasion open.
      //
      // Identical strings are checked once — that is the overwhelmingly common case
      // (plain prose sanitizes to itself), so the second call is paid only by input
      // carrying markup, which is exactly the input worth paying for.
      const fieldsToModerate = sanitized === body.data.text ? [body.data.text] : [body.data.text, sanitized];
      const moderation = await contentChecker.checkFields(fieldsToModerate);
      if (!moderation.allowed) {
        logModerationRejection(request.log, {
          surface: 'player_feedback',
          uid: request.user?.uid,
          category: moderation.category,
        });
        return reply.status(422).send({ error: 'content_rejected', category: moderation.category ?? 'other' });
      }

      const currentTime = now();

      // 3. Coarse per-IP rate limit.
      if (isRateLimited(feedbackByIp, request.ip, currentTime, maxPerWindow, rateLimitWindowMs)) {
        return reply.status(429).send({ error: 'too many feedback requests, please try again later' });
      }

      // 4. Daily per-user quota, separate from the creator `feedback` counter — a
      // creator sending build revisions and a player leaving play feedback should
      // not compete for the same budget.
      const dateStr = new Date(currentTime).toISOString().slice(0, 10);
      const quota = await store.checkAndIncrementQuota(
        request.user.uid,
        dateStr,
        dailyPlayerFeedbackQuota,
        'playerFeedback',
      );
      if (!quota.allowed) {
        if (quota.tier === 'blocked') {
          return reply.status(403).send({ error: 'account is blocked' });
        }
        return reply.status(429).send({ error: 'daily feedback quota exceeded' });
      }

      await store.addPlayerFeedback(params.data.slug, request.user.uid, sanitized);

      return reply.send({ ok: true });
    },
  );
}
