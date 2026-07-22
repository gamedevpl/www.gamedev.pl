// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n';
import { SubmissionStatusView } from './SubmissionStatusView';
import { getSubmissionStatus } from './submissionApi';

vi.mock('./submissionApi', async () => {
  const actual = await vi.importActual<typeof import('./submissionApi')>('./submissionApi');
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

describe('SubmissionStatusView', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    window.location.hash = '#/';
    vi.clearAllMocks();
  });

  it('renders queued state copy', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({ status: 'queued' });
    await i18n.changeLanguage('en');
    window.location.hash = '#/status/queued-token';

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'queued-token' }));
      await flushEffects();
    });

    expect(container.textContent).toContain('In the queue');

    await act(async () => {
      root.unmount();
    });
  });

  it('renders needs changes state copy', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({ status: 'needs_changes' });
    await i18n.changeLanguage('en');
    window.location.hash = '#/status/needs-changes';

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'needs-changes' }));
      await flushEffects();
    });

    expect(container.textContent).toContain('Needs changes');

    await act(async () => {
      root.unmount();
    });
  });

  it('renders the published play flow with the published game URL', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'published',
      slug: 'sky-dodge',
      playUrl: 'https://example.com/games/sky-dodge/index.html',
    });
    await i18n.changeLanguage('en');
    window.location.hash = '#/status/published-token';

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'published-token', submittedTitle: 'Sky Dodge' }));
      await flushEffects();
    });

    expect(container.textContent).toContain('Ready to play!');

    const playButton = container.querySelector('button');
    expect(playButton?.textContent).toBe('Play your game');

    await act(async () => {
      playButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });

    const iframe = container.querySelector('iframe[title="Sky Dodge"]');
    expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts');
    expect(iframe?.getAttribute('src')).toBe('https://example.com/games/sky-dodge/index.html');

    await act(async () => {
      root.unmount();
    });
  });
});
