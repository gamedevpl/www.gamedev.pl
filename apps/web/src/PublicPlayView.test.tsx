// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./catalog.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./catalog.js')>();
  return {
    ...actual,
    fetchPublishedGame: vi.fn(),
  };
});

import { PublicPlayView } from './PublicPlayView.js';
import { fetchPublishedGame } from './catalog.js';
import i18n from './i18n/index.js';

describe('PublicPlayView', () => {
  let container: HTMLDivElement;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    container = document.createElement('div');
    document.body.appendChild(container);
    vi.mocked(fetchPublishedGame).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    container.remove();
  });

  it('renders "Game not found" panel without leaking GameTheater chrome on 404', async () => {
    const error = new Error('Not found') as Error & { status?: number };
    error.status = 404;
    vi.mocked(fetchPublishedGame).mockRejectedValue(error);

    const onExit = vi.fn();
    const root = createRoot(container);
    await act(async () => {
      root.render(<PublicPlayView slug="ink-and-fury" onExit={onExit} />);
    });
    // usePublishedGameFetch retries 3 times on 404 with backoff (1s, 2s, 4s)
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(container.querySelector('.game-theater')).toBeNull();
    expect(container.querySelector('.theater-title')).toBeNull();
    expect(container.querySelector('.theater-badge')).toBeNull();
    expect(container.textContent).not.toContain('ink-and-fury');
    expect(container.textContent).toContain('Game not found');
    expect(container.textContent).toContain('This game does not exist.');

    await act(async () => root.unmount());
  });

  it('renders GameTheater with game title and html on successful fetch', async () => {
    vi.mocked(fetchPublishedGame).mockResolvedValue({
      slug: 'promo-game',
      title: 'Promo Game Title',
      html: '<!doctype html><canvas></canvas>',
    });

    const onExit = vi.fn();
    const root = createRoot(container);
    await act(async () => {
      root.render(<PublicPlayView slug="promo-game" onExit={onExit} />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.querySelector('.stage')).not.toBeNull();
    expect(container.textContent).toContain('Promo Game Title');
    expect(container.querySelector('iframe')).not.toBeNull();

    await act(async () => root.unmount());
  });
});
