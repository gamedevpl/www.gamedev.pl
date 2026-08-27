// AgentBackend over any ManagedAgentProvider, dispatched over MCP.
import type { AgentBackend, BuildBrief, DispatchResult, SeedDelivery } from './agent-backend.js';
import { buildPrompt } from '../delivery/build-prompt.js';
import type { AgentObservation, AgentSessionTokens } from '../creation/job-state.js';
import { appendKitDigest, type KitDigestLoader } from './kit-digest.js';
import {
  isManagedSessionHarvestable,
  ManagedAgentError,
  type ManagedAgentEffort,
  type ManagedAgentProvider,
  type ManagedBudgetStop,
  type ManagedSessionUsage,
  type ManagedTokenUsage,
  type ManagedGeminiTokenUsage,
  type ManagedOpenAiTokenUsage,
  type ManagedMcpBearerCredential,
  type ManagedUsageBudget,
  type ManagedToolAccess,
} from './managed-agent.js';

export interface ManagedBackendOptions {
  provider: ManagedAgentProvider;
  readSignals?: (jobId: number) => Promise<ManagedRoundSignals | null>;
  // Cacheable prefix, typically the published Creator Kit digest.
  systemPrompt?: () => Promise<string | undefined>;
  kitDigest?: KitDigestLoader;
  effort?: ManagedAgentEffort;
  maxDurationSeconds?: number;
  budget?: ManagedUsageBudget;
  tools: ManagedToolAccess;
  mcpBearerCredential?: (brief: BuildBrief) => ManagedMcpBearerCredential | undefined;
  readCredentialRef?: (jobId: number, sessionRef: string) => Promise<string | undefined>;
  nudgeIdle?: boolean;
  log?: {
    warn: (context: object, message: string) => void;
    info?: (context: object, message: string) => void;
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

// Discriminated by shape: a flat usage's vendor field is just string.
function ledgerTokens(
  usage: ManagedTokenUsage | ManagedGeminiTokenUsage | ManagedOpenAiTokenUsage,
): AgentSessionTokens {
  if ('toolUseTokens' in usage) {
    return {
      vendor: 'gemini',
      model: usage.model,
      input: usage.inputTokens,
      output: usage.outputTokens,
      total: usage.totalTokens,
      thought: usage.thoughtTokens,
      cached: usage.cachedTokens,
      toolUse: usage.toolUseTokens,
    };
  }
  if ('reasoningTokens' in usage) {
    return {
      vendor: 'openai',
      model: usage.model,
      input: usage.inputTokens,
      output: usage.outputTokens,
      total: usage.totalTokens,
      reasoning: usage.reasoningTokens,
      cached: usage.cachedTokens,
    };
  }
  return {
    input: usage.inputTokens,
    output: usage.outputTokens,
    ...(usage.vendor === 'anthropic' || usage.vendor === 'copilot' ? { vendor: usage.vendor } : {}),
    ...(usage.model ? { model: usage.model } : {}),
  };
}

function observedBudget(
  usage: ManagedSessionUsage | undefined,
  budget: ManagedUsageBudget | undefined,
): number | undefined {
  if (!usage || !budget) return undefined;
  if (budget.unit === 'credits' && usage.unit === 'credits') return usage.credits;
  if (budget.unit === 'tokens' && usage.unit === 'tokens') {
    return 'totalTokens' in usage ? usage.totalTokens : usage.inputTokens + usage.outputTokens;
  }
  return undefined;
}

// Idle requires_action: tool_confirmation Studio cannot Approve.
export function isManagedIdleBlockedOnAction(stopReason: string | undefined): boolean {
  return stopReason === 'requires_action';
}

// Nudge 400 while waiting on tool_confirmation.
export function isUnnudgeableManagedIdleError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /tool_confirmation|requires_action|waiting for.*confirmation/i.test(message);
}

export function createManagedBackend(options: ManagedBackendOptions): AgentBackend {
  if (!options.tools.mcpEndpoints?.length) {
    throw new ManagedAgentError('a managed backend needs an MCP endpoint');
  }
  const seedSupported = options.provider.supportsSeedFiles ?? true;
  const backendName = `managed:${options.provider.vendor}`;
  const budgetStops = new Map<string, ManagedBudgetStop>();
  const startedAt = new Map<string, number>();
  const idleNudged = new Set<string>();
  const credentialRefs = new Map<string, string>();
  const releasedCredentials = new Set<string>();
  // So cancel/cleanup can still log jobId/slug without a caller hint.
  const sessionJobs = new Map<string, { jobId: number; slug?: string }>();

  function jobContext(ref: string, jobId?: number): { jobId?: number; slug?: string } {
    const job = sessionJobs.get(ref);
    const resolvedIssue = jobId ?? job?.jobId;
    return {
      ...(resolvedIssue !== undefined ? { jobId: resolvedIssue } : {}),
      ...(job?.slug ? { slug: job.slug } : {}),
    };
  }

  async function releaseCredential(ref: string, jobId?: number): Promise<void> {
    const context = jobContext(ref, jobId);
    const credentialRef =
      credentialRefs.get(ref) ??
      (context.jobId !== undefined ? await options.readCredentialRef?.(context.jobId, ref) : undefined);
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
    // An unsupported seed must also drop from the brief, not just workspaceFiles.
    const effectiveBrief = seedSupported || !brief.seed ? brief : { ...brief, seed: undefined };
    const session = await options.provider.startSession({
      correlationId: String(brief.jobId),
      ...(systemPrompt ? { systemPrompt } : {}),
      prompt: buildPrompt(effectiveBrief),
      model: options.provider.model,
      ...(options.effort ? { effort: options.effort } : {}),
      ...(seedSupported && brief.seed
        ? {
            workspaceFiles: brief.seed.files.map((file) => ({
              path: `games/${brief.seed!.slug}/${file.path}`,
              content: file.content,
            })),
          }
        : {}),
      ...(options.maxDurationSeconds ? { maxDurationSeconds: options.maxDurationSeconds } : {}),
      tools: options.tools,
      ...(mcpBearerCredential ? { mcpBearerCredential } : {}),
    });
    startedAt.set(session.id, Date.now());
    sessionJobs.set(session.id, {
      jobId: brief.jobId,
      ...(brief.slug ? { slug: brief.slug } : {}),
    });
    if (session.credentialRef) {
      credentialRefs.set(session.id, session.credentialRef);
      options.log?.info?.(
        {
          jobId: brief.jobId,
          ...(brief.slug ? { slug: brief.slug } : {}),
          ref: session.id,
          credentialRef: session.credentialRef,
          ...(mcpBearerCredential ? { mcpUrl: mcpBearerCredential.url } : {}),
        },
        'managed round credential minted',
      );
    }
    return {
      ref: session.id,
      ...(session.workspace ? { workspace: session.workspace } : {}),
      ...(session.credentialRef ? { credentialRef: session.credentialRef } : {}),
    };
  }

  return {
    name: backendName,

    seedDelivery(): SeedDelivery {
      return seedSupported ? 'workspace' : 'channel';
    },

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

      const usage = session.usage;
      const usageFields = usage
        ? usage.unit === 'tokens'
          ? { sessionTokens: ledgerTokens(usage), sessionUsage: usage }
          : { sessionCredits: usage.credits, sessionUsage: usage }
        : {};
      const stopped = budgetStops.get(ref);
      if (stopped) {
        return {
          state: 'cancelled',
          hasCandidate: observeOptions.hasCandidate,
          stopReason: 'budget_reached',
          budgetStop: stopped,
          ...(session.workspace ? { workspace: session.workspace } : {}),
          ...usageFields,
        };
      }

      const measuredBudget = observedBudget(usage, options.budget);
      const nativeBudgetStop = session.stopReason === 'budget_reached';
      if (
        options.budget &&
        ((measuredBudget !== undefined && measuredBudget > options.budget.max) || nativeBudgetStop)
      ) {
        const cancellation = nativeBudgetStop ? { enforced: true } : await options.provider.cancelSession(ref);
        const budgetStop: ManagedBudgetStop = {
          unit: options.budget!.unit,
          observed: measuredBudget ?? options.budget.max,
          max: options.budget!.max,
          enforced: cancellation.enforced,
        };
        budgetStops.set(ref, budgetStop);
        await releaseCredential(ref, observeOptions.jobId);
        options.log?.warn(
          { ref, observed: budgetStop.observed, max: options.budget!.max, enforced: cancellation.enforced },
          'managed round stopped at its usage budget',
        );
        return {
          state: 'cancelled',
          hasCandidate: observeOptions.hasCandidate,
          stopReason: 'budget_reached',
          budgetStop,
          ...(session.workspace ? { workspace: session.workspace } : {}),
          ...usageFields,
        };
      }

      const started = startedAt.get(ref) ?? (session.startedAt ? Date.parse(session.startedAt) : NaN);
      const expired =
        options.maxDurationSeconds !== undefined &&
        Number.isFinite(started) &&
        Date.now() - started >= options.maxDurationSeconds * 1000 &&
        !['completed', 'failed', 'timed_out', 'cancelled'].includes(session.state);
      if (expired) {
        await options.provider.cancelSession(ref);
        await releaseCredential(ref, observeOptions.jobId);
        return {
          state: 'timed_out',
          hasCandidate: observeOptions.hasCandidate,
          ...(session.workspace ? { workspace: session.workspace } : {}),
          ...usageFields,
        };
      }

      const hasCandidate = observeOptions.hasCandidate;

      // Everything a nudge needs except what only the channel knows.
      const nudgeCandidate =
        session.state === 'idle' &&
        !hasCandidate &&
        options.nudgeIdle !== false &&
        session.stopReason !== 'budget_reached' &&
        !isManagedIdleBlockedOnAction(session.stopReason) &&
        Boolean(options.provider.sendMessage) &&
        !idleNudged.has(ref);
      // Re-read signals after a spent nudge.
      const needsSignals =
        nudgeCandidate ||
        credentialRefs.has(ref) ||
        Boolean(options.readCredentialRef && session.state === 'idle') ||
        (session.state === 'idle' && !hasCandidate && idleNudged.has(ref)) ||
        isManagedIdleBlockedOnAction(session.stopReason);
      const signals =
        needsSignals && options.readSignals && observeOptions.jobId !== undefined
          ? await options.readSignals(observeOptions.jobId)
          : null;
      const roundDelivered = Boolean(signals?.deliveredVersion || signals?.previewVersion);
      const agentEnded = Boolean(signals?.agentEndedAt);

      let nudged = false;
      let spentWithoutDelivery = false;
      if (
        session.state === 'idle' &&
        !hasCandidate &&
        !roundDelivered &&
        !agentEnded &&
        isManagedIdleBlockedOnAction(session.stopReason)
      ) {
        // Tool confirmation: Studio cannot Approve — spend the round.
        idleNudged.add(ref);
        spentWithoutDelivery = true;
        options.log?.warn(
          { ref, stopReason: session.stopReason },
          'idle managed session blocked on required action; ending round without delivery',
        );
      } else if (nudgeCandidate && !roundDelivered && !agentEnded && options.provider.sendMessage) {
        try {
          await options.provider.sendMessage(
            ref,
            'Continue this round now. No delivery is recorded for this round. Act through the existing tools, submit the playable source tree, and end only after submit_sources succeeds. Do not explain or wait.',
          );
          idleNudged.add(ref);
          nudged = true;
          options.log?.info?.({ ref }, 'nudged idle managed session to continue');
        } catch (error) {
          // Transient: retry next poll. Confirmation: spend the round.
          if (isUnnudgeableManagedIdleError(error)) {
            idleNudged.add(ref);
            spentWithoutDelivery = true;
          }
          options.log?.warn({ err: error, ref }, 'could not nudge idle managed session');
        }
      } else if (session.state === 'idle' && !hasCandidate && !roundDelivered && !agentEnded && idleNudged.has(ref)) {
        // Nudge spent; still idle; nothing delivered.
        spentWithoutDelivery = true;
      }

      if (
        isManagedSessionHarvestable(session.state) &&
        (session.state !== 'idle' || agentEnded || spentWithoutDelivery)
      ) {
        await releaseCredential(ref, observeOptions.jobId);
      }

      // Spent idle → completed so reconcile leaves building (no "Powstaje kod").
      const state = nudged ? 'in_progress' : spentWithoutDelivery ? 'completed' : session.state;

      return {
        state,
        hasCandidate,
        ...(session.workspace ? { workspace: session.workspace } : {}),
        ...usageFields,
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
      budgetStops.delete(previous.ref);
      if (previous.credentialRef) credentialRefs.set(previous.ref, previous.credentialRef);
      await releaseCredential(previous.ref);
      credentialRefs.delete(previous.ref);
      sessionJobs.delete(previous.ref);
      if (previous.workspace) await options.provider.deleteWorkspace?.(previous.workspace);
      await options.provider.deleteSession?.(previous.ref);
    },
  };
}
