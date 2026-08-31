// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./catalog', () => ({
  fetchPublishedGame: vi.fn(),
}));

import { PublishedGameFrame } from './PublishedGameFrame.js';
import { fetchPublishedGame } from './catalog.js';
import i18n from './i18n/index.js';

describe('PublishedGameFrame retry', () => {
  let container: HTMLDivElement;

  beforeEach(async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    container = document.createElement('div');
    document.body.appendChild(container);
    vi.mocked(fetchPublishedGame).mockReset();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    container.remove();
  });

  it('offers Retry after a failed load and fetches again when clicked', async () => {
    vi.mocked(fetchPublishedGame).mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({
      slug: 'solo-cards',
      title: 'Solo Cards',
      html: '<!doctype html><title>Solo Cards</title>',
    });

    const root = createRoot(container);
    await act(async () => {
      root.render(<PublishedGameFrame slug="solo-cards" title="Solo Cards" embed />);
    });
    // Let the rejected promise settle.
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toMatch(/could not load this game/i);
    const retry = container.querySelector<HTMLButtonElement>('button');
    expect(retry?.textContent).toMatch(/retry/i);

    await act(async () => {
      retry?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchPublishedGame).toHaveBeenCalledTimes(2);
    expect(container.querySelector('iframe')).not.toBeNull();
    await act(async () => root.unmount());
  });

  it('covers the wait with the full-viewport mascot, not a loading line', async () => {
    let resolveGame!: (value: { slug: string; title: string; html: string }) => void;
    vi.mocked(fetchPublishedGame).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveGame = resolve;
        }),
    );

    const root = createRoot(container);
    await act(async () => {
      root.render(<PublishedGameFrame slug="solo-cards" title="Solo Cards" embed />);
    });

    expect(container.querySelector('.app-loading-screen')).not.toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.textContent).not.toMatch(/loading game/i);

    await act(async () => {
      resolveGame({
        slug: 'solo-cards',
        title: 'Solo Cards',
        html: '<!doctype html><title>Solo Cards</title>',
      });
      await Promise.resolve();
    });

    expect(container.querySelector('.app-loading-screen')).toBeNull();
    expect(container.querySelector('iframe')).not.toBeNull();
    await act(async () => root.unmount());
  });
});
