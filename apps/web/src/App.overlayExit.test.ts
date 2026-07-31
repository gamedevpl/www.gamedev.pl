// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.js';
import { AuthProvider } from './AuthContext.js';
import i18n from './i18n/index.js';

/**
 * Closing a game returns you to where you opened it from.
 *
 * The exit used to be an unconditional trip home, which quietly threw away context
 * every time: a creator who opened their build from Creator Studio and closed it landed
 * on the catalog, several clicks away from the game they were in the middle of making.
 * Back is only safe when this tab has an in-app entry to go back to, so both halves are
 * guarded here — the deep link that must not walk off the site is as much the point as
 * the in-app open that must not lose its place.
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

  it('goes back to whatever opened it, rather than home', async () => {
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
    expect(window.location.pathname).toBe('/play/sky-dodge');

    const exit = container.querySelector<HTMLButtonElement>('.exit-btn');
    expect(exit).not.toBeNull();
    await act(async () => {
      exit?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });

    expect(back).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
  });

  it('goes home from a cold deep link, where Back would leave the site', async () => {
    mockApi();
    window.history.pushState(null, '', '/play/sky-dodge');
    const { container, root } = await renderApp();

    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});

    const exit = container.querySelector<HTMLButtonElement>('.exit-btn');
    expect(exit).not.toBeNull();
    await act(async () => {
      exit?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });

    expect(back).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/');

    await act(async () => {
      root.unmount();
    });
  });
});
