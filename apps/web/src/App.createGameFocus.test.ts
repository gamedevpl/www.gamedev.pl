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

describe('Play home anchor from elsewhere', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    window.history.pushState(null, '', '/');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const featuredGame = {
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
    editor: null,
    orientation: 'any',
    touch: null,
    submittedBy: null,
  };

  function stubAppFetchesWithCatalog() {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/auth/me')) {
        return new Response(JSON.stringify({ user: { uid: 'g:test', tier: 'standard', name: 'Tester' } }));
      }
      if (url.endsWith('/api/health')) {
        return new Response(JSON.stringify({ status: 'ok', provider: 'mock', privateBeta: false }));
      }
      if (url.endsWith('/api/catalog')) {
        return new Response(JSON.stringify([featuredGame]));
      }
      if (url.includes('/api/recommendations')) {
        return new Response(JSON.stringify({ items: [] }));
      }
      if (url.includes('/api/featured')) {
        return new Response(JSON.stringify({ slugs: [] }));
      }
      if (url.endsWith('/api/quota')) {
        return new Response(JSON.stringify({ submissions: { used: 0, limit: 10 } }));
      }
      if (url.includes('/api/my/games') || url.includes('/api/studio')) {
        return new Response(JSON.stringify({ games: [] }));
      }
      return new Response('{}', { status: 404 });
    });

    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: () => undefined,
    });
    return vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => undefined);
  }

  it('queues the play anchor and resolves it once home mounts, from Studio', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const scrollIntoView = stubAppFetchesWithCatalog();

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

    const hamburger = container.querySelector<HTMLButtonElement>('.hamburger-btn');
    await act(async () => {
      hamburger?.click();
      await flushEffects();
    });
    const playItem = Array.from(container.querySelectorAll<HTMLButtonElement>('.nav-link')).find(
      (btn) => btn.textContent?.trim() === 'Play',
    );
    expect(playItem).toBeDefined();

    await act(async () => {
      playItem?.click();
      await flushEffects();
    });

    expect(window.location.pathname).toBe('/');

    // The pending-scroll effect polls every 100ms until the target mounts.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });

    const playAnchor = container.querySelector('#play-anchor');
    expect(playAnchor).not.toBeNull();
    expect(scrollIntoView).toHaveBeenCalled();
    expect(scrollIntoView.mock.instances).toContain(playAnchor);

    await act(async () => root.unmount());
  });
});

