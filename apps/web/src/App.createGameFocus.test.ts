// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.js';
import { AuthProvider } from './AuthContext.js';
import i18n from './i18n/index.js';

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('Create Game menu focus', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    window.history.pushState(null, '', '/');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function stubAppFetches() {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/auth/me')) {
        return new Response(JSON.stringify({ user: { uid: 'g:test', tier: 'standard', name: 'Tester' } }));
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
      if (url.endsWith('/api/quota')) {
        return new Response(JSON.stringify({ submissions: { used: 0, limit: 10 } }));
      }
      if (url.includes('/api/my/games') || url.includes('/api/studio')) {
        return new Response(JSON.stringify({ games: [] }));
      }
      return new Response('{}', { status: 404 });
    });

    // Page-load autofocus is desktop-only; force the narrow path so focus comes
    // only from the menu click under test.
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: true,
        media: '(max-width: 768px)',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );

    // jsdom has no scrollIntoView; install a stub first so spyOn can restore it.
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: () => undefined,
    });
    return vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => undefined);
  }

  async function openCreateGame(container: HTMLElement) {
    const hamburger = container.querySelector<HTMLButtonElement>('.hamburger-btn');
    expect(hamburger).not.toBeNull();
    await act(async () => {
      hamburger?.click();
      await flushEffects();
    });

    const createGame = Array.from(container.querySelectorAll<HTMLButtonElement>('.nav-link')).find((btn) =>
      /Create Game/i.test(btn.textContent ?? ''),
    );
    expect(createGame).toBeDefined();
    await act(async () => {
      createGame?.click();
      await flushEffects();
    });
  }

  it('navigates to /create and focuses its prompt when chosen from the hamburger', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    stubAppFetches();

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

    expect(window.location.pathname).toBe('/');

    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    await openCreateGame(container);

    expect(window.location.pathname).toBe('/create');
    // A scrolled home page must not land /create mid-page too.
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
    const prompt = container.querySelector<HTMLTextAreaElement>('.big-prompt-input');
    expect(prompt).not.toBeNull();
    // A deliberate tap focuses even on this forced-narrow viewport.
    expect(document.activeElement).toBe(prompt);

    await act(async () => root.unmount());
  });

  it('navigates to /create from Studio too (off-home path)', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    stubAppFetches();

    await i18n.changeLanguage('en');
    window.history.pushState(null, '', '/studio');

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

    expect(container.querySelector('.big-prompt-input')).toBeNull();

    await openCreateGame(container);

    const prompt = container.querySelector<HTMLTextAreaElement>('.big-prompt-input');
    expect(prompt).not.toBeNull();
    expect(document.activeElement).toBe(prompt);
    expect(window.location.pathname).toBe('/create');

    await act(async () => root.unmount());
  });
});
