import { describe, expect, it } from 'vitest';
import { isRoundSealed } from './roundSealed.js';

describe('isRoundSealed', () => {
  it('seals on either field, because both can carry it', () => {
    expect(isRoundSealed({ status: 'in_review' })).toBe(true);
    expect(isRoundSealed({ status: 'published' })).toBe(true);
    expect(isRoundSealed({ status: 'building', phase: 'ready_for_review' })).toBe(true);
    expect(isRoundSealed({ status: 'building', phase: 'published' })).toBe(true);
  });

  it('leaves a round in flight open', () => {
    expect(isRoundSealed({ status: 'building' })).toBe(false);
    expect(isRoundSealed({ status: 'queued', phase: 'building' })).toBe(false);
    expect(isRoundSealed({ status: 'needs_changes' })).toBe(false);
  });

  it('answers false for an absent status rather than throwing', () => {
    expect(isRoundSealed(null)).toBe(false);
    expect(isRoundSealed(undefined)).toBe(false);
  });
});
