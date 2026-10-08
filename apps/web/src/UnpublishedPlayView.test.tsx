// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18next from 'i18next';
import { fetchPublishedGame } from './catalog.js';
import { PUBLISHED_FETCH_RETRY_MS } from './usePublishedGameFetch.js';
import { UnpublishedPlayView } from './UnpublishedPlayView.js';

vi.mock('./catalog.js', async () => {
  const actual = await vi.importActual<typeof import('./catalog.js')>('./catalog.js');
  return { ...actual, fetchPublishedGame: vi.fn() };
});

const fetchGame = vi.mocked(fetchPublishedGame);

describe('UnpublishedPlayView', () => {
  beforeEach(async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    fetchGame.mockReset();
    await i18next.changeLanguage('en');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders "Game not found" / "This game does not exist." on 404 in English', async () => {
    const miss = Object.assign(new Error('game not found'), { status: 404 });
    fetchGame.mockRejectedValue(miss);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(<UnpublishedPlayView slug="unknown-game" onExit={() => {}} />);
    });

    // Advance through retries (1s, 2s, 4s)
    for (let i = 0; i < 4; i++) {
      await act(async () => {
        vi.advanceTimersByTime(PUBLISHED_FETCH_RETRY_MS * 8);
        await Promise.resolve();
      });
    }

    const title = host.querySelector('h2.section-title');
    const errorText = host.querySelector('p.error');
    expect(title?.textContent).toBe('Game not found');
    expect(errorText?.textContent).toBe('This game does not exist.');

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it('renders "Nie ma takiej gry" / "Ta gra nie istnieje." on 404 in Polish', async () => {
    await i18next.changeLanguage('pl');
    const miss = Object.assign(new Error('game not found'), { status: 404 });
    fetchGame.mockRejectedValue(miss);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(<UnpublishedPlayView slug="unknown-game" onExit={() => {}} />);
    });

    for (let i = 0; i < 4; i++) {
      await act(async () => {
        vi.advanceTimersByTime(PUBLISHED_FETCH_RETRY_MS * 8);
        await Promise.resolve();
      });
    }

    const title = host.querySelector('h2.section-title');
    const errorText = host.querySelector('p.error');
    expect(title?.textContent).toBe('Nie ma takiej gry');
    expect(errorText?.textContent).toBe('Ta gra nie istnieje.');

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it('renders generic error title on server error', async () => {
    const serverErr = Object.assign(new Error('server broke'), { status: 500 });
    fetchGame.mockRejectedValue(serverErr);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(<UnpublishedPlayView slug="some-game" onExit={() => {}} />);
    });

    const title = host.querySelector('h2.section-title');
    const errorText = host.querySelector('p.error');
    expect(title?.textContent).toBe('Could not load game');
    expect(errorText?.textContent).toBe("We couldn't load this game right now. Please try again in a moment.");

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });
});
