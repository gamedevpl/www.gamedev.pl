// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

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
import { dispatchFromFrame } from './test-utils/frameMessage.js';
import { performanceWindow, playBatches } from './test-utils/playTelemetry.js';

describe('PublicPlayView', () => {
  let container: HTMLDivElement;
  let fetchSpy: MockInstance<typeof globalThis.fetch>;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    container = document.createElement('div');
    document.body.appendChild(container);
    vi.mocked(fetchPublishedGame).mockReset();
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 202 }));
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
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
    expect(playBatches(fetchSpy)).toHaveLength(0);

    await act(async () => root.unmount());
  });

  it('renders GameTheater with game title and html on successful fetch', async () => {
    vi.mocked(fetchPublishedGame).mockResolvedValue({
      slug: 'promo-game',
      title: 'Promo Game Title',
      html: '<!doctype html><canvas></canvas>',
      artifactVersion: 'a'.repeat(64),
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

    expect(fetchPublishedGame).toHaveBeenCalledTimes(1);
    expect(playBatches(fetchSpy)).toHaveLength(1);
    expect(playBatches(fetchSpy)[0]).toMatchObject({
      slug: 'promo-game',
      events: [{ type: 'game_opened', artifactVersion: 'a'.repeat(64), device: { deviceClass: expect.any(String) } }],
    });
    const frame = container.querySelector('iframe')!;
    await act(async () => {
      dispatchFromFrame(frame.contentWindow!, {
        source: 'gdpl-player',
        type: 'alive',
        frames: 300,
        performance: performanceWindow,
      });
      root.unmount();
    });
    expect(playBatches(fetchSpy).at(-1)?.events).toMatchObject([
      { type: 'alive', performance: performanceWindow },
      { type: 'game_closed' },
    ]);
  });
});
