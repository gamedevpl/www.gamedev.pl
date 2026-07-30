import { describe, expect, it } from 'vitest';
import { buildJobQueue } from './job-admin-routes.js';
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

describe('buildJobQueue', () => {
  it('puts stalled jobs first, however long the healthy ones have been running', () => {
    // The whole point of the view: one broken build must not be buried under nineteen
    // healthy ones that happen to be older.
    const queue = buildJobQueue(
      [
        record({ issueNumber: 1, state: 'building', stateSince: ago(90 * MINUTE), lastAgentSignalAt: ago(MINUTE) }),
        record({ issueNumber: 2, state: 'queued', stateSince: ago(20 * MINUTE) }),
      ],
      NOW,
    );

    expect(queue.jobs.map((job) => job.issueNumber)).toEqual([2, 1]);
    expect(queue.jobs[0].stall).toBe('not_dispatched');
    expect(queue.jobs[1].stall).toBeNull();
    expect(queue.stalled).toBe(1);
  });

  it('sorts healthy jobs by time in state, not by age', () => {
    // An old submission that only just entered `building` is less interesting than a
    // newer one that has been building far longer.
    const queue = buildJobQueue(
      [
        record({
          issueNumber: 1,
          createdAt: ago(10 * 60 * MINUTE),
          state: 'building',
          stateSince: ago(2 * MINUTE),
          lastAgentSignalAt: ago(MINUTE),
        }),
        record({
          issueNumber: 2,
          createdAt: ago(60 * MINUTE),
          state: 'building',
          stateSince: ago(10 * MINUTE),
          lastAgentSignalAt: ago(MINUTE),
        }),
      ],
      NOW,
    );

    expect(queue.jobs.map((job) => job.issueNumber)).toEqual([2, 1]);
  });

  it('drops finished jobs — the queue is what still needs attention', () => {
    const queue = buildJobQueue(
      [
        record({ issueNumber: 1, state: 'published', stateSince: ago(MINUTE) }),
        record({ issueNumber: 2, state: 'canceled', stateSince: ago(MINUTE) }),
        record({ issueNumber: 3, state: 'building', stateSince: ago(MINUTE), lastAgentSignalAt: ago(MINUTE) }),
      ],
      NOW,
    );

    expect(queue.jobs.map((job) => job.issueNumber)).toEqual([3]);
  });

  it('includes jobs that predate adoption by falling back to the derived status', () => {
    // Otherwise the queue would fill in gradually as each job happened to be polled,
    // and would be misleadingly short exactly when it is first looked at.
    const queue = buildJobQueue([record({ issueNumber: 7, lastStatus: 'building' })], NOW);

    expect(queue.jobs).toHaveLength(1);
    expect(queue.jobs[0].state).toBe('building');
    expect(queue.jobs[0].timeInStateMs).toBe(30 * MINUTE);
  });

  it('shows both the internal state and what the creator is being told', () => {
    const queue = buildJobQueue([record({ issueNumber: 1, state: 'gating', stateSince: ago(MINUTE) })], NOW);

    expect(queue.jobs[0].state).toBe('gating');
    expect(queue.jobs[0].creatorStatus).toBe('building');
  });

  it('counts by state so the shape of the queue is answerable at a glance', () => {
    const queue = buildJobQueue(
      [
        record({ issueNumber: 1, state: 'queued', stateSince: ago(MINUTE) }),
        record({ issueNumber: 2, state: 'queued', stateSince: ago(MINUTE) }),
        record({ issueNumber: 3, state: 'building', stateSince: ago(MINUTE), lastAgentSignalAt: ago(MINUTE) }),
      ],
      NOW,
    );

    expect(queue.byState).toEqual({ queued: 2, building: 1 });
  });

  it('surfaces the recent history newest first', () => {
    const queue = buildJobQueue(
      [
        record({
          issueNumber: 1,
          state: 'building',
          stateSince: ago(MINUTE),
          lastAgentSignalAt: ago(MINUTE),
          transitions: [
            { to: 'queued', at: ago(20 * MINUTE), by: 'creator' },
            { to: 'dispatched', at: ago(10 * MINUTE), by: 'reconciler' },
            { to: 'building', at: ago(MINUTE), by: 'reconciler' },
          ],
        }),
      ],
      NOW,
    );

    expect(queue.jobs[0].recentTransitions.map((t) => t.to)).toEqual(['building', 'dispatched', 'queued']);
  });

  it('prefers what the agent reports over inference', () => {
    const queue = buildJobQueue(
      [
        record({
          issueNumber: 1,
          state: 'building',
          stateSince: ago(MINUTE),
          lastAgentSignalAt: ago(MINUTE),
          agentState: 'waiting_for_user',
        }),
      ],
      NOW,
    );

    expect(queue.jobs[0].stall).toBe('awaiting_input');
  });
});
