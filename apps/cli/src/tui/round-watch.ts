import { getStatus, isTerminalStatus, type RoundStatus } from '../turn.js';
import { CliError } from '../exit-codes.js';
import { describeError } from '../errors.js';
import {
  formatRoundLive,
  formatStatusEvent,
  shouldAnnounceStatus,
  statusFingerprint,
  statusWatchDelayMs,
} from '../status-watch.js';
import type { ApiClient } from '../api.js';

export type RoundWatch = {
  poke: () => void;
  stop: () => void;
  run: Promise<void>;
};

export function createRoundWatch(input: {
  getToken: () => string | null;
  api: ApiClient;
  setLive: (lines: string[]) => void;
  announce: (text: string) => void;
  onSlug?: (slug: string) => void;
  sleep?: (ms: number) => Promise<void>;
}): RoundWatch {
  let stopped = false;
  let wake: (() => void) | null = null;
  const sleep = input.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));

  function poke(): void {
    wake?.();
  }

  const run = (async () => {
    let lastKey = '';
    let lastStatus: RoundStatus | undefined;
    while (!stopped) {
      const token = input.getToken();
      if (token) {
        try {
          const status = await getStatus(input.api, token);
          lastStatus = status;
          if (status.slug) input.onSlug?.(status.slug);
          input.setLive(formatRoundLive(status, input.api.origin));
          const key = statusFingerprint(status);
          if (shouldAnnounceStatus(status, lastKey, key)) input.announce(formatStatusEvent(status));
          lastKey = key;
          if (isTerminalStatus(status.status)) {
            stopped = true;
            break;
          }
        } catch (error) {
          if (!(error instanceof CliError && error.message === 'not found')) {
            input.setLive([describeError(error).message]);
          }
        }
      }
      if (stopped) break;
      const delay = lastStatus ? statusWatchDelayMs(lastStatus) : 3000;
      await Promise.race([
        sleep(delay),
        new Promise<void>((resolve) => {
          wake = resolve;
        }),
      ]);
      wake = null;
    }
  })();

  return {
    poke,
    stop() {
      stopped = true;
      poke();
    },
    run,
  };
}
