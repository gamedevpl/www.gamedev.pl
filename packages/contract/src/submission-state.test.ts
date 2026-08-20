import { describe, expect, it } from 'vitest';
import { SUBMISSION_STATES } from './submission-state.js';

describe('SUBMISSION_STATES', () => {
  it('lists the seven states the API and web both derive', () => {
    expect(SUBMISSION_STATES).toEqual([
      'queued',
      'building',
      'in_review',
      'publishing',
      'published',
      'needs_changes',
      'abandoned',
    ]);
  });
});
