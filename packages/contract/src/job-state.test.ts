import { describe, expect, it } from 'vitest';
import { JOB_STALL_VALUES, JOB_STATES } from './job-state.js';

describe('JOB_STATES', () => {
  it('lists the eleven states the API and web both derive', () => {
    expect(JOB_STATES).toEqual([
      'queued',
      'dispatched',
      'building',
      'submitted',
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

describe('JOB_STALL_VALUES', () => {
  it('lists the eight stall reasons the API and web both derive', () => {
    expect(JOB_STALL_VALUES).toEqual([
      'awaiting_input',
      'not_dispatched',
      'quiet',
      'ended',
      'gate_not_started',
      'gate_crashed',
      'session_crashed',
      'no_agent_yet',
    ]);
  });
});
