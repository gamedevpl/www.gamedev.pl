// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDetailsBuildProgress } from './StudioDetailsBuildProgress.js';
import i18n from '../../i18n/index.js';
import { getSubmissionStatus } from '../../submissionApi.js';

vi.mock('../../submissionApi', async () => {
  const actual = await vi.importActual<typeof import('../../submissionApi.js')>('../../submissionApi.js');
  return {
    ...actual,
    getSubmissionStatus: vi.fn(),
  };
});

const mockedGetSubmissionStatus = vi.mocked(getSubmissionStatus);

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('StudioDetailsBuildProgress', () => {
  afterEach(() => {
    mockedGetSubmissionStatus.mockReset();
  });

  it('renders the checklist fraction relocated from the thread foot', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'building',
      progress: {
        headSha: 'sha-1',
        commits: [],
        checklist: [
          { text: 'Collision', checked: true },
          { text: 'Sprites', checked: true },
          { text: 'Audio', checked: false },
        ],
        revisions: [],
      },
    });
    await i18n.changeLanguage('en');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(StudioDetailsBuildProgress, { token: 'progress-token' }));
      await flushEffects();
      await flushEffects();
    });

    const panel = container.querySelector('[data-testid="studio-details-progress"]');
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain('2 of 3 done');
    expect(panel?.textContent).toContain('Collision');
    expect(panel?.textContent).toContain('Audio');
    expect(panel?.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('2');

    await act(async () => {
      root.unmount();
    });
  });

  it('renders nothing when the round has no checklist yet', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'building',
      progress: { headSha: 'sha-1', commits: [], checklist: [], revisions: [] },
    });
    await i18n.changeLanguage('en');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(StudioDetailsBuildProgress, { token: 'empty-progress' }));
      await flushEffects();
      await flushEffects();
    });

    expect(container.querySelector('[data-testid="studio-details-progress"]')).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });
});
