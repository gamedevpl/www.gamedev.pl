// AgentBackend over any ManagedAgentProvider; delivery is pulled.
import type { AgentBackend, BuildBrief, DispatchResult } from './agent-backend.js';
import { buildPrompt } from './build-prompt.js';
import { forbiddenDeliveryPathReason } from './games-store.js';
import type { AgentObservation } from './job-state.js';
import { appendKitDigest, type KitDigestLoader } from './kit-digest.js';
import {
  assertWithinManagedOutputPlan,
  ManagedAgentError,
  createManagedOutputBudget,
  isManagedSessionHarvestable,
  ManagedOutputRejectedError,
  selectManagedOutputs,
  type ManagedAgentEffort,
  type ManagedAgentProvider,
  type ManagedOutputCaps,
  type ManagedOutputFile,
  type ManagedOutputPlan,
  type ManagedMcpBearerCredential,
  type ManagedToolAccess,
} from './managed-agent.js';

export interface ManagedDeliveryInput {
  issueNumber: number;
  slug: string;
  files: ManagedOutputFile[];
  // The vendor session the files were harvested from.
  sessionRef: string;
  // Authority captured at dispatch and checked again immediately before storage.
  backend: string;
  roundGeneration: number;
  mode: 'preview' | 'publish';
}

export interface ManagedDeliveryResult {
  version: string;
}

// Injected, and idempotent per issueNumber and sessionRef.
export type ManagedDeliverySink = (input: ManagedDeliveryInput) => Promise<ManagedDeliveryResult>;

export interface ManagedDeliveryClaim {
  issueNumber: number;
  slug: string;
  sessionRef: string;
}

// Durable at-most-once across instances; see the design doc.
export interface ManagedDeliveryLock {
  acquire(claim: ManagedDeliveryClaim): Promise<boolean>;
  // Failed attempt, so a later poll can retry.
  release(claim: ManagedDeliveryClaim): Promise<void>;
}

// Store-backed lock for multi-instance harvest.
export function createManagedDeliveryLock(
  store: {
    claimManagedDelivery(
      claim: { issueNumber: number; sessionRef: string; slug: string },
      at: string,
    ): Promise<boolean>;
    releaseManagedDelivery(claim: { issueNumber: number; sessionRef: string }): Promise<void>;
  },
  now: () => string = () => new Date().toISOString(),
): ManagedDeliveryLock {
  return {
    acquire: (claim) => store.claimManagedDelivery(claim, now()),
    release: (claim) => store.releaseManagedDelivery(claim),
  };
}

// Round state from the build channel, which the vendor session cannot see.
export interface ManagedRoundSignals {
  // A sealed publish delivery.
  deliveredVersion?: string;
  // A preview delivery: gates without sealing.
  previewVersion?: string;
  // The MCP `end` tool; the agent stopped deliberately.
  agentEndedAt?: string;
}

export interface ManagedBackendOptions {
  provider: ManagedAgentProvider;
  readSignals?: (issueNumber: number) => Promise<ManagedRoundSignals | null>;
  // Omit only when an MCP-connected agent submits for itself.
  deliver?: ManagedDeliverySink;
  lock?: ManagedDeliveryLock;
  // Cacheable prefix, typically the published Creator Kit digest.
  systemPrompt?: () => Promise<string | undefined>;
  kitDigest?: KitDigestLoader;
  outputPath?: string;
  effort?: ManagedAgentEffort;
  maxDurationSeconds?: number;
  outputCaps?: ManagedOutputCaps;
  tools?: ManagedToolAccess;
  mcpBearerCredential?: (brief: BuildBrief) => ManagedMcpBearerCredential | undefined;
  readCredentialRef?: (issueNumber: number, sessionRef: string) => Promise<string | undefined>;
  nudgeIdle?: boolean;
  // Preview keeps the first delivery cheap; publish seals.
  deliveryMode?: 'preview' | 'publish';
  log?: {
    warn: (context: object, message: string) => void;
    info?: (context: object, message: string) => void;
  };
}

export const DEFAULT_MANAGED_OUTPUT_PATH = 'outputs';

