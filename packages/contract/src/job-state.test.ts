import { describe, expect, it } from 'vitest';
import { JOB_STATES } from './job-state.js';

describe('JOB_STATES', () => {
  it('lists the twelve states the API and web both derive', () => {
    expect(JOB_STATES).toEqual([
      'queued',
      'dispatched',
      'building',
      'submitted',
      'gating',
      'ready_for_review',
      'publishing',
      'published',
      'needs_changes',
      'failed',
      'canceled',
      'abandoned',
    ]);
  });
});
