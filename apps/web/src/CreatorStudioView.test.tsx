// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreatorStudioView } from './CreatorStudioView.js';
import i18n from './i18n/index.js';
import type { StudioGame, StudioGamesResponse, StudioScorecard } from './studioApi.js';

const fetchStudioGames = vi.fn();
const fetchStudioHealth = vi.fn();
const fetchStudioScorecards = vi.fn();
const fetchStudioSuggestions = vi.fn();
const approveSuggestion = vi.fn();
const dismissSuggestion = vi.fn();
const fetchGameAutonomy = vi.fn();
const setGameAutonomy = vi.fn();
const setDraftShared = vi.fn();
let authUser: { uid: string; name: string } | null = null;

vi.mock('./AuthContext', () => ({
  useAuth: () => ({ user: authUser, logout: vi.fn() }),
}));

vi.mock('./studioApi', async () => {
  const actual = await vi.importActual<typeof import('./studioApi.js')>('./studioApi.js');
  return {
    ...actual,
    fetchStudioGames: (...args: unknown[]) => fetchStudioGames(...args),
    fetchStudioHealth: (...args: unknown[]) => fetchStudioHealth(...args),
    fetchStudioScorecards: (...args: unknown[]) => fetchStudioScorecards(...args),
    fetchStudioSuggestions: (...args: unknown[]) => fetchStudioSuggestions(...args),
    approveSuggestion: (...args: unknown[]) => approveSuggestion(...args),
    dismissSuggestion: (...args: unknown[]) => dismissSuggestion(...args),
    fetchGameAutonomy: (...args: unknown[]) => fetchGameAutonomy(...args),
    setGameAutonomy: (...args: unknown[]) => setGameAutonomy(...args),
    setDraftShared: (...args: unknown[]) => setDraftShared(...args),
    submitImprovement: vi.fn(),
  };
});

function studioShelf(games: StudioGame[], truncated = false, totalGames?: number): StudioGamesResponse {
  return { games, truncated, totalGames: totalGames ?? games.length };
}

function manyGames(count: number): StudioGame[] {
  return Array.from({ length: count }, (_, index) => ({
    token: `token-${index}`,
    title: index === 3 ? 'Sky Dodge' : `Game ${index + 1}`,
    createdAt: new Date(Date.UTC(2026, 6, count - index)).toISOString(),
    lastKnownStatus: index % 4 === 0 ? 'building' : 'published',
    ...(index % 4 === 0
      ? {}
      : { slug: `game-${index + 1}`, publishedAt: new Date(Date.UTC(2026, 6, count - index)).toISOString() }),
  }));
}

async function renderStudio(props: Partial<Parameters<typeof CreatorStudioView>[0]> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const onNavigate = props.onNavigate ?? vi.fn();
  await act(async () => {
    root.render(
      createElement(CreatorStudioView, {
        onNavigate,
        onPlay: vi.fn(),
        ...props,
      }),
    );
  });
  await act(async () => {
    await fetchStudioGames.mock.results[0]?.value;
    await fetchStudioHealth.mock.results[0]?.value;
    await fetchStudioScorecards.mock.results[0]?.value;
    await fetchStudioSuggestions.mock.results[0]?.value;
  });
  const rerender = async (next: Partial<Parameters<typeof CreatorStudioView>[0]>) => {
    await act(async () => {
      root.render(createElement(CreatorStudioView, { onNavigate, onPlay: vi.fn(), ...props, ...next }));
    });
    await act(async () => {
      await Promise.resolve();
    });
  };
  return { container, root, onNavigate, rerender };
}

