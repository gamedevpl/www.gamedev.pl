// The retry curve shared by the party room client and the zone client.
// Not the whole reconnect loop: the two differ on purpose, so timers,
// disposal and final-reason sets stay in their own files. Only the
// attempt count and delay were identical, and could have drifted.

// Attempts before a client gives up and reports 'unreachable'.
export const DEFAULT_MAX_RECONNECT_ATTEMPTS = 8;

const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 8000;

export interface ReconnectBackoff {
  // True before any failure, so the first dial reads 'connecting'.
  isFirstAttempt(): boolean;
  // Call on a successful open.
  reset(): void;
  // Delay for the next attempt, or null when the budget is spent.
  nextDelayMs(): number | null;
}

export function createReconnectBackoff(maxAttempts: number = DEFAULT_MAX_RECONNECT_ATTEMPTS): ReconnectBackoff {
  let attempts = 0;
  return {
    isFirstAttempt: () => attempts === 0,
    reset: () => {
      attempts = 0;
    },
    nextDelayMs: () => {
      attempts += 1;
      if (attempts > maxAttempts) return null;
      return Math.min(BASE_DELAY_MS * 2 ** (attempts - 1), MAX_DELAY_MS);
    },
  };
}
