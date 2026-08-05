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

    expect(playAction).toHaveBeenCalledWith(expect.objectContaining({ slug: 'neon-courier' }));
    expect(container.querySelector('iframe')).toBeNull();
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

  it('opens Remix directly through the theater handoff', async () => {
    await renderPage();

    const remix = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Remix'),
    );
    expect(remix).toBeDefined();
    await act(async () => {
      remix!.click();
    });

    expect(remixAction).toHaveBeenCalledWith(expect.objectContaining({ slug: 'neon-courier' }));
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

  it('reports the loaded title upward for document.title', async () => {
    const onGameLoaded = vi.fn();
    await renderPage({ onGameLoaded });
    expect(onGameLoaded).toHaveBeenCalledWith('Neon Courier');
  });
});
