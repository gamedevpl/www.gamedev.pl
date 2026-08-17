// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.js';
import { AuthProvider } from './AuthContext.js';
import i18n from './i18n/index.js';

// BottomCta must wait for the catalog, on home and /create alike.

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
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
  return { container, root };
}

describe('BottomCta gated on catalog readiness', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    window.history.pushState(null, '', '/');
    vi.restoreAllMocks();
  });

  function mockApiWithDeferredCatalog() {
    const catalogGate = deferred<Response>();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/auth/me')) {
        return new Response(JSON.stringify({ user: null }), { status: 401 });
      }
      if (url.endsWith('/api/health')) {
        return new Response(JSON.stringify({ status: 'ok', provider: 'mock', privateBeta: false }));
      }
      if (url.endsWith('/api/catalog')) {
        return catalogGate.promise;
      }
      if (url.includes('/api/recommendations')) {
        return new Response(JSON.stringify({ items: [] }));
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });
    return catalogGate;
  }

  it('waits for the catalog on home', async () => {
    const catalogGate = mockApiWithDeferredCatalog();
    const { container, root } = await renderApp();

    expect(container.querySelector('#hero-prompt')).not.toBeNull();
    expect(container.querySelector('.bottom-cta')).toBeNull();

    await act(async () => {
      catalogGate.resolve(new Response(JSON.stringify([])));
      await flushEffects();
      await flushEffects();
    });

    expect(container.querySelector('.bottom-cta')).not.toBeNull();

    await act(async () => root.unmount());
  });

  it('waits for the catalog on /create too', async () => {
    const catalogGate = mockApiWithDeferredCatalog();
    window.history.pushState(null, '', '/create');
    const { container, root } = await renderApp();

    expect(container.querySelector('#hero-prompt')).not.toBeNull();
    expect(container.querySelector('.bottom-cta')).toBeNull();

    await act(async () => {
      catalogGate.resolve(new Response(JSON.stringify([])));
      await flushEffects();
      await flushEffects();
    });

    expect(container.querySelector('.bottom-cta')).not.toBeNull();

    await act(async () => root.unmount());
  });
});
