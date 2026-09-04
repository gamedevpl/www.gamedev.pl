import type { AgentBackend, SeedFiles } from '../agent-surface/agent-backend.js';
import { mintAgentToken, mintManagedMcpOpener } from '../platform/agent-token.js';
import type { GameSeeder } from './game-seed.js';
import type { BuilderKind } from './builder.js';
import type { Store, SubmissionRecord } from '../platform/store.js';
import { buildDispatchIssueBody } from './create-game.js';
import { seedOutcomeFor } from '../platform/seed-outcome.js';
import { isActiveBuildRound } from './builder.js';
import { canTransition } from './job-state.js';
import type { SeedPipeline } from './seed-pipeline.js';

// Rebuilds a dispatch spec from stored spec and qa; null if none.
export function reconstructDispatchSpec(record: Pick<SubmissionRecord, 'title' | 'spec' | 'qa'>): string | null {
  if (!record.spec) return null;
  const concept = [record.spec, ...(record.qa ?? [])].join('\n\n');
  return buildDispatchIssueBody({ title: record.title, concept });
}

export interface DispatcherDeps {
  store: Store | undefined;
  submissionTokenSecret: string | undefined;
  gameSeeder: GameSeeder | undefined;
  now: () => number;
  notifyAppBaseUrl: string;
  backendFor: (builder: BuilderKind | undefined) => Promise<AgentBackend | undefined>;
  builderOf: (record: SubmissionRecord | null | undefined) => BuilderKind;
  recordSessionCost: (
    jobId: number,
    ref: string,
    backend: AgentBackend,
    log: { error: (context: object, message: string) => void },
  ) => Promise<void>;
  seedDeliveryFor: SeedPipeline['seedDeliveryFor'];
  seedBuild: SeedPipeline['seedBuild'];
  publishSeedPreview: SeedPipeline['publishSeedPreview'];
}

