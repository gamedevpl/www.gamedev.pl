import { describe, expect, it, vi } from 'vitest';
import { createCloudBuildOutcomeReader, createGateCrashProbe, type GateCrashProbeDeps } from './gate-crash.js';
import { gateCrashStall } from '../creation/job-state.js';
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

describe('gateCrashStall', () => {
  it('reads the last transition, not the newest timestamp', () => {
    expect(
      gateCrashStall({
        state: 'needs_changes',
        transitions: [
          { to: 'needs_changes', at: '2026-08-21T09:00:00.000Z', by: 'gate', reason: 'gate_red' },
          { to: 'needs_changes', at: '2026-08-21T08:00:00.000Z', by: 'gate', reason: 'gate_crashed' },
        ],
      }),
    ).toBe('gate_crashed');
  });

  it('says nothing once the job has moved on', () => {
    expect(
      gateCrashStall({
        state: 'building',
        transitions: [{ to: 'needs_changes', at: DELIVERED_AT, by: 'gate', reason: 'gate_crashed' }],
      }),
    ).toBeNull();
  });
});

describe('createGateCrashProbe', () => {
  it('records a crash when the build failed and no verdict was ever written', async () => {
    const d = deps();
    const transition = await createGateCrashProbe(d)(record());

    expect(transition).toMatchObject({ to: 'needs_changes', by: 'gate', reason: 'gate_crashed' });
    expect(d.recordJobTransition).toHaveBeenCalledWith(
      1000081,
      expect.objectContaining({ reason: 'gate_crashed' }),
      expect.objectContaining({ roundGeneration: 15 }),
    );
    expect(d.log.info).toHaveBeenCalledWith(expect.anything(), 'delivery gate crashed');
  });

  it('never calls a red verdict a crash', async () => {
    const d = deps({
      getManifest: vi.fn(async () => ({ roundGeneration: 15, gate: { green: false, ranAt: DELIVERED_AT } })),
    });
    expect(await createGateCrashProbe(d)(record())).toBeNull();
    expect(d.readBuildOutcome).not.toHaveBeenCalled();
  });

  it('leaves a still-running build alone', async () => {
    const d = deps({ readBuildOutcome: vi.fn(async () => 'running' as const) });
    expect(await createGateCrashProbe(d)(record())).toBeNull();
    expect(d.recordJobTransition).not.toHaveBeenCalled();
  });

  it('waits out the threshold before spending a build read', async () => {
    const d = deps();
    d.getManifest = vi.fn(async () => ({ roundGeneration: 15, createdAt: new Date(NOW - 60_000).toISOString() }));
    const fresh = record();
    expect(await createGateCrashProbe(d)(fresh)).toBeNull();
    expect(d.readBuildOutcome).not.toHaveBeenCalled();
  });

  it('only looks at deliveries that are waiting on the gate', async () => {
    const d = deps();
    expect(
      await createGateCrashProbe(d)(
        record({ state: 'building', deliveredVersion: undefined, previewVersion: undefined }),
      ),
    ).toBeNull();
    expect(await createGateCrashProbe(d)(record({ state: 'published' }))).toBeNull();
    expect(d.readBuildOutcome).not.toHaveBeenCalled();
  });

  it('does nothing when no build id was ever booked', async () => {
    const d = deps();
    expect(await createGateCrashProbe(d)(record({ costs: [] }))).toBeNull();
    expect(d.readBuildOutcome).not.toHaveBeenCalled();
  });

  it('leaves the job untouched when the build cannot be read', async () => {
    const d = deps({ readBuildOutcome: vi.fn(async () => 'unknown' as const) });
    expect(await createGateCrashProbe(d)(record())).toBeNull();
    expect(d.recordJobTransition).not.toHaveBeenCalled();
  });

  it('reports nothing when the store refuses the transition', async () => {
    const d = deps({ recordJobTransition: vi.fn(async () => false) });
    expect(await createGateCrashProbe(d)(record())).toBeNull();
    expect(d.log.info).not.toHaveBeenCalled();
  });
});

describe('createCloudBuildOutcomeReader', () => {
  it('reads the build status off the API', async () => {
    const fetchImpl = vi.fn(
      async () => ({ ok: true, json: async () => ({ status: 'FAILURE' }) }) as unknown as Response,
    );
    const read = createCloudBuildOutcomeReader({ project: 'gamedevpl', fetchImpl, getAccessToken: async () => 't' });

    expect(await read('build-abc')).toBe('failed');
    expect(String(fetchImpl.mock.calls[0]![0])).toContain('/projects/gamedevpl/builds/build-abc');
  });

  it('answers unknown rather than throwing when the read fails', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network');
    });
    const read = createCloudBuildOutcomeReader({
      project: 'gamedevpl',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getAccessToken: async () => 't',
    });
    expect(await read('build-abc')).toBe('unknown');
  });
});
