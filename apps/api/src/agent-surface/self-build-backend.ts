// The "self" agent backend: the creator's own coding agent builds the game.
//
// The platform dispatches nothing external. A round opens a channel (token + job record),
// optionally stores a generated seed draft on the job, and waits for channel activity.
// Progress, delivery and stop all travel through the existing build channel — the same
// path Copilot uses for upload and inbox — so gate, store and publication stay unaware
// of who is typing on the other end.

import type { AgentBackend, BuildBrief, DispatchResult, SeedDelivery, SeedFiles } from './agent-backend.js';
import type { AgentObservation } from '../creation/job-state.js';

export interface SelfBuildSignals {
  lastAgentSignalAt?: string;
  deliveredVersion?: string;
}

export interface SelfBuildBackendOptions {
  /**
   * Persists a generated seed on the job document. Self builds never commit a seed
   * branch — the draft lives on the record until the agent (or a later round) reads it.
   */
  persistSeed?: (jobId: number, seed: SeedFiles) => Promise<void>;
  /**
   * Returns a previously stored seed for this job, when one exists. Resume reuses it
   * rather than inventing a second draft of a game already in progress.
   */
  readSeed?: (jobId: number) => Promise<SeedFiles | undefined>;
  /** Channel-side signals the reconciler projects into an observation. */
  readSignals?: (jobId: number) => Promise<SelfBuildSignals | null>;
}

/** Opaque ref recorded on the job. Parseable back to the job id for observe. */
export function selfBuildRef(jobId: number): string {
  return `self:${jobId}`;
}

export function parseSelfBuildRef(ref: string): number | null {
  const match = /^self:(\d+)$/.exec(ref);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function createSelfBuildBackend(options: SelfBuildBackendOptions = {}): AgentBackend {
  async function openRound(brief: BuildBrief): Promise<DispatchResult> {
    // Prefer a seed already stored on the job (resume of the same round) over inventing
    // another. A brief.seed from the caller still wins when nothing is stored yet —
    // that is the first-dispatch path after the seeder ran.
    const existing = options.readSeed ? await options.readSeed(brief.jobId) : undefined;
    const seed = existing ?? brief.seed;
    if (seed && options.persistSeed && !existing) {
      await options.persistSeed(brief.jobId, seed);
    }
    return { ref: selfBuildRef(brief.jobId) };
  }

  return {
    name: 'self',

    // BYOCA has no workspace we can write; get_seed reads it back.
    seedDelivery: (): SeedDelivery => 'channel',

    async dispatch(brief: BuildBrief): Promise<DispatchResult> {
      return openRound(brief);
    },

    async resume(brief: BuildBrief, _previous: DispatchResult): Promise<DispatchResult> {
      return openRound(brief);
    },

    /**
     * Projects channel signals into the vendor-neutral observation shape.
     *
     * No external reads: the store already knows whether the agent has spoken and
     * whether anything was delivered. Returning `queued` before the first signal is
     * what keeps self rounds out of Copilot-style "not_dispatched" stalls.
     */
    async observe(ref: string, { hasCandidate }: { hasCandidate: boolean }): Promise<AgentObservation | null> {
      const jobId = parseSelfBuildRef(ref);
      if (jobId === null) return null;
      const signals = options.readSignals ? await options.readSignals(jobId) : null;
      const delivered = hasCandidate || Boolean(signals?.deliveredVersion);
      if (delivered) {
        return { state: 'completed', hasCandidate: true };
      }
      if (signals?.lastAgentSignalAt) {
        return { state: 'in_progress', hasCandidate: false };
      }
      return { state: 'queued', hasCandidate: false };
    },

    async cancel(): Promise<{ enforced: boolean }> {
      // Same cooperative stop as Copilot: the channel's control.stop tells a live agent
      // to exit; nothing here can kill a process on the creator's machine.
      return { enforced: false };
    },
  };
}