// Starts a round on a job: mint the channel, seed it, dispatch.
export function createDispatcher(deps: DispatcherDeps) {
  const {
    store,
    submissionTokenSecret,
    gameSeeder,
    now,
    notifyAppBaseUrl,
    backendFor,
    builderOf,
    recordSessionCost,
    seedDeliveryFor,
    seedBuild,
    publishSeedPreview,
  } = deps;

  async function dispatchBuild(input: {
    jobId: number;
    spec: string;
    locale: string;
    log: { error: (context: object, message: string) => void };
    // The directory a new build is told to build into.

    // Set with feedback, it is the game an improvement continues.

    // Carried from creation, so the brief names a real path.
    slug?: string;
    // What to change. Untrusted text: data, never instructions.
    feedback?: string;
    // Who builds this round. Defaults to the last builder, then platform.
    builder?: BuilderKind;
  }): Promise<boolean> {
    // Without the signing secret there is no channel credential to give.

    // An agent that cannot report or deliver is worse than none.
    if (!submissionTokenSecret || !store) return false;
    const existing = await store.getSubmission(input.jobId);
    const builder = input.builder ?? builderOf(existing);
    const selected = await backendFor(builder);
    if (!selected) return false;
    try {
      await store.setRoundBuilder(input.jobId, builder, { resetRoundBudget: false });
      const roundGeneration = (await store.ensureRoundGeneration(input.jobId)) ?? 1;
      // Before the brief, so a draft is announced only when it exists.

      // The slug it mints must be on the record the brief reads.

      // A seed lives under the slug; a job without one has none.

      // Ask before paying, and ask how the seed would arrive.
      const seedDelivery = seedDeliveryFor(selected, builder);
      // Only these rounds read the job copy, so only they store one.
      const readsSeedFromJob = seedDelivery === 'channel';
      const storedSeed = readsSeedFromJob ? existing?.seed : undefined;
      const willAttemptJobSeed =
        readsSeedFromJob && !storedSeed && !input.feedback && Boolean(input.slug) && Boolean(gameSeeder);
      if (storedSeed) {
        await store.setSubmissionSeed(input.jobId, storedSeed);
      } else if (willAttemptJobSeed) {
        // Generation takes minutes; pending makes agents recheck get_seed.

        // Otherwise a race reads as "no seed, scaffold from scratch".
        await store.setSeedStatus(input.jobId, 'pending');
      } else if (readsSeedFromJob) {
        await store.setSeedStatus(input.jobId, 'unavailable');
      }
      const seedAttempt =
        storedSeed || input.feedback || !input.slug
          ? undefined
          : await seedBuild({ ...input, slug: input.slug, delivery: seedDelivery });
      const draft = seedAttempt?.draft;
      const seed: SeedFiles | undefined = storedSeed
        ? storedSeed
        : draft
          ? {
              slug: draft.slug,
              files: draft.files,
              references: draft.references,
              ...(draft.notes ? { notes: draft.notes } : {}),
            }
          : undefined;
      if (readsSeedFromJob && !storedSeed) {
        if (seed) {
          // Persist before dispatch, so a racing read still sees the draft.
          await store.setSubmissionSeed(input.jobId, seed);
        } else if (willAttemptJobSeed) {
          // Downgrade to unavailable only when generation was tried and failed.

          // The other path already wrote unavailable above.
          await store.setSeedStatus(input.jobId, 'unavailable');
        }
      }
      const current = await store.getSubmission(input.jobId);
      if (
        !current ||
        !isActiveBuildRound(current) ||
        builderOf(current) !== builder ||
        current.roundGeneration !== roundGeneration ||
        current.builderHandoff
      ) {
        input.log.error({ jobId: input.jobId }, 'discarding dispatch after the round changed');
        return false;
      }
      const result = await selected.dispatch({
        jobId: input.jobId,
        roundGeneration,
        ...(input.slug ? { slug: input.slug } : {}),
        spec: input.spec,
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
        ...(input.slug ? { slug: input.slug } : {}),
        ...(input.feedback ? { feedback: input.feedback } : {}),
        ...(seed ? { seed } : {}),
      });
      // Written once here; only this scope knows generation and placement.

      // After dispatch, so no bookkeeping delays the agent starting.

      // Failures too: recording only successes is what hid an outage.
      const seedOutcome = seedOutcomeFor({
        attempt: seedAttempt,
        placed: readsSeedFromJob ? Boolean(seed) : true,
        at: new Date(now()).toISOString(),
      });
      if (seedOutcome) {
        try {
          await store.recordSeedOutcome(input.jobId, seedOutcome);
        } catch (error) {
          input.log.error({ err: error, jobId: input.jobId }, 'could not record the seed outcome');
        }
      }
      await store.recordDispatch(input.jobId, {
        backend: selected.name,
        ref: result.ref,
        workspace: result.workspace,
        credentialRef: result.credentialRef,
      });
      // The round-zero preview: a playable rough draft within minutes.

      // Off the response path; no submit should wait on a bundle pass.

      // Gated on the draft bundling, and built from its own files.

      // What is shown is exactly what the agent starts from.

      // Failures here are their own problem; the build is already out.
      if (draft?.compiles) {
        void publishSeedPreview({
          jobId: input.jobId,
          slug: draft.slug,
          files: draft.files,
          locale: input.locale,
        }).catch((error: unknown) => {
          input.log.error({ err: error, jobId: input.jobId }, 'seed preview failed');
        });
      }
      await recordSessionCost(input.jobId, result.ref, selected, input.log);
      // Dispatch is fire-and-forget; a self agent can deliver first.

      // The write does not refuse regressions, so an unconditional one would

      // yank a submitted job back and reopen the double-close hazard.

      // Advance only when the walk allows; refs and cost are durable anyway.
      const latest = await store.getSubmission(input.jobId);
      const from = latest?.state ?? 'queued';
      if (canTransition(from, 'dispatched')) {
        await store.recordJobTransition(input.jobId, {
          to: 'dispatched',
          at: new Date(now()).toISOString(),
          by: 'system',
          reason: `dispatched_to_${selected.name}`,
        });
      }
      // Otherwise the agent already advanced past dispatch; do not regress.
      return true;
    } catch (error) {
      // A failed dispatch leaves the job queued, which the operator queue reports.

      // It surfaces as a visible stalled job, never a silently dead one.
      input.log.error({ err: error, jobId: input.jobId }, 'agent dispatch failed');
      return false;
    }
  }

  // The reaper's one retry after dispatchBuild died before a ref.
  async function redispatchQueuedJob(input: {
    jobId: number;
    log: { error: (context: object, message: string) => void };
  }): Promise<{ outcome: 'retried' | 'exhausted' | 'skipped'; reason?: string }> {
    if (!store) return { outcome: 'skipped', reason: 'store_unavailable' };
    const record = await store.getSubmission(input.jobId);
    if (!record) return { outcome: 'skipped', reason: 'not_found' };
    if (record.state !== 'queued' || (record.dispatch?.refs?.length ?? 0) > 0) {
      return { outcome: 'skipped', reason: 'not_stuck' };
    }

    const fail = async (reason: string) => {
      if (canTransition('queued', 'failed')) {
        await store.recordJobTransition(input.jobId, {
          to: 'failed',
          at: new Date(now()).toISOString(),
          by: 'system',
          reason,
        });
      }
    };

    if (record.dispatchReaperAttemptedAt) {
      await fail('dispatch_reaper_exhausted');
      return { outcome: 'exhausted' };
    }

    const spec = reconstructDispatchSpec(record);
    if (!spec) {
      await fail('dispatch_reaper_no_spec');
      return { outcome: 'exhausted', reason: 'no_spec' };
    }

    const claimed = await store.claimDispatchReaperAttempt(input.jobId, new Date(now()).toISOString());
    if (!claimed) return { outcome: 'skipped', reason: 'already_claimed' };

    await dispatchBuild({
      jobId: input.jobId,
      ...(record.slug ? { slug: record.slug } : {}),
      spec,
      locale: record.locale ?? 'en',
      builder: builderOf(record),
      log: input.log,
    });
    return { outcome: 'retried' };
  }

  // First dispatch from stored state; claims nothing, fails nothing.
  async function dispatchQueuedJob(input: {
    jobId: number;
    log: { error: (context: object, message: string) => void };
  }): Promise<{ outcome: 'dispatched' | 'skipped'; reason?: string }> {
    if (!store) return { outcome: 'skipped', reason: 'store_unavailable' };
    const record = await store.getSubmission(input.jobId);
    if (!record) return { outcome: 'skipped', reason: 'not_found' };
    if (record.state !== 'queued' || (record.dispatch?.refs?.length ?? 0) > 0) {
      return { outcome: 'skipped', reason: 'not_queued' };
    }
    const spec = reconstructDispatchSpec(record);
    if (!spec) return { outcome: 'skipped', reason: 'no_spec' };
    const dispatched = await dispatchBuild({
      jobId: input.jobId,
      ...(record.slug ? { slug: record.slug } : {}),
      spec,
      locale: record.locale ?? 'en',
      builder: builderOf(record),
      log: input.log,
    });
    return dispatched ? { outcome: 'dispatched' } : { outcome: 'skipped', reason: 'declined' };
  }

  return { dispatchBuild, redispatchQueuedJob, dispatchQueuedJob };
}
