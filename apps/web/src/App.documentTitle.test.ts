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

function mockPublicApis() {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith('/api/auth/me')) {
      return new Response(JSON.stringify({ user: { uid: 'g:test', tier: 'standard' } }));
    }
    if (url.endsWith('/api/health')) {
      return new Response(JSON.stringify({ status: 'ok', provider: 'mock', privateBeta: false }));
    }
    if (url.endsWith('/api/catalog')) {
      return new Response(JSON.stringify([]));
    }
    if (url.includes('/api/games/')) {
      return new Response(JSON.stringify({ slug: 'sky-dodge', title: 'Sky Dodge', html: '<canvas></canvas>' }));
    }
    if (url.includes('/api/submissions/')) {
      return new Response(JSON.stringify({ status: 'queued' }), { status: 200 });
    }
    if (url.includes('/api/telemetry/')) {
      return new Response(null, { status: 204 });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

describe('document title follows navigation', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    window.history.pushState(null, '', '/');
    document.title = '';
    vi.restoreAllMocks();
  });

  it('updates the tab title for home, legal, play, status, and health routes', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockPublicApis();
    await i18n.changeLanguage('en');
    window.history.pushState(null, '', '/');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(AuthProvider, null, createElement(App)));
      await flushEffects();
      await flushEffects();
    });

    expect(document.title).toBe('Gamedev.pl — Describe a game, play it');

    await act(async () => {
      window.history.pushState(null, '', '/privacy');
      window.dispatchEvent(new PopStateEvent('popstate'));
      await flushEffects();
    });
    expect(document.title).toBe('Privacy Policy — Gamedev.pl');

    await act(async () => {
      window.history.pushState(null, '', '/terms');
      window.dispatchEvent(new PopStateEvent('popstate'));
      await flushEffects();
    });
    expect(document.title).toBe('Terms of Service — Gamedev.pl');

    await act(async () => {
      window.history.pushState(null, '', '/play/sky-dodge');
      window.dispatchEvent(new PopStateEvent('popstate'));
      await flushEffects();
      await flushEffects();
    });
    expect(document.title).toBe('Play Sky Dodge — Gamedev.pl');

    await act(async () => {
      window.history.pushState(null, '', '/status/tok-abc');
      window.dispatchEvent(new PopStateEvent('popstate'));
      await flushEffects();
    });
    expect(document.title).toBe('Your game is in the works — Gamedev.pl');

    await act(async () => {
      window.history.pushState(null, '', '/health');
      window.dispatchEvent(new PopStateEvent('popstate'));
      await flushEffects();
    });
    expect(document.title).toBe('Telemetry — Gamedev.pl');

    await act(async () => {
      window.history.pushState(null, '', '/this-page-does-not-exist');
      window.dispatchEvent(new PopStateEvent('popstate'));
      await flushEffects();
    });
    expect(document.title).toBe('Page not found — Gamedev.pl');

    await act(async () => {
      window.history.pushState(null, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
      await flushEffects();
    });
    expect(document.title).toBe('Gamedev.pl — Describe a game, play it');

    await act(async () => {
      root.unmount();
    });
  });

  it('uses a saved submission title on the status route', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockPublicApis();
    await i18n.changeLanguage('en');
    localStorage.setItem(
      'gamedev_saved_specs',
      JSON.stringify([
        {
          token: 'tok-saved',
          title: 'Coin Catcher',
          concept: 'Catch falling coins',
          createdAt: Date.now(),
        },
      ]),
    );
    window.history.pushState(null, '', '/status/tok-saved');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(AuthProvider, null, createElement(App)));
      await flushEffects();
      await flushEffects();
    });

    expect(document.title).toBe('Status · Coin Catcher — Gamedev.pl');

    await act(async () => {
      root.unmount();
    });
  });
});
