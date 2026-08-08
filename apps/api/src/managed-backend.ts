// AgentBackend over any ManagedAgentProvider; delivery is pulled.
import type { AgentBackend, BuildBrief, DispatchResult } from './agent-backend.js';
import { buildPrompt } from './copilot-backend.js';
import type { AgentObservation } from './job-state.js';
import {
  assertWithinManagedOutputCaps,
  isManagedSessionHarvestable,
  ManagedOutputRejectedError,
  toGameRelativeOutputs,
  type ManagedAgentEffort,
  type ManagedAgentProvider,
  type ManagedOutputCaps,
  type ManagedOutputFile,
  type ManagedToolAccess,
} from './managed-agent.js';

export interface ManagedDeliveryInput {
  issueNumber: number;
  slug: string;
  files: ManagedOutputFile[];
  // The vendor session the files were harvested from.
  sessionRef: string;
  mode: 'preview' | 'publish';
}

export interface ManagedDeliveryResult {
  version: string;
}

// Injected: no store or gate access here.
export type ManagedDeliverySink = (input: ManagedDeliveryInput) => Promise<ManagedDeliveryResult>;

export interface ManagedBackendOptions {
  provider: ManagedAgentProvider;
  deliver: ManagedDeliverySink;
  // Cacheable prefix, typically the published Creator Kit digest.
  systemPrompt?: () => Promise<string | undefined>;
  outputPath?: string;
  effort?: ManagedAgentEffort;
  maxDurationSeconds?: number;
  outputCaps?: ManagedOutputCaps;
  tools?: ManagedToolAccess;
  // Preview keeps the first delivery cheap; publish seals.
  deliveryMode?: 'preview' | 'publish';
  log?: {
    warn: (context: object, message: string) => void;
    info?: (context: object, message: string) => void;
  };
}

export const DEFAULT_MANAGED_OUTPUT_PATH = 'outputs';

export function createManagedBackend(options: ManagedBackendOptions): AgentBackend {
  const outputPath = options.outputPath ?? DEFAULT_MANAGED_OUTPUT_PATH;
  const deliveryMode = options.deliveryMode ?? 'preview';
  // At-most-once per session; a re-poll cannot duplicate.
  const harvested = new Set<string>();

  async function start(brief: BuildBrief): Promise<DispatchResult> {
    const systemPrompt = options.systemPrompt ? await options.systemPrompt() : undefined;
    const session = await options.provider.startSession({
      correlationId: String(brief.issueNumber),
      ...(systemPrompt ? { systemPrompt } : {}),
      prompt: buildPrompt(brief),
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
    });
    return { ref: session.id };
  }

  async function harvest(sessionRef: string, issueNumber: number, slug: string): Promise<boolean> {
    if (harvested.has(sessionRef)) return false;
    const raw = await options.provider.listOutputs(sessionRef);
    let files: ManagedOutputFile[];
    try {
      files = toGameRelativeOutputs(raw, slug);
      if (files.length === 0) return false;
      assertWithinManagedOutputCaps(files, options.outputCaps);
    } catch (error) {
      if (!(error instanceof ManagedOutputRejectedError)) throw error;
      // Not retried: the same sandbox repeats the bytes.
      harvested.add(sessionRef);
      options.log?.warn({ err: error, issueNumber, slug, sessionRef }, 'managed output refused');
      return false;
    }
    await options.deliver({ issueNumber, slug, files, sessionRef, mode: deliveryMode });
    harvested.add(sessionRef);
    options.log?.info?.(
      { issueNumber, slug, sessionRef, files: files.length, vendor: options.provider.vendor },
      'delivered managed agent output',
    );
    return true;
  }

  return {
    name: `managed:${options.provider.vendor}`,

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

      let hasCandidate = observeOptions.hasCandidate;
      const canHarvest =
        !hasCandidate &&
        isManagedSessionHarvestable(session.state) &&
        observeOptions.issueNumber !== undefined &&
        Boolean(observeOptions.slug);
      if (canHarvest) {
        try {
          hasCandidate = await harvest(ref, observeOptions.issueNumber!, observeOptions.slug!);
        } catch (error) {
          // A failed pull retries on the next poll.
          options.log?.warn({ err: error, ref }, 'could not harvest managed agent output');
        }
      }

      return {
        state: session.state,
        hasCandidate,
        ...(session.usage
          ? { sessionTokens: { input: session.usage.inputTokens, output: session.usage.outputTokens } }
          : {}),
      };
    },

    async cancel(ref): Promise<{ enforced: boolean }> {
      return options.provider.cancelSession(ref);
    },

    async cleanup(previous: DispatchResult): Promise<void> {
      harvested.delete(previous.ref);
      await options.provider.deleteSession?.(previous.ref);
    },
  };
}
