// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogRail, FeaturedGame } from './CatalogRail.js';
import type { CatalogEntry } from '../../catalog.js';
import i18n from '../../i18n/index.js';

const withVideo: CatalogEntry = {
  slug: 'neon-courier',
  title: 'Neon Courier',
  genre: 'Arcade',
  controls: 'Arrow keys',
  status: 'published',
  media: {
    screenshots: [{ name: 'run', file: 'run.png' }],
    video: 'trailer.mp4',
  },
  multiplayer: null,
  saves: null,
  world: null,
  sensing: null,
  editor: 'content',
  orientation: 'any',
  touch: 'gamekit',
  submittedBy: 'gamedev.pl',
  creatorHandle: null,
};

const withoutVideo: CatalogEntry = {
  ...withVideo,
  slug: 'no-video',
  title: 'No Video',
  media: { screenshots: [{ name: 'run', file: 'run.png' }], video: null },
};

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  vi.useRealTimers();
});

function render(entries: CatalogEntry[]) {
  root = createRoot(container);
  act(() => {
    root!.render(
      createElement(CatalogRail, {
        heading: 'Picks',
        entries,
        via: 'rail_start_here',
        onPlayGame: vi.fn(),
      }),
    );
  });
}

describe('RailCard hover video preview', () => {
  it('does not show an editor capability badge on editable rail cards', () => {
    render([withVideo]);
    expect(container.querySelector('[title="This game has a built-in content editor"]')).toBeNull();
  });

  it('arms the trailer after a mouse hover dwell and drops it on leave', async () => {
    vi.useFakeTimers();
    render([withVideo]);

    const media = container.querySelector('.rail-card-media')!;
    expect(container.querySelector('video')).toBeNull();

    act(() => {
      media.dispatchEvent(new PointerEvent('pointerover', { pointerType: 'mouse', bubbles: true }));
    });
    expect(container.querySelector('video')).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(240);
    });
    const video = container.querySelector<HTMLVideoElement>('video');
    expect(video?.getAttribute('src')).toBe('/api/games/neon-courier/media/trailer.mp4');
    expect(video?.getAttribute('poster')).toBe('/api/games/neon-courier/media/run.png?w=320');

    act(() => {
      media.dispatchEvent(new PointerEvent('pointerout', { pointerType: 'mouse', bubbles: true }));
    });
    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('img')).not.toBeNull();
  });

  it('does not arm a preview for a card with no video', async () => {
    vi.useFakeTimers();
    render([withoutVideo]);

    const media = container.querySelector('.rail-card-media')!;
    act(() => {
      media.dispatchEvent(new PointerEvent('pointerover', { pointerType: 'mouse', bubbles: true }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(240);
    });

    expect(container.querySelector('video')).toBeNull();
    expect(media.getAttribute('tabindex')).toBeNull();
  });

  it('arms immediately on keyboard focus and drops it on blur', async () => {
    render([withVideo]);

    const media = container.querySelector<HTMLDivElement>('.rail-card-media')!;
    expect(media.getAttribute('tabindex')).toBe('0');

    act(() => {
      media.focus();
    });
    expect(container.querySelector('video')).not.toBeNull();

    act(() => {
      media.blur();
    });
    expect(container.querySelector('video')).toBeNull();
  });

  it('arms and disarms the trailer from the tap-only toggle, bypassing the dwell timer', () => {
    render([withVideo]);

    const toggle = () => container.querySelector<HTMLButtonElement>('.rail-card-preview-toggle')!;
    expect(toggle()).not.toBeNull();
    expect(container.querySelector('video')).toBeNull();

    act(() => toggle().click());
    expect(container.querySelector('video')).not.toBeNull();
    expect(toggle().getAttribute('aria-pressed')).toBe('true');

    act(() => toggle().click());
    expect(container.querySelector('video')).toBeNull();
    expect(toggle().getAttribute('aria-pressed')).toBe('false');
  });

  it('has no tap toggle for a card with no video', () => {
    render([withoutVideo]);
    expect(container.querySelector('.rail-card-preview-toggle')).toBeNull();
  });
});

