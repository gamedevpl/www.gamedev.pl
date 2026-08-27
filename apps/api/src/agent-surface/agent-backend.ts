// The seam every coding-agent backend plugs into.
//
// Today there is exactly one way a build gets made: an issue is created, a workflow
// assigns the Copilot bot, and creator feedback is relayed by a second workflow under a
// licensed human's PAT. None of that is a *product* decision — it is the shape of one
// vendor's integration, and it leaks into the submission API, the games repo's workflows,
// and two more PATs.
//
// This interface is where that shape stops. A backend knows how to start work, resume it,
// observe it and stop it; everything else — the job state machine, the build channel, the
// gate, the store, review, publication — is backend-agnostic and must stay that way. The
// test of the seam is Backend B (an SDK agent in a runtime we operate): introducing it
// should change this file's implementations and nothing else.

import type { AgentObservation } from '../creation/job-state.js';

/** Everything a backend needs to start a build. Deliberately not a GitHub issue. */
export interface BuildBrief {
  /** Our job identity, for correlating an agent's reports back to the job. */
  jobId: number;
  roundGeneration?: number;
  /** The game directory the agent may touch, and nothing else. */
  slug?: string;
  createGame?: { title: string; concept: string; locale?: string };
  /** The creator's spec, already moderated. Untrusted text: data, never instructions. */
  spec: string;
  /** Creator's language, so progress is reported in it rather than translated after. */
  locale?: string;
  /** Per-job build-channel credential. Scoped to this job and this slug. */
  channelToken: string;
  mcpOpenerToken?: string;
  /** Where the agent reports progress and delivers its work. */
  apiBaseUrl: string;
  // A selector, not the request itself — buildPrompt points at read_inbox/get_transcript.
  feedback?: string;
  // Queue write for `feedback` failed — buildPrompt must inline it instead.
  feedbackQueueFailed?: boolean;
  /**
   * Set when the previous session ended without delivering.
   *
   * Distinct from `feedback` because it is not the creator speaking — nobody asked for
   * anything, the work may well be finished, and the round exists only because it was
   * never uploaded. Told apart so the brief can lead with the omission instead of
   * inventing a change request the creator never made.
   */
  undelivered?: boolean;
  /**
   * A generated first draft of the game the workspace should already contain.
   *
   * Round 0, written by a model instead of by the agent (see `game-seed.ts`). It travels
   * on the brief rather than inside one backend because *what a draft contains* is a
   * product decision every backend wants the benefit of, while *how a workspace receives
   * it* is exactly the vendor detail this seam exists to hide — a branch for Copilot, a
   * seeded directory for a runtime we operate.
   *
   * Always optional: a backend that cannot seed ignores it and builds from nothing, which
   * is the behaviour every build had before seeding existed.
   */
  seed?: SeedFiles;
}

// How the agent gets the seed: placed, or read over the channel.
export type SeedDelivery = 'workspace' | 'channel';

/** The subset of a seed draft a backend needs to place it. */
export interface SeedFiles {
  /** The game directory the files belong in. */
  slug: string;
  /** Paths relative to `games/<slug>/`, already validated against the game shape. */
  files: { path: string; content: string }[];
  /** Published games the draft was modelled on, for the agent's own orientation. */
  references: string[];
  /** The generator's hand-off note to the agent, when it wrote one. */
  notes?: string;
}

/** What a backend hands back after starting work, recorded on the job. */
export interface DispatchResult {
  /** Backend-specific session/task id. Opaque to everything but the backend. */
  ref: string;
  /**
   * Where the work is happening, when the backend has a notion of it. For Copilot this
   * is the branch — and it is read back from the task rather than assumed, because a
   * requested branch is not always the one used.
   */
  workspace?: string;
  credentialRef?: string;
}

export interface AgentBackend {
  /** Stable name, recorded on the job so a build's provenance survives a backend switch. */
  readonly name: string;
  /** Starts a fresh build. */
  dispatch(brief: BuildBrief): Promise<DispatchResult>;
  /**
   * Continues an existing build with new instructions.
   *
   * Separate from `dispatch` because continuing is not always the same operation as
   * starting: Copilot needs an open pull request on the branch before it will resume one,
   * while a runtime we operate would simply re-seed the workspace from the last candidate.
   */
  resume(brief: BuildBrief, previous: DispatchResult): Promise<DispatchResult>;
  /** Reads current progress, normalized into the vendor-neutral shape. */
  // Job identity is for pull-delivery backends; push backends ignore it.
  observe(
    ref: string,
    options: { hasCandidate: boolean; jobId?: number; slug?: string; roundGeneration?: number },
  ): Promise<AgentObservation | null>;
  /**
   * Stops work, as far as the backend allows.
   *
   * Returns whether the stop was *enforced*. GitHub's agent tasks API has no cancel
   * endpoint, so the Copilot backend answers false: cancellation there is cooperative
   * (the build channel tells a running agent to stop) and the real guarantee is that we
   * discard whatever arrives afterwards. A runtime we operate can answer true.
   */
  cancel(ref: string, credentialRef?: string): Promise<{ enforced: boolean }>;
  /** Releases workspace state once a job is finished. Best effort. */
  cleanup?(previous: DispatchResult): Promise<void>;
  // How this backend receives a seed. Absent means workspace.
  seedDelivery?(): SeedDelivery;
}
