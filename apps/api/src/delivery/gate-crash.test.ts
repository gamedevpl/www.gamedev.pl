import { describe, expect, it, vi } from 'vitest';

import {
  createCloudBuildOutcomeReader,
  createGateCrashProbe,
  gateCrashStall,
  lastGateRunRef,
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
    getManifest: vi.fn(async () => ({}) as { gate?: unknown; previewGate?: unknown }),
    readBuildOutcome: vi.fn(async () => 'failed' as const),
    log: { info: vi.fn(), warn: vi.fn() },
    now: () => NOW,
    thresholdMs: 10 * 60 * 1000,
    ...overrides,
  };
}

describe('outcomeFromBuildStatus', () => {
  it('reads Cloud Build statuses into the three answers that matter', () => {
    expect(outcomeFromBuildStatus('SUCCESS')).toBe('succeeded');
    expect(outcomeFromBuildStatus('WORKING')).toBe('running');
    expect(outcomeFromBuildStatus('QUEUED')).toBe('running');
    // A build with no worker is as dead as one that threw.
    expect(outcomeFromBuildStatus('EXPIRED')).toBe('failed');
    expect(outcomeFromBuildStatus('TIMEOUT')).toBe('failed');
    expect(outcomeFromBuildStatus(undefined)).toBe('unknown');
  });
});

describe('lastGateRunRef', () => {
  it('ignores builds from an earlier round', () => {
    // A stale id would blame this round for an older failure.
    const ref = lastGateRunRef(
      [
        { kind: 'gate_run', at: '2026-08-20T00:00:00.000Z', by: 'cloud-build', ref: 'old' },
        { kind: 'gate_run', at: '2026-08-21T08:30:00.000Z', by: 'cloud-build', ref: 'current' },
      ],
      DELIVERED_AT,
    );
    expect(ref).toBe('current');
  });

  it('ignores costs that are not gate runs', () => {
    expect(lastGateRunRef([{ kind: 'agent_session', at: DELIVERED_AT, by: 'copilot', ref: 'x' }], DELIVERED_AT)).toBe(
      undefined,
    );
  });
});

describe('gateCrashStall', () => {
  it('reads the last transition, not the newest timestamp', () => {
    // Append-ordered; a re-read verdict can carry an older `at`.
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
    expect(d.recordJobTransition).toHaveBeenCalledWith(1000081, expect.objectContaining({ reason: 'gate_crashed' }));
    // A28 keys on this line.
    expect(d.log.info).toHaveBeenCalledWith(expect.anything(), 'delivery gate crashed');
  });

  it('never calls a red verdict a crash', async () => {
    // The gate exits non-zero on red too.
    const d = deps({ getManifest: vi.fn(async () => ({ gate: { green: false } })) });
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
    const fresh = record({ stateSince: new Date(NOW - 60_000).toISOString() });
    expect(await createGateCrashProbe(d)(fresh)).toBeNull();
    expect(d.readBuildOutcome).not.toHaveBeenCalled();
  });

  it('only looks at deliveries that are waiting on the gate', async () => {
    const d = deps();
    expect(await createGateCrashProbe(d)(record({ state: 'building' }))).toBeNull();
    expect(await createGateCrashProbe(d)(record({ state: 'published' }))).toBeNull();
    expect(d.readBuildOutcome).not.toHaveBeenCalled();
  });

  it('does nothing when no build id was ever booked', async () => {
    const d = deps();
    expect(await createGateCrashProbe(d)(record({ costs: [] }))).toBeNull();
    expect(d.readBuildOutcome).not.toHaveBeenCalled();
  });

  it('leaves the job untouched when the build cannot be read', async () => {
    // An API blip must not rewrite live jobs.
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
