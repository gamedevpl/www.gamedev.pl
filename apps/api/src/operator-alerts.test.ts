import { describe, expect, it } from 'vitest';
import { detectOperatorAlerts, FAILED_ALERT_WINDOW_MS } from './operator-alerts.js';
import type { SubmissionRecord } from './store.js';

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
