import { useEffect, useState } from 'react';
import { useAuth } from './AuthContext.js';
import { listMySubmissions, type SubmissionState } from './submissionApi.js';
import { STUDIO_LIVE_STATUSES } from './studioShelf.js';

/**
 * How many of this creator's builds are actually in flight right now.
 *
 * The header badge used to count locally saved specs, which is a different number:
 * `mySpecs` is browser storage that nothing prunes when a build finishes, so it grew
 * into a lifetime tally shown as if it were "in progress" — and read zero on a second
 * device with builds running. Ownership is server-side, so ask the server.
 *
 * One store read per poll (`/api/submissions/mine` returns stored statuses, no GitHub
 * fan-out), and slower than the home rail: the badge is a glance, not a watch.
 */
const REFRESH_MS = 60_000;

/**
 * A submission with no derived status yet counts as in flight: the list already drops
 * abandoned builds, and `lastKnownStatus` is filled by the two-minute sweep — so the
 * only records without one are the builds just submitted. Excluding them would blank
 * the badge for the first two minutes, which is exactly when a creator looks at it.
 */
function isInFlight(status: SubmissionState | null): boolean {
  return status === null || STUDIO_LIVE_STATUSES.has(status);
}

/**
 * @param refreshKey bump to re-read immediately (e.g. right after a new submission).
 * @param enabled pass false where the badge cannot be seen. A direct `/play/<slug>`
 *   link costs the game and nothing else — the header sits behind a full-viewport
 *   player there, and a badge nobody can read is not worth a request.
 */
export function useActiveBuildCount(refreshKey = 0, enabled = true): number {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setCount(0);
      return;
    }
    // Keep the last count rather than zeroing it: the badge is only hidden, not stale.
    if (!enabled) return;

    let cancelled = false;

    async function load() {
      try {
        const submissions = await listMySubmissions();
        if (cancelled) return;
        setCount(submissions.filter((submission) => isInFlight(submission.lastKnownStatus)).length);
      } catch {
        // Signed out mid-poll, or the API is unreachable. A badge is not worth an
        // error state — leave the last known count and try again on the next tick.
      }
    }

    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [user, refreshKey, enabled]);

  return count;
}
