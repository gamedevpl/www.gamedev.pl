import { describe, expect, it } from 'vitest';
import {
  detectOperatorAlerts,
  detectSeedingDegraded,
  FAILED_ALERT_WINDOW_MS,
  FEEDBACK_STALL_MS,
  SEEDING_DEGRADED_WINDOW_MS,
} from './operator-alerts.js';
import type { JobSeedOutcome, SubmissionRecord } from '../store.js';

const NOW = Date.parse('2026-07-30T12:00:00Z');
const MINUTE = 60_000;
const ago = (ms: number) => new Date(NOW - ms).toISOString();

function record(overrides: Partial<SubmissionRecord> & { issueNumber: number }): SubmissionRecord {
  return {
    ownerUid: 'g:1',
    title: 'A game',
    createdAt: ago(30 * MINUTE),
    ...overrides,
  };
}

describe('detectOperatorAlerts', () => {
  it('says nothing about a build that is simply taking a while', () => {
    // The property the whole channel depends on: a job reporting progress is not an
    // alert, however long it has been running. Get this wrong and every alert is noise.
    const alerts = detectOperatorAlerts(
      [record({ issueNumber: 1, state: 'building', stateSince: ago(180 * MINUTE), lastAgentSignalAt: ago(MINUTE) })],
      NOW,
    );

    expect(alerts).toEqual([]);
  });

  it('flags a gate-green build waiting on the publish decision', () => {
    const alerts = detectOperatorAlerts(
      [record({ issueNumber: 1_000_001, state: 'ready_for_review', stateSince: ago(5 * MINUTE), slug: 'comet' })],
      NOW,
    );

    expect(alerts).toEqual([
      {
        id: 'op-1000001-review_ready',
        kind: 'review_ready',
        issueNumber: 1_000_001,
        title: 'A game',
        ownerUid: 'g:1',
        slug: 'comet',
        since: ago(5 * MINUTE),
      },
    ]);
  });

  it('flags a stall and says which kind, so the fix is legible', () => {
    const alerts = detectOperatorAlerts(
      [
        record({
          issueNumber: 2,
          state: 'building',
          stateSince: ago(60 * MINUTE),
          lastAgentSignalAt: ago(40 * MINUTE),
        }),
      ],
      NOW,
    );

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ kind: 'build_stalled', stall: 'quiet' });
  });

  it('forgets a failure once it is old news', () => {
    const fresh = record({ issueNumber: 3, state: 'failed', stateSince: ago(2 * 60 * MINUTE) });
    const ancient = record({ issueNumber: 4, state: 'failed', stateSince: ago(FAILED_ALERT_WINDOW_MS + MINUTE) });

    const alerts = detectOperatorAlerts([fresh, ancient], NOW);

    expect(alerts.map((alert) => alert.issueNumber)).toEqual([3]);
  });

  it('ignores finished and abandoned work', () => {
    const alerts = detectOperatorAlerts(
      [
        record({ issueNumber: 5, state: 'published', stateSince: ago(MINUTE) }),
        record({ issueNumber: 6, state: 'canceled', stateSince: ago(MINUTE) }),
        // Abandoned by the creator while it happened to be stalled: their decision ends it.
        record({ issueNumber: 7, state: 'building', stateSince: ago(90 * MINUTE), abandonedAt: ago(MINUTE) }),
      ],
      NOW,
    );

    expect(alerts).toEqual([]);
  });

  it('sees a legacy record through its last derived status', () => {
    // Records that predate the job model carry no state at all. Missing them would make
    // the console quietly wrong about exactly the builds most likely to be stuck.
    const alerts = detectOperatorAlerts(
      [record({ issueNumber: 8, lastStatus: 'in_review', stateSince: ago(MINUTE) })],
      NOW,
    );

    expect(alerts).toHaveLength(1);
    expect(alerts[0].kind).toBe('review_ready');
  });

  it('puts the publish decision above a stall, and the longest wait first', () => {
    const alerts = detectOperatorAlerts(
      [
        record({ issueNumber: 10, state: 'failed', stateSince: ago(MINUTE) }),
        record({ issueNumber: 11, state: 'queued', stateSince: ago(30 * MINUTE) }),
        record({ issueNumber: 12, state: 'ready_for_review', stateSince: ago(2 * MINUTE) }),
        record({ issueNumber: 13, state: 'ready_for_review', stateSince: ago(20 * MINUTE) }),
      ],
      NOW,
    );

    expect(alerts.map((alert) => alert.issueNumber)).toEqual([13, 12, 11, 10]);
  });
});

