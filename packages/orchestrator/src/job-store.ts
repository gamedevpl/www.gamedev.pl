import { isTerminal, type GenerationJob, type JobState } from './types.js';

/**
 * Persistence seam for jobs. In-memory today; a database implementation can drop
 * in later without the orchestrator changing.
 */
export interface JobStore {
  save(job: GenerationJob): void;
  get(id: string): GenerationJob | undefined;
  /** Jobs in the given state, oldest first (FIFO dispatch order). */
  byState(state: JobState): GenerationJob[];
  countByState(state: JobState): number;
  /** How many of a creator's jobs currently hold capacity (provisioning or running). */
  countActiveForCreator(creatorId: string): number;
  all(): GenerationJob[];
  /**
   * Drops the oldest finished jobs, keeping at most `keep`. Without this a
   * long-running process grows without bound, since finished jobs (which hold a
   * whole generated game) are otherwise never released.
   */
  pruneTerminal(keep: number): number;
}

const ACTIVE_STATES: JobState[] = ['provisioning', 'running'];

export class InMemoryJobStore implements JobStore {
  // Map preserves insertion order, which gives us FIFO for free.
  private readonly jobs = new Map<string, GenerationJob>();

  save(job: GenerationJob): void {
    this.jobs.set(job.id, job);
  }

  get(id: string): GenerationJob | undefined {
    return this.jobs.get(id);
  }

  byState(state: JobState): GenerationJob[] {
    return this.all().filter((job) => job.state === state);
  }

  countByState(state: JobState): number {
    let count = 0;
    for (const job of this.jobs.values()) {
      if (job.state === state) count += 1;
    }
    return count;
  }

  countActiveForCreator(creatorId: string): number {
    let count = 0;
    for (const job of this.jobs.values()) {
      if (job.creatorId === creatorId && ACTIVE_STATES.includes(job.state)) count += 1;
    }
    return count;
  }

  all(): GenerationJob[] {
    return [...this.jobs.values()];
  }

  pruneTerminal(keep: number): number {
    // Map iteration is insertion-ordered, so the terminal jobs come out oldest-first.
    const terminal = this.all().filter((job) => isTerminal(job.state));
    const excess = terminal.length - Math.max(0, keep);
    if (excess <= 0) return 0;

    for (const job of terminal.slice(0, excess)) {
      this.jobs.delete(job.id);
    }
    return excess;
  }
}
