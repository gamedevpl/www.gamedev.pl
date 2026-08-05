// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.js';
import { AuthProvider } from './AuthContext.js';
import i18n from './i18n/index.js';

/**
 * Closing a game reveals the page that opened it.
 *
 * Published play is an in-place theater now: catalog/profile buttons open over their
 * current page, while a shared `/play/<slug>` link first renders a static game page.
 * Closing must therefore dismiss the theater without mutating browser history in either
 * case. That keeps catalog position and leaves a shared link shareable after play.
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
          },
        ]),
      );
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

  it('reveals the static game page behind a cold deep-link theater', async () => {
    mockApi();
    window.history.pushState(null, '', '/play/sky-dodge');
    const { container, root } = await renderApp();

    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});

    const play = container.querySelector<HTMLButtonElement>('.game-page-actions .primary-btn');
    expect(play).not.toBeNull();
    await act(async () => {
      play?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });

    const exit = container.querySelector<HTMLButtonElement>('.exit-btn');
    expect(exit).not.toBeNull();
    await act(async () => {
      exit?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });

    expect(back).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/play/sky-dodge');
    expect(container.querySelector('.game-page h1')?.textContent).toBe('Sky Dodge');

    await act(async () => {
      root.unmount();
    });
  });
});
