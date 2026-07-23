// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n';
import { ACTIVE_POLL_MS, SubmissionStatusView } from './SubmissionStatusView';
import { getSubmissionPreview, getSubmissionStatus } from './submissionApi';

vi.mock('./submissionApi', async () => {
  const actual = await vi.importActual<typeof import('./submissionApi')>('./submissionApi');
  return {
    ...actual,
    getSubmissionStatus: vi.fn(),
    getSubmissionPreview: vi.fn(),
  };
});

const mockedGetSubmissionStatus = vi.mocked(getSubmissionStatus);
const mockedGetSubmissionPreview = vi.mocked(getSubmissionPreview);

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

  it('shows the submitted prompt and a ticking elapsed timer while the build is running', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({ status: 'building' });
    await i18n.changeLanguage('en');
    window.location.hash = '#/status/elapsed-token';

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(SubmissionStatusView, {
          token: 'elapsed-token',
          submittedTitle: 'Circus Cat',
          submittedConcept: 'A black cat dodging hula hoops',
          submittedAt: Date.now() - 134_000,
        }),
      );
      await flushEffects();
    });

    // The prompt the player typed is echoed back, so they can see what they asked for.
    expect(container.textContent).toContain('A black cat dodging hula hoops');
    // 134s -> "2m 14s", proving the duration formatting and that the timer is mounted.
    expect(container.textContent).toContain('2m 14s');

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

    expect(container.textContent).toContain('Needs a tweak');

    await act(async () => {
      root.unmount();
    });
  });

  it('renders the published play flow served by the app API', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'published',
      slug: 'sky-dodge',
    });
    // PublishedGameFrame fetches the assembled game from GET /api/games/:slug.
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ slug: 'sky-dodge', title: 'Sky Dodge', html: '<canvas>published</canvas>' })),
      );
    await i18n.changeLanguage('en');
    window.location.hash = '#/status/published-token';

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'published-token', submittedTitle: 'Sky Dodge' }));
      await flushEffects();
    });

    expect(container.textContent).toContain('Live!');

    const playButton = container.querySelector('button');
    expect(playButton?.textContent).toBe('Play your game');

    await act(async () => {
      playButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
      await flushEffects();
    });

    expect(fetchSpy).toHaveBeenCalledWith('/api/games/sky-dodge');
    const iframe = container.querySelector('iframe[title="Sky Dodge"]');
    expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts');
    expect(iframe?.getAttribute('srcdoc')).toBe('<canvas>published</canvas>');

    fetchSpy.mockRestore();

    await act(async () => {
      root.unmount();
    });
  });

  it('renders the build progress checklist and commit log, and auto-loads the preview without a click', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionStatus.mockResolvedValue({
      status: 'building',
      preview: { slug: 'space-runner' },
      progress: {
        headSha: 'sha-1',
        commits: [{ message: 'Scaffold the game', committedDate: '2026-01-01T00:00:00Z' }],
        checklist: [
          { text: 'Scaffold index.html and game.js', checked: true },
          { text: 'Add collision detection', checked: false },
        ],
      },
    });
    mockedGetSubmissionPreview.mockResolvedValue({
      slug: 'space-runner',
      title: 'Space Runner',
      html: '<canvas></canvas>',
    });
    await i18n.changeLanguage('en');
    window.location.hash = '#/status/building-token';

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'building-token' }));
      await flushEffects();
      await flushEffects();
    });

    expect(container.textContent).toContain('Scaffold index.html and game.js');
    expect(container.textContent).toContain('Add collision detection');
    expect(container.textContent).toContain('Scaffold the game');

    // No manual "preview" button click required — it loads on its own once available.
    expect(mockedGetSubmissionPreview).toHaveBeenCalledWith('building-token');
    const iframe = container.querySelector('iframe[title="Space Runner"]');
    expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts');

    await act(async () => {
      root.unmount();
    });
  });

  it('refreshes the live preview only when the agent pushes a new commit (headSha changes)', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    try {
      let currentSha = 'sha-1';
      mockedGetSubmissionStatus.mockImplementation(async () => ({
        status: 'building',
        preview: { slug: 'space-runner' },
        progress: { headSha: currentSha, commits: [], checklist: [] },
      }));
      mockedGetSubmissionPreview.mockImplementation(async () => ({
        slug: 'space-runner',
        title: 'Space Runner',
        html: `<canvas>${currentSha}</canvas>`,
      }));
      await i18n.changeLanguage('en');
      window.location.hash = '#/status/refresh-token';

      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      await act(async () => {
        root.render(createElement(SubmissionStatusView, { token: 'refresh-token' }));
        await flushEffects();
        await flushEffects();
      });

      expect(mockedGetSubmissionPreview).toHaveBeenCalledTimes(1);
      expect(container.querySelector('iframe')?.getAttribute('srcdoc')).toBe('<canvas>sha-1</canvas>');

      // A status poll fires (still headSha "sha-1") — must NOT re-fetch the preview.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ACTIVE_POLL_MS);
        await flushEffects();
      });
      expect(mockedGetSubmissionStatus).toHaveBeenCalledTimes(2);
      expect(mockedGetSubmissionPreview).toHaveBeenCalledTimes(1);

      // The agent pushes a new commit — the next poll picks up a new headSha, which
      // must trigger a silent preview refresh (no click needed).
      currentSha = 'sha-2';
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ACTIVE_POLL_MS);
        await flushEffects();
      });

      expect(mockedGetSubmissionPreview).toHaveBeenCalledTimes(2);
      expect(container.querySelector('iframe')?.getAttribute('srcdoc')).toBe('<canvas>sha-2</canvas>');

      await act(async () => {
        root.unmount();
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
