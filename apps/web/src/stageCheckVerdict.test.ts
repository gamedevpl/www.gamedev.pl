import { describe, expect, it } from 'vitest';

import { publishedBuildVersion, stageCheckVerdict } from './stageCheckVerdict.js';
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

  it('trusts the preview gate only for the head commit it ran on', () => {
    const gate = { green: true, ranAt: '2026-09-30T22:48:00.000Z' };
    const s = status({
      previewGate: gate,
      progress: { headSha: 'sha-head', commits: [], checklist: [], revisions: [] },
    });
    expect(stageCheckVerdict(s, 'sha-head')).toBe(true);
    expect(stageCheckVerdict({ ...s, previewGate: { ...gate, green: false } }, 'sha-head')).toBe(false);
    // A fresher channel build has no version: unverified bytes are never "checked".
    expect(stageCheckVerdict(s, null)).toBeNull();
    expect(stageCheckVerdict(s, 'sha-older')).toBeNull();
    expect(stageCheckVerdict(null, null)).toBeNull();
  });
});

describe('publishedBuildVersion', () => {
  it('names the newest green publish build, skipping previews and failed publishes', () => {
    const s = status({
      recentBuilds: [
        { version: 'v-pre', createdAt: '2026-09-30T22:50:00.000Z', mode: 'preview', verdict: 'green' },
        { version: 'v-red', createdAt: '2026-09-30T22:40:00.000Z', mode: 'publish', verdict: 'red' },
        { version: 'v-live', createdAt: '2026-09-30T22:30:00.000Z', mode: 'publish', verdict: 'green' },
        { version: 'v-older', createdAt: '2026-09-30T22:20:00.000Z', mode: 'publish', verdict: 'green' },
      ],
    });
    expect(publishedBuildVersion(s)).toBe('v-live');
  });

  it('says nothing once the publication has left the recent window', () => {
    expect(publishedBuildVersion(status({ recentBuilds: builds }))).toBeNull();
    expect(publishedBuildVersion(null)).toBeNull();
  });
});
