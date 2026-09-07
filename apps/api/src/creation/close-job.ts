import type { AgentBackend } from '../agent-surface/agent-backend.js';
import type { Store, SubmissionRecord, TransitionGuard } from '../platform/store.js';
import type { BuilderKind } from './builder.js';
import type { JobState, TransitionActor } from './job-state.js';

type Log = { error: (context: object, message: string) => void };

export interface CloseJobDeps {
  store: Store;
  now: () => number;
  backendFor: (builder: BuilderKind | undefined) => Promise<AgentBackend | undefined>;
  builderOf: (record: SubmissionRecord | null | undefined) => BuilderKind;
  releaseWorkspace: (jobId: number, workspace: string, log: Log, backendName?: string) => Promise<void>;
  invalidateStatusCache?: (jobId: number) => void;
}

export interface CloseJobInput {
  record: SubmissionRecord;
  to: Extract<JobState, 'canceled' | 'abandoned'>;
  by: TransitionActor;
  reason: string;
  log: Log;
  // Sweep only: a claim, refused if the round moved since the read.
  guard?: TransitionGuard;
}

// One exit for creator, operator and sweep: claim, cancel, release, mark.
export async function closeJob(
  deps: CloseJobDeps,
  input: CloseJobInput,
): Promise<{ closed: boolean; stopEnforced: boolean }> {
  const { record, log } = input;
  const jobId = record.jobId;
  const at = new Date(deps.now()).toISOString();

  // Transition first: with a guard it is the claim everything rests on.
  const transition = { to: input.to, at, by: input.by, reason: input.reason };
  const recorded = await deps.store.recordJobTransition(jobId, transition, input.guard);
  if (input.guard && !recorded) return { closed: false, stopEnforced: false };

  let stopEnforced = false;
  const ref = record.dispatch?.refs.at(-1);
  const cancelBackend = await deps.backendFor(deps.builderOf(record));
  if (cancelBackend && ref) {
    try {
      stopEnforced = (await cancelBackend.cancel(ref, record.dispatch?.credentialRefs?.[ref])).enforced;
    } catch (cancelError) {
      log.error({ err: cancelError, jobId, reason: input.reason }, 'agent cancel failed; job closes regardless');
    }
  }

  // Re-read: the cancel may have moved workspace fields under us.
  const after = (await deps.store.getSubmission(jobId)) ?? record;
  if (after.dispatch?.workspace) {
    await deps.releaseWorkspace(jobId, after.dispatch.workspace, log, after.dispatch.backend);
  }
  // Seed branch outlives the dispatch; forgotten so cleanup never retries it.
  if (after.dispatch?.seedWorkspace) {
    await deps.releaseWorkspace(jobId, after.dispatch.seedWorkspace, log, after.dispatch.backend);
    await deps.store.clearDispatchSeedWorkspace(jobId);
  }

  await deps.store.setSubmissionAbandoned(jobId, at);
  deps.invalidateStatusCache?.(jobId);
  return { closed: true, stopEnforced };
}
