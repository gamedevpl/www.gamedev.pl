import { describe, expect, it, vi } from 'vitest';
import type { Store, SubmissionRecord } from '../platform/store.js';
import { createGateRepairHandler } from './gate-repair.js';
import type { createResumeBuild } from './resume-build.js';

const record = {
  jobId: 7,
  builder: 'platform',
  locale: 'pl',
  roundGeneration: 2,
  dispatch: { refs: ['session-1'] },
} as SubmissionRecord;

function setup(latest: Partial<SubmissionRecord> = {}) {
  const store = {
    getSubmission: vi.fn(async () => ({ ...record, ...latest })),
    claimGateRepair: vi.fn(async () => true),
  } as unknown as Store;
  const resumeBuild = vi.fn(async () => ({ started: true as const })) as ReturnType<typeof createResumeBuild>;
  const handler = createGateRepairHandler({
    store,
    builderOf: () => 'platform',
    resumeBuild,
    now: () => Date.parse('2026-09-24T12:00:00Z'),
    log: { error: vi.fn() },
  });
  return { store, resumeBuild, handler };
}

describe('managed gate repair', () => {
  it('waits for the agent to finish before claiming the red version', async () => {
    const { store, handler } = setup();
    expect(await handler({ record, version: 'v2', report: 'runtime error' })).toBe(false);
    expect(store.claimGateRepair).not.toHaveBeenCalled();
  });

  it('keeps the current session alive after submit, even with stale terminal agent state', async () => {
    const { store, handler } = setup({
      agentEndedAt: '2026-09-24T11:59:00Z',
      agentEndedBy: 'submit',
      agentState: 'completed',
      costs: [{ kind: 'agent_session', at: '2026-09-24T11:58:00Z', by: 'managed', ref: 'session-1' }],
    });
    expect(await handler({ record, version: 'v2', report: 'runtime error' })).toBe(false);
    expect(store.claimGateRepair).not.toHaveBeenCalled();
  });

  it('rejects a settled observation from an earlier dispatch', async () => {
    const current = { ...record, dispatch: { refs: ['session-1', 'session-2'] } } as SubmissionRecord;
    const { store, handler } = setup({
      dispatch: { refs: ['session-1', 'session-2'] },
      costs: [
        {
          kind: 'agent_session',
          at: '2026-09-24T11:58:00Z',
          by: 'managed',
          ref: 'session-1',
          finishedAt: '2026-09-24T11:59:00Z',
        },
      ],
    });
    expect(await handler({ record: current, version: 'v2', report: 'runtime error' })).toBe(false);
    expect(store.claimGateRepair).not.toHaveBeenCalled();
  });

  it('rejects a verdict snapshot from before a newer dispatch', async () => {
    const { store, handler } = setup({
      dispatch: { refs: ['session-1', 'session-2'] },
      agentEndedAt: '2026-09-24T11:59:00Z',
      agentEndedBy: 'end',
    });
    expect(await handler({ record, version: 'v2', report: 'runtime error' })).toBe(false);
    expect(store.claimGateRepair).not.toHaveBeenCalled();
  });

  it('claims the version before sending its report into a same-round repair', async () => {
    const { store, resumeBuild, handler } = setup({
      agentEndedAt: '2026-09-24T11:59:00Z',
      agentEndedBy: 'end',
    });
    expect(await handler({ record, version: 'v2', report: 'runtime error' })).toBe(true);
    expect(store.claimGateRepair).toHaveBeenCalledWith(7, 'v2', '2026-09-24T12:00:00.000Z', 2);
    expect(resumeBuild).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 7,
        locale: 'pl',
        undelivered: true,
        gateRepair: { version: 'v2', report: 'runtime error' },
      }),
    );
  });

  it('repairs after observing the current session finish without an explicit end', async () => {
    const { store, resumeBuild, handler } = setup({
      agentEndedAt: '2026-09-24T11:59:00Z',
      agentEndedBy: 'submit',
      costs: [
        {
          kind: 'agent_session',
          at: '2026-09-24T11:58:00Z',
          by: 'managed',
          ref: 'session-1',
          finishedAt: '2026-09-24T11:59:30Z',
          state: 'completed',
        },
      ],
    });
    expect(await handler({ record, version: 'v2', report: 'runtime error' })).toBe(true);
    expect(store.claimGateRepair).toHaveBeenCalledOnce();
    expect(resumeBuild).toHaveBeenCalledOnce();
  });
});
