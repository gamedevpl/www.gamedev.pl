import type { Store, SubmissionRecord } from '../platform/store.js';
import type { JobTransition } from './job-state.js';
import { sessionCrashTransition } from './session-crash.js';

export async function recordSessionCrash(
  store: Pick<Store, 'getSubmission' | 'recordJobTransition'>,
  evaluated: SubmissionRecord,
  dispatchRef: string,
  now: () => number,
): Promise<JobTransition | null> {
  const fresh = await store.getSubmission(evaluated.jobId);
  if (!fresh) return null;
  const transition = sessionCrashTransition(fresh.state, now);
  if (!transition) return null;
  const recorded = await store.recordJobTransition(evaluated.jobId, transition, {
    state: fresh.state ?? 'queued',
    roundGeneration: evaluated.roundGeneration ?? 1,
    dispatchRef,
  });
  return recorded ? transition : null;
}
