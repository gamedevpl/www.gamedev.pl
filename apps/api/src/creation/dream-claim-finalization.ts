import type { Store } from '../platform/store.js';
import type { DreamJobDeps, DreamRunInput } from './dream-job.js';

export async function closeDreamClaim(
  store: Pick<Store, 'finishDreamRun'>,
  input: DreamRunInput,
  claimedAt: string,
  now: () => number,
  log: DreamJobDeps['log'],
  superseded: boolean,
): Promise<void> {
  await store
    .finishDreamRun(
      input.record.jobId,
      { version: input.version, claimedAt, superseded },
      new Date(now()).toISOString(),
    )
    .catch((error: unknown) => log.warn({ err: error, jobId: input.record.jobId }, 'dream claim not closed'));
}
