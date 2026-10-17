// @vitest-environment jsdom

import { act, createElement, useCallback, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CreatorStudioView } from './CreatorStudioView.js';
import { useAppNavigation, type Navigate } from '../../useAppNavigation.js';
import i18n from '../../i18n/index.js';
import type { StudioGame } from '../../studioApi.js';

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

it('keeps Back and Forward on the requested game without rewriting history', async () => {
  const first = '/studio/trenchline-command/details';
  const second = '/studio/transport-tycoon-remake/details';
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
        'Open Transport Tycoon',
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
  expect(container.querySelector('.studio-strip-title')?.textContent).toContain('Trenchline Command');

  await act(async () => {
    container.querySelector<HTMLAnchorElement>(`a[href="${second}"]`)!.click();
  });
  expect(window.location.pathname).toBe(second);
  expect(container.querySelector('.studio-strip-title')?.textContent).toContain('Transport Tycoon Remake');
  navigations.mockClear();
  replacements.mockClear();

  for (const [path, title] of [
    [first, 'Trenchline Command'],
    [second, 'Transport Tycoon Remake'],
    [first, 'Trenchline Command'],
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
    expect(container.querySelector('.studio-strip-title')?.textContent).toContain(title);
    expect(container.querySelector('.studio-rail')).not.toBeNull();
    expect(navigations).not.toHaveBeenCalled();
    expect(replacements).not.toHaveBeenCalled();
  }
});
