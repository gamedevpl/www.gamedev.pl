// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { AuthProvider } from './AuthContext';
import i18n from './i18n';

/**
 * Playing is public; making a game is not.
 *
 * During the closed beta the splash used to be the entire site for anyone without a
 * session, which meant a shared game link led strangers to a wall. These guard the
 * decision to open play: an anonymous visitor reaches the arcade, and the splash — which
 * owns the waitlist join — appears only for someone whose sign-in was actually refused.
 */

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

function mockApi(options: { rejectSignIn?: boolean } = {}) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith('/api/auth/me')) {
      // No session: exactly what an anonymous visitor's first request answers.
      return new Response(JSON.stringify({ error: 'unauthenticated' }), { status: 401 });
    }
    if (url.endsWith('/api/health')) {
      return new Response(JSON.stringify({ status: 'ok', provider: 'mock', privateBeta: true }));
    }
    if (url.endsWith('/api/catalog')) {
      if (options.rejectSignIn) return new Response(JSON.stringify([]));
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
  return container;
}

describe('anonymous play during closed beta', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    sessionStorage.clear();
    window.history.pushState(null, '', '/');
    vi.restoreAllMocks();
  });

  it('shows the arcade to a visitor with no session instead of the splash', async () => {
    mockApi();
    window.history.pushState(null, '', '/');

    const container = await renderApp();

    // The splash's waitlist button is its signature element.
    expect(container.querySelector('#btn-join-waitlist')).toBeNull();
    // The catalog was fetched anonymously and rendered.
    expect(container.textContent).toContain('Sky Dodge');
  });

  it('fetches the catalog without a session', async () => {
    mockApi();
    await renderApp();

    const calls = vi.mocked(globalThis.fetch).mock.calls.map((call) => String(call[0]));
    expect(calls.some((url) => url.endsWith('/api/catalog'))).toBe(true);
  });
});
