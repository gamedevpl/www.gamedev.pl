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

function mockApi({
  user = { uid: 'creator-1', tier: 'beta' } as { uid: string; tier: string } | null,
  privateBeta = false,
} = {}) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';

    if (url.endsWith('/api/auth/me')) {
      if (!user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
      return new Response(JSON.stringify({ user }));
    }
    if (url.endsWith('/api/health')) {
      return new Response(JSON.stringify({ status: 'ok', provider: 'mock', privateBeta }));
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
            multiplayer: { mode: 'controllers', minPlayers: 2, maxPlayers: 4 },
          },
        ]),
      );
    }
    if (url.endsWith('/api/creators/nightshift')) {
      return new Response(
        JSON.stringify({
          profile: {
            handle: 'nightshift',
            profileName: 'Night Shift',
            bio: 'Fly through the dusk.',
            avatarUrl: null,
            profileCreatedAt: '2026-07-01T00:00:00.000Z',
          },
          games: [
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
          ],
        }),
      );
    }
    if (url.endsWith('/api/mp/sessions') && method === 'POST') {
      return new Response(
        JSON.stringify({
          code: 'TEST1',
          hostToken: 'host-tok',
          joinToken: 'join-tok',
          joinPath: '/join/TEST1#join-tok',
          maxPlayers: 4,
          expiresAt: Date.now() + 60000,
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
    await flushEffects();
    await flushEffects();
    await flushEffects();
  });
  return { container, root };
}

describe('theater routing and lifecycle', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
    localStorage.clear();
    window.history.pushState(null, '', '/');
    vi.restoreAllMocks();
  });

  it('tears down theater overlay and player-open class on browser Back', async () => {
    mockApi();
    window.history.pushState(null, '', '/');
    const { container, root } = await renderApp();

    const play = container.querySelector<HTMLButtonElement>('.card-actions .primary-btn');
    expect(play).not.toBeNull();
    await act(async () => {
      play?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });

    expect(window.location.pathname).toBe('/play/sky-dodge');
    expect(document.body.classList.contains('player-open')).toBe(true);
    expect(container.querySelector('.exit-btn')).not.toBeNull();

    await act(async () => {
      window.history.pushState(null, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
      await flushEffects();
      await flushEffects();
    });

    expect(window.location.pathname).toBe('/');
    expect(document.body.classList.contains('player-open')).toBe(false);
    expect(container.querySelector('.exit-btn')).toBeNull();

    await act(async () => root.unmount());
  });

  it('preserves creator profile in-place theater during closed beta for anonymous visitor', async () => {
    mockApi({ user: null, privateBeta: true });
    window.history.pushState(null, '', '/nightshift');
    const { container, root } = await renderApp();

    expect(container.querySelector('.creator-profile-page')).not.toBeNull();
    expect(container.querySelector('.closed-beta-splash')).toBeNull();

    const profilePlay = container.querySelector<HTMLButtonElement>('.creator-profile-game-actions .primary-btn');
    expect(profilePlay).not.toBeNull();
    await act(async () => {
      profilePlay?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });

    expect(window.location.pathname).toBe('/nightshift');
    expect(container.querySelector('.closed-beta-splash')).toBeNull();
    expect(document.body.classList.contains('player-open')).toBe(true);
    const exit = container.querySelector<HTMLButtonElement>('.exit-btn');
    expect(exit).not.toBeNull();

    await act(async () => {
      exit?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });

    expect(window.location.pathname).toBe('/nightshift');
    expect(document.body.classList.contains('player-open')).toBe(false);
    expect(container.querySelector('.exit-btn')).toBeNull();

    await act(async () => root.unmount());
  });

  it('dismisses in-place party theater without replacing opener with canonical game page', async () => {
    mockApi();
    await import('./surfaces/party/PartyPage.js');
    window.history.pushState(null, '', '/party');
    const { container, root } = await renderApp();
    await act(async () => {
      await flushEffects();
      await flushEffects();
    });

    expect(container.querySelector('.party-page')).not.toBeNull();
    const partyBtn = container.querySelector<HTMLButtonElement>('.rail-card-party');
    expect(partyBtn).not.toBeNull();
    await act(async () => {
      partyBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
      await flushEffects();
    });

    expect(window.location.pathname).toBe('/party');
    const exit = container.querySelector<HTMLButtonElement>('.exit-btn');
    expect(exit).not.toBeNull();

    await act(async () => {
      exit?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });

    expect(window.location.pathname).toBe('/party');
    expect(container.querySelector('.exit-btn')).toBeNull();

    await act(async () => root.unmount());
  });
});
