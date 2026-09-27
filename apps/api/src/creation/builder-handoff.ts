import type { Store } from '../platform/store.js';
import type { createResumeBuild } from './resume-build.js';
import type { BuilderHandoffAckInput, BuilderHandoffOutcome } from './builder-handoff-ack.js';

export async function acknowledgeHandoff(
  input: BuilderHandoffAckInput,
  deps: {
    store?: Store;
    resumeBuild: ReturnType<typeof createResumeBuild>;
    invalidateStatusCache: (jobId: number) => void;
  },
): Promise<BuilderHandoffOutcome> {
  const { store, resumeBuild, invalidateStatusCache } = deps;
  if (!store) return { started: false, reason: 'not_configured' };
  const current = await store.getSubmission(input.jobId);
  if (!current?.builderHandoff) return { started: false, reason: 'handoff_not_pending' };
  const acknowledged = await store.acknowledgeBuilderHandoff(input.jobId, input.acknowledgedAt, input.roundGeneration);
  if (!acknowledged) return { started: false, reason: 'handoff_already_acknowledged' };
  try {
    await input.finalize?.();
  } catch (err) {
    if (err && typeof err === 'object' && 'statusCode' in err && err.statusCode === 401) throw err;
    input.log.error({ err, jobId: input.jobId }, 'handoff closing writes failed');
  }
  const outcome = await resumeBuild({
    jobId: input.jobId,
    feedback: current.spec ?? `Continue building "${current.title ?? 'this game'}" for gamedev.pl.`,
    locale: current.locale ?? 'en',
    log: input.log,
    builder: acknowledged.to,
    preserveRoundBudget: true,
    transition: {
      by: 'creator',
      reason: acknowledged.to === 'self' ? 'platform_builder_handoff' : 'self_builder_handoff',
    },
  });
  if (outcome.started) await store.clearBuilderHandoff(input.jobId);
  invalidateStatusCache(input.jobId);
  return outcome;
}