describe('CreatorStudioView', () => {
  beforeEach(() => {
    authUser = null;
    fetchStudioGames.mockReset();
    fetchStudioHealth.mockReset();
    fetchStudioHealth.mockResolvedValue({ days: [], truncated: false, games: [] });
    fetchStudioScorecards.mockReset();
    fetchStudioScorecards.mockResolvedValue([]);
    fetchStudioSuggestions.mockReset();
    fetchStudioSuggestions.mockResolvedValue([]);
    approveSuggestion.mockReset();
    dismissSuggestion.mockReset();
    fetchGameAutonomy.mockReset();
    fetchGameAutonomy.mockRejectedValue(new Error('not owned'));
    setGameAutonomy.mockReset();
    setDraftShared.mockReset();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('prompts unsigned visitors to sign in', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');

    const { container, root } = await renderStudio();

    expect(container.textContent).toContain('Creator Studio');
    expect(container.textContent).toMatch(/Sign in/i);

    root.unmount();
  });

  it('claims the app shell while the shelf loads so the footer does not flash', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    authUser = { uid: 'g:studio-demo', name: 'Studio Demo' };

    let resolveGames!: (value: StudioGamesResponse) => void;
    fetchStudioGames.mockReturnValue(
      new Promise<StudioGamesResponse>((resolve) => {
        resolveGames = resolve;
      }),
    );

    const container = document.createElement('div');
    // The shell CSS is keyed off `.app:has(...)`, so the marker has to sit under an
    // `.app` that also holds a footer — the real tree App mounts.
    const app = document.createElement('div');
    app.className = 'app';
    const content = document.createElement('div');
    content.className = 'content';
    const footer = document.createElement('footer');
    footer.className = 'site-footer';
    app.append(content, footer);
    document.body.appendChild(app);
    content.appendChild(container);

    const root = createRoot(container);
    await act(async () => {
      root.render(createElement(CreatorStudioView, { onNavigate: vi.fn(), onPlay: vi.fn() }));
    });

    expect(container.querySelector('.studio-shell-pending')).toBeTruthy();
    expect(container.textContent).toContain('Loading your games…');
    // jsdom does not apply stylesheets, so assert the marker the `:has()` rule keys on
    // rather than computed footer display — that is what keeps the flash from painting.
    expect(app.querySelector('.studio-shell-pending')).toBeTruthy();

    await act(async () => {
      resolveGames(studioShelf(manyGames(2)));
      await fetchStudioGames.mock.results[0]?.value;
      await fetchStudioHealth.mock.results[0]?.value;
    });

    expect(container.querySelector('.studio-shell-pending')).toBeFalsy();
    expect(container.querySelector('.studio-layout.is-game-open')).toBeTruthy();

    root.unmount();
    app.remove();
    authUser = null;
  });

  it('adds search and filters once the shelf has many games', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    authUser = { uid: 'g:studio-demo', name: 'Studio Demo' };
    fetchStudioGames.mockResolvedValue(studioShelf(manyGames(10)));

    const { container, root } = await renderStudio();

    expect(container.textContent).toMatch(/10 games/i);
    expect(container.querySelector('input[type="search"]')).toBeTruthy();
    expect(container.textContent).toContain('Building');
    expect(container.textContent).toContain('Live');
    expect(container.querySelectorAll('.studio-shelf-item').length).toBe(10);

    const buildingFilter = Array.from(container.querySelectorAll('.studio-shelf-filter')).find((button) =>
      button.textContent?.startsWith('Building'),
    );
    expect(buildingFilter).toBeTruthy();

    await act(async () => {
      buildingFilter!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const items = Array.from(container.querySelectorAll('.studio-shelf-item'));
    expect(items.length).toBe(3);
    expect(items.every((item) => item.textContent?.includes('Writing code'))).toBe(true);

    root.unmount();
  });

  it('opens the games shelf from the open control', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    authUser = { uid: 'g:studio-demo', name: 'Studio Demo' };
    fetchStudioGames.mockResolvedValue(studioShelf(manyGames(6)));

    const { container, root } = await renderStudio();

    const openShelf = container.querySelector('.studio-shelf-open');
    expect(openShelf).toBeTruthy();

    await act(async () => {
      openShelf!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('.studio-layout')?.classList.contains('is-shelf-open')).toBe(true);
    expect(container.querySelector('.studio-shelf-backdrop')).toBeTruthy();

    root.unmount();
  });

  it('lists one shelf row per game when a live title has an improve tip', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    authUser = { uid: 'g:studio-demo', name: 'Studio Demo' };
    fetchStudioGames.mockResolvedValue(
      studioShelf([
        {
          token: 'live-mw',
          title: 'Miniature Warfare 2D',
          slug: 'miniature-warfare-2d',
          createdAt: '2026-07-01T00:00:00.000Z',
          lastKnownStatus: 'published',
          publishedAt: '2026-07-01T00:00:00.000Z',
        },
        {
          token: 'tip-mw',
          title: 'Miniature Warfare 2D',
          slug: 'miniature-warfare-2d',
          createdAt: '2026-07-20T00:00:00.000Z',
          lastKnownStatus: 'building',
        },
        {
          token: 'live-gts',
          title: 'Global Thermonuclear Strategy',
          slug: 'global-thermonuclear-strategy',
          createdAt: '2026-07-02T00:00:00.000Z',
          lastKnownStatus: 'published',
          publishedAt: '2026-07-02T00:00:00.000Z',
        },
        {
          token: 'tip-gts',
          title: 'Global Thermonuclear Strategy',
          slug: 'global-thermonuclear-strategy',
          createdAt: '2026-07-21T00:00:00.000Z',
          lastKnownStatus: 'building',
        },
        {
          token: 'live-tv',
          title: 'A game tycoon like where I run a tv busi',
          slug: 'tv-tycoon',
          createdAt: '2026-07-03T00:00:00.000Z',
          lastKnownStatus: 'published',
          publishedAt: '2026-07-03T00:00:00.000Z',
        },
      ]),
    );

    const width = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });

    const { container, root } = await renderStudio({ selectedGame: 'miniature-warfare-2d' });

    // Collapsed tip+live pairs → 3 shelf rows. Open the phone drawer to count them.
    const openShelf = container.querySelector('.studio-shelf-open');
    expect(openShelf).toBeTruthy();
    await act(async () => {
      openShelf!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const shelf = container.querySelector('.studio-shelf');
    expect(shelf?.textContent).toMatch(/3 games/i);
    expect(shelf?.querySelectorAll('.studio-shelf-item').length).toBe(3);
    expect(shelf?.textContent).toMatch(/Building\s*2/);
    expect(shelf?.textContent).toMatch(/Live\s*3/);

    Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
    root.unmount();
  });

  it('closes the shelf on Escape while in playtest tab without exiting playtest', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    authUser = { uid: 'g:studio-demo', name: 'Studio Demo' };
    fetchStudioGames.mockResolvedValue(studioShelf(manyGames(6)));

    const { container, root } = await renderStudio({ selectedGame: 'game-2', selectedTab: 'playtest' });

    const openShelf = container.querySelector('.studio-shelf-open');
    expect(openShelf).toBeTruthy();

    await act(async () => {
      openShelf!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('.studio-layout')?.classList.contains('is-shelf-open')).toBe(true);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(container.querySelector('.studio-layout')?.classList.contains('is-shelf-open')).toBe(false);
    expect(container.querySelector('.studio-panel')?.classList.contains('is-playtesting')).toBe(true);

    root.unmount();
    authUser = null;
  });

  it('collapses a long shelf to a rail after a game is selected', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    authUser = { uid: 'g:studio-demo', name: 'Studio Demo' };
    fetchStudioGames.mockResolvedValue(studioShelf(manyGames(10)));

    const { container, root } = await renderStudio();

    expect(container.querySelector('.studio-layout')?.classList.contains('is-compact-shelf')).toBe(true);
    expect(container.querySelector('.studio-layout')?.classList.contains('is-shelf-open')).toBe(false);
    expect(container.querySelector('.studio-shelf')).toBeTruthy();
    expect(container.querySelector('.studio-game-switcher')).toBeNull();

    root.unmount();
  });

  it('locks body scroll while the phone shelf drawer is open', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    authUser = { uid: 'g:studio-demo', name: 'Studio Demo' };
    fetchStudioGames.mockResolvedValue(studioShelf(manyGames(6)));
    // jsdom has no matchMedia; width is the same fallback the drawer uses in embedded
    // webviews. Narrow enough that the shelf is off-canvas, not the desktop rail.
    const width = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });

    const { container, root } = await renderStudio();

    const shelf = container.querySelector('.studio-shelf');
    expect(shelf?.hasAttribute('inert')).toBe(true);
    expect(shelf?.getAttribute('aria-hidden')).toBe('true');

    const openShelf = container.querySelector('.studio-shelf-open');
    expect(openShelf).toBeTruthy();
    await act(async () => {
      openShelf!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('.studio-layout')?.classList.contains('is-shelf-open')).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
    expect(container.querySelector('.studio-shelf')?.hasAttribute('inert')).toBe(false);
    expect(container.querySelector('.studio-shelf')?.getAttribute('aria-hidden')).toBeNull();

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      // closeShelf restores focus on the next animation frame.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });
    expect(document.body.style.overflow).not.toBe('hidden');
    expect(container.querySelector('.studio-shelf')?.hasAttribute('inert')).toBe(true);
    // Escape must not leave focus trapped in the now-hidden search field.
    expect(document.activeElement).toBe(openShelf);

    Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
    root.unmount();
  });

  it('persists the selected tab in the URL', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    authUser = { uid: 'g:studio-demo', name: 'Studio Demo' };
    fetchStudioGames.mockResolvedValue(studioShelf(manyGames(2)));
    window.history.replaceState(null, '', '/studio/token-0');

    const { container, root, onNavigate } = await renderStudio({ selectedGame: 'token-0' });

    const detailsAction = Array.from(container.querySelectorAll('.studio-head-action')).find((button) =>
      button.textContent?.includes('Details'),
    );
    expect(detailsAction).toBeTruthy();

    await act(async () => {
      detailsAction!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onNavigate).toHaveBeenCalledWith('/studio/token-0/details');
    // Beside the thread, not instead of it: opening the facts about a game must not
    // take the game off the screen.
    expect(container.querySelector('.studio-rail')).not.toBeNull();
    expect(container.querySelector('.studio-build')).not.toBeNull();

    root.unmount();
  });

  it('makes Play the primary head action, with Details as an icon peer', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    authUser = { uid: 'g:studio-demo', name: 'Studio Demo' };
    fetchStudioGames.mockResolvedValue(studioShelf(manyGames(2)));
    window.history.replaceState(null, '', '/studio/token-0');

    const { container, root } = await renderStudio({ selectedGame: 'token-0' });

    const play = Array.from(container.querySelectorAll('.studio-head-action')).find((button) =>
      button.classList.contains('is-primary'),
    );
    const details = Array.from(container.querySelectorAll('.studio-head-action')).find((button) =>
      button.textContent?.includes('Details'),
    );
    expect(play?.textContent).toMatch(/Play/);
    expect(play?.classList.contains('is-primary')).toBe(true);
    expect(details?.classList.contains('is-primary')).toBe(false);
    expect(details?.classList.contains('is-icon-only')).toBe(true);

    root.unmount();
  });

  it('lets Play toggle back to the thread when already open', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    authUser = { uid: 'g:studio-demo', name: 'Studio Demo' };
    fetchStudioGames.mockResolvedValue(studioShelf(manyGames(2)));
    window.history.replaceState(null, '', '/studio/token-0/playtest');

    const { container, root, onNavigate } = await renderStudio({
      selectedGame: 'token-0',
      selectedTab: 'playtest',
    });

    const play = Array.from(container.querySelectorAll('.studio-head-action')).find((button) =>
      button.classList.contains('is-primary'),
    );
    expect(play?.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('.studio-playtest')).not.toBeNull();
    expect(container.querySelector('.studio-build')).toBeNull();

    await act(async () => {
      play!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onNavigate).toHaveBeenCalledWith('/studio/token-0/thread');

    root.unmount();
  });

  it('lands an old tab name on the surface that absorbed it, and corrects the URL', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    authUser = { uid: 'g:studio-demo', name: 'Studio Demo' };
    fetchStudioGames.mockResolvedValue(studioShelf(manyGames(2)));
    // The shape of a link from before there were three surfaces. The router resolves
    // `stats` onto Details; what is asserted here is that the address follows.
    window.history.replaceState(null, '', '/studio/token-0/stats');

    const { container, root, onNavigate } = await renderStudio({ selectedGame: 'token-0', selectedTab: 'details' });

    expect(container.querySelector('.studio-rail')).not.toBeNull();
    // In place, so the old address does not become a history entry to go Back through.
    expect(onNavigate).toHaveBeenCalledWith('/studio/token-0/details', { replace: true });
    // The surface it landed on has a control showing it is open, and one to close it by.
    const details = Array.from(container.querySelectorAll('.studio-head-action')).find((button) =>
      button.textContent?.includes('Details'),
    );
    expect(details?.getAttribute('aria-pressed')).toBe('true');
    // And the tab strip is gone for good.
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(0);

    root.unmount();
  });

  it('keeps an unpublished game to its creator until they share it', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    authUser = { uid: 'g:studio-demo', name: 'Studio Demo' };
    setDraftShared.mockResolvedValue({ shared: true, slug: 'tv-tycoon' });
    fetchStudioGames.mockResolvedValue(
      studioShelf([
        {
          token: 'token-draft',
          title: 'TV Tycoon',
          createdAt: '2026-07-30T09:00:00.000Z',
          lastKnownStatus: 'building',
          slug: 'tv-tycoon',
        },
      ]),
    );
    window.history.replaceState(null, '', '/studio/tv-tycoon/overview');

    const { container, root } = await renderStudio({ selectedGame: 'tv-tycoon', selectedTab: 'details' });

    const toggle = container.querySelector<HTMLButtonElement>('.studio-share-toggle');
    expect(toggle?.getAttribute('aria-checked')).toBe('false');
    // Off means off: no link on screen to copy, because there is nothing that works.
    expect(container.querySelector('.studio-share .status-share')).toBeNull();

    await act(async () => {
      toggle!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(setDraftShared).toHaveBeenCalledWith('token-draft', true);
    expect(container.querySelector('.studio-share-toggle')?.getAttribute('aria-checked')).toBe('true');
    // The game's ordinary permalink — the same one it keeps once it is published, so
    // there is nothing to re-send when that happens. Never a separate draft address.
    expect(container.querySelector('.studio-share .inline-link')?.textContent).toContain('/play/tv-tycoon');

    root.unmount();
  });

  it('puts the switch back when the change did not take', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    authUser = { uid: 'g:studio-demo', name: 'Studio Demo' };
    setDraftShared.mockRejectedValue(new Error('nope'));
    fetchStudioGames.mockResolvedValue(
      studioShelf([
        {
          token: 'token-draft',
          title: 'TV Tycoon',
          createdAt: '2026-07-30T09:00:00.000Z',
          lastKnownStatus: 'building',
          slug: 'tv-tycoon',
        },
      ]),
    );

    const { container, root } = await renderStudio({ selectedGame: 'tv-tycoon', selectedTab: 'details' });

    await act(async () => {
      container.querySelector('.studio-share-toggle')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // A switch left showing "on" after a failed write is the worst outcome here: the
    // creator believes they shared a game that nobody else can open.
    expect(container.querySelector('.studio-share-toggle')?.getAttribute('aria-checked')).toBe('false');
    expect(container.querySelector('.studio-share .error')).not.toBeNull();

    root.unmount();
  });

  it('makes the details panel behave like a sheet on a narrow screen', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    authUser = { uid: 'g:studio-demo', name: 'Studio Demo' };
    fetchStudioGames.mockResolvedValue(studioShelf(manyGames(2)));
    // jsdom has no matchMedia, which is also the fallback path in real embedded
    // webviews — the width is what decides when the query is unavailable.
    const width = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { value: 420, configurable: true });

    const { container, root } = await renderStudio({ selectedGame: 'token-0', selectedTab: 'details' });

    // Over the thread, so: something to tap beside it, and a page that does not scroll
    // away behind it. Without these it is a fixed panel the page slides underneath.
    expect(container.querySelector('.studio-rail-backdrop')).not.toBeNull();
    expect(container.querySelector('.studio-rail')?.getAttribute('aria-modal')).toBe('true');
    expect(document.body.style.overflow).toBe('hidden');

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(container.querySelector('.studio-rail')).toBeNull();
    expect(document.body.style.overflow).not.toBe('hidden');

    Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
    root.unmount();
  });

  it('leaves the details panel a plain rail when there is room beside the thread', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    authUser = { uid: 'g:studio-demo', name: 'Studio Demo' };
    fetchStudioGames.mockResolvedValue(studioShelf(manyGames(2)));
    const width = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true });

    const { container, root } = await renderStudio({ selectedGame: 'token-0', selectedTab: 'details' });

    // Beside the thread it is not modal, and must not lock the page — the reader can
    // see straight past it to the conversation it is about.
    expect(container.querySelector('.studio-rail')).not.toBeNull();
    expect(container.querySelector('.studio-rail-backdrop')).toBeNull();
    expect(document.body.style.overflow).not.toBe('hidden');

    Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
    root.unmount();
  });

  it('does not carry one game’s details state onto another', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    authUser = { uid: 'g:studio-demo', name: 'Studio Demo' };
    fetchStudioGames.mockResolvedValue(
      studioShelf([
        {
          token: 'token-shared',
          title: 'TV Tycoon',
          createdAt: '2026-07-30T09:00:00.000Z',
          lastKnownStatus: 'building',
          slug: 'tv-tycoon',
          draftShared: true,
        },
        {
          token: 'token-private',
          title: 'Space Miner',
          createdAt: '2026-07-30T09:30:00.000Z',
          lastKnownStatus: 'building',
          slug: 'space-miner',
        },
      ]),
    );

    // Two `/details` URLs in a row — a browser Back, or a link. The panel stays mounted
    // across that, so anything it seeded from the first game would still be on screen.
    const { container, root, rerender } = await renderStudio({
      selectedGame: 'tv-tycoon',
      selectedTab: 'details',
    });
    expect(container.querySelector('.studio-share-toggle')?.getAttribute('aria-checked')).toBe('true');

    await rerender({ selectedGame: 'space-miner', selectedTab: 'details' });

    // The second game has never been shared, and the switch must say so.
    expect(container.querySelector('.studio-share-toggle')?.getAttribute('aria-checked')).toBe('false');
    expect(setDraftShared).not.toHaveBeenCalled();

    root.unmount();
  });

  it('opens a game addressed by its slug', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    authUser = { uid: 'g:studio-demo', name: 'Studio Demo' };
    fetchStudioGames.mockResolvedValue(studioShelf(manyGames(3)));
    window.history.replaceState(null, '', '/studio/game-2');

    const { container, root } = await renderStudio({ selectedGame: 'game-2' });

    expect(container.querySelector('.studio-detail-title-block h2')?.textContent).toContain('Game 2');

    root.unmount();
  });

  it('rewrites an old capability-token link onto the game’s slug', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    authUser = { uid: 'g:studio-demo', name: 'Studio Demo' };
    fetchStudioGames.mockResolvedValue(studioShelf(manyGames(3)));
    window.history.replaceState(null, '', '/studio/token-1');

    // The shape of a link from a months-old notification email, minted before games
    // were given a slug at submission.
    const { container, root, onNavigate } = await renderStudio({ selectedGame: 'token-1' });

    // It still opens the right game…
    expect(container.querySelector('.studio-detail-title-block h2')?.textContent).toContain('Game 2');
    // …and leaves a readable URL behind it, taking the capability out of history. In
    // place, so the old address does not become an entry to go Back through.
    expect(onNavigate).toHaveBeenCalledWith('/studio/game-2/thread', { replace: true });

    root.unmount();
  });

  it('shows nothing for a game the creator does not own', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    authUser = { uid: 'g:studio-demo', name: 'Studio Demo' };
    fetchStudioGames.mockResolvedValue(studioShelf(manyGames(3)));
    window.history.replaceState(null, '', '/studio/somebody-elses-game');

    // Slugs are public — they are in every /play/ link — so the guard cannot be that
    // the address is secret. It is that the shelf holds only this creator's games, and
    // nothing on this screen is fetched by the URL's value.
    const { container, root, onNavigate } = await renderStudio({ selectedGame: 'somebody-elses-game' });

    expect(container.querySelector('.studio-detail')).toBeNull();
    expect(onNavigate).not.toHaveBeenCalled();

    root.unmount();
  });

  it('keeps a capability token out of the URL on bare /studio until a game is picked', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    authUser = { uid: 'g:studio-demo', name: 'Studio Demo' };
    fetchStudioGames.mockResolvedValue(studioShelf(manyGames(2)));
    window.history.replaceState(null, '', '/studio');

    const { container, root, onNavigate } = await renderStudio();

    // First game is selected in the UI for convenience…
    expect(container.querySelector('.studio-shelf-item.is-active')?.textContent).toContain('Game 1');
    // …but nothing is written to the address bar until an explicit pick.
    expect(onNavigate).not.toHaveBeenCalled();

    const second = Array.from(container.querySelectorAll('.studio-shelf-item')).find((item) =>
      item.textContent?.includes('Game 2'),
    );
    expect(second).toBeTruthy();
    await act(async () => {
      second!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    // And when it is written, it names the game — not the capability token that used
    // to sit in the URL bar, in history, and in every screenshot of this screen.
    expect(onNavigate).toHaveBeenCalledWith('/studio/game-2/thread');

    root.unmount();
  });
});

