// Sliding-window frame limiter, shared by the party relay and the zone host.
// Lives beside the cap it enforces; both apps had identical copies.
// A factory, not a class: this package ships functions only.

import { MAX_SOCKET_FRAMES_PER_SECOND } from './socket-limits.js';

export interface FrameLimiter {
  // True while within budget; false means disconnect the sender.
  allow(now: number): boolean;
}

export function createFrameLimiter(maxPerSecond: number = MAX_SOCKET_FRAMES_PER_SECOND): FrameLimiter {
  let timestamps: number[] = [];
  return {
    allow(now: number): boolean {
      timestamps = timestamps.filter((at) => now - at < 1000);
      if (timestamps.length >= maxPerSecond) return false;
      timestamps.push(now);
      return true;
    },
  };
}