export function createManagedBackend(options: ManagedBackendOptions): AgentBackend {
  const deliver = options.deliver;
  if (!deliver && !options.tools?.mcpEndpoints?.length) {
    throw new ManagedAgentError(
      'a managed backend needs either a delivery sink or an MCP endpoint the agent can submit through',
    );
  }
  const outputPath = options.outputPath ?? DEFAULT_MANAGED_OUTPUT_PATH;
  const deliveryMode = options.deliveryMode ?? 'preview';
  const channelMode = Boolean(options.tools?.mcpEndpoints?.length);
  const backendName = `managed:${options.provider.vendor}`;
  // At-most-once per session; a re-poll cannot duplicate.
  const harvested = new Set<string>();
  const startedAt = new Map<string, number>();
  const idleNudged = new Set<string>();
  const sessionGenerations = new Map<string, number>();
  const credentialRefs = new Map<string, string>();
  const releasedCredentials = new Set<string>();
  // So cancel/cleanup can still log issueNumber/slug without a caller hint.
  const sessionJobs = new Map<string, { issueNumber: number; slug?: string }>();

  function jobContext(ref: string, issueNumber?: number): { issueNumber?: number; slug?: string } {
    const job = sessionJobs.get(ref);
    const resolvedIssue = issueNumber ?? job?.issueNumber;
    return {
      ...(resolvedIssue !== undefined ? { issueNumber: resolvedIssue } : {}),
      ...(job?.slug ? { slug: job.slug } : {}),
    };
  }

  async function releaseCredential(ref: string, issueNumber?: number): Promise<void> {
    const context = jobContext(ref, issueNumber);
    const credentialRef =
      credentialRefs.get(ref) ??
      (context.issueNumber !== undefined ? await options.readCredentialRef?.(context.issueNumber, ref) : undefined);
    if (!credentialRef || releasedCredentials.has(credentialRef) || !options.provider.releaseCredential) return;
    releasedCredentials.add(credentialRef);
    try {
      await options.provider.releaseCredential(credentialRef);
      options.log?.info?.({ ...context, ref, credentialRef }, 'managed round credential revoked');
    } catch (error) {
      releasedCredentials.delete(credentialRef);
      options.log?.warn({ err: error, ...context, ref, credentialRef }, 'could not revoke managed round credential');
    }
  }

  async function start(brief: BuildBrief): Promise<DispatchResult> {
    const systemPrompt = appendKitDigest(
      options.systemPrompt ? await options.systemPrompt() : undefined,
      options.kitDigest ? await options.kitDigest.load() : undefined,
    );
    const mcpBearerCredential = options.mcpBearerCredential?.(brief);
    const session = await options.provider.startSession({
      correlationId: String(brief.issueNumber),
      ...(systemPrompt ? { systemPrompt } : {}),
      // The prompt has to describe the delivery this backend will actually read.
      prompt: buildPrompt(
        brief,
        channelMode
          ? { kind: 'channel', fast: true }
          : deliver
            ? { kind: 'outputs', path: outputPath }
            : { kind: 'channel', fast: true },
      ),
      model: options.provider.model,
      ...(options.effort ? { effort: options.effort } : {}),
      ...(brief.seed
        ? {
            workspaceFiles: brief.seed.files.map((file) => ({
              path: `games/${brief.seed!.slug}/${file.path}`,
              content: file.content,
            })),
          }
        : {}),
      outputPath,
      ...(options.maxDurationSeconds ? { maxDurationSeconds: options.maxDurationSeconds } : {}),
      ...(options.tools ? { tools: options.tools } : {}),
      ...(mcpBearerCredential ? { mcpBearerCredential } : {}),
    });
    startedAt.set(session.id, Date.now());
    sessionGenerations.set(session.id, brief.roundGeneration ?? 1);
    sessionJobs.set(session.id, {
      issueNumber: brief.issueNumber,
      ...(brief.slug ? { slug: brief.slug } : {}),
    });
    if (session.credentialRef) {
      credentialRefs.set(session.id, session.credentialRef);
      options.log?.info?.(
        {
          issueNumber: brief.issueNumber,
          ...(brief.slug ? { slug: brief.slug } : {}),
          ref: session.id,
          credentialRef: session.credentialRef,
          ...(mcpBearerCredential ? { mcpUrl: mcpBearerCredential.url } : {}),
        },
        'managed round credential minted',
      );
    }
    return { ref: session.id, ...(session.credentialRef ? { credentialRef: session.credentialRef } : {}) };
  }

  // `pending` means ask again, so the round is not spent.
  type HarvestOutcome = 'delivered' | 'empty' | 'refused' | 'pending';

  async function download(sessionRef: string, plan: ManagedOutputPlan[]): Promise<ManagedOutputFile[]> {
    const budget = createManagedOutputBudget(options.outputCaps);
    const files: ManagedOutputFile[] = [];
    for (const entry of plan) {
      const content = await options.provider.readOutput(sessionRef, entry.ref);
      files.push(budget.admit(entry.path, content));
    }
    return files;
  }

  async function harvest(
    sessionRef: string,
    issueNumber: number,
    slug: string,
    roundGeneration?: number,
  ): Promise<HarvestOutcome> {
    if (!deliver || harvested.has(sessionRef)) return 'empty';
    const claim = { issueNumber, slug, sessionRef };
    const listed = await options.provider.listOutputs(sessionRef);
    let plan: ManagedOutputPlan[];
    try {
      const selected = selectManagedOutputs(listed, slug);
      // submit_sources' own rules, dropping not refusing: docs/managed-agent-backend.md.
      const deliverable: ManagedOutputPlan[] = [];
      const ignored = [...selected.ignored];
      for (const entry of selected.plan) {
        if (forbiddenDeliveryPathReason(entry.path)) ignored.push(entry.ref.path);
        else deliverable.push(entry);
      }
      if (ignored.length > 0) {
        options.log?.info?.({ ...claim, ignored }, 'ignored managed outputs that are not deliverable sources');
      }
      plan = assertWithinManagedOutputPlan(deliverable, options.outputCaps);
    } catch (error) {
      if (!(error instanceof ManagedOutputRejectedError)) throw error;
      // Not retried: the same sandbox repeats the bytes.
      harvested.add(sessionRef);
      options.log?.warn({ err: error, ...claim }, 'managed output refused');
      return 'refused';
    }
    if (plan.length === 0) return 'empty';

    // The lock holder delivers; the loser waits for the candidate.
    if (options.lock && !(await options.lock.acquire(claim))) {
      options.log?.info?.(claim, 'managed delivery already claimed elsewhere');
      return 'pending';
    }
    try {
      const files = await download(sessionRef, plan);
      // Prefer the durable job generation over process memory.
      const generation = roundGeneration ?? sessionGenerations.get(sessionRef) ?? 1;
      await deliver({
        issueNumber,
        slug,
        files,
        sessionRef,
        backend: backendName,
        roundGeneration: generation,
        mode: deliveryMode,
      });
      harvested.add(sessionRef);
      options.log?.info?.(
        { ...claim, files: files.length, vendor: options.provider.vendor },
        'delivered managed agent output',
      );
      return 'delivered';
    } catch (error) {
      if (error instanceof ManagedOutputRejectedError) {
        harvested.add(sessionRef);
        options.log?.warn({ err: error, ...claim }, 'managed output refused');
        return 'refused';
      }
      await options.lock?.release(claim).catch(() => undefined);
      throw error;
    }
  }

  return {
    name: backendName,

    async dispatch(brief: BuildBrief): Promise<DispatchResult> {
      return start(brief);
    },

    // A revision restores the game from the store.
    async resume(brief: BuildBrief): Promise<DispatchResult> {
      return start(brief);
    },

    async observe(ref, observeOptions): Promise<AgentObservation | null> {
      const session = await options.provider.getSession(ref);
      if (!session) return null;

      const started = startedAt.get(ref) ?? (session.startedAt ? Date.parse(session.startedAt) : NaN);
      const expired =
        options.maxDurationSeconds !== undefined &&
        Number.isFinite(started) &&
        Date.now() - started >= options.maxDurationSeconds * 1000 &&
        !['completed', 'failed', 'timed_out', 'cancelled'].includes(session.state);
      if (expired) {
        await options.provider.cancelSession(ref);
        await releaseCredential(ref, observeOptions.issueNumber);
        return {
          state: 'timed_out',
          hasCandidate: observeOptions.hasCandidate,
          ...(session.usage
            ? { sessionTokens: { input: session.usage.inputTokens, output: session.usage.outputTokens } }
            : {}),
        };
      }

      let hasCandidate = observeOptions.hasCandidate;
      let outcome: HarvestOutcome = 'empty';
      const canHarvest =
        Boolean(deliver) &&
        !channelMode &&
        !hasCandidate &&
        isManagedSessionHarvestable(session.state) &&
        observeOptions.issueNumber !== undefined &&
        Boolean(observeOptions.slug);
      if (canHarvest) {
        try {
          outcome = await harvest(
            ref,
            observeOptions.issueNumber!,
            observeOptions.slug!,
            observeOptions.roundGeneration,
          );
          hasCandidate = outcome === 'delivered';
        } catch (error) {
          // A failed pull retries on the next poll.
          outcome = 'pending';
          options.log?.warn({ err: error, ref }, 'could not harvest managed agent output');
        }
      }

      // Everything a nudge needs except what only the channel knows.
      const nudgeCandidate =
        session.state === 'idle' &&
        !hasCandidate &&
        options.nudgeIdle !== false &&
        session.stopReason !== 'budget_reached' &&
        Boolean(options.provider.sendMessage) &&
        !idleNudged.has(ref);
      // Provider cannot see a channel submit or end; read once.
      const needsSignals =
        nudgeCandidate || credentialRefs.has(ref) || Boolean(options.readCredentialRef && session.state === 'idle');
      const signals =
        needsSignals && options.readSignals && observeOptions.issueNumber !== undefined
          ? await options.readSignals(observeOptions.issueNumber)
          : null;
      const roundDelivered = Boolean(signals?.deliveredVersion || signals?.previewVersion);
      const agentEnded = Boolean(signals?.agentEndedAt);

      let nudged = false;
      if (nudgeCandidate && !roundDelivered && !agentEnded && options.provider.sendMessage) {
        try {
          await options.provider.sendMessage(
            ref,
            'Continue this round now. No delivery is recorded for this round. Act through the existing tools, submit the playable source tree, and end only after submit_sources succeeds. Do not explain or wait.',
          );
          idleNudged.add(ref);
          nudged = true;
          options.log?.info?.({ ref }, 'nudged idle managed session to continue');
        } catch (error) {
          options.log?.warn({ err: error, ref }, 'could not nudge idle managed session');
        }
      }

      if (isManagedSessionHarvestable(session.state) && (session.state !== 'idle' || agentEnded)) {
        await releaseCredential(ref, observeOptions.issueNumber);
      }

      // A settled session with no candidate fails the round.
      const state = outcome === 'pending' || nudged ? 'in_progress' : session.state;

      return {
        state,
        hasCandidate,
        ...(session.usage
          ? { sessionTokens: { input: session.usage.inputTokens, output: session.usage.outputTokens } }
          : {}),
      };
    },

    async cancel(ref, credentialRef): Promise<{ enforced: boolean }> {
      if (credentialRef) credentialRefs.set(ref, credentialRef);
      try {
        return await options.provider.cancelSession(ref);
      } finally {
        // Archive even when interrupt fails; job is already terminal.
        await releaseCredential(ref);
      }
    },

    async cleanup(previous: DispatchResult): Promise<void> {
      startedAt.delete(previous.ref);
      idleNudged.delete(previous.ref);
      harvested.delete(previous.ref);
      sessionGenerations.delete(previous.ref);
      if (previous.credentialRef) credentialRefs.set(previous.ref, previous.credentialRef);
      await releaseCredential(previous.ref);
      credentialRefs.delete(previous.ref);
      sessionJobs.delete(previous.ref);
      await options.provider.deleteSession?.(previous.ref);
    },
  };
}
