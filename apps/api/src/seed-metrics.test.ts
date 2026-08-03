import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { logSeedStagingFailure, SEED_STAGING_FAILED_MSG } from './seed-metrics.js';

const here = dirname(fileURLToPath(import.meta.url));

/** Captures what a pino logger would have been handed. */
function fakeLog() {
  const errors: Array<{ obj: unknown; msg: unknown }> = [];
  return {
    errors,
    logger: { error: (obj: object, msg: string) => errors.push({ obj, msg }) },
  };
}

describe('logSeedStagingFailure', () => {
  it('uses a stable message, because a log filter matches on it', () => {
    // If this string changes, the log-based metric in infra/setup-monitoring.sh stops
    // matching and A23 goes quiet without failing — the worst shape of breakage, and
    // exactly the shape this whole alert exists to prevent for seeding itself.
    const { errors, logger } = fakeLog();
    logSeedStagingFailure(logger, { issueNumber: 9, compiles: true, ms: 41_000, mutedForMs: 600_000 });

    expect(SEED_STAGING_FAILED_MSG).toBe('seed staging failed');
    expect(errors[0]?.msg).toBe(SEED_STAGING_FAILED_MSG);
  });

  it('records what was lost, not just that something was', () => {
    // The first question after the email is "how bad" — a draft that compiled was a
    // playable round-0 preview the creator did not get, and one that did not was a head
    // start the agent did not get. Both are worth the alert; only one is worth a hurry.
    const { errors, logger } = fakeLog();
    logSeedStagingFailure(logger, { issueNumber: 9, compiles: true, ms: 41_000, mutedForMs: 600_000 });

    expect(errors[0]?.obj).toEqual({ seed: { issueNumber: 9, compiles: true, ms: 41_000, mutedForMs: 600_000 } });
  });
});

/**
 * The other half of the two-file contract.
 *
 * Same discipline as moderation-metrics.test.ts, for the same reason: a filter that
 * matches zero entries produces a metric that is always zero, and a metric that is always
 * zero reads exactly like "seeding is healthy". Nothing else in the system would notice.
 */
describe('the alert that reads these logs', () => {
  const script = readFileSync(resolve(here, '../../../infra/setup-monitoring.sh'), 'utf8');

  it('filters on the message this module emits', () => {
    expect(script).toContain(SEED_STAGING_FAILED_MSG);
    expect(script).toContain('seed_staging_failures');
  });

  it('is scoped to the app service rather than the whole project', () => {
    // The relay and the zone host run the same image and seed nothing. A project-wide
    // filter would silently include them.
    expect(script).toMatch(/seed_staging_failures[\s\S]{0,600}resource\.labels\.service_name/);
  });

  it('scopes the alert policy too, not only the metric behind it', () => {
    // Asserted separately because the metric is editable in the Console: widening its
    // filter would turn A23 project-wide without this file changing.
    const policy = script.slice(script.indexOf('A23 seeded builds cannot place their drafts'));
    expect(policy).toContain('logging.googleapis.com/user/seed_staging_failures');
    expect(policy.slice(0, 800)).toContain('service_name');
  });

  it('names a first thing to check, because the cause is never in this service', () => {
    // The log line says a commit failed; it cannot say the PAT lost a scope. An operator
    // reading A23 at 7am should not have to rediscover that, which is what happened the
    // first time — the diagnosis took a round-trip through Cloud Logging by hand.
    const policy = script.slice(script.indexOf('A23 seeded builds cannot place their drafts'));
    const documentation = policy.slice(0, policy.indexOf('EOF'));
    expect(documentation).toContain('credential-ledger.md');
    expect(documentation).toContain('SEED_DISPATCH');
  });
});

describe('the only place that reports a staging failure', () => {
  it('is submissions.ts, through this module', () => {
    // The counter is only worth alerting on if every staging failure reaches it. There is
    // one site today; this exists so that a second one has to be a deliberate choice
    // rather than a `log.error` that looks the same and counts for nothing.
    const submissions = readFileSync(resolve(here, 'submissions.ts'), 'utf8');
    expect(submissions).toContain('logSeedStagingFailure(');
    // The prose the metric used to have to match, gone rather than reworded. It said the
    // same thing in a sentence a future edit would have felt free to improve.
    expect(submissions).not.toContain('pausing seeding rather than generating drafts');
  });
});
