import { describe, expect, it, vi } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import type { GamesStore } from '../delivery/games-store.js';
import { createJobReconciler, type JobReconcilerDeps } from './job-reconciler.js';
import { retryClosedPreviewDream } from './closed-preview-dream-retry.js';

const AT = '2026-09-26T12:00:00.000Z';
async function setup(accepted = false) {
  const store = new InMemoryStore();
  await store.createSubmission(9, 'g:owner', 'Preview');
  await store.setSubmissionSlug(9, 'preview-game');
  await store.recordDispatch(9, { backend: 'managed', ref: 'session-1' });
  await store.recordJobTransition(9, { to: 'building', at: AT, by: 'agent' });
  await store.setSubmissionPreviewVersion(9, 'v1');
  await store.incrementRoundDeliveryCount(9);
  await store.markAgentEnded(9, AT, 'end');
  const generation = (await store.getSubmission(9))!.roundGeneration!;
  const manifest = { roundGeneration: generation, previewGate: { green: true, ranAt: AT, screenshot: 'shot.png' } };
  const getManifest = vi.fn(async () => manifest);
  const handoff = vi.fn<NonNullable<JobReconcilerDeps['onPreviewGateGreen']>>(async ({ record, version }) => {
    if (accepted || handoff.mock.calls.length > 1) await store.claimDreamRun(9, version, AT, record.roundGeneration!);
  });
  const reconciler = createJobReconciler({
    store,
    gamesStore: { getManifest } as unknown as GamesStore,
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    now: () => Date.parse(AT),
    observeQuietMs: 0,
    maxDeliveryNudges: 1,
    backendForRecord: async () => undefined,
    releaseWorkspace: async () => {},
    resumeBuild: async () => ({}),
    acknowledgeBuilderHandoff: async () => ({ started: false }),
    probeGateCrash: async () => null,
    postGateScreenshot: async () => null,
    onPreviewGateGreen: handoff,
  });
  const poll = async () => reconciler.reconcileGateVerdict((await store.getSubmission(9))!);
  return { store, manifest, getManifest, handoff, poll };
}

describe('dream handoff after a preview round closes', () => {
  it('retries a refused handoff and preserves the closed round', async () => {
    const { store, handoff, poll } = await setup();
    expect(await poll()).toMatchObject({ reason: 'preview_gate_green' });
    const closed = (await store.getSubmission(9))!;
    expect(await poll()).toBeNull();
    expect(handoff).toHaveBeenCalledTimes(2);
    expect(handoff.mock.calls[1][0]).toMatchObject({
      version: 'v1',
      screenshotPath: 'shot.png',
      record: { state: 'ready_for_review' },
    });
    expect((await store.getSubmission(9))?.roundGeneration).toBe(closed.roundGeneration);
    expect((await store.getSubmission(9))?.transitions).toEqual(closed.transitions);
    await poll();
    expect(handoff).toHaveBeenCalledTimes(2);
  });

  it('does not repeat a handoff accepted by the round that closed', async () => {
    const { handoff, poll } = await setup(true);
    await poll();
    await poll();
    expect(handoff).toHaveBeenCalledOnce();
  });

  it.each(['version', 'generation', 'red'])('refuses a mismatched closed candidate: %s', async (change) => {
    const { store, manifest, handoff, poll } = await setup();
    await poll();
    if (change === 'version') await store.setSubmissionPreviewVersion(9, 'v2');
    if (change === 'generation') manifest.roundGeneration += 1;
    if (change === 'red') manifest.previewGate.green = false;
    await poll();
    expect(handoff).toHaveBeenCalledOnce();
  });
});

it.each([false, true])('retries only superseded ended old-generation claims: %s', async (superseded) => {
  const { store, handoff, poll } = await setup(true);
  await poll();
  await store.finishDreamRun(9, { version: 'v1', claimedAt: AT, superseded }, AT);
  await poll();
  expect(handoff).toHaveBeenCalledTimes(superseded ? 2 : 1);
});

it('never repeats a posted claim even with a superseded marker', async () => {
  const { store, manifest, handoff, poll } = await setup(true);
  await poll();
  const record = (await store.getSubmission(9))!;
  await retryClosedPreviewDream(
    { ...record, dreamRun: { ...record.dreamRun!, postedAt: AT, superseded: true } },
    { getManifest: async () => manifest } as unknown as GamesStore,
    handoff,
    () => Date.parse(AT),
  );
  expect(handoff).toHaveBeenCalledOnce();
});
