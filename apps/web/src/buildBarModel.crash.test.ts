import { describe, expect, it } from 'vitest';

import { buildBarModel } from './buildBarModel.js';
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

describe('gate interruption readout', () => {
  it('labels a timeout clearly and removes the running ETA', () => {
    const model = buildBarModel(
      status({ recentBuilds: [build({ verdict: 'red', status: 'timed_out', failedIndex: 8 })] }),
      t,
    );
    expect(model).toMatchObject({ state: 'red', label: 'studioPanel.buildBar.timedOut', etaMinutes: null });
  });

  it('stops a stale progress bar when the round already reports a gate crash', () => {
    const model = buildBarModel(
      status({
        status: 'needs_changes',
        failure: { reason: 'gate_crashed' },
        recentBuilds: [build()],
        gateProgress: { lane: 'publish', stage: 'agent-play', index: 8, total: 12, at: '2026-10-12T22:00:00.000Z' },
      }),
      t,
    );
    expect(model).toMatchObject({ state: 'red', label: 'studioPanel.buildBar.crashed', etaMinutes: null });
  });
});
