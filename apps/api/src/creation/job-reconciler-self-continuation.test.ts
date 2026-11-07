import { describe, expect, it, vi } from 'vitest';
import { createSelfBuildBackend, selfBuildRef } from '../agent-surface/self-build-backend.js';
import type { GamesStore } from '../delivery/games-store.js';
import { InMemoryStore } from '../platform/store.js';
import { createJobReconciler } from './job-reconciler.js';

const AT = '2026-11-07T17:26:00.000Z';
const JOB = 11;

async function continuation() {
  const store = new InMemoryStore();
  await store.createSubmission(JOB, 'g:owner', 'Cozy game');
  await store.setSubmissionSlug(JOB, 'cozy-game');
  await store.recordDispatch(JOB, { backend: 'self', ref: selfBuildRef(JOB) });
  // An earlier round published v5, then the creator asked for more.
  await store.setSubmissionDeliveredVersion(JOB, 'v5');
  await store.bumpRoundGeneration(JOB);
  await store.recordJobTransition(JOB, { to: 'building', at: AT, by: 'agent', reason: 'task_in_progress' });
  await store.touchLastAgentSignalAt(JOB, AT);
  const backend = createSelfBuildBackend({
    readSignals: async (jobId) => {
      const record = await store.getSubmission(jobId);
      return record
        ? {
            lastAgentSignalAt: record.lastAgentSignalAt,
            deliveredVersion: record.deliveredVersion,
            previewVersion: record.previewVersion,
            roundDeliveryCount: record.roundDeliveryCount,
          }
        : null;
    },
  });
  const reconciler = createJobReconciler({
    store,
    gamesStore: { getManifest: vi.fn(async () => null) } as unknown as GamesStore,
    log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
    // Twelve quiet minutes: the agent is running its local gate.
    now: () => Date.parse(AT) + 12 * 60_000,
    observeQuietMs: 2 * 60_000,
    maxDeliveryNudges: 1,
    backendForRecord: async () => backend,
    releaseWorkspace: async () => {},
    resumeBuild: vi.fn(async () => ({})),
    acknowledgeBuilderHandoff: vi.fn(async () => ({ started: false })),
    probeGateCrash: async () => null,
    postGateScreenshot: async () => null,
    onGateRed: async () => false,
  });
  return { store, reconciler };
}

describe('a self continuation round on a game that was published before', () => {
  it('stays open while the agent works quietly', async () => {
    const { store, reconciler } = await continuation();
    const before = (await store.getSubmission(JOB))!;
    expect(await reconciler.reconcileNativeJob(before)).toBeNull();
    const after = (await store.getSubmission(JOB))!;
    expect(after.state).toBe('building');
    expect(after.roundGeneration).toBe(before.roundGeneration);
  });

  it('completes once this round publishes', async () => {
    const { store, reconciler } = await continuation();
    await store.setSubmissionDeliveredVersion(JOB, 'v6');
    await store.incrementRoundDeliveryCount(JOB);
    const record = (await store.getSubmission(JOB))!;
    expect(await reconciler.reconcileNativeJob(record)).toMatchObject({
      to: 'ready_for_review',
      reason: 'task_completed',
    });
  });
});
