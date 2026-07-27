// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreatorStudioView } from './CreatorStudioView.js';
import i18n from './i18n/index.js';
import type { StudioGame } from './studioApi.js';

const fetchStudioGames = vi.fn();
const fetchStudioHealth = vi.fn();
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

async function renderStudio() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(CreatorStudioView, { onNavigate: vi.fn(), onPlay: vi.fn() }));
  });
  await act(async () => {
    await fetchStudioGames.mock.results[0]?.value;
    await fetchStudioHealth.mock.results[0]?.value;
  });
  return { container, root };
}

describe('CreatorStudioView', () => {
  beforeEach(() => {
    authUser = null;
    fetchStudioGames.mockReset();
    fetchStudioHealth.mockReset();
    fetchStudioHealth.mockResolvedValue({ days: [], truncated: false, games: [] });
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
});
