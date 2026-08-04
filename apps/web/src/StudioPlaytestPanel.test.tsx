// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n/index.js';
import { PREVIEW_POLL_MS, StudioPlaytestPanel } from './StudioPlaytestPanel.js';
import type { StudioGame } from './studioApi.js';

vi.mock('./catalog.js', () => ({
  fetchPublishedGame: vi.fn(async () => ({
    slug: 'sky-dodge',
    title: 'Sky Dodge',
    html: '<!doctype html><html><body><canvas id="game"></canvas></body></html>',
  })),
}));

vi.mock('./submissionApi.js', () => ({
  getSubmissionPreview: vi.fn(async () => ({
    html: '<!doctype html><html><body><canvas id="game"></canvas></body></html>',
  })),
  submitFeedback: vi.fn(),
}));

vi.mock('./studioApi.js', async () => {
  const actual = await vi.importActual<typeof import('./studioApi.js')>('./studioApi.js');
  return {
    ...actual,
    submitImprovement: vi.fn(),
  };
});

const game: StudioGame = {
  token: 'tok-1',
  title: 'Sky Dodge',
  createdAt: '2026-07-01T00:00:00.000Z',
  lastKnownStatus: 'published',
  slug: 'sky-dodge',
  publishedAt: '2026-07-02T00:00:00.000Z',
};

describe('StudioPlaytestPanel theater', () => {
  beforeEach(() => {
    document.body.className = '';
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
    vi.useRealTimers();
  });

  it('opens a full-viewport theater with overlay controls once the build loads', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');

    const onExit = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(StudioPlaytestPanel, { game, published: true, onExit }));
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const theater = container.querySelector('.studio-playtest-theater');
    expect(theater).not.toBeNull();
    expect(theater?.getAttribute('role')).toBe('dialog');
    expect(container.querySelector('.studio-playtest-bar')).not.toBeNull();
    expect(container.querySelector('.studio-playtest-viewport .game-frame')).not.toBeNull();
    expect(container.querySelector('.studio-playtest-stage')).toBeNull();
    expect(document.body.classList.contains('player-open')).toBe(true);

    const exit = container.querySelector('.exit-btn') as HTMLButtonElement;
    expect(exit).not.toBeNull();

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onExit).toHaveBeenCalledTimes(1);

    await act(async () => {
      exit.click();
    });
    expect(onExit).toHaveBeenCalledTimes(2);

    root.unmount();
    expect(document.body.classList.contains('player-open')).toBe(false);
  });

  it('offers a way back to the thread when no playable build exists', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');

    const { getSubmissionPreview } = await import('./submissionApi.js');
    vi.mocked(getSubmissionPreview).mockRejectedValueOnce(new Error('no preview'));

    const onExit = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const unpublished: StudioGame = { ...game, lastKnownStatus: 'building', slug: undefined, publishedAt: undefined };

    await act(async () => {
      root.render(createElement(StudioPlaytestPanel, { game: unpublished, published: false, onExit }));
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('.studio-playtest-theater')).toBeNull();
    expect(container.textContent).toContain('No playable build is ready yet');
    expect(container.textContent).not.toContain('Build tab');

    const back = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Back to thread'),
    );
    expect(back).toBeTruthy();

    await act(async () => {
      back!.click();
    });
    expect(onExit).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onExit).toHaveBeenCalledTimes(2);

    root.unmount();
  });

  it('keeps waiting on 409 until the gate preview is ready', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    vi.useFakeTimers();

    const { getSubmissionPreview } = await import('./submissionApi.js');
    const previewHtml = '<!doctype html><html><body><canvas id="game"></canvas></body></html>';
    vi.mocked(getSubmissionPreview)
      .mockRejectedValueOnce(Object.assign(new Error('no preview available'), { status: 409 }))
      .mockResolvedValueOnce({
        slug: 'sky-dodge',
        title: 'Sky Dodge',
        html: previewHtml,
      });

    const onExit = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const unpublished: StudioGame = { ...game, lastKnownStatus: 'building', slug: undefined, publishedAt: undefined };

    await act(async () => {
      root.render(createElement(StudioPlaytestPanel, { game: unpublished, published: false, onExit }));
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('.studio-playtest-theater')).toBeNull();
    expect(container.textContent).toContain('Automated checks are assembling your draft');
    expect(container.textContent).not.toContain('No playable build is ready yet');
    expect(vi.mocked(getSubmissionPreview)).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PREVIEW_POLL_MS);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(vi.mocked(getSubmissionPreview)).toHaveBeenCalledTimes(2);
    expect(container.querySelector('.studio-playtest-theater')).not.toBeNull();
    expect(container.textContent).not.toContain('Automated checks are assembling your draft');

    root.unmount();
    vi.useRealTimers();
  });

  it('does not exit on Escape when shelfOpen is true', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');

    const onExit = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(StudioPlaytestPanel, { game, published: true, onExit, shelfOpen: true }));
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onExit).not.toHaveBeenCalled();

    root.unmount();
  });
});