describe('detectOperatorAlerts — undelivered change requests', () => {
  it('flags a request no agent has collected past the threshold', () => {
    // The job itself looks healthy, and that is the point: the relay that wakes an
    // agent for a change request can be down while the build it should reach is fine.
    const alerts = detectOperatorAlerts(
      [record({ issueNumber: 20, state: 'building', stateSince: ago(MINUTE), lastAgentSignalAt: ago(MINUTE) })],
      NOW,
      new Map([[20, ago(FEEDBACK_STALL_MS + MINUTE)]]),
    );

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ kind: 'feedback_undelivered', issueNumber: 20 });
  });

  it('leaves a fresh request alone', () => {
    const alerts = detectOperatorAlerts(
      [record({ issueNumber: 21, state: 'building', stateSince: ago(MINUTE), lastAgentSignalAt: ago(MINUTE) })],
      NOW,
      new Map([[21, ago(5 * MINUTE)]]),
    );

    expect(alerts).toEqual([]);
  });

  it('answers without it when the caller cannot afford the reads', () => {
    // A smaller answer, never a wrong one: the other three kinds still come back.
    const alerts = detectOperatorAlerts([record({ issueNumber: 22, state: 'ready_for_review' })], NOW);

    expect(alerts.map((alert) => alert.kind)).toEqual(['review_ready']);
  });

  it('outranks a stall on the same job — the relay is the thing that is broken', () => {
    const alerts = detectOperatorAlerts(
      [record({ issueNumber: 23, state: 'building', stateSince: ago(90 * MINUTE) })],
      NOW,
      new Map([[23, ago(FEEDBACK_STALL_MS + MINUTE)]]),
    );

    expect(alerts.map((alert) => alert.kind)).toEqual(['feedback_undelivered']);
  });
});

describe('detectOperatorAlerts — records the state machine cannot read', () => {
  it('still reports an uncollected change request on a record with no state at all', () => {
    // The sweep's alert pass reads the records it fetched before deriving anything, so a
    // job on its first sweep has neither `state` nor `lastStatus`. Skipping it as
    // unreadable would silently exempt exactly the newest jobs.
    const alerts = detectOperatorAlerts(
      [record({ issueNumber: 30 })],
      NOW,
      new Map([[30, ago(FEEDBACK_STALL_MS + MINUTE)]]),
    );

    expect(alerts.map((alert) => alert.kind)).toEqual(['feedback_undelivered']);
  });

  it('says nothing about a message left on finished work', () => {
    const alerts = detectOperatorAlerts(
      [record({ issueNumber: 31, state: 'canceled' })],
      NOW,
      new Map([[31, ago(FEEDBACK_STALL_MS + MINUTE)]]),
    );

    expect(alerts).toEqual([]);
  });
});

