import type { GameProject } from '@gamedevpl/game-generator';

/**
 * Job lifecycle. Terminal states are `succeeded` and `failed`; every terminal
 * transition must have released the job's capacity (and, for a real container
 * backend, torn the container down).
 *
 * queued → provisioning → running → succeeded | failed
 */
export type JobState = 'queued' | 'provisioning' | 'running' | 'succeeded' | 'failed';

export const TERMINAL_STATES: readonly JobState[] = ['succeeded', 'failed'];

export function isTerminal(state: JobState): boolean {
  return TERMINAL_STATES.includes(state);
}

export interface GenerationJob {
  id: string;
  /** Who submitted it — used for per-creator throttling and attribution. */
  creatorId: string;
  /** The untrusted natural-language prompt. */
  prompt: string;
  /** Optional target repo/template to run against. */
  repoRef?: string;
  state: JobState;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  /** Set when state === 'succeeded'. */
  result?: GameProject;
  /** Set when state === 'failed'. */
  error?: string;
}

export interface SubmitJobInput {
  creatorId: string;
  prompt: string;
  repoRef?: string;
}

/**
 * Context handed to a runner so it can report that provisioning finished and the
 * agent is actually executing. Optional: a runner that never calls `onRunning`
 * simply stays in `provisioning` until it settles.
 */
export interface JobRunContext {
  onRunning(): void;
}

/**
 * Executes one job. Deliberately generic: it may call an in-process generator, or
 * provision an ephemeral container and run an agent inside it. The orchestrator
 * only cares that it resolves with a GameProject or rejects.
 */
export type JobRunner = (job: GenerationJob, context: JobRunContext) => Promise<GameProject>;
