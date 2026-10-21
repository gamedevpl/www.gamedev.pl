// Sweep open rounds: one scan per window, due ones re-read.

import { isRoundOpen } from '../platform/sweep-scope.js';
import type { Store, SubmissionRecord } from '../platform/store.js';

// A backstop for closed tabs; new rounds may wait this long.
export const OPEN_ROUNDS_WINDOW_MS = 10 * 60_000;

export interface OpenRoundsWindow {
  // Due rounds are re-read; the rest come from the last scan.
  read(isDue: (record: SubmissionRecord) => boolean): Promise<SubmissionRecord[]>;
}

export function createOpenRoundsWindow(deps: {
  store: Pick<Store, 'listOpenRounds' | 'getSubmission'>;
  now: () => number;
  windowMs?: number;
}): OpenRoundsWindow {
  const windowMs = deps.windowMs ?? OPEN_ROUNDS_WINDOW_MS;
  let scan: { expiresAt: number; records: SubmissionRecord[] } | null = null;
  return {
    async read(isDue) {
      const at = deps.now();
      if (!scan || scan.expiresAt <= at) {
        const records = await deps.store.listOpenRounds();
        scan = { expiresAt: at + windowMs, records };
        return records;
      }
      const records: SubmissionRecord[] = [];
      for (const cached of scan.records) {
        if (!isDue(cached)) {
          records.push(cached);
          continue;
        }
        // One failed read keeps the scanned copy; it retries next run.
        const fresh = await deps.store.getSubmission(cached.jobId).catch(() => cached);
        if (fresh && isRoundOpen(fresh)) records.push(fresh);
      }
      scan = { expiresAt: scan.expiresAt, records };
      return records;
    },
  };
}
