// Transactional creator events (docs/notifications-plan.md). Deliberately minimal —
// queued/in_review are not notified. New types must pass the "would the user thank
// us?" test before being added.
export type NotificationType =
  | 'submission.building'
  | 'submission.published'
  | 'submission.needs_changes'
  /**
   * The engine moved and this creator's *published* game no longer passes the check it
   * was accepted under (the health re-gate). Deliberately a nudge, not a takedown
   * notice: the game keeps serving — its baked bundle froze the engine it shipped with —
   * and the ask is an improvement round, which rebuilds it against the current engine.
   */
  | 'submission.game_health'
  /**
   * Weekly summary of how a creator's published games are doing
   * (docs/improvement-loop-plan.md IL-2). Unlike the three above it is not tied to one
   * submission, which is why its id is keyed by week rather than by issue number.
   */
  | 'creator.digest'
  /**
   * A game someone follows published a new version. The one notification the follow
   * button exists to send, and the reason it is a follow rather than a bookmark:
   * "the game you played got better" is worth an interruption, and nothing else about
   * a game someone else owns is.
   */
  | 'game.new_version'
  /**
   * The operator's own queue, delivered instead of waited on
   * (`operator-alerts.ts`). These do not go to the creator: they go to every uid in
   * ADMIN_UIDS, because the thing being reported — a build waiting on the publish
   * decision, one that failed, one that has stopped moving — is nobody else's to act
   * on, and the creator already has their own status page for their own game.
   */
  | 'operator.review_ready'
  | 'operator.build_failed'
  | 'operator.build_stalled'
  | 'operator.feedback_undelivered'
  /** A health re-gate came back red: a live game no longer passes on the current engine. */
  | 'operator.game_unhealthy'
  /**
   * Seeded builds are generating drafts nobody can place. Not about one job — those
   * jobs are fine, they just built unseeded — but about a platform fault that costs a
   * paid model call per submission and shows no symptom anywhere a person looks.
   */
  /**
   * Someone asked to join the closed beta. Not a job alert — there is no issue number —
   * but it is still an operator action: approve (or not) via the waitlist tooling.
   */
  | 'operator.waitlist_joined'
  // Operator started a review sweep; notify reviewers.
  | 'operator.review_sweep'
  /**
   * A proposal is waiting on this creator — somebody proposed a change to one of their
   * games and it passed our gate.
   *
   * Deliberately its own type rather than folded into the submission family: it is not
   * about a job (a proposal has none, by design), and the submission copy renders
   * "«your game» happened", where this is "somebody wants to change «your game»" — a
   * different sentence with a different actor.
   */
  | 'proposal.awaiting_review'
  /** A proposal this person sent was decided — accepted, declined, or bounced back. */
  | 'proposal.decided'
  /**
   * A proposal this person sent is live in the game. The watcher relationship starts
   * here: merged contributors get digest visibility, never approval rights.
   */
  | 'proposal.merged';

/** The proposal family, split out for the same reason the submission one is. */
export type ProposalNotificationType = Extract<NotificationType, `proposal.${string}`>;

/**
 * The types that are about one submission, and so can render "«game title» happened".
 *
 * Split out because the digest cannot: it spans every game a creator owns and carries
 * counts instead of a title. Keeping it a derived type rather than a hand-written list
 * means a fourth submission event joins the email and push copy automatically, while a
 * second non-submission event has to be thought about.
 */
export type SubmissionNotificationType = Extract<NotificationType, `submission.${string}`>;

/** The operator-facing half, derived the same way and for the same reason. */
export type OperatorNotificationType = Extract<NotificationType, `operator.${string}`>;

export interface StoredNotification {
  /** Deterministic id (e.g. `sub-142-published`) so emission is idempotent. */
  id: string;
  type: NotificationType;
  createdAt: string;
  readAt: string | null;
  /** Set once a notification email has been sent, so retries don't re-send. */
  emailedAt: string | null;
  /**
   * i18n key + params rather than rendered text, so a language switch re-renders
   * old notifications correctly. The client calls t(titleKey, params).
   */
  titleKey: string;
  bodyKey: string;
  params: Record<string, string>;
  /** In-app destination, e.g. `/status/<token>` or `/play/<slug>`. */
  link: string;
}

// A browser Web Push subscription (docs/notifications-plan.md M2), stored verbatim
// as the client serialized it. Keyed by a hash of the endpoint so re-subscribing
// the same browser overwrites rather than duplicates.
export interface PushSubscriptionRecord {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  createdAt: string;
}
