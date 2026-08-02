/**
 * Seed staging failures, made visible to Cloud Monitoring (alert A23).
 *
 * Seeding fails open at every level, which is right — a creator's build must never die
 * because an optimization did — and it means the whole feature can stop working without
 * anything going red. That is not hypothetical: the first live seeded build generated a
 * draft, could not commit it (the dispatch PAT had no `Contents: write` on the games
 * repo), discarded it, and dispatched normally. The build looked fine. The only evidence
 * was one log line, and nobody was reading it.
 *
 * So the failure emits one structured line, from here and nowhere else, and a log-based
 * metric in `infra/setup-monitoring.sh` counts it. The message string below is the
 * operational contract between this file and that one — `seed-metrics.test.ts` asserts it
 * from both sides, because a filter that matches nothing produces a metric that is always
 * zero, which reads exactly like "seeding is fine".
 *
 * Watched in Cloud Monitoring rather than through the in-app operator alerts for a reason
 * worth keeping: this is the platform's own plumbing, and an alert about it that travels
 * through the platform's sweep, its store, its notification table and its mail provider
 * shares a fate with the thing it is watching. The console badge still reports it (see
 * `detectSeedingDegraded`), because that is where an operator would act — but the thing
 * that has to reach an inbox when the app is having a bad day does not run in the app.
 */

/** The stable message every staging failure logs. The A23 log filter matches on it. */
export const SEED_STAGING_FAILED_MSG = 'seed staging failed';

export interface SeedStagingFailure {
  issueNumber: number;
  /** Whether the discarded draft would have bundled — how much was actually lost. */
  compiles: boolean;
  /** How long generating it took, so the wasted wall-clock is a number. */
  ms: number;
  /** How long seeding is muted for, so the email can say what happens next. */
  mutedForMs: number;
}

interface Logger {
  error: (context: object, message: string) => void;
}

/**
 * Record one seed that was generated and could not be placed.
 *
 * `error` severity, unlike the moderation counterpart's `warn`: a rejected comment is the
 * system working, and this is money spent on a draft that reached nobody. It is also the
 * severity Logs Explorer defaults to surfacing, which is where an operator looks first.
 */
export function logSeedStagingFailure(log: Logger, failure: SeedStagingFailure): void {
  log.error(
    {
      seed: {
        issueNumber: failure.issueNumber,
        compiles: failure.compiles,
        ms: failure.ms,
        mutedForMs: failure.mutedForMs,
      },
    },
    SEED_STAGING_FAILED_MSG,
  );
}
