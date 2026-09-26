import { describe, expect, it, vi } from 'vitest';
import type { GamesStore } from '../delivery/games-store.js';
import type { Store, SubmissionRecord } from '../platform/store.js';
import { createJobReconciler } from './job-reconciler.js';
import type { AgentBackend } from '../agent-surface/agent-backend.js';

const AT = '2026-09-24T12:00:00.000Z';

function setup(green: boolean) {
  const record = {
    jobId: 7,
    slug: 'test-game',
    state: 'submitted',
    builder: 'platform',
    roundGeneration: 2,
    previewVersion: 'v2',
    locale: 'en',
  } as SubmissionRecord;
  const store = {
    setRoundLastGateMetricKey: vi.fn(async () => {}),
    recordJobTransition: vi.fn(async () => true),
    getSubmission: vi.fn(async () => record),
  } as unknown as Store;
  const gamesStore = {
    getManifest: vi.fn(async () => ({
      roundGeneration: 2,
      previewGate: { green, ranAt: AT, report: 'smoke failed at runtime' },
    })),
  } as unknown as GamesStore;
  const onGateRed = vi.fn(async () => true);
  const reconciler = createJobReconciler({
    store,
    gamesStore,
    log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
    now: () => Date.parse(AT),
    observeQuietMs: 0,
    maxDeliveryNudges: 1,
    backendForRecord: async () => undefined,
    releaseWorkspace: async () => {},
    resumeBuild: async () => ({}),
    acknowledgeBuilderHandoff: async () => ({ started: false }),
    probeGateCrash: async () => null,
    postGateScreenshot: async () => null,
    onGateRed,
  });
  return { record, store, onGateRed, reconciler };
}

describe('gate repair reconciliation', () => {
  it('returns the replacement dispatch after a red runtime gate', async () => {
    const { record, store, onGateRed, reconciler } = setup(false);
    const result = await reconciler.reconcileGateVerdict(record);
    expect(store.recordJobTransition).toHaveBeenCalledWith(7, expect.objectContaining({ reason: 'gate_red' }));
    expect(onGateRed).toHaveBeenCalledWith({ record, version: 'v2', report: 'smoke failed at runtime' });
    expect(result).toMatchObject({ to: 'dispatched', reason: 'gate_repair' });
  });

  it('does not spend a repair on a green preview or stale round', async () => {
    const green = setup(true);
    await green.reconciler.reconcileGateVerdict(green.record);
    expect(green.onGateRed).not.toHaveBeenCalled();
    const stale = setup(false);
    stale.record.roundGeneration = 3;
    await stale.reconciler.reconcileGateVerdict(stale.record);
    expect(stale.onGateRed).not.toHaveBeenCalled();
  });

  it('revisits a red verdict after the original session ends without recording another rejection', async () => {
    const { record, store, onGateRed, reconciler } = setup(false);
    record.state = 'needs_changes';
    record.transitions = [{ to: 'needs_changes', at: AT, by: 'gate', reason: 'gate_red' }];
    const result = await reconciler.reconcileGateVerdict(record);
    expect(store.recordJobTransition).not.toHaveBeenCalled();
    expect(onGateRed).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ to: 'dispatched', reason: 'gate_repair' });
  });

  it('observes a completed agent immediately after a red gate and makes repair eligible', async () => {
    const { record, store } = setup(false);
    record.dispatch = { backend: 'managed', refs: ['session-1'] } as SubmissionRecord['dispatch'];
    record.costs = [{ kind: 'agent_session', at: AT, by: 'managed', ref: 'session-1', creditsMeasured: true }];
    const observe = vi.fn(async () => ({ state: 'completed' as const }));
    const setJobCostFinished = vi.fn(async () => {
      const entry = record.costs?.[0];
      if (entry) entry.finishedAt = AT;
    });
    Object.assign(store, {
      recordJobTransition: vi.fn(
        async (_jobId: number, transition: { to: SubmissionRecord['state']; reason: string }) => {
          record.state = transition.to;
          record.transitions = [{ to: 'needs_changes', at: AT, by: 'gate', reason: transition.reason }];
          return true;
        },
      ),
      setJobCostFinished,
      setSubmissionAgentState: vi.fn(async () => {}),
    });
    const onGateRed = vi.fn(async () => Boolean(record.costs?.[0]?.finishedAt));
    const backendForRecord = vi.fn(async () => ({ observe }) as unknown as AgentBackend);
    const reconciler = createJobReconciler({
      store,
      gamesStore: {
        getManifest: vi.fn(async () => ({
          roundGeneration: 2,
          previewGate: { green: false, ranAt: AT, report: 'runtime error' },
        })),
      } as unknown as GamesStore,
      log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
      now: () => Date.parse(AT),
      observeQuietMs: 60_000,
      maxDeliveryNudges: 1,
      backendForRecord,
      releaseWorkspace: async () => {},
      resumeBuild: async () => ({}),
      acknowledgeBuilderHandoff: async () => ({ started: false }),
      probeGateCrash: async () => null,
      postGateScreenshot: async () => null,
      onGateRed,
    });
    const result = await reconciler.reconcileGateVerdict(record);
    expect(observe).toHaveBeenCalledOnce();
    expect(backendForRecord).toHaveBeenCalledWith(record);
    expect(setJobCostFinished).toHaveBeenCalledOnce();
    expect(onGateRed).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ to: 'dispatched', reason: 'gate_repair' });
  });
});