describe('Party navigation from elsewhere', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    window.history.pushState(null, '', '/');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // A multiplayer game, so the party rail has something to show.
  const partyGame = {
    slug: 'party-karts',
    title: 'Party Karts',
    genre: 'Arcade racing (3D)',
    controls: 'Arrow keys',
    status: 'published',
    media: null,
    multiplayer: { mode: 'controllers', minPlayers: 2, maxPlayers: 4 },
    saves: null,
    world: null,
    sensing: null,
    editor: null,
    orientation: 'any',
    touch: null,
    submittedBy: null,
  };

  function stubAppFetchesWithCatalog() {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/auth/me')) {
        return new Response(JSON.stringify({ user: { uid: 'g:test', tier: 'standard', name: 'Tester' } }));
      }
      if (url.endsWith('/api/health')) {
        return new Response(JSON.stringify({ status: 'ok', provider: 'mock', privateBeta: false }));
      }
      if (url.endsWith('/api/catalog')) {
        return new Response(JSON.stringify([partyGame]));
      }
      if (url.includes('/api/recommendations')) {
        return new Response(JSON.stringify({ items: [] }));
      }
      if (url.includes('/api/featured')) {
        return new Response(JSON.stringify({ slugs: [] }));
      }
      if (url.endsWith('/api/quota')) {
        return new Response(JSON.stringify({ submissions: { used: 0, limit: 10 } }));
      }
      if (url.includes('/api/my/games') || url.includes('/api/studio')) {
        return new Response(JSON.stringify({ games: [] }));
      }
      return new Response('{}', { status: 404 });
    });

    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: () => undefined,
    });
    return vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => undefined);
  }

  it('opens the /party page from Studio (off-home path)', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    stubAppFetchesWithCatalog();

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

    const hamburger = container.querySelector<HTMLButtonElement>('.hamburger-btn');
    await act(async () => {
      hamburger?.click();
      await flushEffects();
    });
    const partyItem = Array.from(container.querySelectorAll<HTMLButtonElement>('.nav-link')).find(
      (btn) => btn.textContent?.trim() === 'Party',
    );
    expect(partyItem).toBeDefined();

    await act(async () => {
      partyItem?.click();
      await flushEffects();
      await flushEffects();
    });

    expect(window.location.pathname).toBe('/party');

    // The catalog fetch resolves asynchronously; give it a beat before asserting content.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });

    const partyPage = container.querySelector('.party-page');
    expect(partyPage).not.toBeNull();
    expect(container.textContent).toContain('Party Karts');

    await act(async () => root.unmount());
  });

  it('sends "Build a game" to /create with the concept pre-loaded for a party game', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    stubAppFetchesWithCatalog();

    await i18n.changeLanguage('en');
    window.history.pushState(null, '', '/party');

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

    const buildButton = Array.from(container.querySelectorAll<HTMLButtonElement>('.party-custom-btn')).find((btn) =>
      /Build a game/i.test(btn.textContent ?? ''),
    );
    expect(buildButton).toBeDefined();

    await act(async () => {
      buildButton?.click();
    });

    expect(window.location.pathname).toBe('/create');
    const prompt = container.querySelector<HTMLTextAreaElement>('.big-prompt-input');
    expect(prompt).not.toBeNull();
    expect(prompt?.value).toContain('party game');
    expect(prompt?.value).toContain('phones as controllers');
    expect(document.activeElement).toBe(prompt);
    // Cursor lands at the end so typing continues the starter sentence.
    expect(prompt?.selectionStart).toBe(prompt?.value.length);

    await act(async () => root.unmount());
  });

  it('does not leak the party starter into Home once the visitor leaves /create', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    stubAppFetchesWithCatalog();

    await i18n.changeLanguage('en');
    window.history.pushState(null, '', '/party');

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

    const buildButton = container.querySelector<HTMLButtonElement>('.party-custom-btn');
    await act(async () => {
      buildButton?.click();
    });
    expect(window.location.pathname).toBe('/create');
    expect(container.querySelector<HTMLTextAreaElement>('.big-prompt-input')?.value).toContain('party game');

    const logo = container.querySelector<HTMLAnchorElement>('.logo');
    await act(async () => {
      logo?.click();
      await flushEffects();
    });

    expect(window.location.pathname).toBe('/');
    expect(container.querySelector<HTMLTextAreaElement>('.big-prompt-input')?.value ?? '').toBe('');

    await act(async () => root.unmount());
  });

  it('does not resurface the party starter on a second /create visit via the Up chevron', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    stubAppFetchesWithCatalog();

    await i18n.changeLanguage('en');
    window.history.pushState(null, '', '/party');

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

    const buildButton = container.querySelector<HTMLButtonElement>('.party-custom-btn');
    await act(async () => {
      buildButton?.click();
      // Let the pending-clear effect run before the Up chevron bounces home.
      await flushEffects();
    });
    expect(window.location.pathname).toBe('/create');
    expect(container.querySelector<HTMLTextAreaElement>('.big-prompt-input')?.value).toContain('party game');

    // The Up chevron on /create bypasses every Home/Create-specific handler.
    const upButton = container.querySelector<HTMLButtonElement>('button.nav-up');
    expect(upButton).not.toBeNull();
    await act(async () => {
      upButton?.click();
      await flushEffects();
    });
    expect(window.location.pathname).toBe('/');

    const hamburger = container.querySelector<HTMLButtonElement>('.hamburger-btn');
    await act(async () => {
      hamburger?.click();
      await flushEffects();
    });
    const createItem = Array.from(container.querySelectorAll<HTMLButtonElement>('.nav-link')).find((btn) =>
      /Create Game/i.test(btn.textContent ?? ''),
    );
    await act(async () => {
      createItem?.click();
      await flushEffects();
    });

    expect(window.location.pathname).toBe('/create');
    expect(container.querySelector<HTMLTextAreaElement>('.big-prompt-input')?.value ?? '').toBe('');

    await act(async () => root.unmount());
  });
});
