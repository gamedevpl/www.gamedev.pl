export const HEARTBEAT_MS = 12_000;
export const MIN_BEAT_MS = 5_000;
export const HELLO_INTERVAL_MS = 3_000;

export function createPresenceCadence(run: () => void) {
  let nextAt = -Infinity;
  let timer: number | null = null;
  return {
    allow(now: number): boolean {
      const wait = nextAt - now;
      if (wait > 0) {
        timer ??= window.setTimeout(() => {
          timer = null;
          run();
        }, wait);
        return false;
      }
      nextAt = now + HELLO_INTERVAL_MS;
      return true;
    },
    failed(now: number) {
      nextAt = now + 6_000;
    },
    stop() {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    },
  };
}
