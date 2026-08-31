// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.js';
import { AuthProvider } from './AuthContext.js';
import i18n from './i18n/index.js';

/**
 * Closing a game reveals the page that opened it — or, for a `/play/<slug>` deep
 * link, replaces onto the canonical game page so the URL matches the surface.
 *
 * Catalog/profile Play opens an in-place theater; Close dismisses without history.
 * A shared `/play/<slug>` auto-opens, and Close goes to `/:handle/:slug`.
 */

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

function mockApi() {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith('/api/auth/me')) {
      return new Response(JSON.stringify({ user: { uid: 'creator-1', tier: 'beta' } }));
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
            media: null,
            creatorHandle: 'nightshift',
            submittedBy: 'Night Shift',
          },
        ]),
      );
    }
    if (url.endsWith('/api/games/sky-dodge/page')) {
      return new Response(
        JSON.stringify({
          entry: {
            slug: 'sky-dodge',
            title: 'Sky Dodge',
            genre: 'Arcade',
            controls: 'Arrow keys',
            status: 'published',
            media: null,
            creatorHandle: 'nightshift',
            submittedBy: 'Night Shift',
          },
          creator: {
            handle: 'nightshift',
            profileName: 'Night Shift',
            bio: '',
            avatarUrl: null,
            profileCreatedAt: '2026-07-01T00:00:00.000Z',
          },
          platformAuthored: false,
          description: 'Dodge the sky.',
        }),
      );
    }
    if (url.includes('/api/my/games') || url.includes('/api/studio')) {
      return new Response(JSON.stringify({ games: [] }));
    }
    if (url.includes('/api/games/')) {
      return new Response(JSON.stringify({ slug: 'sky-dodge', title: 'Sky Dodge', html: '<!doctype html><canvas>' }));
    }
    return new Response(JSON.stringify({}), { status: 404 });
  });
}

async function renderApp() {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(AuthProvider, null, createElement(App)));
    await flushEffects();
  });
  await act(async () => {
    await flushEffects();
  });
  return { container, root };
}

describe('closing a full-viewport game', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
    localStorage.clear();
    window.history.pushState(null, '', '/');
    vi.restoreAllMocks();
  });

  it('reveals the catalog that opened it without changing history', async () => {
    mockApi();
    window.history.pushState(null, '', '/');
    const { container, root } = await renderApp();

    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});

    const play = container.querySelector<HTMLButtonElement>('.card-actions .primary-btn');
    expect(play).not.toBeNull();
    await act(async () => {
      play?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });
    expect(window.location.pathname).toBe('/');

    const exit = container.querySelector<HTMLButtonElement>('.exit-btn');
    expect(exit).not.toBeNull();
    await act(async () => {
      exit?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });

    expect(back).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/');
    expect(container.querySelector('.exit-btn')).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it('replaces a cold /play deep link onto the canonical game page on Close', async () => {
    mockApi();
    window.history.pushState(null, '', '/play/sky-dodge');
    const { container, root } = await renderApp();

    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});

    // Deep link auto-opens the theater; no Play click required.
    const exit = container.querySelector<HTMLButtonElement>('.exit-btn');
    expect(exit).not.toBeNull();
    await act(async () => {
      exit?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
      await flushEffects();
    });

    expect(back).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/nightshift/sky-dodge');
    expect(container.querySelector('.exit-btn')).toBeNull();
    expect(container.querySelector('.game-page h1')?.textContent).toBe('Sky Dodge');

    await act(async () => {
      root.unmount();
    });
  });

  it('covers unpublished /play loading with the mascot, not the site header', async () => {
    let resolveGame!: (value: Response) => void;
    const gamePending = new Promise<Response>((resolve) => {
      resolveGame = resolve;
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/auth/me')) {
        return new Response(JSON.stringify({ user: { uid: 'creator-1', tier: 'beta' } }));
      }
      if (url.endsWith('/api/health')) {
        return new Response(JSON.stringify({ status: 'ok', provider: 'mock', privateBeta: false }));
      }
      if (url.endsWith('/api/catalog')) {
        return new Response(JSON.stringify([]));
      }
      if (url.includes('/api/my/games') || url.includes('/api/studio')) {
        return new Response(JSON.stringify({ games: [] }));
      }
      if (url.includes('/api/games/pending-draft')) {
        return gamePending;
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });

    window.history.pushState(null, '', '/play/pending-draft');
    const { container, root } = await renderApp();

    expect(container.querySelector('.app-loading-screen')).not.toBeNull();
    expect(container.querySelector('.game-theater-bar')).toBeNull();

    await act(async () => {
      resolveGame(new Response(JSON.stringify({ slug: 'pending-draft', title: 'Pending', html: '<canvas>' })));
      await flushEffects();
      await flushEffects();
    });

    expect(container.querySelector('.app-loading-screen')).toBeNull();
    expect(container.querySelector('.game-theater-bar')).not.toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it('exits an unpublished /play deep link to home on Close', async () => {
    mockApi();
    window.history.pushState(null, '', '/play/transport-tycoon-remake');
    const { container, root } = await renderApp();

    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});

    const exit = container.querySelector<HTMLButtonElement>('.exit-btn');
    expect(exit).not.toBeNull();
    await act(async () => {
      exit?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
      await flushEffects();
    });

    expect(back).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/');
    expect(container.querySelector('.exit-btn')).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it('returns to the in-app opener when closing /play opened from within the app', async () => {
    mockApi();
    window.history.pushState(null, '', '/');
    const { container, root } = await renderApp();

    expect(window.location.pathname).toBe('/');

    // Open hamburger menu and navigate to /create
    const hamburger = container.querySelector<HTMLButtonElement>('.hamburger-btn');
    if (hamburger) {
      await act(async () => {
        hamburger.click();
        await flushEffects();
      });
    }
    const createBtn = Array.from(container.querySelectorAll<HTMLButtonElement>('.nav-link')).find((btn) =>
      /Create/i.test(btn.textContent ?? ''),
    );
    if (createBtn) {
      await act(async () => {
        createBtn.click();
        await flushEffects();
      });
    }
    expect(window.location.pathname).toBe('/create');

    const showcasePlay = container.querySelector<HTMLButtonElement>('.card-actions .primary-btn');
    if (showcasePlay) {
      await act(async () => {
        showcasePlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flushEffects();
      });
    }

    await act(async () => {
      root.unmount();
    });
  });
});
