import type { AgentBackend, SeedFiles } from '../agent-surface/agent-backend.js';
import { mintAgentToken, mintManagedMcpOpener } from '../platform/agent-token.js';
import type { ManagedAvailabilityGate, ManagedUnavailableReason } from '../agent-surface/managed-availability.js';
import type { Store, SubmissionRecord } from '../platform/store.js';
import type { BuilderKind } from './builder.js';
import { canTransition, type JobTransition } from './job-state.js';

// Why a round did not start, when one did not.

// no_capacity is the one failure unrelated to this job.

// The agent account is out of requests; every job is stuck.

// Told apart so the creator hears "not now" rather than a guess.
export type ResumeFailureReason = 'not_configured' | 'no_capacity' | 'dispatch_failed' | 'platform_unavailable';

export type ResumeOutcome =
  { started: true } | { started: false; reason: ResumeFailureReason; unavailableReason?: ManagedUnavailableReason };

// Reads a dispatch failure for the distinction a caller can act on.

// GitHub answers an exhausted allowance with 412 and a message saying so.

// The message is matched too; a 412 has meant nothing else.
export function classifyResumeFailure(error: unknown): ResumeFailureReason {
  const status = (error as { status?: unknown } | null)?.status;
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (status === 412 || /premium quota|insufficient .*quota/i.test(message)) return 'no_capacity';
  return 'dispatch_failed';
}

export interface ResumeBuildDeps {
  store: Store | undefined;
  submissionTokenSecret: string | undefined;
  managedAvailabilityGate: ManagedAvailabilityGate | null | undefined;
  now: () => number;
  notifyAppBaseUrl: string;
  backendFor: (builder: BuilderKind | undefined) => Promise<AgentBackend | undefined>;
  backendByStoredName: (name: string | undefined) => AgentBackend | undefined;
  builderOf: (record: SubmissionRecord | null | undefined) => BuilderKind;
  recordSessionCost: (
    jobId: number,
    ref: string,
    backend: AgentBackend,
    log: { error: (context: object, message: string) => void },
  ) => Promise<void>;
  releaseWorkspace: (
    jobId: number,
    workspace: string,
    log: { error: (context: object, message: string) => void },
    backendName?: string,
  ) => Promise<void>;
  seedFromLatestDelivery: (record: SubmissionRecord) => Promise<SeedFiles | undefined>;
}

