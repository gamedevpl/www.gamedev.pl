import { InMemoryJobStore, type JobStore } from './job-store.js';
import type { GenerationJob, JobRunner, JobState, SubmitJobInput } from './types.js';

/** Thrown by `submit` when the queue is at `maxQueueDepth` — the backpressure signal. */
export class QueueFullError extends Error {
  constructor(depth: number) {
    super(`job queue is full (${depth} queued); try again later`);
    this.name = 'QueueFullError';
  }
}

export interface OrchestratorOptions {
  runner: JobRunner;
  store?: JobStore;
  /** Global cap on jobs holding capacity at once. Default 2. */
  maxConcurrent?: number;
  /** Per-creator cap, so one creator can't monopolize capacity. Default 1. */
  maxConcurrentPerCreator?: number;
  /** Max jobs waiting before `submit` rejects. Default 100. */
  maxQueueDepth?: number;
  /**
   * How many finished jobs to retain for polling before the oldest are dropped.
   * Bounds memory: each finished job holds a whole generated game. Default 200.
   */
  maxRetainedJobs?: number;
  generateId?: () => string;
  now?: () => Date;
}

export interface OrchestratorStats {
  queued: number;
  provisioning: number;
  running: number;
  succeeded: number;
  failed: number;
  maxConcurrent: number;
  maxConcurrentPerCreator: number;
}

let idCounter = 0;
const defaultGenerateId = (): string => `job_${Date.now().toString(36)}_${(idCounter += 1).toString(36)}`;

/**
 * Queues generation jobs and dispatches them to a runner under a concurrency cap
 * and a per-creator throttle.
 *
 * Submissions never run synchronously: `submit` enqueues and returns immediately,
 * and the caller polls for status. That's what lets traffic be bursty without
 * either dropping work or running unbounded expensive jobs at once.
 *
 * Dispatch is event-driven (on submit, and again whenever a job settles) rather
 * than timer-polled, which keeps it deterministic and easy to test.
 *
 * Failures are terminal — jobs are not retried blindly, because agent runs are
 * expensive and not idempotent.
 */
export class Orchestrator {
  private readonly runner: JobRunner;
  private readonly store: JobStore;
  private readonly maxConcurrent: number;
  private readonly maxConcurrentPerCreator: number;
  private readonly maxQueueDepth: number;
  private readonly maxRetainedJobs: number;
  private readonly generateId: () => string;
  private readonly now: () => Date;
  private readonly idleWaiters: Array<() => void> = [];

  constructor(options: OrchestratorOptions) {
    this.runner = options.runner;
    this.store = options.store ?? new InMemoryJobStore();
    this.maxConcurrent = options.maxConcurrent ?? 2;
    this.maxConcurrentPerCreator = options.maxConcurrentPerCreator ?? 1;
    this.maxQueueDepth = options.maxQueueDepth ?? 100;
    this.maxRetainedJobs = options.maxRetainedJobs ?? 200;
    this.generateId = options.generateId ?? defaultGenerateId;
    this.now = options.now ?? (() => new Date());
  }

  submit(input: SubmitJobInput): GenerationJob {
    const queued = this.store.countByState('queued');
    if (queued >= this.maxQueueDepth) {
      throw new QueueFullError(queued);
    }

    const job: GenerationJob = {
      id: this.generateId(),
      creatorId: input.creatorId,
      prompt: input.prompt,
      ...(input.repoRef ? { repoRef: input.repoRef } : {}),
      state: 'queued',
      createdAt: this.now().toISOString(),
    };
    this.store.save(job);
    this.pump();
    return job;
  }

  get(id: string): GenerationJob | undefined {
    return this.store.get(id);
  }

  /**
   * Returns recent jobs, newest first, capped at `limit` (default 20, max 50).
   * Titles are only available on succeeded jobs.
   */
  list(limit = 20): GenerationJob[] {
    const cap = Math.min(Math.max(1, limit), 50);
    return this.store
      .all()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, cap);
  }

  stats(): OrchestratorStats {
    return {
      queued: this.store.countByState('queued'),
      provisioning: this.store.countByState('provisioning'),
      running: this.store.countByState('running'),
      succeeded: this.store.countByState('succeeded'),
      failed: this.store.countByState('failed'),
      maxConcurrent: this.maxConcurrent,
      maxConcurrentPerCreator: this.maxConcurrentPerCreator,
    };
  }

  /** Resolves once nothing is queued or in flight. Intended for tests and shutdown. */
  async drain(): Promise<void> {
    if (this.isIdle()) return;
    await new Promise<void>((resolve) => this.idleWaiters.push(resolve));
  }

  private activeCount(): number {
    return this.store.countByState('provisioning') + this.store.countByState('running');
  }

  private isIdle(): boolean {
    return this.activeCount() === 0 && this.store.countByState('queued') === 0;
  }

  /**
   * Dispatches as many queued jobs as capacity allows. Skips (rather than blocks
   * on) jobs whose creator is at their per-creator cap, so one busy creator can't
   * head-of-line block everyone behind them.
   */
  private pump(): void {
    while (this.activeCount() < this.maxConcurrent) {
      const next = this.store
        .byState('queued')
        .find((job) => this.store.countActiveForCreator(job.creatorId) < this.maxConcurrentPerCreator);
      if (!next) break;
      // Marks the job active synchronously before the first await, so this loop
      // sees the updated capacity and can't over-dispatch.
      void this.dispatch(next);
    }
  }

  private async dispatch(job: GenerationJob): Promise<void> {
    this.transition(job, 'provisioning', { startedAt: this.now().toISOString() });

    try {
      const result = await this.runner(job, {
        onRunning: () => {
          if (job.state === 'provisioning') this.transition(job, 'running');
        },
      });
      this.transition(job, 'succeeded', { result, finishedAt: this.now().toISOString() });
    } catch (error) {
      this.transition(job, 'failed', {
        error: error instanceof Error ? error.message : String(error),
        finishedAt: this.now().toISOString(),
      });
    }

    // Bound memory: finished jobs hold a whole generated game each.
    this.store.pruneTerminal(this.maxRetainedJobs);

    // Capacity just freed — try to start whatever was waiting on it.
    this.pump();
    this.releaseIfIdle();
  }

  private transition(job: GenerationJob, state: JobState, patch: Partial<GenerationJob> = {}): void {
    job.state = state;
    Object.assign(job, patch);
    this.store.save(job);
  }

  private releaseIfIdle(): void {
    if (!this.isIdle()) return;
    while (this.idleWaiters.length > 0) {
      this.idleWaiters.shift()?.();
    }
  }
}
