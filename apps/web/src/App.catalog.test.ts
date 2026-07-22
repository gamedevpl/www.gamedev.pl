// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { gameUrl } from './catalog';
import i18n from './i18n';

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('catalog playback', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    window.location.hash = '#/';
    vi.restoreAllMocks();
  });

  it('renders a catalog game in a sandboxed iframe from the published game URL', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify([
          { slug: 'sky-dodge', title: 'Sky Dodge', genre: 'Arcade', controls: 'Arrow keys', status: 'published' },
        ]),
      ),
    );

    await i18n.changeLanguage('en');
    window.location.hash = '#/';

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(App));
      await flushEffects();
    });

    const playButton = container.querySelector('.catalog-card button');
    expect(playButton?.textContent).toContain('Play');

    await act(async () => {
      playButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });

    const iframe = container.querySelector('iframe[title="Sky Dodge"]');
    expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts');
    expect(iframe?.getAttribute('src')).toBe(gameUrl('sky-dodge'));

    await act(async () => {
      root.unmount();
    });
  });
});
