import type { OrientationLock, OrientationPlatform } from '../types.js';

type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: OrientationLock) => Promise<void>;
  unlock?: () => void;
};

function getOrientation(): LockableOrientation | null {
  if (typeof screen === 'undefined' || !screen.orientation) return null;
  return screen.orientation as LockableOrientation;
}

function canLock(): boolean {
  const orientation = getOrientation();
  return Boolean(orientation && typeof orientation.lock === 'function');
}

async function lock(desired: OrientationLock): Promise<boolean> {
  const orientation = getOrientation();
  if (!orientation || typeof orientation.lock !== 'function') return false;
  try {
    await orientation.lock(desired);
    return true;
  } catch {
    return false;
  }
}

function unlock(): void {
  const orientation = getOrientation();
  if (!orientation || typeof orientation.unlock !== 'function') return;
  try {
    orientation.unlock();
  } catch {
    // Ignore browsers without an active lock or unlock support.
  }
}

export const webOrientation: OrientationPlatform = { canLock, lock, unlock };
