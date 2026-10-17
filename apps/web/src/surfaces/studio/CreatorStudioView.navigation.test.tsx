// @vitest-environment jsdom

import { act, createElement, useCallback, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CreatorStudioView } from './CreatorStudioView.js';
import { useAppNavigation, type Navigate } from '../../useAppNavigation.js';
import i18n from '../../i18n/index.js';
import { fetchStudioGames, fetchStudioHealth, type StudioGame, type StudioGamesResponse } from '../../studioApi.js';

const user = { uid: 'g:creator', name: 'Creator' };
const games: StudioGame[] = [
  {
    token: 'trenchline-token',
    title: 'Trenchline Command',
    slug: 'trenchline-command',
    createdAt: '2026-08-01T00:00:00.000Z',
    lastKnownStatus: 'building',
  },
  {
    token: 'transport-token',
    title: 'Transport Tycoon Remake',
    slug: 'transport-tycoon-remake',
    createdAt: '2026-08-02T00:00:00.000Z',
    lastKnownStatus: 'building',
  },
];

vi.mock('../../AuthContext.js', () => ({ useAuth: () => ({ user }) }));
vi.mock('../../studioApi.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../studioApi.js')>()),
  fetchStudioGames: vi.fn(async () => ({ games, truncated: false, totalGames: games.length })),
  fetchStudioHealth: vi.fn(async () => ({ days: [], truncated: false, games: [] })),
  fetchStudioScorecards: vi.fn(async () => []),
  fetchStudioSuggestions: vi.fn(async () => []),
}));
vi.mock('../../submissionApi.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../submissionApi.js')>()),
  getSubmissionStatus: vi.fn(async () => ({ media: [] })),
}));

let root: Root;
let container: HTMLDivElement;

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  vi.mocked(fetchStudioGames).mockReset().mockResolvedValue({ games, truncated: false, totalGames: games.length });
  vi.mocked(fetchStudioHealth).mockClear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

async function renderHistory(first: string, second: string) {
  window.history.replaceState(null, '', first);
  const replacements = vi.spyOn(window.history, 'replaceState');
  const navigations = vi.fn();

  function RoutedStudio() {
    const partySeedRef = useRef<string | null>(null);
    const { route, navigate } = useAppNavigation({ partySeedRef, setPendingScrollTarget: vi.fn() });
    const onNavigate = useCallback<Navigate>(
      (path, options) => {
        navigations(path, options);
        // Bound a regression so redirect loops fail without hanging Vitest.
        if (navigations.mock.calls.length <= 8) navigate(path, options);
      },
      [navigate],
    );
    if (route.view !== 'studio') return null;
    return createElement(
      'div',
      null,
      createElement(
        'a',
        {
          href: second,
          onClick: (event: ReactMouseEvent) => {
            event.preventDefault();
            onNavigate(second);
          },
        },
        'Open next game',
      ),
      createElement(CreatorStudioView, {
        selectedGame: route.game,
        selectedTab: route.tab,
        onNavigate,
        onPlay: vi.fn(),
      }),
    );
  }

  await act(async () => root.render(createElement(RoutedStudio)));
  return { navigations, replacements };
}

it.each([
  { slug: 'transport-tycoon-remake', title: 'Transport Tycoon Remake', truncated: false },
  { slug: 'missing-game', title: null, truncated: false },
  { slug: 'off-shelf-game', title: 'Off Shelf Game', truncated: true },
  { slug: 'missing-game', title: null, truncated: true },
])('keeps Back and Forward on $slug without rewriting history', async ({ slug, title, truncated }) => {
  if (truncated) {
    vi.mocked(fetchStudioGames).mockImplementation(async (requested) => ({
      games:
        requested === 'off-shelf-game'
          ? [...games, { ...games[1], token: 'off-shelf-token', slug: requested, title: 'Off Shelf Game' }]
          : games,
      truncated: true,
      totalGames: 60,
    }));
  }
  const first = '/studio/trenchline-command/details';
  const second = `/studio/${slug}/details`;
  const { navigations, replacements } = await renderHistory(first, second);
  expect(container.querySelector('.studio-strip-title')?.textContent).toContain('Trenchline Command');

  await act(async () => {
    container.querySelector<HTMLAnchorElement>(`a[href="${second}"]`)!.click();
  });
  expect(window.location.pathname).toBe(second);
  const expectGame = (expectedTitle: string | null) => {
    if (expectedTitle) {
      expect(container.querySelector('.studio-strip-title')?.textContent).toContain(expectedTitle);
      expect(container.querySelector('.studio-rail')).not.toBeNull();
    } else {
      expect(container.querySelector('.studio-strip-title')).toBeNull();
      expect(container.querySelector('.studio-rail')).toBeNull();
      expect(container.textContent).toContain(i18n.t('studioPanel.gameNotFound'));
    }
  };
  expectGame(title);
  navigations.mockClear();
  replacements.mockClear();

  for (const { path, expectedTitle } of [
    { path: first, expectedTitle: 'Trenchline Command' },
    { path: second, expectedTitle: title },
    { path: first, expectedTitle: 'Trenchline Command' },
  ]) {
    await act(async () => {
      const changed = new Promise<void>((resolve) =>
        window.addEventListener('popstate', () => resolve(), { once: true }),
      );
      if (path === first) window.history.back();
      else window.history.forward();
      await changed;
    });
    expect(window.location.pathname).toBe(path);
    expectGame(expectedTitle);
    expect(navigations).not.toHaveBeenCalled();
    expect(replacements).not.toHaveBeenCalled();
  }
  expect(fetchStudioGames).toHaveBeenCalledTimes(truncated ? 2 : 1);
  if (truncated) expect(fetchStudioGames).toHaveBeenLastCalledWith(slug);
  expect(fetchStudioHealth).toHaveBeenCalledTimes(1);
});

