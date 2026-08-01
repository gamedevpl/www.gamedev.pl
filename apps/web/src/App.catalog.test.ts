// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.js';
import { AuthProvider } from './AuthContext.js';
import { NAVIGATE_EVENT, type NavigateEventDetail } from './router.js';
import i18n from './i18n/index.js';

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('catalog playback', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    window.history.pushState(null, '', '/');
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
      if (url.includes('/api/recommendations')) {
        return new Response(JSON.stringify({ items: [] }));
      }
      if (/\/api\/games\/[^/]+\/played$/.test(new URL(url, 'http://localhost').pathname)) {
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    await i18n.changeLanguage('en');
    window.history.pushState(null, '', '/');

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
    // A card that is merely on screen shows its poster and no media player — see the
    // note on `previewRequested` in ArcadeCatalog.tsx.
    const poster = container.querySelector<HTMLImageElement>('img.catalog-preview');
    expect(poster?.getAttribute('src')).toBe('/api/games/sky-dodge/media/opening.png?w=640');
    expect(container.querySelector('video')).toBeNull();
    // The moment strip waits for engagement too — 240 extra elements across a sixty-game
    // arcade is what the scroll was paying for.
    expect(container.querySelectorAll('.catalog-moment')).toHaveLength(0);

    const previewButton = container.querySelector<HTMLButtonElement>('.preview-toggle');
    await act(async () => {
      previewButton?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      previewButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });

    // Asking for the preview is what mounts the player, with the poster it was already
    // showing so the swap is invisible.
    const preview = container.querySelector<HTMLVideoElement>('video.catalog-preview');
    expect(preview?.getAttribute('src')).toBe('/api/games/sky-dodge/media/gameplay.mp4');
    expect(preview?.getAttribute('poster')).toBe('/api/games/sky-dodge/media/opening.png?w=640');
    expect(container.querySelectorAll('.catalog-moment')).toHaveLength(2);
    expect(previewButton?.textContent).toContain('Pause preview');

    // history.pushState fires nothing, so in-app navigation is announced explicitly
    // for listeners outside App (analytics). Without it their only option is to
    // monkey-patch history — see NAVIGATE_EVENT in router.ts.
    const navigations: string[] = [];
    const onNavigate = (event: Event) => {
      navigations.push((event as CustomEvent<NavigateEventDetail>).detail.path);
    };
    window.addEventListener(NAVIGATE_EVENT, onNavigate);

    await act(async () => {
      playButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
      await flushEffects();
    });

    expect(navigations).toEqual(['/play/sky-dodge']);
    // Announced only after the URL is already the new one, so a listener that reads
    // window.location instead of trusting `detail` still sees the same place.
    expect(window.location.pathname).toBe('/play/sky-dodge');
    window.removeEventListener(NAVIGATE_EVENT, onNavigate);

    const iframe = container.querySelector('iframe[title="Sky Dodge"]');
    expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts allow-pointer-lock');
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
      if (url.includes('/api/recommendations')) {
        return new Response(JSON.stringify({ items: [] }));
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    window.history.pushState(null, '', '/');
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
      window.history.pushState(null, '', '/status/some-token');
      window.dispatchEvent(new PopStateEvent('popstate'));
      await flushEffects();
    });

    await act(async () => {
      window.history.pushState(null, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
      await flushEffects();
      await flushEffects();
    });

    expect(catalogCalls).toBe(initialCalls + 1);

    await act(async () => {
      root.unmount();
    });
  });

  it('opens game theater for direct play path routes even before catalog is loaded', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const fetched: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      fetched.push(url);
      if (url.endsWith('/api/auth/me')) {
        return new Response(JSON.stringify({ user: { uid: 'g:test', tier: 'standard' } }));
      }
      if (url.endsWith('/api/health')) {
        return new Response(JSON.stringify({ status: 'ok', provider: 'mock', privateBeta: false }));
      }
      if (url.endsWith('/api/catalog')) {
        return new Response(JSON.stringify([]));
      }
      if (url.includes('/api/recommendations')) {
        return new Response(JSON.stringify({ items: [] }));
      }
      if (url.endsWith('/api/games/football-3d-lite')) {
        return new Response(
          JSON.stringify({ slug: 'football-3d-lite', title: 'Football 3D Lite', html: '<canvas>football</canvas>' }),
        );
      }
      if (/\/api\/games\/[^/]+\/played$/.test(new URL(url, 'http://localhost').pathname)) {
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    window.history.pushState(null, '', '/play/football-3d-lite');
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

    const iframe = container.querySelector('iframe');
    expect(iframe).not.toBeNull();
    const srcdoc = iframe?.getAttribute('srcdoc') ?? '';
    expect(srcdoc).toContain('<canvas>football</canvas>');

    // A direct game link costs the game and nothing else: the gallery and the
    // "your games" rail sit behind a full-viewport player, so they must not load.
    expect(fetched.some((url) => url.includes('/api/catalog'))).toBe(false);
    expect(fetched.some((url) => url.includes('/api/submissions/mine'))).toBe(false);
    expect(fetched.some((url) => url.includes('/api/games/football-3d-lite'))).toBe(true);

    // The header title comes from the game itself over the player bridge, since a
    // direct link has no catalog entry to take one from.
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'null',
          data: { source: 'gdpl-player', type: 'meta', title: 'Football 3D Lite', desc: 'Score a goal', muted: false },
        }),
      );
      await flushEffects();
    });
    expect(container.querySelector('.theater-title-text')?.textContent).toBe('Football 3D Lite');
    expect(container.querySelector('.theater-author')?.textContent).toMatch(/gamedev\.pl/);

    await act(async () => {
      root.unmount();
    });
  });
});
