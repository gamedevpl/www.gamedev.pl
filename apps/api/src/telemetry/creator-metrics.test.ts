import { describe, expect, it } from 'vitest';
import { returnedAfterPublish, summarizeCreatorMetrics } from './creator-metrics.js';
import type { SubmissionRecord, User } from '../platform/store.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-08-01T12:00:00.000Z');

function submission(partial: Partial<SubmissionRecord> & { issueNumber: number }): SubmissionRecord {
  return {
    ownerUid: 'g:a',
    createdAt: '2026-07-01T10:00:00.000Z',
    title: 'A game',
    ...partial,
  } as SubmissionRecord;
}

function user(uid: string, activeDays: string[]): User {
  return { uid, activeDays } as User;
}

describe('returnedAfterPublish', () => {
  it('ignores activity on the publish day itself', () => {
    // The creator is almost always watching when their own build lands; counting that
    // would report a D7 rate near 100% that means nothing.
    expect(returnedAfterPublish(['2026-07-10'], '2026-07-10T09:00:00.000Z')).toBe(false);
  });

  it('counts a return on a later day inside the window', () => {
    expect(returnedAfterPublish(['2026-07-12'], '2026-07-10T09:00:00.000Z')).toBe(true);
  });

  it('does not count a return after the window closed', () => {
    expect(returnedAfterPublish(['2026-07-25'], '2026-07-10T09:00:00.000Z')).toBe(false);
  });

  it('still finds an early return when a later visit is also recorded', () => {
    // The exact case a single `lastSeenAt` timestamp gets wrong: day 2 and day 30 look
    // identical to day 30 alone.
    expect(returnedAfterPublish(['2026-08-09', '2026-07-12'], '2026-07-10T09:00:00.000Z')).toBe(true);
  });

  it('treats missing history as no return rather than throwing', () => {
    expect(returnedAfterPublish(undefined, '2026-07-10T09:00:00.000Z')).toBe(false);
  });
});

describe('summarizeCreatorMetrics', () => {
  it('excludes creators whose 7 days have not elapsed yet', () => {
    const justPublished = new Date(NOW - 2 * DAY).toISOString();
    const metrics = summarizeCreatorMetrics(
      [submission({ issueNumber: 1, ownerUid: 'g:a', publishedAt: justPublished })],
      new Map([['g:a', user('g:a', [])]]),
      NOW,
    );

    // Not a failure to return — no chance to yet. Counting it would drag the rate down
    // every time a new game ships.
    expect(metrics.published).toBe(1);
    expect(metrics.eligibleForReturn).toBe(0);
    expect(metrics.d7ReturnRate).toBeNull();
  });

  it('computes the return rate over eligible creators', () => {
    const metrics = summarizeCreatorMetrics(
      [
        submission({ issueNumber: 1, ownerUid: 'g:a', publishedAt: '2026-07-10T09:00:00.000Z' }),
        submission({ issueNumber: 2, ownerUid: 'g:b', publishedAt: '2026-07-10T09:00:00.000Z' }),
      ],
      new Map([
        ['g:a', user('g:a', ['2026-07-12'])],
        ['g:b', user('g:b', [])],
      ]),
      NOW,
    );

    expect(metrics.eligibleForReturn).toBe(2);
    expect(metrics.returnedWithin7Days).toBe(1);
    expect(metrics.d7ReturnRate).toBe(0.5);
  });

  it('counts a prolific creator once, not once per game', () => {
    const metrics = summarizeCreatorMetrics(
      [
        submission({ issueNumber: 1, ownerUid: 'g:a', publishedAt: '2026-07-10T09:00:00.000Z' }),
        submission({ issueNumber: 2, ownerUid: 'g:a', publishedAt: '2026-07-11T09:00:00.000Z' }),
        submission({ issueNumber: 3, ownerUid: 'g:a', publishedAt: '2026-07-12T09:00:00.000Z' }),
      ],
      new Map([['g:a', user('g:a', [])]]),
      NOW,
    );

    expect(metrics.creators).toBe(1);
    expect(metrics.eligibleForReturn).toBe(1);
    expect(metrics.gamesPerCreator).toBe(3);
  });

  it('reports build duration as median and slow tail', () => {
    const builds = [10, 20, 30, 40, 300].map((minutes, index) =>
      submission({
        issueNumber: index + 1,
        ownerUid: `g:${index}`,
        createdAt: '2026-07-01T10:00:00.000Z',
        publishedAt: new Date(Date.parse('2026-07-01T10:00:00.000Z') + minutes * 60_000).toISOString(),
      }),
    );

    const metrics = summarizeCreatorMetrics(builds, new Map(), NOW);
    expect(metrics.medianBuildMinutes).toBe(30);
    // The tail is the point: a median of 30 hides the creator who waited five hours.
    expect(metrics.p90BuildMinutes).toBe(300);
  });

  it('ignores submissions that never published', () => {
    const metrics = summarizeCreatorMetrics(
      [
        submission({ issueNumber: 1, ownerUid: 'g:a' }),
        submission({ issueNumber: 2, ownerUid: 'g:a', abandonedAt: 'x' }),
      ],
      new Map(),
      NOW,
    );
    expect(metrics.published).toBe(0);
    expect(metrics.medianBuildMinutes).toBeNull();
  });

  it('survives an empty window', () => {
    const metrics = summarizeCreatorMetrics([], new Map(), NOW);
    expect(metrics).toMatchObject({ published: 0, creators: 0, d7ReturnRate: null, gamesPerCreator: null });
  });
});
