// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.js';
import { AuthProvider } from './AuthContext.js';
import i18n from './i18n/index.js';

/**
 * Closed beta: anonymous visitors see the splash, not the catalog.
 *
 * A brief regression opened browse/play without a session; these guard the splash wall
 * so a shared link or a cold visit lands on sign-in + waitlist, not the catalog.
 */

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

function mockApi(publicPlaySlugs: string[] = []) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith('/api/auth/me')) {
      return new Response(JSON.stringify({ error: 'unauthenticated' }), { status: 401 });
    }
    if (url.endsWith('/api/health')) {
      return new Response(JSON.stringify({ status: 'ok', provider: 'mock', privateBeta: true, publicPlaySlugs }));
    }
    if (url.endsWith('/api/games/airtime')) {
      return new Response(
        JSON.stringify({ slug: 'airtime', title: 'Airtime', html: '<!doctype html><canvas></canvas>' }),
      );
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

describe('anonymous visitors during closed beta', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    sessionStorage.clear();
    window.history.pushState(null, '', '/');
    vi.restoreAllMocks();
  });

  it('shows the closed-beta splash instead of the catalog', async () => {
    mockApi();
    window.history.pushState(null, '', '/');

    const container = await renderApp();

    expect(container.querySelector('.beta-splash')).not.toBeNull();
    expect(container.textContent).not.toContain('Sky Dodge');
    expect(container.querySelector('article.catalog-card')).toBeNull();
  });

  it('does not fetch the catalog without a session', async () => {
    mockApi();
    await renderApp();

    const calls = vi.mocked(globalThis.fetch).mock.calls.map((call) => String(call[0]));
    expect(calls.some((url) => url.endsWith('/api/catalog'))).toBe(false);
  });

  it('keeps the canonical game page behind the beta wall', async () => {
    mockApi();
    window.history.pushState(null, '', '/gtanczyk/airtime');

    const container = await renderApp();

    expect(container.querySelector('.beta-splash')).not.toBeNull();
    expect(
      vi.mocked(globalThis.fetch).mock.calls.some((call) => String(call[0]).endsWith('/api/games/airtime/page')),
    ).toBe(false);
  });

  it('opens an allowlisted promotional game without a session', async () => {
    mockApi(['airtime']);
    window.history.pushState(null, '', '/play/airtime');

    const container = await renderApp();

    expect(container.querySelector('.beta-splash')).toBeNull();
    expect(container.querySelector('.stage')).not.toBeNull();
    expect(vi.mocked(globalThis.fetch).mock.calls.some((call) => String(call[0]).endsWith('/api/games/airtime'))).toBe(
      true,
    );
    expect(vi.mocked(globalThis.fetch).mock.calls.some((call) => String(call[0]).endsWith('/api/catalog'))).toBe(false);
  });
});