describe('detectSeedingDegraded', () => {
  const outcome = (overrides: Partial<JobSeedOutcome> & { at: string }): JobSeedOutcome => ({
    generated: true,
    references: ['comet-courier'],
    ms: 40_000,
    compiles: true,
    repaired: false,
    staged: false,
    ...overrides,
  });

  // A round 0 that produced nothing — the 2026-08 outage's shape.
  const nothing = (at: string): JobSeedOutcome =>
    outcome({ at, generated: false, reason: 'seeder_declined', references: [], ms: 0, compiles: false });

  it('says nothing when seeding has never run', () => {
    expect(detectSeedingDegraded([], NOW)).toBeNull();
  });

  it('says nothing about one failure — GitHub has bad minutes', () => {
    expect(detectSeedingDegraded([outcome({ at: ago(MINUTE) })], NOW)).toBeNull();
  });

  it('raises once two in a row could not be placed', () => {
    const alert = detectSeedingDegraded([outcome({ at: ago(MINUTE) }), outcome({ at: ago(30 * MINUTE) })], NOW);

    expect(alert).toMatchObject({
      kind: 'seeding_degraded',
      id: 'op-seeding-degraded-2026-07-30',
      // The oldest of the run, so the age reads as how long this has been broken rather
      // than how long ago the last build was.
      since: ago(30 * MINUTE),
    });
    // No job to point at: this is about the platform, and rendering #0 would send an
    // operator looking for a job that does not exist.
    expect(alert?.issueNumber).toBeUndefined();
  });

  it('stays quiet when placing plainly works for some of them', () => {
    // A mix is a per-draft problem, not a broken credential — and alerting on it would
    // mean the one channel that says "your plumbing is down" also says other things.
    const alert = detectSeedingDegraded(
      [outcome({ at: ago(MINUTE) }), outcome({ at: ago(2 * MINUTE) }), outcome({ at: ago(30 * MINUTE), staged: true })],
      NOW,
    );

    expect(alert).toBeNull();
  });

  it('raises when round 0 generated nothing at all, not only when placing failed', () => {
    const alert = detectSeedingDegraded([nothing(ago(MINUTE)), nothing(ago(30 * MINUTE))], NOW);

    expect(alert).toMatchObject({ kind: 'seeding_degraded', since: ago(30 * MINUTE) });
  });

  it('counts a generation failure and a placement failure as the same outage', () => {
    const alert = detectSeedingDegraded([nothing(ago(MINUTE)), outcome({ at: ago(20 * MINUTE) })], NOW);

    expect(alert).toMatchObject({ kind: 'seeding_degraded' });
  });

  it('stays quiet when a generated draft did land', () => {
    const alert = detectSeedingDegraded([nothing(ago(MINUTE)), outcome({ at: ago(20 * MINUTE), staged: true })], NOW);

    expect(alert).toBeNull();
  });

  it('names the provider in the title when every failure shares one (SP-12)', () => {
    const alert = detectSeedingDegraded(
      [
        { ...nothing(ago(MINUTE)), provider: 'anthropic' },
        { ...nothing(ago(30 * MINUTE)), provider: 'anthropic' },
      ],
      NOW,
    );

    expect(alert?.title).toBe('The last 2 new games (anthropic)');
  });

  it('leaves the title generic when the run mixes providers — a wrong guess is worse', () => {
    const alert = detectSeedingDegraded(
      [
        { ...nothing(ago(MINUTE)), provider: 'anthropic' },
        { ...nothing(ago(30 * MINUTE)), provider: 'vertex' },
      ],
      NOW,
    );

    expect(alert?.title).toBe('The last 2 new games');
  });

  it('treats a legacy no-provider failure as vertex, not as a name-free wildcard', () => {
    // A missing provider must not be misread as "every failure is anthropic".
    const alert = detectSeedingDegraded(
      [nothing(ago(MINUTE)), { ...nothing(ago(30 * MINUTE)), provider: 'anthropic' }],
      NOW,
    );

    expect(alert?.title).toBe('The last 2 new games');
  });

  it('forgets failures older than the window', () => {
    const alert = detectSeedingDegraded(
      [outcome({ at: ago(SEEDING_DEGRADED_WINDOW_MS + MINUTE) }), outcome({ at: ago(SEEDING_DEGRADED_WINDOW_MS * 2) })],
      NOW,
    );

    expect(alert).toBeNull();
  });

  it('ignores an unreadable timestamp rather than counting it', () => {
    const alert = detectSeedingDegraded([outcome({ at: 'not a date' }), outcome({ at: ago(MINUTE) })], NOW);

    expect(alert).toBeNull();
  });

  it('re-alerts the next day, not the next sweep', () => {
    const outcomes = [outcome({ at: ago(MINUTE) }), outcome({ at: ago(30 * MINUTE) })];
    const first = detectSeedingDegraded(outcomes, NOW);
    const sameSweepAgain = detectSeedingDegraded(outcomes, NOW + MINUTE);
    const nextDay = detectSeedingDegraded(
      [outcome({ at: ago(-20 * 60 * MINUTE) }), ...outcomes],
      NOW + 20 * 60 * MINUTE,
    );

    expect(sameSweepAgain?.id).toBe(first?.id);
    expect(nextDay?.id).toBe('op-seeding-degraded-2026-07-31');
  });
});
