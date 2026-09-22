import { describe, expect, it } from 'vitest';
import { quotaRefusal, secondsUntilUtcMidnight } from './agent-quota-headroom.js';

describe('quota refusals carry a code', () => {
  it('counts the wait to the next UTC midnight', () => {
    const at = Date.parse('2026-09-22T23:59:00Z');
    expect(secondsUntilUtcMidnight(at)).toBe(60);
    expect(secondsUntilUtcMidnight(Date.parse('2026-09-22T00:00:00Z'))).toBe(24 * 60 * 60);
  });

  it('tells an exhausted day apart from a blocked account', () => {
    const at = Date.parse('2026-09-22T12:00:00Z');
    expect(quotaRefusal('free', 'used up', at)).toEqual({
      code: 'quota_exhausted',
      message: 'used up',
      retryAfterSeconds: 12 * 60 * 60,
    });
    // Waiting never unblocks an account, so promising a retry would be a lie.
    expect(quotaRefusal('blocked', 'used up', at)).toEqual({
      code: 'quota_blocked',
      message: 'account is blocked',
    });
  });
});
