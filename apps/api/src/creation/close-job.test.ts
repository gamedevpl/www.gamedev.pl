import { describe, expect, it, vi } from 'vitest';
import type { AgentBackend } from '../agent-surface/agent-backend.js';
import type { Store, SubmissionRecord } from '../platform/store.js';
import { closeJob } from './close-job.js';

describe('closeJob', () => {
  it('cancels through the backend that owns the stored dispatch', async () => {
    const record = {
      jobId: 17,
      dispatch: { backend: 'managed:anthropic', refs: ['anthropic-session'] },
    } as SubmissionRecord;
    const cancel = vi.fn(async () => ({ enforced: true }));
    const backendForRecord = vi.fn(async () => ({ cancel }) as unknown as AgentBackend);
    const store = {
      recordJobTransition: vi.fn(async () => true),
      getSubmission: vi.fn(async () => record),
      setSubmissionAbandoned: vi.fn(async () => {}),
    } as unknown as Store;

    const result = await closeJob(
      {
        store,
        now: () => Date.parse('2026-09-26T12:00:00.000Z'),
        backendForRecord,
        releaseWorkspace: vi.fn(async () => {}),
      },
      { record, to: 'canceled', by: 'operator', reason: 'operator_canceled', log: { error: vi.fn() } },
    );

    expect(backendForRecord).toHaveBeenCalledWith(record);
    expect(cancel).toHaveBeenCalledWith('anthropic-session', undefined);
    expect(result).toEqual({ closed: true, stopEnforced: true });
  });
});
