import { describe, expect, it } from 'vitest';

import { buildBarModel, medianGateMinutes } from './buildBarModel.js';
import type { RecentBuild, SubmissionStatus } from './submissionApi.js';

const t = (key: string) => key;

function status(overrides: Partial<SubmissionStatus> = {}): SubmissionStatus {
  return { status: 'building', ...overrides } as SubmissionStatus;
}

function build(overrides: Partial<RecentBuild> = {}): RecentBuild {
  return {
    version: 'v1',
    createdAt: '2026-08-21T08:00:00.000Z',
    mode: 'publish',
    verdict: 'pending',
    total: 12,
    ...overrides,
  };
}

describe('medianGateMinutes', () => {
  it('ignores a single slow outlier', () => {
    // One game's real spread, plus a straggler.
    const builds = [174, 176, 188, 203, 210, 540].map((s) => build({ verdict: 'green', finishedInMs: s * 1000 }));

    expect(medianGateMinutes(builds)).toBe(3);
  });

  it('says nothing when no build has finished', () => {
    expect(medianGateMinutes([build()])).toBeNull();
    expect(medianGateMinutes(undefined)).toBeNull();
  });
});

describe('buildBarModel', () => {
  it('is indeterminate before the gate reports a stage', () => {
    // A hard 0 here is what reads as stuck.
    const model = buildBarModel(status({ recentBuilds: [build()] }), t);

    expect(model).toMatchObject({ state: 'starting', fraction: null });
  });

  it('grows with the stage index', () => {
    const model = buildBarModel(
      status({
        recentBuilds: [build()],
        gateProgress: { lane: 'publish', stage: 'trace', index: 5, total: 12, at: '2026-08-21T08:01:00.000Z' },
      }),
      t,
    );

    expect(model?.state).toBe('running');
    expect(model?.fraction).toBeCloseTo(0.5);
  });

  it('freezes a red build where it died, and stays red', () => {
    const model = buildBarModel(status({ recentBuilds: [build({ verdict: 'red', failedIndex: 1, total: 12 })] }), t);

    expect(model?.state).toBe('red');
    expect(model?.fraction).toBeCloseTo(2 / 12);
  });

  it('does not paint green when the newest build failed', () => {
    // The old badge went green on "nothing running".
    const builds = [build({ verdict: 'red', failedIndex: 3 }), build({ version: 'v0', verdict: 'green' })];

    expect(buildBarModel(status({ recentBuilds: builds }), t)?.state).toBe('red');
  });

  it('fills green on a pass', () => {
    const model = buildBarModel(status({ recentBuilds: [build({ verdict: 'green' })] }), t);

    expect(model).toMatchObject({ state: 'green', fraction: 1, etaMinutes: null });
  });

  it('shows nothing at all before the first delivery', () => {
    expect(buildBarModel(status({ recentBuilds: [] }), t)).toBeNull();
    expect(buildBarModel(undefined, t)).toBeNull();
  });

  it('reads "round in progress" when the newest build belongs to a prior round', () => {
    const model = buildBarModel(status({ jobId: 42, recentBuilds: [build({ verdict: 'green', jobId: 41 })] }), t);

    expect(model).toMatchObject({ state: 'starting', fraction: null, label: 'studioPanel.buildBar.roundInProgress' });
  });

  it('trusts the newest build once it belongs to the current round', () => {
    const model = buildBarModel(status({ jobId: 42, recentBuilds: [build({ verdict: 'green', jobId: 42 })] }), t);

    expect(model).toMatchObject({ state: 'green' });
  });

  it('counts preview lanes out of six', () => {
    const model = buildBarModel(
      status({
        recentBuilds: [build({ mode: 'preview', total: 6 })],
        gateProgress: { lane: 'preview', stage: 'smoke', index: 3, total: 6, at: '2026-08-21T08:01:00.000Z' },
      }),
      t,
    );

    expect(model?.fraction).toBeCloseTo(4 / 6);
  });
});
