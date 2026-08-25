// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n/index.js';
import type { GamePage as GamePageData } from './gamePageApi.js';

const fetchGamePage = vi.fn();
let authUser: { uid: string; handle?: string } | null = null;
let privateBeta = false;

vi.mock('./gamePageApi.js', () => ({
  fetchGamePage: (...args: unknown[]) => fetchGamePage(...args),
}));

vi.mock('./AuthContext.js', () => ({
  useAuth: () => ({ user: authUser, privateBeta, refreshUser: vi.fn(), logout: vi.fn() }),
}));

vi.mock('./VoteWidget.js', () => ({
  VoteWidget: () => createElement('div', { 'data-testid': 'votes' }),
}));

vi.mock('./AuthModal.js', () => ({
  AuthModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? createElement('div', { 'data-testid': 'auth-modal' }) : null,
}));

import { GamePage } from './GamePage.js';

function pageData(overrides: Partial<GamePageData> = {}): GamePageData {
  return {
    entry: {
      slug: 'neon-courier',
      title: 'Neon Courier',
      genre: 'arcade',
      controls: 'Arrows move, Space fires',
      status: 'published',
      media: {
        screenshots: [
          { name: 'opening', file: 'opening.png' },
          { name: 'battle', file: 'battle.png' },
        ],
        video: null,
      },
      multiplayer: null,
      saves: null,
      world: null,
      sensing: null,
      editor: 'content',
      orientation: 'any',
      touch: null,
      submittedBy: 'nightshift',
      creatorHandle: 'nightshift',
    },
    creator: {
      handle: 'nightshift',
      profileName: 'Nocna Zmiana',
      bio: '',
      avatarUrl: null,
      profileCreatedAt: '2026-07-01T00:00:00.000Z',
    },
    platformAuthored: false,
    description: 'Deliver packages before the last neon goes out.',
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root | null = null;
let playAction: ReturnType<typeof vi.fn>;
let remixAction: ReturnType<typeof vi.fn>;
const originalVisualViewport = window.visualViewport;

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  authUser = null;
  privateBeta = false;
  fetchGamePage.mockReset();
  fetchGamePage.mockResolvedValue(pageData());
  playAction = vi.fn();
  remixAction = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container.remove();
  window.history.pushState(null, '', window.location.pathname);
  if (originalVisualViewport === undefined) {
    Reflect.deleteProperty(window, 'visualViewport');
  } else {
    Object.defineProperty(window, 'visualViewport', {
      value: originalVisualViewport,
      configurable: true,
      writable: true,
    });
  }
});

async function renderPage(props: Partial<Parameters<typeof GamePage>[0]> = {}) {
  root = createRoot(container);
  await act(async () => {
    root!.render(
      createElement(GamePage, {
        handle: 'nightshift',
        slug: 'neon-courier',
        onNavigate: vi.fn(),
        onPlay: playAction,
        onRemix: remixAction,
        ...props,
      }),
    );
  });
  await act(async () => {
    await fetchGamePage.mock.results[0]?.value.catch(() => {});
    await Promise.resolve();
  });
}

function stubVisualViewport(height: number, offsetTop = 0) {
  const listeners = new Map<string, Set<() => void>>();
  const viewport = {
    height,
    offsetTop,
    addEventListener: (type: string, listener: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    removeEventListener: (type: string, listener: () => void) => listeners.get(type)?.delete(listener),
  };
  Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true, writable: true });
  return {
    async emit(type: 'resize' | 'scroll', next: { height?: number; offsetTop?: number }) {
      if (next.height !== undefined) viewport.height = next.height;
      if (next.offsetTop !== undefined) viewport.offsetTop = next.offsetTop;
      await act(async () => {
        listeners.get(type)?.forEach((listener) => listener());
        await Promise.resolve();
      });
    },
    listenerCount: () => (listeners.get('resize')?.size ?? 0) + (listeners.get('scroll')?.size ?? 0),
  };
}

