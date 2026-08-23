/**
 * Moderation rejections, made visible (docs/content-safety-plan.md Layer 5, slice 2).
 *
 * Every layer of the content-safety design was built and then never observed. Rejections
 * happen — a 422 goes back to the creator and the event evaporates. That is fine for one
 * clumsy phrasing and useless for the question the owner actually needs answered when the
 * beta opens: *is anyone probing this, and where?* A moderator with no numbers cannot tell
 * a deny-list that is working from one that stopped being called.
 *
 * So every rejection emits one structured line, from here and nowhere else. One place
 * matters more than it looks: there are seven call sites across six modules, each of which
 * builds its own 422, and "log it at each site" would mean seven slightly different shapes
 * — different keys, different severities, one that forgot the category — and a log-based
 * metric can only count what it can match. The filter that backs the alert keys off the
 * message string below, so that string is part of the operational contract, not a comment.
 *
 * **What is deliberately not logged: the text.** Counting is the goal, and the rejected
 * text is the abusive content itself. Writing it into Cloud Logging would move user-authored
 * abuse material into a system with its own retention, its own access rules and no erasure
 * path, in service of a feature whose entire purpose is to keep that material out. The
 * category is what makes a rejection actionable; the wording never was.
 *
 * The uid IS logged, because concentration is the signal. One rejection is a person
 * struggling to phrase something. Twelve from one uid inside a minute is somebody testing
 * where the wall is, and those two look identical in a bare count. It is the same
 * pseudonymous `g:<sub>` already written to logs elsewhere (admin.ts), not an email.
 */

import type { FastifyBaseLogger } from 'fastify';
import type { RejectCategory } from '../moderation-terms.js';

/**
 * Where the rejection happened. A closed set on purpose: this is a metric label, and a
 * free-form string would produce a cardinality no dashboard can group by, plus typo'd
 * variants that silently do not match any filter.
 *
 * The names describe the *surface a user was on*, not the function that ran, so they stay
 * meaningful when the code underneath moves — which for the submission path is happening
 * right now (the games-store migration re-homes it onto a job model).
 */
export type ModerationSurface =
  | 'submission' // a creator filing a new game spec
  | 'refine' // spec refinement / clarifying-questions pass
  | 'creator_feedback' // a creator steering their own build
  | 'player_feedback' // written feedback on someone else's published game
  | 'world_text' // text placed into a persistent world, seen by other players
  | 'editor_draft' // declared text in a Studio content draft (names, labels)
  | 'editor_assist' // a natural-language tuning request in the editor
  | 'remix_assist' // a player's tuning request on a published game
  | 'remix_code' // a player's code-change request on a published game
  | 'remix_share' // declared text a player is about to put behind a share link
  | 'remix_save' // title / text params baked into a private Studio fork
  | 'contact' // the public contact form, no session required
  | 'proposal' // a proposed change to somebody else's game: title, description, review replies
  | 'mock_prompt'; // the dev-only mock generator route

/** The stable message every rejection logs. The alert's log filter matches on this. */
export const MODERATION_REJECTED_MSG = 'moderation rejected';

export interface ModerationRejection {
  surface: ModerationSurface;
  /** Absent on unauthenticated surfaces (the contact form). Never an email. */
  uid?: string;
  /** Absent when a checker refused without classifying; recorded as `other`. */
  category?: RejectCategory;
}

/**
 * Record one rejection. Severity is `warn`, not `error`: a working deny-list rejecting
 * something is the system succeeding, and putting it at `error` would train the operator
 * to ignore errors — the exact habit that made the first alert catalog worthless.
 */
export function logModerationRejection(log: FastifyBaseLogger, rejection: ModerationRejection): void {
  log.warn(
    {
      moderation: {
        surface: rejection.surface,
        // Recorded rather than omitted: a filter grouping by category needs every entry to
        // carry one, and an absent field silently drops the row out of the breakdown.
        category: rejection.category ?? 'other',
        uid: rejection.uid ?? 'anonymous',
      },
    },
    MODERATION_REJECTED_MSG,
  );
}
