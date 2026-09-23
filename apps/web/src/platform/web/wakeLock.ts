import type { WakeLockHandle, WakeLockPlatform } from '../types.js';

type WakeLockNavigator = Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLockHandle> } };

function supported(): boolean {
  return typeof navigator !== 'undefined' && Boolean((navigator as WakeLockNavigator).wakeLock);
}

async function request(): Promise<WakeLockHandle | null> {
  const wakeLock = (navigator as WakeLockNavigator).wakeLock;
  if (!wakeLock) return null;
  try {
    return await wakeLock.request('screen');
  } catch {
    return null;
  }
}

export const webWakeLock: WakeLockPlatform = { supported, request };