describe('GamePage', () => {
  it('renders a compact preview page without the game, SPEC, or legacy tabs', async () => {
    await renderPage();

    expect(container.textContent).toContain('Neon Courier');
    expect(container.textContent).toContain('Deliver packages before the last neon goes out.');
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('video')).toBeNull();
    expect(container.textContent).not.toContain('SPEC.md');
    expect(container.querySelector('.game-page-preview img')?.getAttribute('src')).toContain('battle.png?w=1280');
    expect(container.querySelectorAll('.game-page-screenshot')).toHaveLength(2);
    expect(container.textContent).toContain('Arrows move, Space fires');
    expect(container.querySelector('[data-testid="votes"]')).not.toBeNull();
  });

  it('opens the sandboxed theater only after an explicit Play action', async () => {
    await renderPage();

    const preview = container.querySelector<HTMLButtonElement>('.game-page-preview');
    expect(preview).not.toBeNull();
    await act(async () => {
      preview!.click();
    });

    // No via param here, so the second arg is undefined.
    expect(playAction).toHaveBeenCalledWith(expect.objectContaining({ slug: 'neon-courier' }), undefined);
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('offers Play together for a multiplayer game and hides it otherwise', async () => {
    const playTogetherAction = vi.fn();
    fetchGamePage.mockResolvedValue(
      pageData({
        entry: {
          ...pageData().entry,
          multiplayer: { mode: 'controllers', minPlayers: 2, maxPlayers: 4 },
        },
      }),
    );
    await renderPage({ onPlayTogether: playTogetherAction });

    const partyButton = container.querySelector<HTMLButtonElement>('.party-btn');
    expect(partyButton).not.toBeNull();
    await act(async () => {
      partyButton!.click();
    });
    expect(playTogetherAction).toHaveBeenCalledWith(expect.objectContaining({ slug: 'neon-courier' }), undefined);
  });

  it('hides Play together for a single-player game', async () => {
    await renderPage();
    expect(container.querySelector('.party-btn')).toBeNull();
  });

  it('carries a rail-attributed via from the URL into the Play call', async () => {
    window.history.pushState(null, '', `${window.location.pathname}?via=rail_party`);
    await renderPage();

    const preview = container.querySelector<HTMLButtonElement>('.game-page-preview');
    await act(async () => {
      preview!.click();
    });

    expect(playAction).toHaveBeenCalledWith(expect.objectContaining({ slug: 'neon-courier' }), 'rail_party');
  });

  it('ignores an unrecognized via value from the URL', async () => {
    window.history.pushState(null, '', `${window.location.pathname}?via=totally-made-up`);
    await renderPage();

    const preview = container.querySelector<HTMLButtonElement>('.game-page-preview');
    await act(async () => {
      preview!.click();
    });

    expect(playAction).toHaveBeenCalledWith(expect.objectContaining({ slug: 'neon-courier' }), undefined);
  });

  it('lets visitors choose another screenshot without starting the game', async () => {
    await renderPage();

    const thumbnails = container.querySelectorAll<HTMLButtonElement>('.game-page-screenshot');
    await act(async () => {
      thumbnails[0].click();
    });

    expect(container.querySelector('.game-page-preview img')?.getAttribute('src')).toContain('opening.png?w=1280');
    expect(thumbnails[0].getAttribute('aria-pressed')).toBe('true');
    expect(playAction).not.toHaveBeenCalled();
  });

  it('opens a focused Remix entry without handing off to the theater', async () => {
    await renderPage();

    const remix = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Remix'),
    );
    expect(remix).toBeDefined();
    await act(async () => {
      remix!.click();
    });

    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(container.querySelector('#game-page-remix-request'));
    expect(remixAction).not.toHaveBeenCalled();
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('does not offer Remix when the catalog has no editor lane', async () => {
    fetchGamePage.mockResolvedValue(
      pageData({
        entry: { ...pageData().entry, editor: null },
      }),
    );
    await renderPage();

    expect(container.querySelector('.game-page-remix')).toBeNull();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(remixAction).not.toHaveBeenCalled();
  });

  it('follows the visual viewport so the mobile keyboard cannot cover the actions', async () => {
    const viewport = stubVisualViewport(844);
    await renderPage();

    await act(async () => {
      Array.from(container.querySelectorAll('button'))
        .find((button) => button.textContent?.includes('Remix'))!
        .click();
    });

    const backdrop = container.querySelector<HTMLElement>('.game-page-remix-backdrop')!;
    expect(backdrop.classList.contains('is-viewport-tracked')).toBe(true);
    expect(backdrop.style.getPropertyValue('--remix-entry-viewport-height')).toBe('844px');

    await viewport.emit('resize', { height: 480 });
    expect(backdrop.style.getPropertyValue('--remix-entry-viewport-height')).toBe('480px');

    await viewport.emit('scroll', { offsetTop: 54 });
    expect(backdrop.style.getPropertyValue('--remix-entry-viewport-offset')).toBe('54px');

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.game-page-remix-close')!.click();
    });
    expect(viewport.listenerCount()).toBe(0);
  });

  it('blocks a blank Remix request', async () => {
    await renderPage();
    await act(async () => {
      Array.from(container.querySelectorAll('button'))
        .find((button) => button.textContent?.includes('Remix'))!
        .click();
    });

    const form = container.querySelector<HTMLFormElement>('.game-page-remix-form')!;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(remixAction).not.toHaveBeenCalled();
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.querySelector<HTMLButtonElement>('.game-page-remix-form .primary-btn')?.disabled).toBe(true);
  });

  it('hands a non-empty request to the theater exactly once', async () => {
    await renderPage();
    await act(async () => {
      Array.from(container.querySelectorAll('button'))
        .find((button) => button.textContent?.includes('Remix'))!
        .click();
    });

    const input = container.querySelector<HTMLTextAreaElement>('#game-page-remix-request')!;
    await act(async () => {
      nativeSetValue(input, '  make the game faster  ');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      container
        .querySelector<HTMLFormElement>('.game-page-remix-form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(remixAction).toHaveBeenCalledTimes(1);
    expect(remixAction).toHaveBeenCalledWith(expect.objectContaining({ slug: 'neon-courier' }), 'make the game faster');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('keeps the preview public but gates Play during closed beta', async () => {
    privateBeta = true;
    await renderPage();

    expect(container.querySelector('.game-page-preview')).not.toBeNull();
    await act(async () => {
      container.querySelector<HTMLButtonElement>('.game-page-actions .primary-btn')!.click();
    });

    expect(playAction).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="auth-modal"]')).not.toBeNull();
  });

  it('replaces the URL when the handle is not the owning creator', async () => {
    const onCanonicalPath = vi.fn();
    await renderPage({ handle: 'somebody_else', onCanonicalPath });

    expect(onCanonicalPath).toHaveBeenCalledWith('/nightshift/neon-courier');
  });

  it('uses the catalog as the breadcrumb for platform-authored games', async () => {
    fetchGamePage.mockResolvedValue(
      pageData({
        entry: { ...pageData().entry, creatorHandle: 'gamedevpl', submittedBy: 'gamedev-platform' },
        creator: null,
        platformAuthored: true,
      }),
    );
    await renderPage({ handle: 'gamedevpl' });

    expect(container.querySelector('.game-page-breadcrumb a')?.getAttribute('href')).toBe('/');
    expect(container.textContent).toContain('gamedev.pl');
  });

  it('hides Open in Studio from visitors', async () => {
    await renderPage();
    expect(container.querySelector('a[href="/studio/neon-courier"]')).toBeNull();
  });

  it('offers Open in Studio to the owning creator', async () => {
    authUser = { uid: 'u1', handle: 'nightshift' };
    await renderPage();

    const studio = container.querySelector<HTMLAnchorElement>('a[href="/studio/neon-courier"]');
    expect(studio).not.toBeNull();
    expect(studio?.textContent).toContain('Open in Studio');
    expect(studio?.classList.contains('secondary-btn')).toBe(true);
  });

  it('does not treat a different signed-in handle as the owner', async () => {
    authUser = { uid: 'u2', handle: 'somebody_else' };
    await renderPage();
    expect(container.querySelector('a[href="/studio/neon-courier"]')).toBeNull();
  });

  it('reports the loaded title upward for document.title', async () => {
    const onGameLoaded = vi.fn();
    await renderPage({ onGameLoaded });
    expect(onGameLoaded).toHaveBeenCalledWith('Neon Courier');
  });
});

function nativeSetValue(el: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(el, value);
}
