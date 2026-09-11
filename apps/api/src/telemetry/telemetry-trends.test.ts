import { describe, expect, it } from 'vitest';
import {
  periodKey,
  rollingAverage,
  rollupTrends,
  summarizeRetentionByEligibilityDay,
  summarizeVisitDay,
  trendPartitions,
} from './telemetry-trends.js';
import type { SubmissionRecord, User, VisitEvent } from '../platform/store.js';

function visit(partial: Partial<VisitEvent> & Pick<VisitEvent, 'visitId' | 'type'>): VisitEvent {
  return {
    at: '2026-08-01T12:00:00.000Z',
    msSinceStart: 0,
    ...partial,
  };
}

describe('summarizeVisitDay', () => {
  it('counts distinct visits, every play, and distinct creations', () => {
    const { activity } = summarizeVisitDay('2026-08-01', [
      visit({ visitId: 'a', type: 'visit_started' }),
      visit({ visitId: 'b', type: 'visit_started' }),
      visit({ visitId: 'a', type: 'play_started', msSinceStart: 1000 }),
      visit({ visitId: 'a', type: 'play_started', msSinceStart: 5000 }),
      visit({ visitId: 'a', type: 'create_step', step: 'prompt_started' }),
      visit({ visitId: 'a', type: 'create_step', step: 'submission_created' }),
      visit({ visitId: 'a', type: 'create_step', step: 'submission_created' }),
    ]);
    expect(activity).toEqual({
      date: '2026-08-01',
      visits: 2,
      plays: 2,
      creations: 1,
      truncated: false,
    });
  });

  it('counts MCP adoption rungs as distinct self visits', () => {
    const { mcp } = summarizeVisitDay('2026-08-01', [
      visit({ visitId: 'a', type: 'studio_step', step: 'builder_chosen', builder: 'self' }),
      visit({ visitId: 'b', type: 'studio_step', step: 'builder_chosen', builder: 'platform' }),
      visit({ visitId: 'a', type: 'studio_step', step: 'connect_copied', builder: 'self', detail: 'install' }),
      visit({ visitId: 'a', type: 'studio_step', step: 'connect_deeplink', builder: 'self', detail: 'cursor' }),
      visit({ visitId: 'a', type: 'studio_step', step: 'agent_signaled', builder: 'self' }),
      visit({ visitId: 'c', type: 'studio_step', step: 'gate_verdict', builder: 'self', detail: 'green' }),
    ]);
    expect(mcp).toEqual({
      date: '2026-08-01',
      selfChosen: 1,
      platformChosen: 1,
      connected: 1,
      signaled: 1,
      gateVerdicts: 1,
      truncated: false,
    });
  });

  it('marks the day truncated when the caller says so', () => {
    expect(summarizeVisitDay('2026-08-01', [], true).activity.truncated).toBe(true);
  });
});

describe('summarizeRetentionByEligibilityDay', () => {
  const NOW = Date.parse('2026-08-20T12:00:00.000Z');

  function submission(ownerUid: string, publishedAt: string): SubmissionRecord {
    return {
      jobId: Math.floor(Math.random() * 10_000),
      ownerUid,
      title: 't',
      createdAt: publishedAt,
      publishedAt,
      lastStatus: 'published',
    } as SubmissionRecord;
  }

  function user(uid: string, activeDays: string[]): User {
    return { uid, activeDays } as User;
  }

  it('plots D7 on the eligibility day, not the publish day', () => {
    // Published Aug 1 → eligible Aug 8. Returned on Aug 5.
    const points = summarizeRetentionByEligibilityDay(
      [submission('g:a', '2026-08-01T10:00:00.000Z')],
      new Map([['g:a', user('g:a', ['2026-08-01', '2026-08-05'])]]),
      ['2026-08-01', '2026-08-08'],
      NOW,
    );
    expect(points.find((row) => row.date === '2026-08-01')).toEqual({
      date: '2026-08-01',
      eligible: 0,
      returned: 0,
      rate: null,
    });
    expect(points.find((row) => row.date === '2026-08-08')).toEqual({
      date: '2026-08-08',
      eligible: 1,
      returned: 1,
      rate: 1,
    });
  });

  it('excludes bot creators and open windows', () => {
    const points = summarizeRetentionByEligibilityDay(
      [
        submission('bot:e2e', '2026-08-01T10:00:00.000Z'),
        submission('g:fresh', '2026-08-18T10:00:00.000Z'), // window still open at NOW
      ],
      new Map([
        ['bot:e2e', user('bot:e2e', ['2026-08-02'])],
        ['g:fresh', user('g:fresh', ['2026-08-19'])],
      ]),
      ['2026-08-08', '2026-08-25'],
      NOW,
    );
    expect(points.every((row) => row.eligible === 0)).toBe(true);
  });
});

describe('rollupTrends + rollingAverage', () => {
  it('sums activity into ISO weeks and averages retention', () => {
    const activity = [
      {
        date: '2026-08-03', // Monday
        visits: 10,
        plays: 5,
        creations: 1,
        truncated: false,
      },
      {
        date: '2026-08-04',
        visits: 20,
        plays: 8,
        creations: 0,
        truncated: false,
      },
    ];
    const mcp = [
      {
        date: '2026-08-03',
        selfChosen: 2,
        platformChosen: 1,
        connected: 1,
        signaled: 1,
        gateVerdicts: 0,
        truncated: false,
      },
      {
        date: '2026-08-04',
        selfChosen: 1,
        platformChosen: 0,
        connected: 1,
        signaled: 0,
        gateVerdicts: 1,
        truncated: false,
      },
    ];
    const retention = [
      { date: '2026-08-03', eligible: 2, returned: 1, rate: 0.5 },
      { date: '2026-08-04', eligible: 2, returned: 2, rate: 1 },
    ];
    const weeks = rollupTrends(activity, mcp, retention, 'week');
    expect(weeks).toHaveLength(1);
    expect(weeks[0]).toMatchObject({
      key: '2026-08-03',
      visits: 30,
      plays: 13,
      creations: 1,
      selfChosen: 3,
      connected: 2,
      signaled: 1,
      gateVerdicts: 1,
      retentionEligible: 4,
      retentionReturned: 3,
      retentionRate: 0.75,
    });
  });

  it('rolls a trailing mean and keeps nulls when nothing is measured', () => {
    expect(rollingAverage([1, 2, 3, 4], 2)).toEqual([1, 1.5, 2.5, 3.5]);
    expect(rollingAverage([null, 1, null, 3], 2)).toEqual([null, 1, 1, 3]);
  });
});

describe('periodKey + trendPartitions', () => {
  it('labels weeks from Monday and months as yyyy-mm', () => {
    expect(periodKey('2026-08-05', 'week')).toEqual({ key: '2026-08-03', label: 'w 08-03' });
    expect(periodKey('2026-08-05', 'month')).toEqual({ key: '2026-08', label: '2026-08' });
  });

  it('returns oldest-first partitions ending today', () => {
    const now = Date.parse('2026-08-06T12:00:00.000Z');
    expect(trendPartitions(3, now)).toEqual(['2026-08-04', '2026-08-05', '2026-08-06']);
  });
});
