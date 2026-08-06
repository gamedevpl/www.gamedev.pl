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

  it('focuses the hero prompt when Create Game is chosen from the hamburger', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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

    Element.prototype.scrollIntoView = vi.fn();

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

    const prompt = container.querySelector<HTMLTextAreaElement>('.big-prompt-input');
    expect(prompt).not.toBeNull();
    expect(document.activeElement).not.toBe(prompt);

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

    expect(document.activeElement).toBe(prompt);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();

    await act(async () => root.unmount());
  });
});
