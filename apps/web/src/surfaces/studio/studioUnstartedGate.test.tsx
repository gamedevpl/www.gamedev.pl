// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
import { isBuildLive } from '../../buildLive.js';
import i18n from '../../i18n/index.js';
import type { SubmissionStatus } from '../../submissionApi.js';
import { StudioBuildBar } from './StudioBuildBar.js';
import { StudioBuildHistory } from './StudioBuildHistory.js';

const unmounts: Array<() => void> = [];
afterEach(async () => {
  await act(async () => {
    while (unmounts.length) unmounts.pop()!();
  });
  document.body.innerHTML = '';
});

it.each(['ended', 'quiet', 'gate_not_started'] as const)(
  'does not claim that a stored preview started verification after %s',
  async (stall) => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    const status: SubmissionStatus = {
      status: 'building',
      phase: 'building',
      stall,
      jobId: 42,
      preview: { slug: 'game' },
      progress: { headSha: 'stored', commits: [], checklist: [], revisions: [] },
      recentBuilds: [
        { jobId: 42, version: 'stored', createdAt: new Date().toISOString(), mode: 'preview', verdict: 'pending' },
      ],
    };
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    unmounts.push(() => root.unmount());
    await act(async () =>
      root.render(
        <>
          <StudioBuildBar status={status} liveVersion="stored" />
          <StudioBuildHistory status={status} playingVersion="stored" />
        </>,
      ),
    );

    expect(isBuildLive(status)).toBe(false);
    expect(host.querySelector('[role="progressbar"]')?.getAttribute('aria-busy')).toBe('false');
    expect(host.querySelector('.studio-build-bar-fill.is-indeterminate')).toBeNull();
    expect(host.querySelector('.studio-build-bar-eta')).toBeNull();
    expect(host.querySelector('.studio-build-bar-label')?.textContent).toBe('Awaiting verification');
    expect(host.querySelector('.studio-build-history-live')?.textContent).toBe('Changes saved; awaiting verification');
    expect(host.querySelector('.studio-build-history-dot.is-live')).toBeNull();
    expect(host.querySelector('.studio-build-history-verdict')?.textContent).toBe('Awaiting verification');
    expect(host.querySelector('.studio-build-history-playing')?.textContent).toContain('Playing');
    expect(isBuildLive({ ...status, phase: 'submitted' })).toBe(false);
    expect(
      isBuildLive({
        ...status,
        gateProgress: { lane: 'preview', stage: 'preparing', index: 0, total: 6, at: new Date().toISOString() },
      }),
    ).toBe(true);
  },
);
