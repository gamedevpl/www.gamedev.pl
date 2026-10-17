// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStageSource } from './useStageSource.js';
import { getChannelPlayable, getSubmissionPreview } from './submissionApi.js';
import type { SubmissionStatus } from './submissionApi.js';
import { fetchPublishedGame } from './catalog.js';

vi.mock('./submissionApi.js', async () => {
  const actual = await vi.importActual<typeof import('./submissionApi.js')>('./submissionApi.js');
  return { ...actual, getSubmissionPreview: vi.fn(), getChannelPlayable: vi.fn() };
});

vi.mock('./catalog.js', async () => {
  const actual = await vi.importActual<typeof import('./catalog.js')>('./catalog.js');
  return { ...actual, fetchPublishedGame: vi.fn() };
});

const mockedGetSubmissionPreview = vi.mocked(getSubmissionPreview);
const mockedGetChannelPlayable = vi.mocked(getChannelPlayable);
const mockedFetchPublishedGame = vi.mocked(fetchPublishedGame);

function statusFor(slug: string, headSha: string): SubmissionStatus {
  return {
    status: 'building',
    preview: { slug },
    progress: { headSha, commits: [], checklist: [], revisions: [] },
  };
}

function probe() {
  let latest: ReturnType<typeof useStageSource> | null = null;
  function Probe(props: {
    token: string;
    status: SubmissionStatus | null;
    options?: { selectedPreviewVersion?: string | null };
  }) {
    latest = useStageSource(props.token, props.status, props.options);
    return null;
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  return {
    render: async (
      token: string,
      status: SubmissionStatus | null,
      options?: { selectedPreviewVersion?: string | null },
    ) => {
      await act(async () => {
        root.render(createElement(Probe, { token, status, options }));
      });
    },
    latest: () => latest!,
    root,
  };
}

describe('Studio preview delivery', () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedGetSubmissionPreview.mockReset();
    mockedGetChannelPlayable.mockReset();
    mockedFetchPublishedGame.mockReset();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('loads a new delivery while the previous preview request is still running', async () => {
    let finishOld!: (value: Awaited<ReturnType<typeof getSubmissionPreview>>) => void;
    mockedGetSubmissionPreview
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOld = resolve;
          }),
      )
      .mockResolvedValue({ slug: 'sky-dodge', title: 'Sky Dodge', html: '<p>new delivery</p>' });

    const { render, latest, root } = probe();
    await render('token-a', statusFor('sky-dodge', 'old'));
    await render('token-a', {
      ...statusFor('sky-dodge', 'new'),
      recentBuilds: [{ version: 'new', createdAt: new Date().toISOString(), mode: 'preview', verdict: 'pending' }],
    });
    expect(mockedGetSubmissionPreview).toHaveBeenCalledTimes(2);
    expect(mockedGetSubmissionPreview).toHaveBeenLastCalledWith('token-a', 'new');
    expect(latest().rawHtml).toBe('<p>new delivery</p>');
    expect(latest().origin.version).toBe('new');

    await act(async () => {
      finishOld({ slug: 'sky-dodge', title: 'Sky Dodge', html: '<p>old delivery</p>' });
    });
    expect(latest().rawHtml).toBe('<p>new delivery</p>');
    expect(latest().origin.version).toBe('new');
    root.unmount();
  });

  it('gives a new delivery its own retries after the previous preview failed', async () => {
    vi.useFakeTimers();
    const { render, latest, root } = probe();
    try {
      mockedGetSubmissionPreview.mockRejectedValue(new Error('preview not ready'));
      await render('token-a', statusFor('sky-dodge', 'old'));
      for (let i = 0; i < 3; i++) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(4_000);
        });
      }
      expect(mockedGetSubmissionPreview).toHaveBeenCalledTimes(4);

      mockedGetSubmissionPreview
        .mockRejectedValueOnce(new Error('new preview not ready'))
        .mockResolvedValue({ slug: 'sky-dodge', title: 'Sky Dodge', html: '<p>new delivery</p>' });
      await render('token-a', statusFor('sky-dodge', 'new'));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4_000);
      });
      expect(latest().rawHtml).toBe('<p>new delivery</p>');
      expect(latest().origin.version).toBe('new');
    } finally {
      await act(async () => root.unmount());
      vi.useRealTimers();
    }
  });

  it('loads the finished build after exhausting its pending-preview retries, without a gate timestamp', async () => {
    vi.useFakeTimers();
    const { render, latest, root } = probe();
    try {
      mockedGetSubmissionPreview.mockResolvedValue({ slug: 'sky-dodge', title: 'Sky Dodge', html: '<p>old</p>' });
      await render('token-a', statusFor('sky-dodge', 'old'));
      mockedGetSubmissionPreview.mockRejectedValue(new Error('preview not ready'));
      const pending: SubmissionStatus = {
        ...statusFor('sky-dodge', 'new'),
        recentBuilds: [{ version: 'new', createdAt: new Date().toISOString(), mode: 'preview', verdict: 'pending' }],
      };
      await render('token-a', pending);
      for (let i = 0; i < 3; i++) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(4_000);
        });
      }
      expect(latest().rawHtml).toBe('<p>old</p>');
      mockedGetSubmissionPreview.mockResolvedValue({ slug: 'sky-dodge', title: 'Sky Dodge', html: '<p>finished</p>' });
      await render('token-a', {
        ...pending,
        recentBuilds: [{ ...pending.recentBuilds![0]!, verdict: 'green' }],
      });
      expect(latest().rawHtml).toBe('<p>finished</p>');
      expect(latest().origin.version).toBe('new');
    } finally {
      await act(async () => root.unmount());
      vi.useRealTimers();
    }
  });
});
