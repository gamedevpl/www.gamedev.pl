// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreatorStudioView } from './CreatorStudioView.js';
import i18n from './i18n/index.js';
import type { StudioGame, StudioScorecard } from './studioApi.js';

const fetchStudioGames = vi.fn();
const fetchStudioHealth = vi.fn();
const fetchStudioScorecards = vi.fn();
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
    submitImprovement: vi.fn(),
  };
});

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
  });
  return { container, root, onNavigate };
}

describe('CreatorStudioView', () => {
  beforeEach(() => {
    authUser = null;
    fetchStudioGames.mockReset();
    fetchStudioHealth.mockReset();
    fetchStudioHealth.mockResolvedValue({ days: [], truncated: false, games: [] });
    fetchStudioScorecards.mockReset();
    fetchStudioScorecards.mockResolvedValue([]);
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

  it('adds search and filters once the shelf has many games', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    authUser = { uid: 'g:studio-demo', name: 'Studio Demo' };
    fetchStudioGames.mockResolvedValue(manyGames(10));

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

  it('opens the game picker from the switcher', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    authUser = { uid: 'g:studio-demo', name: 'Studio Demo' };
    fetchStudioGames.mockResolvedValue(manyGames(6));

    const { container, root } = await renderStudio();

    const switcher = container.querySelector('.studio-game-switcher');
    expect(switcher).toBeTruthy();

    await act(async () => {
      switcher!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('[role="dialog"]')?.textContent).toMatch(/Choose a game/i);

    root.unmount();
  });

  it('enters focus mode once the shelf has many games selected', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    authUser = { uid: 'g:studio-demo', name: 'Studio Demo' };
    fetchStudioGames.mockResolvedValue(manyGames(10));

    const { container, root } = await renderStudio();

    expect(container.querySelector('.studio-layout')?.classList.contains('is-focus')).toBe(true);
    expect(container.querySelector('.studio-game-switcher')?.textContent).toMatch(/10 games/i);

    root.unmount();
  });

  it('persists the selected tab in the URL', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    authUser = { uid: 'g:studio-demo', name: 'Studio Demo' };
    fetchStudioGames.mockResolvedValue(manyGames(2));
    window.history.replaceState(null, '', '/studio/token-0');

    const { container, root, onNavigate } = await renderStudio({ selectedToken: 'token-0' });

    const improveTab = Array.from(container.querySelectorAll('[role="tab"]')).find((button) =>
      button.textContent?.includes('Improve'),
    );
    expect(improveTab).toBeTruthy();

    await act(async () => {
      improveTab!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onNavigate).toHaveBeenCalledWith('/studio/token-0/improve');

    root.unmount();
  });

  it('falls back to the default tab when the deep-linked one does not exist for the game', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    authUser = { uid: 'g:studio-demo', name: 'Studio Demo' };
    // token-0 is still building, so Stats has nothing to show for it.
    fetchStudioGames.mockResolvedValue(manyGames(2));
    window.history.replaceState(null, '', '/studio/token-0/stats');

    const { container, root, onNavigate } = await renderStudio({ selectedToken: 'token-0', selectedTab: 'stats' });

    // Landed on Build, and the URL was corrected in place rather than pushed.
    const activeTab = container.querySelector('[role="tab"][aria-selected="true"]');
    expect(activeTab?.textContent).toContain('Build');
    expect(onNavigate).toHaveBeenCalledWith('/studio/token-0/build', { replace: true });
    // No tab may exist in the URL that has no button to leave it by.
    const tabLabels = Array.from(container.querySelectorAll('[role="tab"]')).map((button) => button.textContent);
    expect(tabLabels.some((label) => label?.includes('Player feedback'))).toBe(false);

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
    fetchStudioGames.mockResolvedValue(published);
    fetchStudioHealth.mockReset();
    fetchStudioHealth.mockResolvedValue({ days: [], truncated: false, games: [] });
    fetchStudioScorecards.mockReset();
    fetchStudioScorecards.mockResolvedValue([]);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  async function openStats() {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    const { container, root } = await renderStudio();
    const statsTab = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.trim().startsWith('Stats'),
    );
    if (statsTab) {
      await act(async () => {
        statsTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    }
    return { container, root };
  }

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
