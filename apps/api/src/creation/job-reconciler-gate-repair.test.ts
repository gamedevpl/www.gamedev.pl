import { describe, expect, it, vi } from 'vitest';
import type { GamesStore } from '../delivery/games-store.js';
import type { Store, SubmissionRecord } from '../platform/store.js';
import { createJobReconciler } from './job-reconciler.js';

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
    backendFor: async () => undefined,
    builderOf: () => 'platform',
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
});
