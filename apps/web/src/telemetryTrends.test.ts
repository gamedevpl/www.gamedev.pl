import { describe, expect, it } from 'vitest';
import { rollingAverage, rollingPeriods, rollupTrends } from './telemetryTrends.js';

describe('telemetryTrends rollups', () => {
  it('passes daily points through and rolls weeks including MCP rungs', () => {
    const activity = [
      { date: '2026-08-03', visits: 10, plays: 4, creations: 1, truncated: false },
      { date: '2026-08-04', visits: 5, plays: 2, creations: 0, truncated: false },
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
        selfChosen: 0,
        platformChosen: 1,
        connected: 0,
        signaled: 0,
        gateVerdicts: 1,
        truncated: false,
      },
    ];
    const retention = [
      { date: '2026-08-03', eligible: 2, returned: 1, rate: 0.5 },
      { date: '2026-08-04', eligible: 0, returned: 0, rate: null },
    ];
    expect(rollupTrends(activity, mcp, retention, 'day')).toHaveLength(2);
    expect(rollupTrends(activity, mcp, retention, 'week')[0]).toMatchObject({
      visits: 15,
      plays: 6,
      creations: 1,
      selfChosen: 2,
      platformChosen: 2,
      connected: 1,
      signaled: 1,
      gateVerdicts: 1,
      retentionEligible: 2,
      retentionReturned: 1,
      retentionRate: 0.5,
    });
  });

  it('maps calendar rolling windows onto grain periods', () => {
    expect(rollingPeriods('day', 7)).toBe(7);
    expect(rollingPeriods('week', 28)).toBe(4);
    expect(rollingPeriods('month', 28)).toBe(1);
    expect(rollingAverage([2, 4, 6], 2)).toEqual([2, 3, 5]);
  });
});
