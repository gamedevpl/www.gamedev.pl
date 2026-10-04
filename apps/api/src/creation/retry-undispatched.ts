import type { Store, SubmissionRecord } from '../platform/store.js';
import { reconstructDispatchSpec } from './dispatch-build.js';
import type { createDispatcher } from './dispatch-build.js';

export async function retryUndispatchedBuild(input: {
  store: Store;
  record: SubmissionRecord;
  dispatchBuild: ReturnType<typeof createDispatcher>['dispatchBuild'];
  now: () => number;
  log: { error: (context: object, message: string) => void };
}): Promise<'started' | 'no_spec' | 'changed' | 'dispatch_failed'> {
  const { store, record, dispatchBuild, now, log } = input;
  const spec = record.dispatchBrief?.trim() || reconstructDispatchSpec(record);
  if (!spec || !record.slug) return 'no_spec';
  const claimed = await store.recordJobTransition(
    record.jobId,
    {
      to: 'queued',
      at: new Date(now()).toISOString(),
      by: 'operator',
      reason: 'operator_retry_dispatch',
    },
    { state: 'failed', roundGeneration: record.roundGeneration ?? 1, undispatched: true },
  );
  if (!claimed) return 'changed';
  const started = await dispatchBuild({
    jobId: record.jobId,
    slug: record.slug,
    spec,
    locale: record.locale ?? 'en',
    builder: record.builder ?? record.defaultBuilder ?? 'platform',
    log,
  });
  return started ? 'started' : 'dispatch_failed';
}
