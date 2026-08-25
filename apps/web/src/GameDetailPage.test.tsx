// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogEntry } from './catalog.js';
import i18n from './i18n/index.js';

const { recordRemixStep } = vi.hoisted(() => ({ recordRemixStep: vi.fn() }));

let authUser: { uid: string; handle?: string } | null = null;

vi.mock('./visitTelemetry.js', () => ({ recordRemixStep }));
vi.mock('./VoteWidget.js', () => ({ VoteWidget: () => <button data-testid="vote">Like 7</button> }));
vi.mock('./ShareGameButton.js', () => ({
  ShareGameButton: () => <button data-testid="share">Share</button>,
}));
vi.mock('./AuthContext.js', () => ({
  useAuth: () => ({ user: authUser, refreshUser: vi.fn(), logout: vi.fn() }),
}));

import { GameDetailPage } from './GameDetailPage.js';

const game: CatalogEntry = {
  slug: 'bridge-builder',
  title: 'Bridge Builder',
  genre: 'strategy',
  controls: 'Arrow keys move. Space places a bridge segment.',
  status: 'published',
  media: {
    screenshots: [
      { name: 'opening', file: 'opening.png' },
      { name: 'building', file: 'building.png' },
    ],
    video: 'gameplay.mp4',
  },
  multiplayer: null,
  saves: null,
  world: null,
  sensing: null,
  editor: 'content',
  orientation: 'any',
  touch: 'gamekit',
  submittedBy: 'Grzegorz',
  creatorHandle: 'gtanczyk',
};

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  authUser = null;
  recordRemixStep.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

function render(
  overrides: {
    game?: CatalogEntry;
    onPlay?: (entry: CatalogEntry) => void;
    onRemix?: (entry: CatalogEntry) => void;
  } = {},
) {
  const onPlay = overrides.onPlay ?? vi.fn();
  const onRemix = overrides.onRemix ?? vi.fn();
  root = createRoot(container);
  act(() => {
    root!.render(
      createElement(GameDetailPage, {
        game: overrides.game ?? game,
        state: 'ready',
        onPlay,
        onPlayTogether: vi.fn(),
        onRemix,
        onRetry: vi.fn(),
      }),
    );
  });
  return { onPlay, onRemix };
}

describe('GameDetailPage', () => {
  it('is preview-first and keeps the player-only actions in one visible row', () => {
    const { onPlay } = render();

    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector<HTMLImageElement>('.game-page-preview img')?.src).toContain(
      '/api/games/bridge-builder/media/building.png?w=1280',
    );
    expect(container.querySelectorAll('.game-page-screenshot')).toHaveLength(2);
    expect(container.querySelectorAll('.game-page-screenshot img')[0]?.getAttribute('src')).toContain(
      'opening.png?w=320',
    );
    expect(container.querySelector('[data-testid="vote"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="share"]')).not.toBeNull();
    expect(container.textContent).toContain('Arrow keys move');

    // None of the speculative/empty old tabs or the agent-facing spec reach this page.
    expect(container.textContent).not.toMatch(/Board|To Play|Releases|Sources|Follow|SPEC\.md/);

    act(() => {
      container.querySelector<HTMLButtonElement>('.game-page-preview')!.click();
    });
    expect(onPlay).toHaveBeenCalledWith(game);
  });

  it('switches the main preview when a screenshot is selected', () => {
    render();

    const thumbnails = container.querySelectorAll<HTMLButtonElement>('.game-page-screenshot');
    act(() => thumbnails[0]?.click());

    expect(container.querySelector<HTMLImageElement>('.game-page-preview img')?.src).toContain(
      '/api/games/bridge-builder/media/opening.png?w=1280',
    );
    expect(thumbnails[0]?.getAttribute('aria-pressed')).toBe('true');
  });

  it('opens Remix directly from the page and records the dedicated entry', () => {
    const { onRemix } = render();

    expect(recordRemixStep).toHaveBeenCalledWith('offered', { control: 'page' });
    act(() => {
      container.querySelector<HTMLButtonElement>('.game-page-remix')!.click();
    });
    expect(recordRemixStep).toHaveBeenCalledWith('opened', { control: 'page' });
    expect(onRemix).toHaveBeenCalledWith(game);
  });

  it('hides Remix and records no_lane when the catalog has no editor', () => {
    const { onRemix } = render({ game: { ...game, editor: null } });

    expect(recordRemixStep).toHaveBeenCalledWith('no_lane', { control: 'page' });
    expect(container.querySelector('.game-page-remix')).toBeNull();
    expect(onRemix).not.toHaveBeenCalled();
  });

  it('hides Open in Studio from visitors', () => {
    render();
    expect(container.querySelector('a[href="/studio/bridge-builder"]')).toBeNull();
  });

  it('offers Open in Studio to the owning creator', () => {
    authUser = { uid: 'u1', handle: 'gtanczyk' };
    render();
    const studio = container.querySelector<HTMLAnchorElement>('a[href="/studio/bridge-builder"]');
    expect(studio).not.toBeNull();
    expect(studio?.textContent).toContain('Open in Studio');
  });

  it('does not autoplay when the only preview asset is a video', () => {
    root = createRoot(container);
    act(() => {
      root!.render(
        createElement(GameDetailPage, {
          game: { ...game, media: { screenshots: [], video: 'gameplay.mp4' } },
          state: 'ready',
          onPlay: vi.fn(),
          onPlayTogether: vi.fn(),
          onRemix: vi.fn(),
          onRetry: vi.fn(),
        }),
      );
    });

    const video = container.querySelector<HTMLVideoElement>('.game-page-preview video');
    expect(video).not.toBeNull();
    expect(video?.autoplay).toBe(false);
    expect(video?.getAttribute('preload')).toBe('metadata');
  });
});
