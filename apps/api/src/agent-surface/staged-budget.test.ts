import { describe, expect, it } from 'vitest';
import { stagedBudgetWarning } from './staged-budget.js';

describe('staged byte budget warning', () => {
  it('says nothing while there is room', () => {
    expect(stagedBudgetWarning({ totalBytes: 100, maxBytes: 1000 })).toBeNull();
    expect(stagedBudgetWarning({ totalBytes: 949, maxBytes: 1000 })).toBeNull();
  });

  it('warns once the staged total is near the cap', () => {
    const warning = stagedBudgetWarning({ totalBytes: 960, maxBytes: 1000 });
    expect(warning).toContain('96%');
    expect(warning).toContain('40 left');
  });

  it('stays quiet when the numbers are missing or nonsense', () => {
    expect(stagedBudgetWarning(undefined)).toBeNull();
    expect(stagedBudgetWarning({ totalBytes: 10 })).toBeNull();
    expect(stagedBudgetWarning({ totalBytes: 10, maxBytes: 0 })).toBeNull();
  });
});
