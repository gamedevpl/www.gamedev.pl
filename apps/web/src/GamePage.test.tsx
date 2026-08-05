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

// The frame fetches the playable document and records a play session on mount;
// neither belongs in this test. The stub records mounts instead.
const frameMounts = vi.fn();
vi.mock('./PublishedGameFrame.js', () => ({
  PublishedGameFrame: (props: { slug: string }) => {
    frameMounts(props.slug);
    return createElement('div', { 'data-testid': 'frame', 'data-slug': props.slug });
  },
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
      controls: 'arrows',
      status: 'published',
      media: null,
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
    specMarkdown: '# Neon Courier\n\nDeliver packages before the last neon goes out.\n\n## Controls\n\n- arrows',
    modules: ['input', 'gameplay', 'gfx'],
    budget: { usedBytes: 147 * 1024, limitBytes: 252 * 1024 },
    releases: [
      { version: 'v3', createdAt: '2026-08-03T12:00:00.000Z', current: true, gateGreen: true },
      { version: 'v1', createdAt: '2026-08-01T12:00:00.000Z', current: false, gateGreen: null },
    ],
    stats: { plays: 4812, medianPlaySeconds: 360, windowDays: 28 },
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  authUser = null;
  privateBeta = false;
  fetchGamePage.mockReset();
  frameMounts.mockReset();
  fetchGamePage.mockResolvedValue(pageData());
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
  it('renders header, playable frame, spec sidebar, modules and budget', async () => {
    await renderPage();

    expect(container.textContent).toContain('Neon Courier');
    expect(container.textContent).toContain('Deliver packages before the last neon goes out.');
    // The default tab mounts the game itself.
    expect(container.querySelector('[data-testid="frame"]')?.getAttribute('data-slug')).toBe('neon-courier');
    // Breadcrumb links to the owning studio.
    expect(container.querySelector('a[href="/nightshift"]')).not.toBeNull();
    // Sidebar facts.
    expect(container.textContent).toContain('SPEC.md');
    expect(container.textContent).toContain('gameplay');
    expect(container.textContent).toContain('147 KiB of 252 KiB');
    expect(container.textContent).toContain('4,812');
    // Secondary tabs exist as real links.
    expect(container.querySelector('a[href="/nightshift/neon-courier/releases"]')).not.toBeNull();
    expect(container.querySelector('a[href="/nightshift/neon-courier/board"]')).not.toBeNull();
  });

  it('lists releases on the releases tab and keeps the frame mounted', async () => {
    await renderPage({ tab: 'releases' });

    expect(container.textContent).toContain('v3');
    expect(container.textContent).toContain('current');
    expect(container.textContent).toContain('v1');
    // Frame is lazy: never armed because the game tab was never active.
    expect(container.querySelector('[data-testid="frame"]')).toBeNull();
  });

  it('gates the frame behind sign-in during closed beta but renders the page', async () => {
    privateBeta = true;
    await renderPage();

    expect(container.querySelector('[data-testid="frame"]')).toBeNull();
    expect(container.textContent).toContain('Playing is in closed beta');
    // The page around the gate still renders for the anonymous visitor.
    expect(container.textContent).toContain('Neon Courier');
    expect(container.textContent).toContain('SPEC.md');

    const cta = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Sign in'),
    );
    expect(cta).toBeDefined();
    await act(async () => {
      cta!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('[data-testid="auth-modal"]')).not.toBeNull();
  });

  it('replaces the URL when the handle is not the owning studio', async () => {
    const onCanonicalPath = vi.fn();
    await renderPage({ handle: 'somebody_else', onCanonicalPath });

    expect(onCanonicalPath).toHaveBeenCalledWith('/nightshift/neon-courier');
  });

  it('404s a game with no creator handle, pointing at the play permalink', async () => {
    fetchGamePage.mockResolvedValue(
      pageData({
        entry: { ...pageData().entry, creatorHandle: null, submittedBy: 'gamedev-platform' },
        creator: null,
      }),
    );
    await renderPage();

    expect(container.textContent).toContain('This game page does not exist.');
    expect(container.querySelector('a[href="/play/neon-courier"]')).not.toBeNull();
  });

  it('reports the loaded title upward for document.title', async () => {
    const onGameLoaded = vi.fn();
    await renderPage({ onGameLoaded });
    expect(onGameLoaded).toHaveBeenCalledWith('Neon Courier');
  });
});
