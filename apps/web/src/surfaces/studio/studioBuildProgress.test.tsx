// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n/index.js';
import { StudioBuildBar } from './StudioBuildBar.js';
import { StudioStageCard } from './StudioStageCard.js';
import type { SubmissionStatus } from '../../submissionApi.js';

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

// Proves it renders as a bar: a real width, not a label.
describe('the build bar as a progress bar', () => {
  const running = {
    status: 'building',
    phase: 'submitted',
    recentBuilds: [
      { version: 'v9', createdAt: '2026-08-21T17:40:00.000Z', mode: 'publish', verdict: 'pending', total: 12 },
    ],
    gateProgress: { lane: 'publish', stage: 'trace', index: 5, total: 12, at: '2026-08-21T17:42:00.000Z' },
  } as unknown as SubmissionStatus;

  it('sets a real fill width from the stage index', async () => {
    const host = await render(<StudioBuildBar status={running} />);
    const fill = host.querySelector<HTMLElement>('.studio-build-bar-fill');

    expect(fill?.style.width).toBe('50%');
    expect(fill?.className).not.toContain('is-indeterminate');
  });

  it('grows as the gate advances', async () => {
    const later = { ...running, gateProgress: { ...running.gateProgress!, stage: 'accept', index: 8, total: 12 } };
    const host = await render(<StudioBuildBar status={later as SubmissionStatus} />);

    expect(host.querySelector<HTMLElement>('.studio-build-bar-fill')?.style.width).toBe('75%');
  });

  it('is indeterminate, with no width, before the first stage', async () => {
    const host = await render(<StudioBuildBar status={{ ...running, gateProgress: undefined } as SubmissionStatus} />);
    const fill = host.querySelector<HTMLElement>('.studio-build-bar-fill');

    expect(fill?.className).toContain('is-indeterminate');
    expect(fill?.style.width).toBe('');
  });

  it('freezes a red build partway instead of filling', async () => {
    const red = {
      status: 'needs_changes',
      recentBuilds: [
        {
          version: 'v9',
          createdAt: '2026-08-21T17:40:00.000Z',
          mode: 'publish',
          verdict: 'red',
          failedIndex: 1,
          total: 12,
        },
      ],
    } as unknown as SubmissionStatus;
    const host = await render(<StudioBuildBar status={red} />);

    expect(host.querySelector('.studio-build-bar')?.className).toContain('is-red');
    expect(host.querySelector<HTMLElement>('.studio-build-bar-fill')?.style.width).toBe('17%');
  });
});

// The window between delivery and the gate's first stage report.
describe('the stage card before the gate reports a stage', () => {
  const justDelivered = {
    status: 'building',
    phase: 'submitted',
    events: [
      { id: 'e1', text: 'Graphics pass: lit cities that dim when struck', createdAt: '2026-08-21T17:40:00.000Z' },
    ],
    recentBuilds: [
      { version: 'v9', createdAt: '2026-08-21T17:40:00.000Z', mode: 'publish', verdict: 'pending', total: 12 },
    ],
  } as unknown as SubmissionStatus;

  it('says it is checking, not that the agent is still writing', async () => {
    const host = await render(<StudioStageCard status={justDelivered} />);
    const text = host.textContent ?? '';

    expect(text).toContain('Checking the build.');
    expect(text).not.toContain('Graphics pass');
  });
});
