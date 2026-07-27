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
  });

  afterEach(() => {
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
});
