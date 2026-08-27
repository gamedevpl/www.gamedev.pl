/**
 * A game's thumbs up/down (docs/improvement-loop-plan.md, signal source #2).
 *
 * Keyed by uid so a repeat vote is a revision, not a second ballot — the plan calls
 * this "low-risk but gameable"; dedupe by uid closes the cheap version of gaming it
 * (spamming one account), not the expensive one (many accounts), which nothing short
 * of identity verification closes and which this feature does not attempt.
 */
export interface GameVoteCounts {
  up: number;
  down: number;
}

/**
 * Free-text feedback from someone who played the game (docs/improvement-loop-plan.md,
 * signal source #1).
 *
 * Keyed by **slug**, not by the submission that built the game — `games/{slug}/playerFeedback/{id}`,
 * matching `games/{slug}/votes/{uid}`. The plan originally put this under
 * `submissions/{jobId}/playerFeedback/{id}` on the theory that a takedown removes it
 * with the submission; that repeats the exact mistake telemetry and votes both made and
 * corrected, since most published games (the ones with real play, i.e. real feedback) have
 * no submission document at all. Corrected here in the same change, like the votes move.
 *
 * Only accepted (post-moderation) text is ever written — a rejected submission is never
 * persisted in any form, so there is nothing here to review or reverse. No `expiresAt`:
 * unlike raw play/visit events, this is moderated, low-volume, uid-attributed content
 * meant to be read repeatedly (feedback-theme extraction, IL-2), so it follows the votes
 * precedent rather than the telemetry 90-day TTL.
 */
export interface PlayerFeedbackRecord {
  id: string;
  uid: string;
  text: string;
  createdAt: string;
}
