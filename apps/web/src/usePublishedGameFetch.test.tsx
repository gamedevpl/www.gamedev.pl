// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PUBLISHED_FETCH_RETRY_MS, usePublishedGameFetch } from './usePublishedGameFetch.js';
import { fetchPublishedGame } from './catalog.js';

vi.mock('./catalog.js', async () => {
  const actual = await vi.importActual<typeof import('./catalog.js')>('./catalog.js');
  return { ...actual, fetchPublishedGame: vi.fn() };
});

const fetchGame = vi.mocked(fetchPublishedGame);

function Probe({ slug }: { slug: string }) {
  const { game, error } = usePublishedGameFetch(slug);
  return (
    <div>
      {game ? <p id="title">{game.title}</p> : null}
      {error ? <p id="error">{String(error.status)}</p> : null}
    </div>
  );
}

describe('usePublishedGameFetch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchGame.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries a 404/409 miss then shows the draft', async () => {
    const miss = Object.assign(new Error('game not found'), { status: 404 });
    fetchGame
      .mockRejectedValueOnce(miss)
      .mockResolvedValueOnce({ slug: 'bastion-wave', title: 'Bastion Wave', html: '<p>ok</p>' });

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(<Probe slug="bastion-wave" />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(host.querySelector('#error')).toBeNull();
    expect(host.querySelector('#title')).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(PUBLISHED_FETCH_RETRY_MS);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(host.querySelector('#title')?.textContent).toBe('Bastion Wave');
    expect(fetchGame).toHaveBeenCalledTimes(2);

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });
});
