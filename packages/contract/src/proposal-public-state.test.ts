import { describe, expect, it } from 'vitest';
import { PROPOSAL_PUBLIC_STATES } from './proposal-public-state.js';

describe('PROPOSAL_PUBLIC_STATES', () => {
  it('lists the eleven states a proposal shows publicly', () => {
    expect(PROPOSAL_PUBLIC_STATES).toEqual([
      'draft',
      'checking',
      'in_review',
      'needs_work',
      'changes_requested',
      'accepted',
      'merged',
      'declined',
      'withdrawn',
      'superseded',
      'expired',
    ]);
  });
});
