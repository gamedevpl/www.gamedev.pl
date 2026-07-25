import { useEffect } from 'react';

type WakeLockSentinel = { release: () => Promise<void> };
type WakeLockNavigator = Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinel> } };

/**
 * Holds a screen wake lock while `active`, so a phone doesn't dim and sleep mid-game.
 * Best-effort: browsers without the Wake Lock API simply carry on.
 *
 * Re-acquires on visibilitychange because the browser drops the lock whenever the
 * page is hidden and never restores it — so without this, one trip to another app
 * (or a lock/unlock) silently disables it for the rest of the session.
 */
export function useScreenWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const wakeLock = (navigator as WakeLockNavigator).wakeLock;
    if (!wakeLock) return;

    let sentinel: WakeLockSentinel | null = null;
    let released = false;

    const acquire = () => {
      // Requesting while hidden always rejects; visibilitychange brings us back.
      if (released || sentinel || document.visibilityState !== 'visible') return;
      void wakeLock
        .request('screen')
        .then((lock) => {
          // The effect may have been torn down while the request was in flight.
          if (released) return void lock.release().catch(() => undefined);
          sentinel = lock;
        })
        .catch(() => undefined);
    };

    const onVisibility = () => {
      // A dropped lock leaves a stale sentinel behind; clear it so acquire() retries.
      if (document.visibilityState === 'visible') {
        sentinel = null;
        acquire();
      }
    };

    acquire();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      released = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void sentinel?.release().catch(() => undefined);
    };
  }, [active]);
}