describe('FeaturedGame hero preview', () => {
  function renderHero(entry: CatalogEntry) {
    root = createRoot(container);
    act(() => {
      root!.render(
        createElement(FeaturedGame, {
          entry,
          onPlayGame: vi.fn(),
          onPlayTogether: vi.fn(),
        }),
      );
    });
  }

  it('shows a game description instead of its full controls and updates when the language changes', async () => {
    renderHero({
      ...withVideo,
      controls: 'Shift+click selects squads; Q calls artillery; U digs tunnels.',
      tagline: {
        en: 'Break through enemy trenches with artillery, sappers and tunnels.',
        pl: 'Przełam front artylerią, saperami i podziemnymi tunelami.',
      },
    });

    expect(container.querySelector('.featured-game-meta')?.textContent).toBe(
      'Break through enemy trenches with artillery, sappers and tunnels.',
    );
    expect(container.textContent).not.toContain('Shift+click');

    await act(async () => {
      await i18n.changeLanguage('pl');
    });

    expect(container.querySelector('.featured-game-meta')?.textContent).toBe(
      'Przełam front artylerią, saperami i podziemnymi tunelami.',
    );
  });

  it('uses the English description when the Polish translation is blank', async () => {
    await i18n.changeLanguage('pl');
    renderHero({ ...withVideo, tagline: { en: 'Deliver packages through neon streets.', pl: '   ' } });
    expect(container.querySelector('.featured-game-meta')?.textContent).toBe('Deliver packages through neon streets.');
  });

  it.each([undefined, null, { en: '  ', pl: '  ' }])(
    'omits missing descriptions without falling back to controls (%j)',
    (tagline) => {
      renderHero({ ...withVideo, tagline });
      expect(container.querySelector('.featured-game-meta')).toBeNull();
      expect(container.textContent).not.toContain(withVideo.controls);
      expect(container.querySelector('.featured-game-actions button')).not.toBeNull();
    },
  );

  it('bounds lengthy descriptions at a word boundary and normalizes whitespace', () => {
    renderHero({ ...withVideo, tagline: { en: 'Command\n\t squads. ' + 'Break through enemy trenches. '.repeat(30) } });
    const description = container.querySelector('.featured-game-meta')?.textContent ?? '';
    expect(description.length).toBeLessThanOrEqual(180);
    expect(description).toMatch(/^Command squads\. /);
    expect(description).toMatch(/…$/);
    expect(description.slice(0, -1)).toMatch(/[\w.]$/);
  });

  it('starts on the poster and swaps in the trailer on tap, without autoplaying', () => {
    // Regression guard: play must fire from an effect, after the video mounts.
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    renderHero(withVideo);

    expect(container.querySelector('img')).not.toBeNull();
    expect(container.querySelector('video')).toBeNull();

    const toggle = container.querySelector<HTMLButtonElement>('.featured-game-preview-toggle');
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute('aria-pressed')).toBe('false');

    act(() => toggle?.click());

    const video = container.querySelector<HTMLVideoElement>('video');
    expect(video?.getAttribute('src')).toBe('/api/games/neon-courier/media/trailer.mp4');
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.featured-game-preview-toggle')?.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('.featured-game-preview-toggle')?.classList.contains('is-playing')).toBe(true);
    expect(play).toHaveBeenCalled();
  });

  it('pauses back to the poster on a second tap', () => {
    renderHero(withVideo);

    const toggle = () => container.querySelector<HTMLButtonElement>('.featured-game-preview-toggle')!;
    act(() => toggle().click());
    expect(container.querySelector('video')).not.toBeNull();

    act(() => toggle().click());
    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('img')).not.toBeNull();
    expect(toggle().getAttribute('aria-pressed')).toBe('false');
  });

  it('has no preview toggle for a game with no video', () => {
    renderHero(withoutVideo);
    expect(container.querySelector('.featured-game-preview-toggle')).toBeNull();
    expect(container.querySelector('img')).not.toBeNull();
  });
});
