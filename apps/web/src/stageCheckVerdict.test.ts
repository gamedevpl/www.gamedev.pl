import { describe, expect, it } from 'vitest';

import { stageCheckVerdict } from './stageCheckVerdict.js';
import type { SubmissionStatus } from './submissionApi.js';

function status(overrides: Partial<SubmissionStatus>): SubmissionStatus {
  return { status: 'building', ...overrides } as SubmissionStatus;
}

const builds: SubmissionStatus['recentBuilds'] = [
  { version: 'v-new', createdAt: '2026-09-30T22:47:00.000Z', mode: 'preview', verdict: 'red' },
  { version: 'v-old', createdAt: '2026-09-30T22:30:00.000Z', mode: 'preview', verdict: 'green' },
  { version: 'v-wip', createdAt: '2026-09-30T22:20:00.000Z', mode: 'preview', verdict: 'pending' },
];

describe('stageCheckVerdict', () => {
  it('reads the verdict of the build actually on stage, not the latest gate run', () => {
    const s = status({ recentBuilds: builds, previewGate: { green: false, ranAt: '2026-09-30T22:48:00.000Z' } });
    expect(stageCheckVerdict(s, 'v-old')).toBe(true);
    expect(stageCheckVerdict(s, 'v-new')).toBe(false);
  });

  it('says nothing while the staged build is still in the gate', () => {
    expect(stageCheckVerdict(status({ recentBuilds: builds }), 'v-wip')).toBeNull();
  });

  it('never claims a failure for a build it cannot identify', () => {
    const red = status({ previewGate: { green: false, ranAt: '2026-09-30T22:48:00.000Z' } });
    expect(stageCheckVerdict(red, null)).toBeNull();
    expect(stageCheckVerdict(red, 'v-unknown')).toBeNull();
  });

  it('falls back to a green preview gate when the build is not listed', () => {
    const green = status({ previewGate: { green: true, ranAt: '2026-09-30T22:48:00.000Z' } });
    expect(stageCheckVerdict(green, null)).toBe(true);
    expect(stageCheckVerdict(null, null)).toBeNull();
  });
});
