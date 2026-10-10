import { describe, expect, it, vi } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import type { SubmissionRecord } from '../platform/store.js';
import { createBuildStatusAssembler } from './build-status.js';
import type { SubmissionStatusResponse } from '../platform/submission-status.js';
import { DREAM_CLAIM_TTL_MS, type DreamRunClaim } from '../store/slices/dream-claim.js';

const JOB = 5151;
const NOW = Date.parse('2026-10-10T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

async function poll(patch: Partial<SubmissionRecord>, viewer = 'g:owner') {
  const store = new InMemoryStore();
  await store.createSubmission(JOB, 'g:owner', 'Airtime');
  const base = (await store.getSubmission(JOB))!;
  vi.spyOn(store, 'getSubmission').mockResolvedValue({ ...base, previewVersion: 'v2', ...patch });
  const assembler = createBuildStatusAssembler({ store, now: () => NOW, isPresenceEventText: () => false });
  return assembler.attachBuildEvents({ status: 'in_review' } as SubmissionStatusResponse, JOB, 'en', viewer);
}

const run = (extra: Partial<DreamRunClaim> = {}): DreamRunClaim => ({
  version: 'v2',
  claimedAt: ago(20_000),
  roundGeneration: 1,
  ...extra,
});

describe('status payload while a concept proposal is drawing', () => {
  it('reports the claim time while the run is in progress', async () => {
    const status = await poll({ dreamRun: run() });
    expect(status.dreaming).toEqual({ since: ago(20_000) });
  });

  it('keeps the live cadence while the run draws', async () => {
    const quiet = { stateSince: ago(10 * 60_000), createdAt: ago(20 * 60_000) };
    expect((await poll({ ...quiet })).pollAfterMs).toBe(10_000);
    expect((await poll({ ...quiet, dreamRun: run() })).pollAfterMs).toBe(3_000);
  });

  it('drops the field once the run ended or posted', async () => {
    expect((await poll({ dreamRun: run({ endedAt: ago(1_000) }) })).dreaming).toBeUndefined();
    expect((await poll({ dreamRun: run({ postedAt: ago(1_000) }) })).dreaming).toBeUndefined();
  });

  it('drops a claim older than the TTL', async () => {
    const status = await poll({ dreamRun: run({ claimedAt: ago(DREAM_CLAIM_TTL_MS + 1) }) });
    expect(status.dreaming).toBeUndefined();
  });

  it('ignores a run for another version or round', async () => {
    expect((await poll({ dreamRun: run({ version: 'v1' }) })).dreaming).toBeUndefined();
    expect((await poll({ dreamRun: run(), roundGeneration: 2 })).dreaming).toBeUndefined();
  });

  it('never tells a token-only viewer', async () => {
    expect((await poll({ dreamRun: run() }, 'g:stranger')).dreaming).toBeUndefined();
  });
});
