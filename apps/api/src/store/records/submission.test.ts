import { describe, expect, it } from 'vitest';
import { fromStoredSubmission } from './submission.js';

// A record written before `gating` was removed can still hold it.

describe('fromStoredSubmission', () => {
  it('reads a legacy gating record as submitted', () => {
    const record = fromStoredSubmission({ jobId: 7, createdAt: '2026-01-01T00:00:00Z', state: 'gating' });

    // Not a cosmetic rename: toSubmissionStatus is exhaustive with no default.

    // An unmapped state would answer undefined on the status route.
    expect(record.state).toBe('submitted');
  });

  it('leaves every other state alone', () => {
    for (const state of ['queued', 'building', 'submitted', 'published', 'failed'] as const) {
      expect(fromStoredSubmission({ jobId: 1, createdAt: '2026-01-01T00:00:00Z', state }).state).toBe(state);
    }
  });

  it('passes a record with no state through untouched', () => {
    const stored = { jobId: 3, createdAt: '2026-01-01T00:00:00Z' };

    expect(fromStoredSubmission(stored)).toEqual(stored);
  });

  it('copies rather than mutating the stored object when it rewrites', () => {
    const stored = { jobId: 9, createdAt: '2026-01-01T00:00:00Z', state: 'gating' };
    const record = fromStoredSubmission(stored);

    expect(record).not.toBe(stored);
    expect(stored.state).toBe('gating');
  });
});
