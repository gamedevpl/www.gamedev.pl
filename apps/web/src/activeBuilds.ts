import { useEffect, useState } from 'react';
import { useAuth } from './AuthContext.js';
import { fetchActiveBuildCount } from './submissionApi.js';

/**
 * How many of this creator's builds are actually in flight right now.
 *
 * The header badge used to count locally saved specs, which is a different number:
 * `mySpecs` is browser storage that nothing prunes when a build finishes, so it grew
 * into a lifetime tally shown as if it were "in progress" — and read zero on a second
 * device with builds running. Ownership is server-side, so ask the server.
 *
 * `/api/submissions/mine/active-count` exists for exactly this poll: the shelf route it
 * used to call reads a creator's entire job history, which at one request a minute per
 * open tab was the single largest source of Firestore reads on the site.
 */
const REFRESH_MS = 180_000;

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
        const active = await fetchActiveBuildCount();
        if (cancelled) return;
        setCount(active);
      } catch {
        // Signed out mid-poll, or the API is unreachable. A badge is not worth an
        // error state — leave the last known count and try again on the next tick.
      }
    }

    void load();
    // A background tab cannot show the badge, so it has no reason to keep asking.
    const tick = () => {
      if (!document.hidden) void load();
    };
    // Catch up on the way back rather than waiting out the rest of the interval.
    const onVisible = () => tick();
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(tick, REFRESH_MS);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, [user, refreshKey, enabled]);

  return count;
}
