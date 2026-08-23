import type { AvatarMode } from '../../creation/creator-profile.js';

export interface User {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
  createdAt: string;
  lastLoginAt: string;
  tier: 'standard' | 'trusted' | 'blocked';
  /** Preferred locale for outbound email (defaults to 'en' when unset). */
  locale?: string;
  /** Global one-click email kill switch — set by the unsubscribe endpoint. */
  emailUnsubscribedAt?: string | null;
  /**
   * Opted out of the weekly creator digest specifically, across every channel.
   *
   * Separate from `emailUnsubscribedAt` because the two are different requests. The digest
   * is the only notification we send that nobody asked for on the day it arrives; the rest
   * are transactional ("your game is published"), and someone who wants to stop the weekly
   * summary almost certainly still wants those. One switch for both would make "stop
   * emailing me every Monday" cost a creator the message they actually care about — which
   * is how a notification system trains people to turn everything off.
   */
  digestOptOutAt?: string | null;
  /**
   * Recent days (`yyyy-mm-dd`) on which this account made an authenticated request,
   * newest first and capped at `ACTIVE_DAYS_KEPT`.
   *
   * A list rather than a `lastSeenAt` instant because the question is "did this creator
   * come back within 7 days of publishing", and a single latest-seen timestamp cannot
   * answer it: someone who returned on day 2 and again on day 30 looks identical to
   * someone who only ever returned on day 30. Days rather than timestamps keeps it to
   * one write per account per day instead of one per request.
   */
  activeDays?: string[];
  /**
   * Unique public handle (`/:handle`). Required to publish a game; never the
   * Google/Apple account name. Absent until the creator claims one.
   */
  handle?: string;
  /** Human byline on catalog cards; may differ from the handle. */
  profileName?: string;
  /** Short plain-text bio on the public profile page. */
  bio?: string;
  /** Whether the public avatar is the Google picture or a lettermark. */
  avatarMode?: AvatarMode;
  /** When the creator first claimed a handle. */
  profileCreatedAt?: string;
  /** When the handle last changed (rename cooldown). */
  handleChangedAt?: string;
  /** When the person requested account deletion. Present only during the recovery window. */
  deletionRequestedAt?: string;
  /** Earliest instant at which the cleanup sweep may permanently erase the account. */
  deletionScheduledFor?: string;
}

/** Reservation row for a lowercase handle → owning uid. */
export interface HandleRecord {
  uid: string;
  claimedAt: string;
  /** Set while the previous owner still holds the rename cooldown. */
  releasedAt?: string;
  previousUid?: string;
}

/** Non-personal owner used after an account is erased. */
export const DELETED_ACCOUNT_UID = 'platform:deleted-account';

export interface AccountIdentityDeletionResult {
  publishedSlugs: string[];
  unpublishedSlugs: string[];
}

export type ClaimHandleResult =
  | { ok: true; user: User }
  | { ok: false; reason: 'invalid' | 'reserved' | 'taken' | 'unchanged' | 'cooldown' | 'not_found' };

/** How much return history a user document carries. Two weeks covers a D7 question. */
export const ACTIVE_DAYS_KEPT = 14;

/**
 * Adds `dateStr` to a user's activity list, newest first, or returns null when it is
 * already the most recent entry.
 *
 * Returning null is what makes this cheap: the caller skips the write entirely, so a
 * creator refreshing all afternoon costs one write, not hundreds.
 */
export function withActiveDay(existing: string[] | undefined, dateStr: string): string[] | null {
  const days = existing ?? [];
  if (days[0] === dateStr) return null;
  return [dateStr, ...days.filter((day) => day !== dateStr)].slice(0, ACTIVE_DAYS_KEPT);
}
