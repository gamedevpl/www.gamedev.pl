import { useEffect } from 'react';
import { platform } from './platform/index.js';
import type { OrientationLock } from './platform/types.js';
import type { DesiredOrientation } from './useOrientationMismatch.js';

export function orientationLockTarget(desired: DesiredOrientation): OrientationLock | null {
  return desired === 'landscape' || desired === 'portrait' ? desired : null;
}

export function useOrientationLock(desired: DesiredOrientation, active: boolean): void {
  const target = orientationLockTarget(desired);

  useEffect(() => {
    if (!active || !target || !platform.orientation.canLock()) return;

    let cancelled = false;
    let locked = false;

    const acquire = () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      void platform.orientation.lock(target).then((ok) => {
        if (!ok) return;
        if (cancelled) {
          platform.orientation.unlock();
          return;
        }
        locked = true;
      });
    };

    const onVisibility = () => {
      // Android drops orientation locks when backgrounded.
      if (document.visibilityState === 'visible') acquire();
    };

    acquire();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (locked) platform.orientation.unlock();
    };
  }, [active, target]);
}