// Starts the next round on an existing job, keeping its thread.
export function createResumeBuild(deps: ResumeBuildDeps) {
  const {
    store,
    submissionTokenSecret,
    managedAvailabilityGate,
    now,
    notifyAppBaseUrl,
    backendFor,
    backendByStoredName,
    builderOf,
    recordSessionCost,
    releaseWorkspace,
    seedFromLatestDelivery,
  } = deps;

  // Starts another round on an existing job.

  // The backend decides what another round costs; the adapter arranges it.

  // Returns what happened rather than only logging it.

  // A round that never started looks like one that is thinking.
  async function resumeBuild(input: {
    jobId: number;
    feedback: string;
    locale: string;
    log: { error: (context: object, message: string) => void };
    // Set when this round exists only because the last never uploaded.
    undelivered?: boolean;
    // The appendCreatorMessage write for `feedback` failed; buildPrompt must inline it.
    feedbackQueueFailed?: boolean;
    // Who asked for this round, when it was not the creator.

    // A history reading derived_from_github for a person's retry would lie.
    transition?: { by: JobTransition['by']; reason: string };
    // Builder for the new round. Ignored on undelivered nudges.
    builder?: BuilderKind;
    // Handoffs keep the per-job delivery budget across builder changes.
    preserveRoundBudget?: boolean;
  }): Promise<ResumeOutcome> {
    if (!submissionTokenSecret || !store) return { started: false, reason: 'not_configured' };
    const record = await store.getSubmission(input.jobId);
    const previous = record?.dispatch;
    const previousBuilder = builderOf(record);
    const builder = input.undelivered ? previousBuilder : (input.builder ?? record?.defaultBuilder ?? previousBuilder);
    const selected = await backendFor(builder);
    if (!selected) return { started: false, reason: 'not_configured' };
    // Skip for undelivered continuations — not a fresh dispatch.
    if (builder === 'platform' && !input.undelivered && managedAvailabilityGate && record?.ownerUid) {
      const dateStr = new Date(now()).toISOString().slice(0, 10);
      const availability = await managedAvailabilityGate.checkAndSpend(record.ownerUid, dateStr);
      if (!availability.available) {
        return { started: false, reason: 'platform_unavailable', unavailableReason: availability.reason };
      }
    }
    let builderActivated = false;
    let dispatchSucceeded = false;
    try {
      // A new round closes the previous token, so bump before minting.

      // An undelivered nudge is the same round: its token must keep working.

      // A legacy job still needs the field written for the reminted key.
      const roundGeneration = input.undelivered
        ? ((await store.ensureRoundGeneration(input.jobId)) ?? 1)
        : ((await store.bumpRoundGeneration(input.jobId)) ?? (record?.roundGeneration ?? 0) + 1);
      const previousBackend = backendByStoredName(previous?.backend) ?? (await backendFor(previousBuilder));
      if (previous?.refs.length && (!input.undelivered || previousBackend?.name.startsWith('managed:'))) {
        const previousRef = previous.refs[previous.refs.length - 1];
        if (previousBackend && previousRef) {
          try {
            await previousBackend.cancel(previousRef, previous?.credentialRefs?.[previousRef]);
          } catch (error) {
            input.log.error(
              { err: error, jobId: input.jobId },
              'previous agent cancel failed before a replacement round',
            );
          }
        }
      }
      const switchSeed =
        !input.undelivered && previousBuilder !== builder && record ? await seedFromLatestDelivery(record) : undefined;
      const preservedSeed = !input.undelivered && previousBuilder !== builder && !switchSeed ? record?.seed : undefined;
      // A round bump clears the stored seed; a nudge keeps one.

      // The record above was loaded before that reset.
      const reusedSelfSeed = input.undelivered && builder === 'self' ? record?.seed : undefined;
      const brief = {
        jobId: input.jobId,
        roundGeneration,
        slug: record?.slug,
        spec: input.feedback,
        feedback: input.feedback,
        locale: input.locale,
        channelToken: mintAgentToken(input.jobId, submissionTokenSecret, {
          roundGeneration,
          now: now(),
        }),
        mcpOpenerToken: mintManagedMcpOpener(input.jobId, submissionTokenSecret, {
          roundGeneration,
          now: now(),
        }),
        apiBaseUrl: notifyAppBaseUrl,
        ...(input.undelivered ? { undelivered: true } : {}),
        ...(input.feedbackQueueFailed ? { feedbackQueueFailed: true } : {}),
        ...(switchSeed ? { seed: switchSeed } : preservedSeed ? { seed: preservedSeed } : {}),
        ...(reusedSelfSeed ? { seed: reusedSelfSeed } : {}),
      };
      // Resume against the selected backend, never the previous one.

      // At a builder change the old ref belongs elsewhere, so start fresh.
      const sameBackend = previous?.backend === selected.name && Boolean(previous?.refs.length);
      if (!input.undelivered && builder !== previousBuilder) {
        // Expose target builder before external session can call back through MCP.
        await store.setRoundBuilder(input.jobId, builder, {
          resetRoundBudget: !input.preserveRoundBudget,
        });
        builderActivated = true;
      }
      const result = sameBackend
        ? await selected.resume(brief, {
            ref: previous!.refs[previous!.refs.length - 1],
            workspace: previous!.workspace,
          })
        : await selected.dispatch(brief);
      dispatchSucceeded = true;
      if (input.undelivered) {
        await store.clearAgentEnded(input.jobId);
      }
      await store.recordDispatch(input.jobId, {
        backend: selected.name,
        ref: result.ref,
        workspace: result.workspace,
        credentialRef: result.credentialRef,
      });
      await recordSessionCost(input.jobId, result.ref, selected, input.log);
      // The old workspace is spent once the new round has its own.

      // Deleted after dispatch succeeds: a failed start still needs that branch.

      // Never after an undelivered round; that branch is the only copy.
      if (!input.undelivered && previous?.workspace && previous.workspace !== result.workspace) {
        await releaseWorkspace(input.jobId, previous.workspace, input.log, previous.backend);
      }
      // Land on dispatched, not building; the API accepts before it starts.

      // Claiming to write code here made Studio look stuck while it booted.

      // The reconciler advances to building from a real observation.
      const latest = await store.getSubmission(input.jobId);
      const from = latest?.state;
      // No prior state: adopt directly, since the write does not gate.

      // Otherwise advance only when the walk allows it.

      // A self agent can deliver first; yanking past submitted is a hazard.
      if (!from || canTransition(from, 'dispatched')) {
        await store.recordJobTransition(input.jobId, {
          to: 'dispatched',
          at: new Date(now()).toISOString(),
          by: input.transition?.by ?? 'creator',
          reason: input.transition?.reason ?? `dispatched_to_${selected.name}`,
        });
      }
      return { started: true };
    } catch (error) {
      if (builderActivated && !dispatchSucceeded) {
        try {
          await store.setRoundBuilder(input.jobId, previousBuilder, { resetRoundBudget: false });
        } catch (rollbackError) {
          input.log.error({ err: rollbackError, jobId: input.jobId }, 'builder rollback failed');
        }
      }
      // The request is already queued; a failed resume costs the head start.
      const reason = classifyResumeFailure(error);
      input.log.error({ err: error, jobId: input.jobId, reason }, 'agent resume failed');
      return { started: false, reason };
    }
  }

  return resumeBuild;
}
