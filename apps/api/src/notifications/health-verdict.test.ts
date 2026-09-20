import { describe, expect, it } from 'vitest';
import { resolveHealthVerdict } from './health-verdict.js';

const check = { version: 'v1', requestedAt: '2026-07-30T12:00:00.000Z' };

describe('resolveHealthVerdict', () => {
  it('drops any streak on a green verdict', () => {
    const outcome = resolveHealthVerdict(
      'sky-dodge',
      { ...check, unhealthySinceAt: '2026-07-01T00:00:00.000Z' },
      { green: true, ranAt: '2026-07-30T12:20:00.000Z' },
    );
    expect(outcome).toMatchObject({ green: true, patch: { green: true, verdictAt: '2026-07-30T12:20:00.000Z' } });
    expect(outcome.patch.unhealthySinceAt).toBeUndefined();
  });

  it('starts the streak at the first red verdict', () => {
    const outcome = resolveHealthVerdict('sky-dodge', check, { green: false, ranAt: '2026-07-30T12:20:00.000Z' });
    expect(outcome).toMatchObject({
      green: false,
      unhealthySinceAt: '2026-07-30T12:20:00.000Z',
      alertId: 'op-health-sky-dodge-v1-2026-07-30T12:20:00.000Z-0',
    });
  });

  it('carries the streak forward and keeps the same alert id inside one cooldown window', () => {
    const outcome = resolveHealthVerdict(
      'sky-dodge',
      { ...check, unhealthySinceAt: '2026-07-01T00:00:00.000Z' },
      { green: false, ranAt: '2026-07-10T00:00:00.000Z' }, // 9 days later — inside 14
    );
    expect(outcome).toMatchObject({
      unhealthySinceAt: '2026-07-01T00:00:00.000Z',
      alertId: 'op-health-sky-dodge-v1-2026-07-01T00:00:00.000Z-0',
    });
  });

  it('bumps the alert id once a full cooldown window has passed unfixed', () => {
    const outcome = resolveHealthVerdict(
      'sky-dodge',
      { ...check, unhealthySinceAt: '2026-07-01T00:00:00.000Z' },
      { green: false, ranAt: '2026-07-16T00:00:00.000Z' }, // 15 days later — past one 14-day window
    );
    expect(outcome).toMatchObject({
      unhealthySinceAt: '2026-07-01T00:00:00.000Z',
      alertId: 'op-health-sky-dodge-v1-2026-07-01T00:00:00.000Z-1',
    });
  });

  it('gives a relapse a different alert id than the original streak, even both at window 0', () => {
    // Without the streak start in the id, both collide at window 0.
    const original = resolveHealthVerdict('sky-dodge', check, { green: false, ranAt: '2026-07-01T00:00:00.000Z' });
    const relapse = resolveHealthVerdict('sky-dodge', check, { green: false, ranAt: '2026-08-01T00:00:00.000Z' });
    expect(original.alertId).not.toBe(relapse.alertId);
  });
});
