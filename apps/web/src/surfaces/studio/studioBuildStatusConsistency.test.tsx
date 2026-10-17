// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n/index.js';
import type { SubmissionStatus } from '../../submissionApi.js';
import { StudioBuildBar } from './StudioBuildBar.js';
import { StudioBuildHistory } from './StudioBuildHistory.js';

const unmounts: Array<() => void> = [];
const version = 'v20261013T004711987Z-6c803e66a65b';

async function render(status: SubmissionStatus) {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <>
        <StudioBuildBar status={status} liveVersion={version} />
        <StudioBuildHistory status={status} />
      </>,
    );
  });
  unmounts.push(() => {
    root.unmount();
    host.remove();
  });
  return host;
}

afterEach(() => {
  while (unmounts.length) unmounts.pop()!();
});

describe('Studio status after a round without a new delivery', () => {
  it.each<Partial<SubmissionStatus>>([
    { status: 'in_review', phase: 'ready_for_review' },
    { status: 'published', phase: 'published' },
    { status: 'needs_changes', phase: 'failed' },
    { status: 'abandoned', phase: 'abandoned' },
    { status: 'building', stall: 'ended' },
    { status: 'building', stall: 'quiet' },
  ])('keeps the bar and history idle for $status / $phase / $stall', async (round) => {
    const host = await render({
      status: 'in_review',
      ...round,
      jobId: 42,
      recentBuilds: [
        {
          jobId: 41,
          version,
          createdAt: '2026-10-13T00:47:11.987Z',
          mode: 'publish',
          verdict: 'green',
          finishedInMs: 300_000,
        },
      ],
    });

    expect(host.querySelector('.studio-build-history-live')?.textContent).toBe('No build is running right now');
    expect(host.querySelector('.studio-build-bar-label')?.textContent).toBe('Checks passed');
    expect(host.querySelector('[role="progressbar"]')?.getAttribute('aria-busy')).toBe('false');
    expect(host.querySelector('.studio-build-bar-eta')).toBeNull();
    expect(host.querySelector('.studio-build-bar-tag.is-playing')?.textContent).toBe('Playing #6c803e');
  });

  it.each(['preview', 'publish'] as const)(
    'keeps both surfaces busy for a pending %s after agent end',
    async (mode) => {
      const host = await render({
        status: 'building',
        phase: mode === 'preview' ? 'building' : 'submitted',
        stall: 'ended',
        jobId: 42,
        gateProgress: { lane: mode, stage: 'preparing', index: 0, total: 6, at: '2026-10-13T00:47:12.000Z' },
        recentBuilds: [{ jobId: 42, version, createdAt: '2026-10-13T00:47:11.987Z', mode, verdict: 'pending' }],
      });

      expect(host.querySelector('.studio-build-history-live')?.className).toContain('is-live');
      expect(host.querySelector('[role="progressbar"]')?.getAttribute('aria-busy')).toBe('true');
    },
  );
});
