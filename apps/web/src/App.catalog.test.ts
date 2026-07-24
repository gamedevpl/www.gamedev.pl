// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { AuthProvider } from './AuthContext';
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

  it('renders a catalog game in a sandboxed iframe served by the app API', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
      this.dispatchEvent(new Event('play'));
      return Promise.resolve();
    });
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
      this.dispatchEvent(new Event('pause'));
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/auth/me')) {
        return new Response(JSON.stringify({ user: { uid: 'g:test', tier: 'standard' } }));
      }
      if (url.endsWith('/api/health')) {
        return new Response(JSON.stringify({ status: 'ok', provider: 'mock', privateBeta: false }));
      }
      if (url.endsWith('/api/catalog')) {
        return new Response(
          JSON.stringify([
            {
              slug: 'sky-dodge',
              title: 'Sky Dodge',
              genre: 'Arcade',
              controls: 'Arrow keys',
              status: 'published',
              media: {
                screenshots: [
                  { name: 'opening', file: 'opening.png' },
                  { name: 'close-call', file: 'close-call.png' },
                ],
                video: 'gameplay.mp4',
              },
            },
          ]),
        );
      }
      if (url.endsWith('/api/games/sky-dodge')) {
        return new Response(JSON.stringify({ slug: 'sky-dodge', title: 'Sky Dodge', html: '<canvas>sky</canvas>' }));
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    await i18n.changeLanguage('en');
    window.location.hash = '#/';

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(AuthProvider, null, createElement(App)));
      await flushEffects();
      await flushEffects();
      await flushEffects();
      await flushEffects();
    });

    const playButton = container.querySelector('.catalog-card .card-actions .primary-btn');
    expect(playButton?.textContent).toContain('Play');
    const preview = container.querySelector<HTMLVideoElement>('.catalog-preview');
    expect(preview?.getAttribute('src')).toBe('/api/games/sky-dodge/media/gameplay.mp4');
    expect(preview?.getAttribute('poster')).toBe('/api/games/sky-dodge/media/opening.png');
    expect(container.querySelectorAll('.catalog-moment')).toHaveLength(2);

    const previewButton = container.querySelector<HTMLButtonElement>('.preview-toggle');
    await act(async () => {
      previewButton?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      previewButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });
    expect(previewButton?.textContent).toContain('Pause preview');

    await act(async () => {
      playButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
      await flushEffects();
    });

    const iframe = container.querySelector('iframe[title="Sky Dodge"]');
    expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts');
    // The game document comes from our API and runs via srcDoc — no external origin.
    // In the player it's wrapped with the embed bridge (hides in-game chrome and
    // relays sound to the header), so the original document is contained, not exact.
    const srcdoc = iframe?.getAttribute('srcdoc') ?? '';
    expect(srcdoc).toContain('<canvas>sky</canvas>');
    expect(srcdoc).toContain('gdpl-player');

    await act(async () => {
      root.unmount();
    });
  });

  it('re-fetches catalog when navigating back to home route', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    let catalogCalls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/auth/me')) {
        return new Response(JSON.stringify({ user: { uid: 'g:test', tier: 'standard' } }));
      }
      if (url.endsWith('/api/health')) {
        return new Response(JSON.stringify({ status: 'ok', provider: 'mock', privateBeta: false }));
      }
      if (url.endsWith('/api/catalog')) {
        catalogCalls++;
        return new Response(
          JSON.stringify([
            {
              slug: catalogCalls === 1 ? 'game-one' : 'game-two',
              title: catalogCalls === 1 ? 'Game One' : 'Game Two',
              genre: 'Arcade',
              controls: 'Arrow keys',
              status: 'published',
              media: null,
              multiplayer: null,
            },
          ]),
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    window.location.hash = '#/';
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(AuthProvider, null, createElement(App)));
      await flushEffects();
      await flushEffects();
    });

    const initialCalls = catalogCalls;
    expect(initialCalls).toBeGreaterThan(0);

    await act(async () => {
      window.location.hash = '#/status/some-token';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      await flushEffects();
    });

    await act(async () => {
      window.location.hash = '#/';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      await flushEffects();
      await flushEffects();
    });

    expect(catalogCalls).toBe(initialCalls + 1);

    await act(async () => {
      root.unmount();
    });
  });
});
