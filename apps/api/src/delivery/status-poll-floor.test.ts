import { describe, expect, it } from 'vitest';
import { lastMovementAt, statusPollFloorMs } from './status-poll-floor.js';

describe('statusPollFloorMs', () => {
  it('asks for no floor on a terminal round, which the client stops polling anyway', () => {
    expect(statusPollFloorMs({ terminal: true, dispatched: false, msSinceMovement: 0 })).toBeUndefined();
  });

  it('lets session boot keep its fast cadence', () => {
    expect(statusPollFloorMs({ terminal: false, dispatched: true, msSinceMovement: 60 * 60_000 })).toBe(2_000);
  });

  it('widens once, and never past ten seconds', () => {
    const floor = (minutes: number) =>
      statusPollFloorMs({ terminal: false, dispatched: false, msSinceMovement: minutes * 60_000 });
    expect(floor(0)).toBe(3_000);
    expect(floor(1)).toBe(3_000);
    expect(floor(5)).toBe(10_000);
    // An agent can rejoin a round quiet for a day.
    expect(floor(20)).toBe(10_000);
    expect(floor(60 * 24)).toBe(10_000);
  });

  it('never slows the live feed on an unusable age', () => {
    for (const msSinceMovement of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      expect(statusPollFloorMs({ terminal: false, dispatched: false, msSinceMovement })).toBe(3_000);
    }
  });
});

describe('lastMovementAt', () => {
  it('takes the newest parseable stamp and ignores the rest', () => {
    expect(
      lastMovementAt(['2026-09-13T10:00:00.000Z', undefined, 'not-a-date', '2026-09-13T11:00:00.000Z']),
    ).toBe(Date.parse('2026-09-13T11:00:00.000Z'));
  });

  it('is undefined when nothing usable is known', () => {
    expect(lastMovementAt([])).toBeUndefined();
    expect(lastMovementAt([undefined, 'nope'])).toBeUndefined();
  });
});
