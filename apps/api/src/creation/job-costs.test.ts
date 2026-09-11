import { describe, expect, it } from 'vitest';
import { buildCostReport } from './job-costs.js';
import type { JobCostEntry, SubmissionRecord } from '../platform/store.js';

const NOW = Date.parse('2026-07-30T12:00:00Z');
const MINUTE = 60_000;
const ago = (ms: number) => new Date(NOW - ms).toISOString();

function session(at: string): JobCostEntry {
  return { kind: 'agent_session', at, by: 'copilot', ref: 'task-1', credits: 1 };
}

function gateRun(at: string): JobCostEntry {
  return { kind: 'gate_run', at, by: 'cloud-build', ref: 'build-1' };
}

function record(overrides: Partial<SubmissionRecord> & { jobId: number }): SubmissionRecord {
  return {
    ownerUid: 'g:1',
    title: 'A game',
    createdAt: ago(60 * MINUTE),
    ...overrides,
  };
}

describe('buildCostReport', () => {
  it('counts what was billed, not what succeeded', () => {
    // Three sessions for one published game is the real cost of that game. A report
    // that only counted the round that shipped would understate building by two thirds.
    const report = buildCostReport([
      record({
        jobId: 1,
        state: 'published',
        publishedAt: ago(5 * MINUTE),
        costs: [
          session(ago(50 * MINUTE)),
          session(ago(30 * MINUTE)),
          session(ago(10 * MINUTE)),
          gateRun(ago(6 * MINUTE)),
        ],
      }),
    ]);

    expect(report.totals).toMatchObject({ jobs: 1, sessions: 3, credits: 3, gateRuns: 1, published: 1 });
    expect(report.creditsPerPublishedGame).toBe(3);
  });

  it('charges failed builds to the price of a published one', () => {
    // The denominator is games that shipped; the numerator is every credit spent. That
    // is what "what does a game cost" means when a third of builds produce nothing.
    const report = buildCostReport([
      record({ jobId: 1, state: 'published', publishedAt: ago(MINUTE), costs: [session(ago(20 * MINUTE))] }),
      record({ jobId: 2, state: 'failed', costs: [session(ago(40 * MINUTE)), session(ago(35 * MINUTE))] }),
    ]);

    expect(report.creditsPerPublishedGame).toBe(3);
    expect(report.creditsOnUnpublished).toBe(2);
  });

  it('prices credits in money, because the rate is fixed rather than estimated', () => {
    // 100 credits to the dollar, published by GitHub. Converting is arithmetic, not a
    // guess, so the money column is a measurement and not a placeholder.
    const report = buildCostReport([
      record({ jobId: 1, costs: [session(ago(20 * MINUTE)), session(ago(10 * MINUTE))] }),
    ]);

    expect(report.jobs[0].usd).toBe(0.02);
    expect(report.totals.usd).toBe(0.02);
  });

  it('still reports tokens as absent rather than as zero', () => {
    // Copilot exposes no token counts, and a zero would read as a measurement that came
    // back empty instead of one that was never taken.
    const report = buildCostReport([record({ jobId: 1, costs: [session(ago(10 * MINUTE))] })]);

    expect(report.totals.tokens).toBeUndefined();
    expect(report.jobs[0].tokens).toBeUndefined();
  });

  it('leaves money absent on a job nothing was ever billed to', () => {
    // A job dispatched before the ledger existed has no spending to convert. $0.00 would
    // say it was free; a dash says it was never measured.
    const report = buildCostReport([record({ jobId: 1, state: 'published', publishedAt: ago(MINUTE) })]);

    expect(report.jobs[0].usd).toBeUndefined();
    expect(report.totals.usd).toBeUndefined();
  });

  it('leaves money absent on a ledger that holds only unpriced entries', () => {
    // Having a ledger is not the same as having a price. A gate run books an entry with
    // neither credits nor dollars, because Cloud Build minutes are billed and nothing
    // reads the price back — so "no figure" here means unpriced, not free.
    const report = buildCostReport([record({ jobId: 1, costs: [gateRun(ago(10 * MINUTE))] })]);

    expect(report.jobs[0].gateRuns).toBe(1);
    expect(report.jobs[0].usd).toBeUndefined();
    expect(report.unmeasuredJobs).toBe(0);
  });

  it('prices a published game and the builds that never shipped', () => {
    const report = buildCostReport([
      record({ jobId: 1, state: 'published', publishedAt: ago(MINUTE), costs: [session(ago(20 * MINUTE))] }),
      record({ jobId: 2, state: 'failed', costs: [session(ago(40 * MINUTE)), session(ago(35 * MINUTE))] }),
    ]);

    // Three credits spent, one game shipped: three cents a game, two of them wasted.
    expect(report.usdPerPublishedGame).toBe(0.03);
    expect(report.usdOnUnpublished).toBe(0.02);
  });

  it('adds directly-priced spending to converted credits rather than replacing it', () => {
    // A backend that bills dollars and a backend that bills credits are different
    // spending on the same job, not two readings of the same spending.
    const report = buildCostReport([
      record({
        jobId: 1,
        costs: [session(ago(20 * MINUTE)), { kind: 'agent_session', at: ago(10 * MINUTE), by: 'backend-b', usd: 0.4 }],
      }),
    ]);

    expect(report.jobs[0].usd).toBe(0.41);
  });

  it('adds up tokens and money once a backend does report them', () => {
    const report = buildCostReport([
      record({
        jobId: 1,
        costs: [
          { kind: 'agent_session', at: ago(20 * MINUTE), by: 'backend-b', tokens: { input: 1000, output: 250 } },
          {
            kind: 'agent_session',
            at: ago(10 * MINUTE),
            by: 'backend-b',
            tokens: { input: 500, output: 125 },
            usd: 0.4,
          },
        ],
      }),
    ]);

    expect(report.totals.tokens).toEqual({ input: 1500, output: 375 });
    expect(report.totals.usd).toBe(0.4);
  });

  it('says how many jobs it could not measure, so a small total is not read as cheap', () => {
    const report = buildCostReport([
      record({ jobId: 1, costs: [session(ago(10 * MINUTE))] }),
      // Dispatched before any of this recorded anything.
      record({ jobId: 2, state: 'published', publishedAt: ago(MINUTE) }),
    ]);

    expect(report.unmeasuredJobs).toBe(1);
    expect(report.totals.credits).toBe(1);
  });

  it('puts the most expensive job first, which is where a runaway hides', () => {
    const report = buildCostReport([
      record({ jobId: 1, costs: [session(ago(10 * MINUTE))] }),
      record({ jobId: 2, costs: [session(ago(50 * MINUTE)), session(ago(40 * MINUTE))] }),
    ]);

    expect(report.jobs.map((job) => job.jobId)).toEqual([2, 1]);
  });

  it('has no answer at all before anything has published', () => {
    const report = buildCostReport([record({ jobId: 1, state: 'building', costs: [session(ago(10 * MINUTE))] })]);

    expect(report.creditsPerPublishedGame).toBeNull();
    expect(report.medianTimeToPublishMs).toBeNull();
  });

  it('measures elapsed time to the last thing that happened, not to now', () => {
    // Otherwise every finished job would keep getting more expensive in wall-clock terms
    // the longer ago it finished.
    const report = buildCostReport([
      record({
        jobId: 1,
        createdAt: ago(120 * MINUTE),
        state: 'published',
        publishedAt: ago(60 * MINUTE),
        costs: [session(ago(119 * MINUTE))],
      }),
    ]);

    expect(report.jobs[0].elapsedMs).toBe(60 * MINUTE);
    expect(report.medianTimeToPublishMs).toBe(60 * MINUTE);
  });
});
