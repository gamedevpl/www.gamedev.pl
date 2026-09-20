import type { TiltPermission, TiltPlatform, TiltReading } from '../types.js';

type OrientationConstructor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<PermissionState | 'granted' | 'denied'>;
};

function ctor(): OrientationConstructor | null {
  if (typeof window === 'undefined') return null;
  const found = (window as unknown as { DeviceOrientationEvent?: OrientationConstructor }).DeviceOrientationEvent;
  return found ?? null;
}

function supported(): boolean {
  return Boolean(ctor());
}

function needsPermission(): boolean {
  return typeof ctor()?.requestPermission === 'function';
}

async function requestPermission(): Promise<TiltPermission> {
  const found = ctor();
  if (!found || typeof found.requestPermission !== 'function') return 'unsupported';
  try {
    const result = await found.requestPermission();
    return result === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

function subscribe(onReading: (reading: TiltReading) => void): () => void {
  const handler = (event: DeviceOrientationEvent) => onReading({ beta: event.beta, gamma: event.gamma });
  window.addEventListener('deviceorientation', handler);
  return () => window.removeEventListener('deviceorientation', handler);
}

export const webTilt: TiltPlatform = { supported, needsPermission, requestPermission, subscribe };
