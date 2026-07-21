/**
 * Per-job spend limiting.
 *
 * The token design means a subverted agent can't steal the provider key — but it
 * could still burn money by looping model calls. This bounds that: each job gets a
 * fixed allowance of upstream requests, and the proxy refuses once it's spent.
 *
 * In-memory, like the orchestrator's queue: fine for a single instance, and it must
 * be replaced with shared storage before running more than one proxy (otherwise the
 * cap is per-instance rather than per-job). See docs/deployment.md.
 */
export class BudgetExceededError extends Error {
  constructor(jobId: string, limit: number) {
    super(`job ${jobId} exceeded its budget of ${limit} upstream requests`);
    this.name = 'BudgetExceededError';
  }
}

export interface JobUsage {
  requests: number;
  firstSeenAt: number;
  lastSeenAt: number;
}

export class BudgetTracker {
  private readonly usage = new Map<string, JobUsage>();

  constructor(
    private readonly maxRequestsPerJob = 100,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records one upstream request for a job, or throws if it's over budget. */
  charge(jobId: string): JobUsage {
    const at = this.now();
    const current = this.usage.get(jobId) ?? { requests: 0, firstSeenAt: at, lastSeenAt: at };

    if (current.requests >= this.maxRequestsPerJob) {
      throw new BudgetExceededError(jobId, this.maxRequestsPerJob);
    }

    const next: JobUsage = { ...current, requests: current.requests + 1, lastSeenAt: at };
    this.usage.set(jobId, next);
    return next;
  }

  get(jobId: string): JobUsage | undefined {
    return this.usage.get(jobId);
  }

  /**
   * Drops usage records older than `maxAgeMs`. Jobs are short-lived and their
   * tokens expire, so retaining usage forever would leak memory.
   */
  prune(maxAgeMs: number): number {
    const cutoff = this.now() - maxAgeMs;
    let removed = 0;
    for (const [jobId, usage] of this.usage) {
      if (usage.lastSeenAt < cutoff) {
        this.usage.delete(jobId);
        removed += 1;
      }
    }
    return removed;
  }
}
