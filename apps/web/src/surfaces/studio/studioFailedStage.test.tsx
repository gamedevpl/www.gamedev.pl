// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n/index.js';
import type { SubmissionStatus } from '../../submissionApi.js';
import { StudioBuildBar } from './StudioBuildBar.js';
import { StudioBuildHistory } from './StudioBuildHistory.js';

const hosts: Array<() => void> = [];

async function render(node: React.ReactElement) {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(node);
  });
  hosts.push(() => {
    root.unmount();
    host.remove();
  });
  return host;
}

afterEach(() => {
  while (hosts.length) hosts.pop()!();
});

describe('failed check visibility in Studio build bar and history', () => {
  it('names the failed check in the build bar and build history details', async () => {
    const red = {
      status: 'needs_changes',
      slug: 'airtime',
      recentBuilds: [
        {
          version: 'v20261101T125112776Z-4d41fc8e3242',
          createdAt: '2026-11-01T12:51:12.776Z',
          mode: 'publish',
          verdict: 'red',
          failedStage: 'trace',
          failedIndex: 5,
          total: 12,
          report: 'FAIL trace airtime: behavior changed against the committed trace',
        },
      ],
    } as unknown as SubmissionStatus;
    const host = await render(
      <>
        <StudioBuildBar status={red} />
        <StudioBuildHistory status={red} />
      </>,
    );

    expect(host.querySelector('.studio-build-bar-label')?.textContent).toBe('Check failed: Behaviour trace');
    expect(host.querySelector('.studio-build-history-live')?.textContent).toBe(
      'Latest build failed verification — expand it below for details and next steps',
    );
    expect(host.querySelector('.studio-build-history-verdict')?.textContent).toBe('Failed · Behaviour trace');

    await act(async () => {
      host.querySelector<HTMLElement>('.studio-build-history-summary')?.click();
    });

    expect(host.querySelector('[data-testid="build-failed-stage"]')?.textContent).toBe(
      'Failed check: Behaviour trace (trace)',
    );
    const guidance = host.querySelector('[data-testid="build-failure-guidance"]')?.textContent;
    expect(guidance).toContain('The game rendered or behaved differently than its recorded baseline trace.');
    expect(guidance).toContain('What to do: Open Chat and ask the agent to fix the checks');
    expect(host.querySelector('[data-testid="build-failure-report"]')?.textContent).toContain(
      'FAIL trace airtime: behavior changed against the committed trace',
    );
  });

  it('shows a fallback explanation and next steps even when a red build has no stage or report', async () => {
    const redWithoutStage = {
      status: 'published',
      slug: 'airtime',
      recentBuilds: [
        {
          version: 'v20261101T125112776Z-4d41fc8e3242',
          createdAt: '2026-11-01T12:51:12.776Z',
          mode: 'publish',
          verdict: 'red',
        },
      ],
    } as unknown as SubmissionStatus;
    const host = await render(<StudioBuildHistory status={redWithoutStage} />);

    await act(async () => {
      host.querySelector<HTMLElement>('.studio-build-history-summary')?.click();
    });

    const guidance = host.querySelector('[data-testid="build-failure-guidance"]')?.textContent;
    expect(guidance).toContain('Automatic verification checks failed for this version');
    expect(guidance).toContain('What to do: Open Chat and ask the agent to fix the checks');
  });
});
