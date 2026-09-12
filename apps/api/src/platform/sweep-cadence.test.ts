import { describe, expect, it } from 'vitest';
import {
  RECHECK_HOURLY_MS,
  RECHECK_NOW_MS,
  RECHECK_TEN_MINUTES_MS,
  createSweepCadence,
  sweepRecheckDelayMs,
} from './sweep-cadence.js';

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

describe('sweepRecheckDelayMs', () => {
  it('rechecks a moving record on the next run', () => {
    expect(sweepRecheckDelayMs(0)).toBe(RECHECK_NOW_MS);
    expect(sweepRecheckDelayMs(HOUR - 1)).toBe(RECHECK_NOW_MS);
  });

  it('widens to ten minutes after an hour of stillness', () => {
    expect(sweepRecheckDelayMs(HOUR)).toBe(RECHECK_TEN_MINUTES_MS);
    expect(sweepRecheckDelayMs(23 * HOUR)).toBe(RECHECK_TEN_MINUTES_MS);
  });

  it('widens to an hour after a day of stillness', () => {
    expect(sweepRecheckDelayMs(DAY)).toBe(RECHECK_HOURLY_MS);
    expect(sweepRecheckDelayMs(90 * DAY)).toBe(RECHECK_HOURLY_MS);
  });

  it('treats an unusable stamp as moving rather than skipping the record', () => {
    expect(sweepRecheckDelayMs(Number.NaN)).toBe(RECHECK_NOW_MS);
  });
});

describe('createSweepCadence', () => {
  const now = 1_800_000_000_000;

  it('is due for a job it has never seen', () => {
    const cadence = createSweepCadence();
    expect(cadence.isDue({ jobId: 1000012, now, lastActivityAt: now })).toBe(true);
  });

  it('keeps a moving job due on every run', () => {
    const cadence = createSweepCadence();
    cadence.reschedule({ jobId: 1000012, now, lastActivityAt: now - 60_000 });
    expect(cadence.isDue({ jobId: 1000012, now, lastActivityAt: now - 60_000 })).toBe(true);
  });

  it('defers a day-old job for an hour', () => {
    const cadence = createSweepCadence();
    cadence.reschedule({ jobId: 1000012, now, lastActivityAt: now - 5 * DAY });
    expect(cadence.isDue({ jobId: 1000012, now: now + 2 * 60_000, lastActivityAt: now - 5 * DAY })).toBe(false);
    expect(cadence.isDue({ jobId: 1000012, now: now + 59 * 60_000, lastActivityAt: now - 5 * DAY })).toBe(false);
    expect(cadence.isDue({ jobId: 1000012, now: now + HOUR, lastActivityAt: now - 5 * DAY })).toBe(true);
  });

  it('defers an hour-old job for ten minutes', () => {
    const cadence = createSweepCadence();
    cadence.reschedule({ jobId: 1000012, now, lastActivityAt: now - 2 * HOUR });
    expect(cadence.isDue({ jobId: 1000012, now: now + 8 * 60_000, lastActivityAt: now - 2 * HOUR })).toBe(false);
    expect(cadence.isDue({ jobId: 1000012, now: now + RECHECK_TEN_MINUTES_MS, lastActivityAt: now - 2 * HOUR })).toBe(true);
  });

  it('keeps a job with uncollected feedback due however still it looks', () => {
    const cadence = createSweepCadence();
    cadence.reschedule({ jobId: 1000012, now, lastActivityAt: now - 90 * DAY, hot: true });
    expect(cadence.isDue({ jobId: 1000012, now, lastActivityAt: now - 90 * DAY })).toBe(true);
  });

  it('forgets a job so a reopened round is derived again', () => {
    const cadence = createSweepCadence();
    cadence.reschedule({ jobId: 1000012, now, lastActivityAt: now - 5 * DAY });
    cadence.forget(1000012);
    expect(cadence.isDue({ jobId: 1000012, now, lastActivityAt: now - 5 * DAY })).toBe(true);
  });

  it('voids a deferral when the record moved meanwhile', () => {
    const cadence = createSweepCadence();
    cadence.reschedule({ jobId: 1000012, now, lastActivityAt: now - 5 * DAY });
    const soon = now + 2 * 60_000;
    expect(cadence.isDue({ jobId: 1000012, now: soon, lastActivityAt: now - 5 * DAY })).toBe(false);
    expect(cadence.isDue({ jobId: 1000012, now: soon, lastActivityAt: soon })).toBe(true);
  });

  it('bounds what it remembers', () => {
    const cadence = createSweepCadence();
    for (let jobId = 0; jobId < 2_500; jobId += 1) {
      cadence.reschedule({ jobId, now, lastActivityAt: now - 5 * DAY });
    }
    expect(cadence.tracked()).toBeLessThanOrEqual(2_000);
  });
});
