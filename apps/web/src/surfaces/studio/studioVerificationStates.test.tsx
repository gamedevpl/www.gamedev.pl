// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import type { SubmissionStatus } from '../../submissionApi.js';
import { StudioBuildBar } from './StudioBuildBar.js';
import { StudioBuildHistory } from './StudioBuildHistory.js';

const cleanups: Array<() => void> = [];
const select = vi.fn();
const candidate = {
  jobId: 42,
  version: 'current',
  createdAt: '2026-10-18T18:00:00Z',
  mode: 'publish',
  verdict: 'pending',
} as const;
const status: SubmissionStatus = {
  status: 'building',
  phase: 'submitted',
  jobId: 42,
  stall: 'ended',
  preview: { slug: 'game' },
  progress: { headSha: candidate.version, commits: [], checklist: [], revisions: [] },
  recentBuilds: [
    candidate,
    { ...candidate, version: 'passed', createdAt: '2026-10-18T17:00:00Z', verdict: 'green', finishedInMs: 180_000 },
  ],
};

async function render(value: SubmissionStatus) {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  cleanups.push(() => root.unmount());
  await act(async () => {
    root.render(
      <>
        <StudioBuildBar status={value} />
        <StudioBuildHistory status={value} onSelectPreviewVersion={select} />
      </>,
    );
  });
  return host;
}

afterEach(async () => {
  await act(async () => {
    while (cleanups.length) cleanups.pop()!();
  });
  document.body.innerHTML = '';
  select.mockClear();
});

it.each(['ended', 'quiet'] as const)(
  'keeps a submitted round starting before its first milestone with %s',
  async (stall) => {
    const host = await render({ ...status, stall });
    expect(host.querySelector('[role="progressbar"]')?.getAttribute('aria-busy')).toBe('true');
    expect(host.querySelector('.studio-build-bar-label')?.textContent).toBe('Verification starting');
    expect(host.querySelector('.studio-build-bar-eta')?.textContent).toContain('3');
    expect(host.querySelector('.studio-build-history-live')?.className).toContain('is-live');
    expect(host.querySelector('.studio-build-history-verdict')?.textContent).toBe('Checking…');
  },
);

it('stops claiming startup once the submitted gate is reported not started', async () => {
  const host = await render({ ...status, stall: 'gate_not_started' });
  expect(host.querySelector('[role="progressbar"]')?.getAttribute('aria-busy')).toBe('false');
  expect(host.querySelector('.studio-build-bar-eta')).toBeNull();
  expect(host.querySelector('.studio-build-bar-label')?.textContent).toBe('Awaiting verification');
  expect(host.querySelector('.studio-build-history-live')?.textContent).toBe('Changes saved; awaiting verification');
  expect(host.querySelector('.studio-build-history-verdict')?.textContent).toBe('Awaiting verification');
});

it('keeps both surfaces idle when the only pending delivery belongs to an older round', async () => {
  const host = await render({ ...status, jobId: 43, phase: 'building' });
  expect(host.querySelector('[role="progressbar"]')?.getAttribute('aria-busy')).toBe('false');
  expect(host.querySelector('.studio-build-bar-label')?.textContent).toBe('No verification result');
  expect(host.querySelector('.studio-build-history-live')?.textContent).toBe('No build is running right now');
  expect(host.querySelector('.studio-build-history-verdict')?.textContent).toBe('No verification result');
});

it.each(['ended', undefined] as const)(
  'does not attribute an older pending delivery to the current round with %s',
  async (stall) => {
    const host = await render({
      ...status,
      phase: 'building',
      stall,
      recentBuilds: [candidate, { ...candidate, jobId: 41, version: 'older', createdAt: '2026-10-18T17:00:00Z' }],
    });
    const verdicts = [...host.querySelectorAll('.studio-build-history-verdict')].map((row) => row.textContent);
    expect(verdicts).toEqual([stall ? 'Awaiting verification' : 'Checking…', 'No verification result']);
  },
);

it.each([true, false])('offers a pending preview only when the saved head is exposed: %s', async (available) => {
  const host = await render({ ...status, preview: available ? status.preview : undefined });
  await act(async () => host.querySelector<HTMLElement>('.studio-build-history-summary')!.click());
  const preview = [...host.querySelectorAll('button')].find((button) => button.textContent?.includes('Preview build'));
  expect(Boolean(preview)).toBe(available);
  if (preview) {
    await act(async () => preview.click());
    expect(select).toHaveBeenCalledWith(candidate.version);
  }
});
