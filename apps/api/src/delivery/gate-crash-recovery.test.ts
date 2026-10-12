import { describe, expect, it, vi } from 'vitest';

import {
  createCloudBuildOutcomeReader,
  createGateCrashProbe,
  outcomeFromBuildStatus,
  type GateCrashProbeDeps,
} from './gate-crash.js';
import type { SubmissionRecord } from '../platform/store.js';

const NOW = Date.parse('2026-08-21T09:00:00.000Z');
const DELIVERED_AT = '2026-08-21T08:00:00.000Z';

function record(overrides: Partial<SubmissionRecord> = {}): SubmissionRecord {
  return {
    jobId: 1000081,
    ownerUid: 'bot:grok',
    title: 'Transport Tycoon Remake',
    createdAt: DELIVERED_AT,
    slug: 'transport-tycoon-remake',
    state: 'submitted',
    stateSince: DELIVERED_AT,
    roundGeneration: 15,
    deliveredVersion: 'v1',
    costs: [{ kind: 'gate_run', at: DELIVERED_AT, by: 'cloud-build', ref: 'build-abc' }],
    ...overrides,
  } as SubmissionRecord;
}

function deps(overrides: Partial<GateCrashProbeDeps> = {}): GateCrashProbeDeps {
  return {
    recordJobTransition: vi.fn(async () => true),
    getManifest: vi.fn(async () => ({ createdAt: DELIVERED_AT, roundGeneration: 15 })),
    putGateCrash: vi.fn(async () => true),
    readBuildOutcome: vi.fn(async () => 'failed' as const),
    log: { info: vi.fn(), warn: vi.fn() },
    now: () => NOW,
    thresholdMs: 10 * 60 * 1000,
    ...overrides,
  };
}

describe('delivery-specific crash recovery', () => {
  it('persists a timeout on the affected version before changing the round', async () => {
    const d = deps({ readBuildOutcome: vi.fn(async () => 'timed_out' as const) });
    expect(await createGateCrashProbe(d)(record())).toMatchObject({ reason: 'gate_crashed' });
    expect(d.putGateCrash).toHaveBeenCalledWith(
      'transport-tycoon-remake',
      'v1',
      expect.objectContaining({
        status: 'timed_out',
        buildId: 'build-abc',
      }),
    );
  });

  it('also detects a preview timeout while the round is building', async () => {
    const d = deps();
    expect(
      await createGateCrashProbe(d)(record({ state: 'building', deliveredVersion: undefined, previewVersion: 'v1' })),
    ).toMatchObject({ reason: 'gate_crashed' });
  });

  it('does not let an older green preview hide a failed publish build', async () => {
    const d = deps({
      getManifest: vi.fn(async (_slug, version) =>
        version === 'old-preview'
          ? { roundGeneration: 14, previewGate: { green: true, ranAt: DELIVERED_AT } }
          : { roundGeneration: 15, createdAt: DELIVERED_AT },
      ),
    });
    expect(await createGateCrashProbe(d)(record({ previewVersion: 'old-preview' }))).toMatchObject({
      reason: 'gate_crashed',
    });
    expect(d.putGateCrash).toHaveBeenCalledWith(expect.anything(), 'v1', expect.anything());
  });

  it('does not rewrite the round if a real verdict won the storage race', async () => {
    const d = deps({ putGateCrash: vi.fn(async () => false) });
    expect(await createGateCrashProbe(d)(record())).toBeNull();
    expect(d.recordJobTransition).not.toHaveBeenCalled();
  });

  it('repairs history for a round whose crash was already detected', async () => {
    const d = deps();
    await createGateCrashProbe(d)(
      record({
        state: 'needs_changes',
        stateSince: new Date(NOW).toISOString(),
        transitions: [{ to: 'needs_changes', at: new Date(NOW).toISOString(), by: 'gate', reason: 'gate_crashed' }],
      }),
    );
    expect(d.putGateCrash).toHaveBeenCalledOnce();
    expect(d.recordJobTransition).not.toHaveBeenCalled();
  });

  it('shares Cloud Build reads across concurrent Studio polls and refreshes after 30 seconds', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ status: 'WORKING' })));
      const read = createCloudBuildOutcomeReader({ project: 'p', fetchImpl, getAccessToken: async () => 't' });
      await Promise.all([read('b'), read('b')]);
      expect(fetchImpl).toHaveBeenCalledOnce();
      vi.advanceTimersByTime(30_000);
      fetchImpl.mockImplementation(async () => new Response(JSON.stringify({ status: 'TIMEOUT' })));
      expect(await read('b')).toBe('timed_out');
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('outcomeFromBuildStatus', () => {
  it('reads Cloud Build statuses into the three answers that matter', () => {
    expect(outcomeFromBuildStatus('SUCCESS')).toBe('succeeded');
    expect(outcomeFromBuildStatus('WORKING')).toBe('running');
    expect(outcomeFromBuildStatus('QUEUED')).toBe('running');
    expect(outcomeFromBuildStatus('EXPIRED')).toBe('failed');
    expect(outcomeFromBuildStatus('TIMEOUT')).toBe('timed_out');
    expect(outcomeFromBuildStatus(undefined)).toBe('unknown');
  });
});

describe('legacy manifest round ownership', () => {
  const legacyCrash = {
    createdAt: DELIVERED_AT,
    gateCrash: { buildId: 'build-abc', ranAt: DELIVERED_AT, status: 'timed_out' as const },
  };

  it('does not replay a generation-less crash onto a newly opened retry', async () => {
    const d = deps({ getManifest: vi.fn(async () => legacyCrash) });
    const retry = record({
      state: 'building',
      roundGeneration: 2,
      stateSince: new Date(NOW - 60_000).toISOString(),
      roundStartedAt: new Date(NOW - 60_000).toISOString(),
    });
    expect(await createGateCrashProbe(d)(retry)).toBeNull();
    expect(d.recordJobTransition).not.toHaveBeenCalled();
    expect(d.putGateCrash).not.toHaveBeenCalled();
    expect(d.readBuildOutcome).not.toHaveBeenCalled();
  });

  it('still recovers a legacy content candidate in its original generation', async () => {
    const d = deps({ getManifest: vi.fn(async () => legacyCrash) });
    expect(await createGateCrashProbe(d)(record({ roundGeneration: 1 }))).toMatchObject({ reason: 'gate_crashed' });
    expect(d.putGateCrash).toHaveBeenCalledOnce();
  });

  it('accepts an explicitly scoped candidate in a later round', async () => {
    const d = deps({ getManifest: vi.fn(async () => ({ ...legacyCrash, roundGeneration: 2 })) });
    expect(await createGateCrashProbe(d)(record({ roundGeneration: 2 }))).toMatchObject({ reason: 'gate_crashed' });
  });
});