it('restores a local selection when leaving a missing route for bare Studio', async () => {
  vi.mocked(fetchStudioGames).mockResolvedValue({ games, truncated: true, totalGames: 60 });
  const first = '/studio/missing-game/details';
  const second = '/studio';
  const { navigations, replacements } = await renderHistory(first, second);
  expect(container.textContent).toContain(i18n.t('studioPanel.gameNotFound'));
  await act(async () => container.querySelector<HTMLAnchorElement>(`a[href="${second}"]`)!.click());
  expect(window.location.pathname).toBe(second);
  expect(container.querySelector('.studio-strip-title')?.textContent).toContain('Transport Tycoon Remake');
  navigations.mockClear();
  replacements.mockClear();
  for (const direction of ['back', 'forward'] as const) {
    await act(async () => {
      const changed = new Promise<void>((resolve) =>
        window.addEventListener('popstate', () => resolve(), { once: true }),
      );
      window.history[direction]();
      await changed;
    });
    if (direction === 'back') {
      expect(window.location.pathname).toBe(first);
      expect(container.querySelector('.studio-strip-title')).toBeNull();
      expect(container.textContent).toContain(i18n.t('studioPanel.gameNotFound'));
    } else {
      expect(window.location.pathname).toBe(second);
      expect(container.querySelector('.studio-strip-title')?.textContent).toContain('Transport Tycoon Remake');
    }
    expect(navigations).not.toHaveBeenCalled();
    expect(replacements).not.toHaveBeenCalled();
  }
  expect(fetchStudioGames).toHaveBeenCalledTimes(1);
});

it('waits for off-shelf lookup and ignores its response after Back', async () => {
  let resolve!: (page: StudioGamesResponse) => void;
  const lookup = new Promise<StudioGamesResponse>((done) => {
    resolve = done;
  });
  vi.mocked(fetchStudioGames).mockImplementation((requested) =>
    requested === 'off-shelf-game' ? lookup : Promise.resolve({ games, truncated: true, totalGames: 60 }),
  );
  const first = '/studio/trenchline-command/details';
  const second = '/studio/off-shelf-game/details';
  const { navigations, replacements } = await renderHistory(first, second);
  await act(async () => container.querySelector<HTMLAnchorElement>(`a[href="${second}"]`)!.click());
  expect(container.querySelector('.studio-strip-title')).toBeNull();
  expect(container.textContent).toContain(i18n.t('studioPanel.loading'));
  expect(container.textContent).not.toContain(i18n.t('studioPanel.gameNotFound'));
  navigations.mockClear();
  replacements.mockClear();
  await act(async () => {
    const changed = new Promise<void>((done) => window.addEventListener('popstate', () => done(), { once: true }));
    window.history.back();
    await changed;
  });
  await act(async () => {
    resolve({ games: [], truncated: true, totalGames: 60 });
    await lookup;
  });
  expect(window.location.pathname).toBe(first);
  expect(container.querySelector('.studio-strip-title')?.textContent).toContain('Trenchline Command');
  expect(navigations).not.toHaveBeenCalled();
  expect(replacements).not.toHaveBeenCalled();
});

it('retries a failed off-shelf lookup when Forward returns to its address', async () => {
  vi.mocked(fetchStudioGames)
    .mockResolvedValueOnce({ games, truncated: true, totalGames: 60 })
    .mockRejectedValueOnce(new Error('network unavailable'))
    .mockResolvedValueOnce({
      games: [...games, { ...games[1], token: 'off-shelf-token', slug: 'off-shelf-game', title: 'Off Shelf Game' }],
      truncated: true,
      totalGames: 60,
    });
  const first = '/studio/trenchline-command/details';
  const second = '/studio/off-shelf-game/details';
  await renderHistory(first, second);
  await act(async () => container.querySelector<HTMLAnchorElement>(`a[href="${second}"]`)!.click());
  expect(container.querySelector('.studio-strip-title')).toBeNull();
  expect(container.textContent).toContain(i18n.t('studioPanel.loadError'));
  expect(container.textContent).not.toContain(i18n.t('studioPanel.gameNotFound'));
  for (const direction of ['back', 'forward'] as const) {
    await act(async () => {
      const changed = new Promise<void>((done) => window.addEventListener('popstate', () => done(), { once: true }));
      window.history[direction]();
      await changed;
    });
  }
  expect(container.querySelector('.studio-strip-title')?.textContent).toContain('Off Shelf Game');
  expect(container.textContent).not.toContain(i18n.t('studioPanel.loadError'));
  expect(fetchStudioGames).toHaveBeenCalledTimes(3);
  expect(fetchStudioHealth).toHaveBeenCalledTimes(1);
});