describe('CreatorStudioView — what players think', () => {
  const published: StudioGame[] = [
    {
      token: 'token-live',
      title: 'Sky Dodge',
      createdAt: '2026-07-01T00:00:00.000Z',
      lastKnownStatus: 'published',
      slug: 'sky-dodge',
      publishedAt: '2026-07-02T00:00:00.000Z',
    },
  ];

  function scorecard(partial: Partial<StudioScorecard> = {}): StudioScorecard {
    return {
      slug: 'sky-dodge',
      computedAt: '2026-07-28T03:00:00.000Z',
      windowDays: 28,
      truncated: false,
      votes: { up: 4, down: 1 },
      feedbackCount: 3,
      untrustedThemes: [{ theme: 'level 2 is a wall', count: 3 }],
      ...partial,
    };
  }

  beforeEach(() => {
    authUser = { uid: 'g:creator', name: 'Creator' };
    fetchStudioGames.mockReset();
    fetchStudioGames.mockResolvedValue(studioShelf(published));
    fetchStudioHealth.mockReset();
    fetchStudioHealth.mockResolvedValue({ days: [], truncated: false, games: [] });
    fetchStudioScorecards.mockReset();
    fetchStudioScorecards.mockResolvedValue([]);
    fetchStudioSuggestions.mockReset();
    fetchStudioSuggestions.mockResolvedValue([]);
    approveSuggestion.mockReset();
    dismissSuggestion.mockReset();
    fetchGameAutonomy.mockReset();
    fetchGameAutonomy.mockRejectedValue(new Error('not owned'));
    setGameAutonomy.mockReset();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  async function openStats() {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    const { container, root } = await renderStudio();
    const detailsAction = Array.from(container.querySelectorAll('.studio-head-action')).find((button) =>
      button.textContent?.includes('Details'),
    );
    if (detailsAction) {
      await act(async () => {
        detailsAction.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    }
    return { container, root };
  }

  describe('suggested improvements', () => {
    function suggestion(partial: Record<string, unknown> = {}) {
      return {
        id: 'sug-sky-dodge-defect-1',
        slug: 'sky-dodge',
        class: 'defect',
        priority: 40,
        evidence: [{ finding: '40 uncaught errors across 100 sessions.', metrics: { errors: 40 } }],
        status: 'proposed',
        computedFrom: '2026-07-28T03:00:00.000Z',
        createdAt: '2026-07-28T03:10:00.000Z',
        untrustedContext: null,
        ...partial,
      };
    }

    it('shows the evidence and offers a decision', async () => {
      fetchStudioSuggestions.mockResolvedValue([suggestion()]);

      const { container, root } = await openStats();

      expect(container.textContent).toContain('Suggested improvements');
      expect(container.textContent).toContain('40 uncaught errors across 100 sessions.');
      expect(container.textContent).toContain('Approve');
      root.unmount();
    });

    it('renders what a game reported as text, never as markup', async () => {
      // Same guarantee the feedback themes above already carry: an error message is a
      // string a game chose to emit, and this surface is one an operator reads.
      fetchStudioSuggestions.mockResolvedValue([
        suggestion({
          untrustedContext: {
            errorSamples: [{ message: '<img src=x onerror=alert(1)>', count: 3 }],
            progressLabels: [],
            feedbackThemes: [],
          },
        }),
      ]);

      const { container, root } = await openStats();

      expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
      expect(container.querySelector('img')).toBeNull();
      root.unmount();
    });

    it('tells the creator their approval counted even when no agent was available', async () => {
      // The whole reason `no-implementer` is a state rather than an error. Reporting a
      // failure here would make Approve look like it silently did nothing.
      fetchStudioSuggestions.mockResolvedValue([suggestion()]);
      approveSuggestion.mockResolvedValue(suggestion({ status: 'no-implementer' }));

      const { container, root } = await openStats();
      const approve = Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'Approve',
      );
      await act(async () => {
        approve?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(container.textContent).toContain('no coding agent was available');
      root.unmount();
    });

    it('asks why before dismissing, and sends the reason', async () => {
      fetchStudioSuggestions.mockResolvedValue([suggestion()]);
      dismissSuggestion.mockResolvedValue(suggestion({ status: 'rejected', statusReason: 'intentional' }));

      const { container, root } = await openStats();
      const dismiss = Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'Dismiss',
      );
      await act(async () => {
        dismiss?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(container.textContent).toContain('Why are you dismissing this?');

      const reason = Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'It is meant to be this way',
      );
      await act(async () => {
        reason?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(dismissSuggestion).toHaveBeenCalledWith('sug-sky-dodge-defect-1', 'intentional');
      root.unmount();
    });

    it('stays out of the way when the router has nothing to say', async () => {
      fetchStudioSuggestions.mockResolvedValue([]);

      const { container, root } = await openStats();

      expect(container.textContent).not.toContain('Suggested improvements');
      root.unmount();
    });
  });

  describe('autonomy permission', () => {
    it('shows the creator what may happen without asking, and reassures about publishing', async () => {
      fetchGameAutonomy.mockResolvedValue('suggest');

      const { container, root } = await openStats();

      expect(container.textContent).toContain('What we may do without asking');
      // The reassurance is load-bearing: it is a property of the job state machine, not a
      // promise, and a creator deciding this needs to know it.
      expect(container.textContent).toContain('Nothing goes live without your review');
      expect(container.textContent).toContain('Suggest, and let me decide');
      root.unmount();
    });

    it('saves the choice the creator makes', async () => {
      fetchGameAutonomy.mockResolvedValue('suggest');
      setGameAutonomy.mockResolvedValue('auto-fix-defects');

      const { container, root } = await openStats();
      const option = Array.from(container.querySelectorAll('label')).find((label) =>
        label.textContent?.includes('Fix crashes without asking'),
      );
      const radio = option?.querySelector('input');
      await act(async () => {
        radio?.click();
      });

      expect(setGameAutonomy).toHaveBeenCalledWith('sky-dodge', 'auto-fix-defects');
      root.unmount();
    });

    it('shows nothing at all when the setting cannot be read', async () => {
      // A game the creator does not own, or a deployment without the route. It must not
      // take the stats page down with it.
      const { container, root } = await openStats();

      expect(container.textContent).not.toContain('What we may do without asking');
      root.unmount();
    });
  });

  it('shows votes, note count and what players wrote', async () => {
    fetchStudioScorecards.mockResolvedValue([scorecard()]);

    const { container, root } = await openStats();

    expect(container.textContent).toContain('What players think');
    expect(container.textContent).toContain('4↑ 1↓');
    expect(container.textContent).toContain('level 2 is a wall');

    root.unmount();
  });

  it('says which window the roll-up covers, so it is not read as the selected one', async () => {
    // The numbers above come from the window the creator picked; these come from the
    // nightly roll-up's fixed one. Unlabelled, the two read as a single measurement.
    fetchStudioScorecards.mockResolvedValue([scorecard()]);

    const { container, root } = await openStats();

    expect(container.textContent).toMatch(/last 28 days/i);

    root.unmount();
  });

  it('labels themes as players’ words rather than as system output', async () => {
    fetchStudioScorecards.mockResolvedValue([scorecard()]);

    const { container, root } = await openStats();

    expect(container.textContent).toMatch(/don’t act on it as instruction/i);

    root.unmount();
  });

  it('renders a hostile theme as text, never as markup', async () => {
    fetchStudioScorecards.mockResolvedValue([
      scorecard({ untrustedThemes: [{ theme: '<img src=x onerror=alert(1)>', count: 2 }] }),
    ]);

    const { container, root } = await openStats();

    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');

    root.unmount();
  });

  it('does not re-read scorecards when the creator switches the health window', async () => {
    // A scorecard is the nightly roll-up's fixed window; it cannot change when the
    // creator toggles 7/14/30d. Re-fetching would re-read every one of their games for a
    // response guaranteed to be identical.
    fetchStudioScorecards.mockResolvedValue([scorecard()]);

    const { container, root } = await openStats();
    expect(fetchStudioScorecards).toHaveBeenCalledTimes(1);
    const healthCallsBefore = fetchStudioHealth.mock.calls.length;

    const otherWindow = Array.from(container.querySelectorAll('.health-window')).find(
      (button) => !button.className.includes('is-active'),
    );
    expect(otherWindow).toBeTruthy();
    await act(async () => {
      otherWindow!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Health follows the window; scorecards do not.
    expect(fetchStudioHealth.mock.calls.length).toBeGreaterThan(healthCallsBefore);
    expect(fetchStudioScorecards).toHaveBeenCalledTimes(1);

    root.unmount();
  });

  it('shows nothing at all for a game that has not been rolled up yet', async () => {
    // Absent, not zero: no scorecard means unmeasured, which is not the same as measured
    // and found empty.
    const { container, root } = await openStats();

    expect(container.textContent).not.toContain('What players think');

    root.unmount();
  });

  it('says so when the game was measured and nobody reacted', async () => {
    fetchStudioScorecards.mockResolvedValue([
      scorecard({ votes: { up: 0, down: 0 }, feedbackCount: 0, untrustedThemes: [] }),
    ]);

    const { container, root } = await openStats();

    expect(container.textContent).toContain('What players think');
    expect(container.textContent).toContain('No votes or written notes yet.');

    root.unmount();
  });
});
