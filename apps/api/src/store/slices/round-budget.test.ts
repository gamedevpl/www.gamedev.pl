import { describe, expect, it } from 'vitest';
import { dreamClaimHolds, InMemoryRoundBudgetStore } from './round-budget.js';
import type { SubmissionRecord } from '../records/submission.js';

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

describe('gate repair claim', () => {
  it('admits one repair for the latest red delivery, then releases the budget in a new round', async () => {
    const record = {
      jobId: 7,
      state: 'needs_changes',
      builder: 'platform',
      previewVersion: 'v2',
      roundGeneration: 3,
    } as SubmissionRecord;
    const rows = new Map([[7, record]]);
    const store = new InMemoryRoundBudgetStore(rows);

    expect(await store.claimGateRepair(7, 'v1', AT, 3)).toBe(false);
    expect(await store.claimGateRepair(7, 'v2', AT, 3)).toBe(true);
    expect(await store.claimGateRepair(7, 'v2', AT, 3)).toBe(false);
    rows.set(7, { ...rows.get(7)!, previewVersion: 'v3', roundGeneration: 4 });
    expect(await store.claimGateRepair(7, 'v3', AT, 4)).toBe(true);
  });

  it('does not start a platform agent for a self round or pending handoff', async () => {
    const rows = new Map<number, SubmissionRecord>([[7, {
      jobId: 7,
      state: 'needs_changes',
      builder: 'self',
      previewVersion: 'v2',
      roundGeneration: 3,
    } as SubmissionRecord]]);
    const store = new InMemoryRoundBudgetStore(rows);
    expect(await store.claimGateRepair(7, 'v2', AT, 3)).toBe(false);
    rows.set(7, { ...rows.get(7)!, builder: 'platform', builderHandoff: {} as SubmissionRecord['builderHandoff'] });
    expect(await store.claimGateRepair(7, 'v2', AT, 3)).toBe(false);
  });
});
