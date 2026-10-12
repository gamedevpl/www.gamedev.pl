// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import { StudioBuildHistory } from './StudioBuildHistory.js';
import { getSubmissionStatus, type SubmissionStatus } from '../../submissionApi.js';
import { SubmissionStatusView } from './SubmissionStatusView.js';

vi.mock('../../submissionApi.js', async () => {
  const actual = await vi.importActual<typeof import('../../submissionApi.js')>('../../submissionApi.js');
  return { ...actual, getSubmissionStatus: vi.fn() };
});

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

describe('Studio after a gate timeout', () => {
  it('shows the timeout in the rail without an active indicator', async () => {
    const status = {
      status: 'needs_changes',
      phase: 'needs_changes',
      stall: 'gate_crashed',
      jobId: 7,
      recentBuilds: [
        {
          jobId: 7,
          version: 'v9',
          createdAt: '2026-10-12T22:00:00.000Z',
          mode: 'publish',
          verdict: 'red',
          status: 'timed_out',
        },
      ],
    } as SubmissionStatus;
    const host = await render(<StudioBuildHistory status={status} />);
    expect(host.textContent).toContain('Build timed out');
    expect(host.querySelector('.studio-build-history-live')?.className).not.toContain('is-live');
    expect(host.querySelector('.studio-build-history-row')?.className).toContain('is-red');
  });
});

it('explains an interrupted check in chat instead of calling it a generic round error', async () => {
  vi.mocked(getSubmissionStatus).mockResolvedValue({
    status: 'needs_changes',
    phase: 'needs_changes',
    failure: { reason: 'gate_crashed' },
    builder: 'platform',
  });
  const host = await render(<SubmissionStatusView token="timeout-copy-token" embedded />);
  expect(host.textContent).toContain('Automated verification was interrupted.');
  expect(host.textContent).not.toContain('This build round ended with an error.');
});
