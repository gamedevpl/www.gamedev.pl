import type { SubmissionRecord, User } from '../platform/store.js';

/**
 * Creator-side aggregates: do creators come back, and what does a build cost us?
 *
 * These are the two numbers that gtm-plan.md (in the private www.gamedev.pl-ops repo) gates Stage 0 on, and neither was
 * answerable — the visit stream is anonymous by design, so it can see someone reach the
 * sign-in wall but never that the same person returned a week later. This reads the
 * signed-in side, where identity legitimately exists because creators have accounts.
 *
 * Aggregates only, as everywhere else: no uid, name, or title is returned.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CreatorMetrics {
  /** Submissions that reached a published game in the window. */
  published: number;
  /**
   * Creators whose D7 window has fully elapsed, i.e. who could have returned by now.
   *
   * The denominator for `returnedWithin7Days`. Someone who published this morning has
   * not failed to return — they simply have not had the chance, and counting them would
   * drag the rate toward zero every time a new game ships.
   */
  eligibleForReturn: number;
  /** Of those, how many were active on a later day inside the 7 that followed. */
  returnedWithin7Days: number;
  /** The Stage 0 gate: share of eligible creators who came back. Null when nobody is. */
  d7ReturnRate: number | null;
  /** Median wall-clock minutes from submission to published game. */
  medianBuildMinutes: number | null;
  /** The slow tail — what a creator waiting on a bad build actually experiences. */
  p90BuildMinutes: number | null;
  /** Distinct creators who published in the window. */
  creators: number;
  /** Published games per creator — repeat creation, the cheapest loyalty signal. */
  gamesPerCreator: number | null;
}

function quantile(sorted: number[], fraction: number): number | null {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
}

/**
 * Did this creator come back in the seven days after their game published?
 *
 * The publish day itself does not count. A creator is almost always present when their
 * own build finishes — that is the same session, not a return — and counting it would
 * report a D7 rate near 100% that means nothing.
 */
export function returnedAfterPublish(activeDays: string[] | undefined, publishedAt: string): boolean {
  const published = Date.parse(publishedAt);
  if (!Number.isFinite(published)) return false;
  const publishDay = new Date(published).toISOString().slice(0, 10);

  return (activeDays ?? []).some((day) => {
    const seen = Date.parse(`${day}T00:00:00.000Z`);
    if (!Number.isFinite(seen)) return false;
    if (day <= publishDay) return false;
    return seen - Date.parse(`${publishDay}T00:00:00.000Z`) <= 7 * DAY_MS;
  });
}

export function summarizeCreatorMetrics(
  submissions: SubmissionRecord[],
  usersByUid: Map<string, User>,
  now: number = Date.now(),
): CreatorMetrics {
  const published = submissions.filter((submission) => submission.publishedAt);

  const buildMinutes = published
    .map((submission) => {
      const start = Date.parse(submission.createdAt);
      const end = Date.parse(submission.publishedAt ?? '');
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
      return Math.round((end - start) / 60_000);
    })
    .filter((minutes): minutes is number => minutes !== null)
    .sort((a, b) => a - b);

  // One row per creator, not per game: a creator who published three games is one
  // person who did or did not come back, and counting them three times would let the
  // most prolific creator dominate the rate.
  const earliestPublishByOwner = new Map<string, string>();
  published.forEach((submission) => {
    const at = submission.publishedAt;
    if (!at) return;
    const current = earliestPublishByOwner.get(submission.ownerUid);
    if (current === undefined || at < current) earliestPublishByOwner.set(submission.ownerUid, at);
  });

  let eligibleForReturn = 0;
  let returnedWithin7Days = 0;
  earliestPublishByOwner.forEach((publishedAt, uid) => {
    const elapsed = now - Date.parse(publishedAt);
    if (!Number.isFinite(elapsed) || elapsed < 7 * DAY_MS) return;
    eligibleForReturn += 1;
    if (returnedAfterPublish(usersByUid.get(uid)?.activeDays, publishedAt)) returnedWithin7Days += 1;
  });

  const creators = earliestPublishByOwner.size;

  return {
    published: published.length,
    eligibleForReturn,
    returnedWithin7Days,
    d7ReturnRate: eligibleForReturn === 0 ? null : returnedWithin7Days / eligibleForReturn,
    medianBuildMinutes: quantile(buildMinutes, 0.5),
    p90BuildMinutes: quantile(buildMinutes, 0.9),
    creators,
    gamesPerCreator: creators === 0 ? null : published.length / creators,
  };
}
