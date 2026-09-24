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

function setup(agentEndedAt?: string) {
  const store = {
    getSubmission: vi.fn(async () => ({ ...record, agentEndedAt })),
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

  it('claims the version before sending its report into a same-round repair', async () => {
    const { store, resumeBuild, handler } = setup('2026-09-24T11:59:00Z');
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
});
