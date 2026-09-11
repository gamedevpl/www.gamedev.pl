// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.js';
import { AuthProvider } from './AuthContext.js';
import type { CatalogEntry } from './catalog.js';
import i18n from './i18n/index.js';

/**
 * Play and a submitted Remix request on `/:handle/:slug` must mount the
 * full-viewport theater.
 *
 * That route is an open-chrome early return in App. The handlers still set
 * `stageContent` (and `body.player-open`), so if the overlay is only rendered
 * in the signed-in main branch, the page locks scroll and shows nothing — the
 * bug that shipped with the public game page.
 */

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

const catalogEntry: CatalogEntry = {
  slug: 'sky-dodge',
  title: 'Sky Dodge',
  genre: 'Arcade',
  controls: 'Arrow keys',
  status: 'published',
  media: null,
  multiplayer: null,
  saves: null,
  world: null,
  sensing: null,
  editor: 'content',
  orientation: 'any',
  touch: null,
  submittedBy: 'nightshift',
  creatorHandle: 'nightshift',
};

const partyCatalogEntry: CatalogEntry = {
  ...catalogEntry,
  multiplayer: { mode: 'controllers', minPlayers: 2, maxPlayers: 4 },
};

function mockApi(options: { entry?: CatalogEntry; signedIn?: boolean; partySessionStatus?: number } = {}) {
  const entry = options.entry ?? catalogEntry;
  const signedIn = options.signedIn ?? true;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/api/auth/me')) {
      return signedIn
        ? new Response(JSON.stringify({ user: { uid: 'creator-1', tier: 'beta' } }))
        : new Response(JSON.stringify({ user: null }), { status: 401 });
    }
    if (url.endsWith('/api/health')) {
      return new Response(JSON.stringify({ status: 'ok', provider: 'mock', privateBeta: false }));
    }
    if (url.endsWith('/api/catalog')) {
      return new Response(JSON.stringify([entry]));
    }
    if (url.endsWith(`/api/games/${entry.slug}/page`)) {
      return new Response(
        JSON.stringify({
          entry,
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
    if (url.endsWith('/api/mp/sessions') && init?.method === 'POST') {
      return options.partySessionStatus && options.partySessionStatus !== 200
        ? new Response(JSON.stringify({ error: 'lobby is full' }), { status: options.partySessionStatus })
        : new Response(
            JSON.stringify({
              code: 'ABCD',
              hostToken: 'h1',
              joinToken: 'j1',
              joinPath: '/join/ABCD',
              maxPlayers: 4,
              expiresAt: Date.now() + 60_000,
            }),
          );
    }
    if (url.endsWith(`/api/games/${entry.slug}/remix`)) {
      return new Response(JSON.stringify({ remixId: 'r1', values: {}, params: {}, suggestions: [] }));
    }
    if (url.endsWith(`/api/games/${entry.slug}`)) {
      return new Response(JSON.stringify({ slug: entry.slug, title: entry.title, html: '<!doctype html><canvas>' }));
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
    await flushEffects();
  });
  return { container, root };
}

describe('theater from the public game page', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
    localStorage.clear();
    window.history.pushState(null, '', '/');
    vi.restoreAllMocks();
  });

  it('keeps Remix on the page until the request is submitted, then opens the theater', async () => {
    mockApi();
    window.history.pushState(null, '', '/nightshift/sky-dodge');
    const { container, root } = await renderApp();

    expect(container.querySelector('.game-page h1')?.textContent).toBe('Sky Dodge');
    expect(document.body.classList.contains('player-open')).toBe(false);

    const remix = container.querySelector<HTMLButtonElement>('.game-page-remix');
    expect(remix).not.toBeNull();
    await act(async () => {
      remix?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
      await flushEffects();
    });

    expect(document.body.classList.contains('player-open')).toBe(false);
    expect(container.querySelector('.stage.is-playing-full-viewport')).toBeNull();
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();

    const request = container.querySelector<HTMLTextAreaElement>('#game-page-remix-request');
    expect(document.activeElement).toBe(request);
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(request, 'make it faster');
      request?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      container
        .querySelector<HTMLFormElement>('.game-page-remix-form')
        ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await flushEffects();
      await flushEffects();
    });

    // The failure mode was: player-open with no theater. Once the request is
    // submitted, both the scroll lock and theater must be present.
    expect(document.body.classList.contains('player-open')).toBe(true);
    expect(container.querySelector('.stage.is-playing-full-viewport')).not.toBeNull();
    expect(container.querySelector('.exit-btn')).not.toBeNull();
    expect(container.querySelector('.remix-panel, .remix-host')).not.toBeNull();

    const exit = container.querySelector<HTMLButtonElement>('.exit-btn');
    await act(async () => {
      exit?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });

    expect(document.body.classList.contains('player-open')).toBe(false);
    expect(container.querySelector('.stage.is-playing-full-viewport')).toBeNull();
    expect(window.location.pathname).toBe('/nightshift/sky-dodge');

    await act(async () => {
      root.unmount();
    });
  });

  it('opens the theater from Play on the same route', async () => {
    mockApi();
    window.history.pushState(null, '', '/nightshift/sky-dodge');
    const { container, root } = await renderApp();

    const play = container.querySelector<HTMLButtonElement>('.game-page-actions .primary-btn');
    expect(play).not.toBeNull();
    await act(async () => {
      play?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });

    expect(document.body.classList.contains('player-open')).toBe(true);
    expect(container.querySelector('.exit-btn')).not.toBeNull();
    expect(window.location.pathname).toBe('/nightshift/sky-dodge');

    await act(async () => {
      root.unmount();
    });
  });

  it('opens the sign-in modal for Play Together when signed out', async () => {
    mockApi({ entry: partyCatalogEntry, signedIn: false });
    window.history.pushState(null, '', '/nightshift/sky-dodge');
    const { container, root } = await renderApp();

    expect(document.querySelector('.auth-modal-card')).toBeNull();
    const party = container.querySelector<HTMLButtonElement>('.party-btn');
    expect(party).not.toBeNull();
    await act(async () => {
      party?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });

    // AuthModal portals to document.body, not into `container`.
    expect(document.querySelector('.auth-modal-card')).not.toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it('shows the party error when opening a lobby fails', async () => {
    mockApi({ entry: partyCatalogEntry, partySessionStatus: 500 });
    window.history.pushState(null, '', '/nightshift/sky-dodge');
    const { container, root } = await renderApp();

    const party = container.querySelector<HTMLButtonElement>('.party-btn');
    expect(party).not.toBeNull();
    await act(async () => {
      party?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
      await flushEffects();
    });

    expect(container.querySelector('.party-error')?.textContent).toBe('lobby is full');

    await act(async () => {
      root.unmount();
    });
  });
});
