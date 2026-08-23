import { describe, expect, it } from 'vitest';

import { toRecentBuild } from '../delivery/recent-builds.js';
import { applyGateVerdict, applyPreviewGateVerdict, applyHealthVerdict } from './version-verdict.js';
import type { VersionManifest } from '../delivery/games-store.js';

const RAN_AT = '2026-08-21T09:00:00.000Z';

function manifest(overrides: Partial<VersionManifest> = {}): VersionManifest {
  return {
    slug: 'space-parcels',
    version: 'v1',
    createdAt: '2026-08-21T08:00:00.000Z',
    issueNumber: 731,
    roundGeneration: 1,
    sourceFiles: [],
    ...overrides,
  } as VersionManifest;
}

describe('applyGateVerdict', () => {
  it('keeps the dying stage before clearing gateProgress', () => {
    // The position is the diagnostic; clearing it loses that.
    const m = manifest({ gateProgress: { lane: 'publish', stage: 'trace', index: 5, total: 12, at: RAN_AT } });

    applyGateVerdict(m, { green: false, report: 'nope' }, RAN_AT);

    expect(m.gate?.failedStage).toBe('trace');
    expect(m.gateProgress).toBeUndefined();
  });

  it('records no stage for a green run', () => {
    const m = manifest({ gateProgress: { lane: 'publish', stage: 'playtest', index: 11, total: 12, at: RAN_AT } });

    applyGateVerdict(m, { green: true }, RAN_AT);

    expect(m.gate?.green).toBe(true);
    expect(m.gate?.failedStage).toBeUndefined();
    expect(m.gateProgress).toBeUndefined();
  });

  it('survives a red run that never reported a stage', () => {
    // A build dying at load never writes gateProgress.
    const m = manifest();

    applyGateVerdict(m, { green: false }, RAN_AT);

    expect(m.gate?.green).toBe(false);
    expect(m.gate?.failedStage).toBeUndefined();
  });
});

describe('applyPreviewGateVerdict', () => {
  it('keeps the dying stage on the preview lane too', () => {
    const m = manifest({ gateProgress: { lane: 'preview', stage: 'smoke', index: 3, total: 6, at: RAN_AT } });

    applyPreviewGateVerdict(m, { green: false }, RAN_AT);

    expect(m.previewGate?.failedStage).toBe('smoke');
    expect(m.gateProgress).toBeUndefined();
  });
});

describe('applyHealthVerdict', () => {
  it('leaves the acceptance verdict alone', () => {
    // Health is latest; the gate verdict is provenance.
    const m = manifest({ gate: { green: true, ranAt: RAN_AT } });

    applyHealthVerdict(m, { green: false, report: 'engine moved' }, RAN_AT);

    expect(m.health?.green).toBe(false);
    expect(m.gate?.green).toBe(true);
  });
});

describe('toRecentBuild', () => {
  it('gives the bar a lane-correct denominator and a frozen red position', () => {
    const m = manifest({
      deliveryMode: 'publish',
      gate: { green: false, ranAt: RAN_AT, failedStage: 'trace' },
    });

    expect(toRecentBuild(m)).toMatchObject({ verdict: 'red', failedStage: 'trace', failedIndex: 5, total: 12 });
  });

  it('counts preview stages, not publish ones', () => {
    const m = manifest({
      deliveryMode: 'preview',
      previewGate: { green: false, ranAt: RAN_AT, failedStage: 'smoke' },
    });

    expect(toRecentBuild(m)).toMatchObject({ mode: 'preview', failedIndex: 3, total: 6 });
  });

  it('reports a pending build with a denominator but no position', () => {
    const built = toRecentBuild(manifest());

    expect(built.verdict).toBe('pending');
    expect(built.total).toBe(12);
    expect(built.failedIndex).toBeUndefined();
  });

  it('carries no position on green', () => {
    const m = manifest({ gate: { green: true, ranAt: RAN_AT } });

    expect(toRecentBuild(m)).toMatchObject({ verdict: 'green', total: 12 });
    expect(toRecentBuild(m).failedIndex).toBeUndefined();
  });

  it('preserves authorship, summary, and fileCount from manifest', () => {
    const m = manifest({
      gate: { green: true, ranAt: RAN_AT },
      authorship: 'agent',
      summary: 'Added sound effects',
      sourceFiles: ['SPEC.md', 'GAME.json', 'game.ts'],
    });

    expect(toRecentBuild(m)).toMatchObject({
      verdict: 'green',
      authorship: 'agent',
      summary: 'Added sound effects',
      fileCount: 3,
    });
  });
});
