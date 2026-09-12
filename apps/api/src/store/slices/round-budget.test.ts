import { describe, expect, it } from 'vitest';
import { dreamClaimHolds } from './round-budget.js';

const AT = '2026-09-07T12:00:30.000Z';
const claimedAt = '2026-09-07T12:00:00.000Z';

describe('dreamClaimHolds', () => {
  it('holds a posted claim inside its own round', () => {
    expect(dreamClaimHolds({ version: 'v1', claimedAt, roundGeneration: 1, postedAt: claimedAt }, 'v1', AT, 1)).toBe(
      true,
    );
  });

  it('releases that claim once the round is reopened', () => {
    expect(dreamClaimHolds({ version: 'v1', claimedAt, roundGeneration: 1, postedAt: claimedAt }, 'v1', AT, 2)).toBe(
      false,
    );
  });

  // Rows written before rounds were numbered belong to the first one.
  it('releases a claim with no generation once the round moves past one', () => {
    expect(dreamClaimHolds({ version: 'v1', claimedAt, postedAt: claimedAt }, 'v1', AT, 2)).toBe(false);
    expect(dreamClaimHolds({ version: 'v1', claimedAt, postedAt: claimedAt }, 'v1', AT, 1)).toBe(true);
  });
});
