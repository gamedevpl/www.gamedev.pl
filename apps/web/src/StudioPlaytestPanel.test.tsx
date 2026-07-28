// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n/index.js';
import { StudioPlaytestPanel } from './StudioPlaytestPanel.js';
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
  });

  afterEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
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
    await act(async () => {
      exit.click();
    });
    expect(onExit).toHaveBeenCalledTimes(1);

    root.unmount();
    expect(document.body.classList.contains('player-open')).toBe(false);
  });
});
