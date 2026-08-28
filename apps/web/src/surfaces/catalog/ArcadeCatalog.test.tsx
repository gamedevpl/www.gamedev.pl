// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArcadeCatalog } from './ArcadeCatalog.js';
import * as AuthContextModule from '../../AuthContext.js';
import type { CatalogEntry } from '../../catalog.js';
import i18n from '../../i18n/index.js';

type ObserverInstance = {
  callback: IntersectionObserverCallback;
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  targets: Element[];
};

let observers: ObserverInstance[];

function installIntersectionObserverMock() {
  observers = [];
  class MockIntersectionObserver {
    callback: IntersectionObserverCallback;
    observe = vi.fn((target: Element) => {
      this.targets.push(target);
    });
    disconnect = vi.fn();
    unobserve = vi.fn();
    targets: Element[] = [];
    root = null;
    rootMargin = '';
    thresholds = [];

    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback;
      observers.push(this);
    }

    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }

  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
}

function intersect(observer: ObserverInstance, target: Element, isIntersecting: boolean) {
  observer.callback(
    [
      {
        isIntersecting,
        target,
        intersectionRatio: isIntersecting ? 1 : 0,
        time: 0,
        boundingClientRect: {} as DOMRectReadOnly,
        intersectionRect: {} as DOMRectReadOnly,
        rootBounds: null,
      },
    ],
    observer as unknown as IntersectionObserver,
  );
}

// Rails mount observers too, so match by watched target instead of index.
function observerFor(target: Element): ObserverInstance {
  const match = observers.find((observer) => observer.targets.includes(target));
  if (!match) throw new Error('no observer registered for target');
  return match;
}

const entries: CatalogEntry[] = [
  {
    slug: 'above-fold',
    title: 'Above Fold',
    genre: 'Arcade',
    controls: 'Arrow keys',
    status: 'published',
    media: {
      screenshots: [
        { name: 'opening', file: 'opening.png' },
        { name: 'mid', file: 'mid.png' },
      ],
      video: 'gameplay.mp4',
    },
    multiplayer: null,
    saves: null,
    world: null,
    sensing: null,
    editor: null,
    orientation: 'any',
    touch: null,
    submittedBy: null,
  },
  {
    slug: 'below-fold',
    title: 'Below Fold',
    genre: 'Puzzle',
    controls: 'Mouse',
    status: 'published',
    media: {
      screenshots: [
        { name: 'opening', file: 'opening.png' },
        { name: 'win', file: 'win.png' },
      ],
      video: 'preview.mp4',
    },
    multiplayer: null,
    saves: null,
    world: null,
    sensing: null,
    editor: null,
    orientation: 'any',
    touch: null,
    submittedBy: 'alice',
  },
];

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

/** Default AuthContext is `loading: true` — resolve auth so the shelf gate can finish. */
function mockSignedOutAuth() {
  vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
    user: null,
    loading: false,
    privateBeta: false,
  } as ReturnType<typeof AuthContextModule.useAuth>);
}

describe('ArcadeCatalog lazy media', () => {
  beforeEach(async () => {
    installIntersectionObserverMock();
    mockSignedOutAuth();
    sessionStorage.setItem(
      'gdpl.catalogSortSignals',
      JSON.stringify({ viewer: '', items: [], popularity: [], lastPlayed: [], newest: [] }),
    );
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    document.body.innerHTML = '';
    sessionStorage.clear();
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('loads posters near the fold but arms video and moments only on preview intent', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ items: [] })));
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(ArcadeCatalog, {
          catalogStatus: 'ready',
          catalogError: null,
          catalogEntries: entries,
          onPlayGame: vi.fn(),
          onPlayTogether: vi.fn(),
          onRetryCatalog: vi.fn(),
        }),
      );
      await flushEffects();
    });

    expect(container.querySelectorAll('.catalog-card')).toHaveLength(2);
    expect(container.querySelectorAll('video')).toHaveLength(0);
    expect(container.querySelectorAll('img.catalog-preview')).toHaveLength(0);
    expect(container.querySelectorAll('.catalog-moment')).toHaveLength(0);
    // One observer per grid card — rails watch their own cards separately.
    const gridMediaObservers = [...container.querySelectorAll('.catalog-media')].map(observerFor);
    expect(gridMediaObservers).toHaveLength(2);

    const firstMedia = container.querySelectorAll('.catalog-media')[0]!;
    await act(async () => {
      intersect(observerFor(firstMedia), firstMedia, true);
      await flushEffects();
    });

    // Near-fold: poster only — no moment thumbs and no MP4 until engage.
    expect(container.querySelectorAll('video')).toHaveLength(0);
    const poster = container.querySelector<HTMLImageElement>('img.catalog-preview');
    expect(poster?.getAttribute('src')).toBe('/api/games/above-fold/media/mid.png?w=640');
    expect(container.querySelectorAll('.catalog-moment')).toHaveLength(0);

    // The modifier the coarse-pointer CSS keeps visible for a tap.
    expect(container.querySelector('.preview-toggle')?.classList.contains('preview-toggle--video')).toBe(true);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.preview-toggle')?.click();
      await flushEffects();
    });

    const preview = container.querySelector<HTMLVideoElement>('video.catalog-preview');
    expect(preview?.getAttribute('src')).toBe('/api/games/above-fold/media/gameplay.mp4');
    expect(preview?.getAttribute('poster')).toBe('/api/games/above-fold/media/mid.png?w=640');
    expect(container.querySelectorAll('.catalog-moment')).toHaveLength(2);

    // The second card still has no media srcs — it never intersected.
    expect(container.querySelectorAll('video')).toHaveLength(1);
    const moments = [...container.querySelectorAll<HTMLImageElement>('.catalog-moment img')];
    expect(moments).toHaveLength(2);
    expect(moments.every((img) => img.src.includes('/api/games/above-fold/'))).toBe(true);
    expect(moments.every((img) => img.getAttribute('src')?.endsWith('?w=96'))).toBe(true);

    await act(async () => {
      root.unmount();
    });
  });

  it('makes the card the game-page link while keeping Play as the theater action', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ items: [] })));
    const onPlayGame = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(ArcadeCatalog, {
          catalogStatus: 'ready',
          catalogError: null,
          catalogEntries: [entries[0]!],
          onPlayGame,
          onPlayTogether: vi.fn(),
          onRetryCatalog: vi.fn(),
        }),
      );
      await flushEffects();
    });

    const cardLink = container.querySelector<HTMLAnchorElement>('.catalog-card-hit-area');
    expect(cardLink?.getAttribute('href')).toBe('/gamedevpl/above-fold');
    expect(container.querySelector('.ai-pill')).toBeNull();
    expect(container.querySelector('.card-about-link')).toBeNull();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.card-actions .primary-btn')?.click();
    });
    // 'grid' tags plays from the full catalog grid, not a rail.
    expect(onPlayGame).toHaveBeenCalledWith(entries[0], 'grid');

    await act(async () => root.unmount());
  });

  it('opens moments on video-less cards via the moments toggle', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ items: [] })));
    const stillsOnly: CatalogEntry[] = [
      {
        ...entries[0]!,
        slug: 'stills-only',
        title: 'Stills Only',
        media: {
          screenshots: [
            { name: 'opening', file: 'opening.png' },
            { name: 'mid', file: 'mid.png' },
          ],
          video: null,
        },
      },
    ];
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(ArcadeCatalog, {
          catalogStatus: 'ready',
          catalogError: null,
          catalogEntries: stillsOnly,
          onPlayGame: vi.fn(),
          onPlayTogether: vi.fn(),
          onRetryCatalog: vi.fn(),
        }),
      );
      await flushEffects();
    });

    const media = container.querySelector('.catalog-media')!;
    expect(media.getAttribute('tabindex')).toBe('0');
    await act(async () => {
      intersect(observerFor(media), media, true);
      await flushEffects();
    });

    expect(container.querySelectorAll('.catalog-moment')).toHaveLength(0);
    const toggle = container.querySelector<HTMLButtonElement>('.preview-toggle');
    expect(toggle?.getAttribute('aria-label')).toMatch(/Show moments/i);

    await act(async () => {
      toggle?.click();
      await flushEffects();
    });

    expect(container.querySelectorAll('.catalog-moment')).toHaveLength(2);
    expect(container.querySelectorAll('video')).toHaveLength(0);

    await act(async () => {
      root.unmount();
    });
  });

  it('unloads poster and video when a card leaves the viewport', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ items: [] })));
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(ArcadeCatalog, {
          catalogStatus: 'ready',
          catalogError: null,
          catalogEntries: entries,
          onPlayGame: vi.fn(),
          onPlayTogether: vi.fn(),
          onRetryCatalog: vi.fn(),
        }),
      );
      await flushEffects();
    });

    const firstMedia = container.querySelectorAll('.catalog-media')[0]!;
    await act(async () => {
      intersect(observerFor(firstMedia), firstMedia, true);
      await flushEffects();
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('.preview-toggle')?.click();
      await flushEffects();
    });
    expect(container.querySelector('video.catalog-preview')).not.toBeNull();

    await act(async () => {
      intersect(observerFor(firstMedia), firstMedia, false);
      await flushEffects();
    });

    expect(container.querySelectorAll('video')).toHaveLength(0);
    expect(container.querySelectorAll('img.catalog-preview')).toHaveLength(0);
    expect(container.querySelectorAll('.catalog-moment')).toHaveLength(0);

    await act(async () => {
      root.unmount();
    });
  });

  it('waits for sort signals before painting the grid (no provisional re-sort)', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    sessionStorage.clear();
    let resolveSignals: ((value: Response) => void) | undefined;
    // Only recommendations hangs — featured pool must resolve immediately.
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/recommendations')) {
        return new Promise<Response>((resolve) => {
          resolveSignals = resolve;
        });
      }
      return new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(ArcadeCatalog, {
          catalogStatus: 'ready',
          catalogError: null,
          catalogEntries: entries,
          onPlayGame: vi.fn(),
          onPlayTogether: vi.fn(),
          onRetryCatalog: vi.fn(),
        }),
      );
      await flushEffects();
    });

    expect(container.querySelectorAll('.catalog-card')).toHaveLength(0);
    expect(container.querySelector('.catalog-state')?.textContent).toMatch(/Loading/i);
    expect(container.querySelector('.arcade-section')?.classList.contains('is-pending')).toBe(true);

    await act(async () => {
      resolveSignals?.(
        new Response(JSON.stringify({ items: [], popularity: [], lastPlayed: [], newest: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      await flushEffects();
    });

    expect(container.querySelectorAll('.catalog-card')).toHaveLength(2);
    expect(container.querySelector('.arcade-section')?.classList.contains('is-pending')).toBe(false);

    await act(async () => {
      root.unmount();
    });
  });

  it('paints immediately when sort signals are already cached', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise<Response>(() => {
          /* leave hanging — cache must be enough for first paint */
        }),
    );
    // Also cap the wait here — a hung fetch must not block forever.
    vi.useFakeTimers();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(ArcadeCatalog, {
          catalogStatus: 'ready',
          catalogError: null,
          catalogEntries: entries,
          onPlayGame: vi.fn(),
          onPlayTogether: vi.fn(),
          onRetryCatalog: vi.fn(),
        }),
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });

    expect(container.querySelectorAll('.catalog-card')).toHaveLength(2);

    await act(async () => {
      root.unmount();
    });
    vi.useRealTimers();
  });

  it('paints the grid with catalog order when the signals fetch rejects', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    sessionStorage.clear();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('network down'));
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(ArcadeCatalog, {
          catalogStatus: 'ready',
          catalogError: null,
          catalogEntries: entries,
          onPlayGame: vi.fn(),
          onPlayTogether: vi.fn(),
          onRetryCatalog: vi.fn(),
        }),
      );
      await flushEffects();
    });

    expect(container.querySelectorAll('.catalog-card')).toHaveLength(2);
    expect(container.querySelector('.catalog-state')).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });
});

describe('ArcadeCatalog shared-world badge', () => {
  beforeEach(async () => {
    installIntersectionObserverMock();
    mockSignedOutAuth();
    sessionStorage.setItem(
      'gdpl.catalogSortSignals',
      JSON.stringify({ viewer: '', items: [], popularity: [], lastPlayed: [], newest: [] }),
    );
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    document.body.innerHTML = '';
    sessionStorage.clear();
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('badges only the games that declare a shared world', async () => {
    // The badge is a promise about other people being there, which is a stronger claim
    // than the rest of the card makes — worth pinning that it appears on exactly the
    // entries that earned it and on no others.
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ items: [] })));
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(ArcadeCatalog, {
          catalogStatus: 'ready',
          catalogError: null,
          catalogEntries: [
            {
              ...entries[0]!,
              slug: 'shared-one',
              title: 'Shared One',
              world: 'shared' as const,
              editor: 'content' as const,
            },
            { ...entries[1]!, slug: 'solo-one', title: 'Solo One', world: null },
          ],
          onPlayGame: vi.fn(),
          onPlayTogether: vi.fn(),
          onRetryCatalog: vi.fn(),
        }),
      );
      await flushEffects();
    });

    const badges = container.querySelectorAll('.card-world-badge');
    expect(badges).toHaveLength(1);
    // Inside the badged card, not merely somewhere on the page.
    const cards = [...container.querySelectorAll('.catalog-card')];
    const badged = cards.find((card) => card.querySelector('.card-world-badge'));
    expect(badged?.textContent).toContain('Shared One');
    expect(badged?.textContent).not.toContain('Solo One');
    expect(badged?.querySelector('[title="This game has a built-in content editor"]')).not.toBeNull();
    expect(cards[1]?.querySelector('[title="This game has a built-in content editor"]')).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });
});

describe('ArcadeCatalog curated surfaces', () => {
  beforeEach(async () => {
    installIntersectionObserverMock();
    mockSignedOutAuth();
    sessionStorage.setItem(
      'gdpl.catalogSortSignals',
      JSON.stringify({ viewer: '', items: [], popularity: [], lastPlayed: [], newest: [] }),
    );
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    document.body.innerHTML = '';
    sessionStorage.clear();
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // Defaults empty unless a case below overrides.
  function stubHomeFetches(overrides?: { featuredSlugs?: string[]; newest?: string[] }) {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/featured')) {
        return new Response(JSON.stringify({ slugs: overrides?.featuredSlugs ?? [] }));
      }
      if (url.includes('/api/recommendations')) {
        return new Response(
          JSON.stringify({ items: [], popularity: [], lastPlayed: [], newest: overrides?.newest ?? [] }),
        );
      }
      return new Response(JSON.stringify({ items: [] }));
    });
  }

  it('shows the party rail for multiplayer games and the continue-playing rail from recent plays, each tagging its play', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    stubHomeFetches();
    localStorage.setItem('gdpl.recentPlays', JSON.stringify(['below-fold']));
    const onPlayGame = vi.fn();
    const onPlayTogether = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const withParty = { ...entries[0]!, multiplayer: { mode: 'controllers' as const, minPlayers: 1, maxPlayers: 4 } };

    await act(async () => {
      root.render(
        createElement(ArcadeCatalog, {
          catalogStatus: 'ready',
          catalogError: null,
          catalogEntries: [withParty, entries[1]!],
          onPlayGame,
          onPlayTogether,
          onRetryCatalog: vi.fn(),
        }),
      );
      await flushEffects();
      await flushEffects();
    });

    const partySection = [...container.querySelectorAll('.catalog-rail-section')].find((section) =>
      section.textContent?.includes('Party mode'),
    );
    expect(partySection?.querySelector('.rail-card-title')?.textContent).toBe(withParty.title);

    // The rail's Play button also carries via, for solo players.
    const hitArea = partySection?.querySelector<HTMLAnchorElement>('.rail-card-hit-area');
    expect(hitArea?.getAttribute('href')).toContain('?via=rail_party');

    await act(async () => {
      partySection?.querySelector<HTMLButtonElement>('.rail-card-party')?.click();
    });
    expect(onPlayTogether).toHaveBeenCalledWith(withParty, 'rail_party');

    const continueSection = [...container.querySelectorAll('.catalog-rail-section')].find((section) =>
      section.textContent?.includes('Continue playing'),
    );
    expect(continueSection?.querySelector('.rail-card-title')?.textContent).toBe(entries[1]!.title);
    // Continue playing is single-player only — no Play Together button.
    expect(continueSection?.querySelector('.rail-card-party')).toBeNull();

    await act(async () => {
      continueSection?.querySelector<HTMLButtonElement>('.rail-card-play')?.click();
    });
    expect(onPlayGame).toHaveBeenCalledWith(entries[1], 'rail_continue');

    await act(async () => root.unmount());
  });

  it('falls back the featured slot to the top of recommended order when the pool is empty', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    stubHomeFetches({ featuredSlugs: [] });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(ArcadeCatalog, {
          catalogStatus: 'ready',
          catalogError: null,
          catalogEntries: entries,
          onPlayGame: vi.fn(),
          onPlayTogether: vi.fn(),
          onRetryCatalog: vi.fn(),
        }),
      );
      await flushEffects();
      await flushEffects();
    });

    // No pool: falls back to catalog order's first entry.
    expect(container.querySelector('.featured-game-title')?.textContent).toBe(entries[0]!.title);
    // The featured poster is clickable too, not just the Play button.
    const featuredHitArea = container.querySelector<HTMLAnchorElement>('.featured-game-hit-area');
    expect(featuredHitArea?.getAttribute('href')).toContain('?via=featured');
    // Nothing left over for Start here.
    expect(
      [...container.querySelectorAll('.catalog-rail-section')].some((s) => s.textContent?.includes('Start here')),
    ).toBe(false);

    await act(async () => root.unmount());
  });

  it('features one pool entry and shows the rest on the Start here rail, excluding it', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    stubHomeFetches({ featuredSlugs: ['below-fold', 'above-fold'] });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(ArcadeCatalog, {
          catalogStatus: 'ready',
          catalogError: null,
          catalogEntries: entries,
          onPlayGame: vi.fn(),
          onPlayTogether: vi.fn(),
          onRetryCatalog: vi.fn(),
        }),
      );
      await flushEffects();
      await flushEffects();
    });

    const featuredTitle = container.querySelector('.featured-game-title')?.textContent;
    expect(['Above Fold', 'Below Fold']).toContain(featuredTitle);

    const startHere = [...container.querySelectorAll('.catalog-rail-section')].find((section) =>
      section.textContent?.includes('Start here'),
    );
    const startHereTitles = [...(startHere?.querySelectorAll('.rail-card-title') ?? [])].map((el) => el.textContent);
    // Start here is the leftover, not the whole pool.
    expect(startHereTitles).toHaveLength(1);
    expect(startHereTitles).not.toContain(featuredTitle);

    await act(async () => root.unmount());
  });
});

describe('ArcadeCatalog shelves', () => {
  beforeEach(async () => {
    installIntersectionObserverMock();
    mockSignedOutAuth();
    sessionStorage.setItem(
      'gdpl.catalogSortSignals',
      JSON.stringify({ viewer: '', items: [], popularity: [], lastPlayed: [], newest: [] }),
    );
    // jsdom has no scrollIntoView; stub it first so spyOn can restore it.
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: () => undefined,
    });
    vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => undefined);
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    document.body.innerHTML = '';
    sessionStorage.clear();
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function stubHomeFetches(overrides?: { featuredSlugs?: string[] }) {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/featured')) {
        return new Response(JSON.stringify({ slugs: overrides?.featuredSlugs ?? [] }));
      }
      if (url.includes('/api/recommendations')) {
        return new Response(JSON.stringify({ items: [], popularity: [], lastPlayed: [], newest: [] }));
      }
      return new Response(JSON.stringify({ items: [] }));
    });
  }

  function makeEntry(partial: Partial<CatalogEntry> & Pick<CatalogEntry, 'slug' | 'title' | 'genre'>): CatalogEntry {
    return {
      controls: 'Arrow keys',
      status: 'published',
      media: null,
      multiplayer: null,
      saves: null,
      world: null,
      sensing: null,
      editor: null,
      orientation: 'any',
      touch: null,
      submittedBy: null,
      ...partial,
    };
  }

  const shelfEntries: CatalogEntry[] = [
    makeEntry({ slug: 'rpg-1', title: 'Roam Quest', genre: 'Roguelike' }),
    makeEntry({ slug: 'sim-1', title: 'Sim City Life', genre: 'City builder' }),
    makeEntry({ slug: 'puzzle-1', title: 'Gem Match', genre: 'Match-3 puzzle' }),
    makeEntry({ slug: 'arcade-1', title: 'Pixel Dash', genre: 'Arcade' }),
    makeEntry({
      slug: 'arcade-mp',
      title: 'Kart Brawl',
      genre: 'Arcade racing (3D)',
      multiplayer: { mode: 'controllers', minPlayers: 2, maxPlayers: 4 },
    }),
  ];

  async function renderShelves(entriesToRender: CatalogEntry[], overrides?: { featuredSlugs?: string[] }) {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    stubHomeFetches(overrides);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onPlayGame = vi.fn();
    const onPlayTogether = vi.fn();

    await act(async () => {
      root.render(
        createElement(ArcadeCatalog, {
          catalogStatus: 'ready',
          catalogError: null,
          catalogEntries: entriesToRender,
          onPlayGame,
          onPlayTogether,
          onRetryCatalog: vi.fn(),
        }),
      );
      await flushEffects();
      await flushEffects();
    });

    return { container, root, onPlayGame, onPlayTogether };
  }

  it('groups the catalog into shelves by category, with a jump bar chip per shelf', async () => {
    const { container, root } = await renderShelves(shelfEntries);

    const shelfHeadings = [...container.querySelectorAll('.catalog-shelf .catalog-rail-heading')].map(
      (el) => el.textContent,
    );
    expect(shelfHeadings).toEqual(
      expect.arrayContaining([
        'Arcade & Racing',
        'RPG & Adventure',
        'Strategy & Sim',
        'Puzzle & Story',
        'Multiplayer & Party',
      ]),
    );

    const jumpChips = [...container.querySelectorAll('.jump-chip')].map((el) => el.textContent);
    expect(jumpChips[0]).toBe('All');
    expect(jumpChips).toEqual(expect.arrayContaining(['Arcade & Racing', 'Multiplayer & Party']));

    // A multiplayer racer sits in both its genre shelf and party.
    const arcadeShelf = [...container.querySelectorAll('.catalog-shelf')].find((section) =>
      section.textContent?.includes('Arcade & Racing'),
    );
    const partyShelf = [...container.querySelectorAll('.catalog-shelf')].find((section) =>
      section.textContent?.includes('Multiplayer & Party'),
    );
    expect(arcadeShelf?.textContent).toContain('Kart Brawl');
    expect(partyShelf?.textContent).toContain('Kart Brawl');

    await act(async () => root.unmount());
  });

  it('plays a shelf card tagged via=shelf', async () => {
    const { container, onPlayGame, root } = await renderShelves(shelfEntries);

    const arcadeShelf = [...container.querySelectorAll('.catalog-shelf')].find((section) =>
      section.textContent?.includes('Arcade & Racing'),
    );
    const playButton = arcadeShelf?.querySelector<HTMLButtonElement>('.rail-card-play');
    await act(async () => {
      playButton?.click();
    });
    expect(onPlayGame).toHaveBeenCalledWith(expect.objectContaining({ slug: 'arcade-1' }), 'shelf');

    await act(async () => root.unmount());
  });

  it('"See all" filters Browse everything to that shelf, with a chip to clear it', async () => {
    const { container, root } = await renderShelves(shelfEntries);

    const rpgShelf = [...container.querySelectorAll('.catalog-shelf')].find((section) =>
      section.textContent?.includes('RPG & Adventure'),
    );
    await act(async () => {
      rpgShelf?.querySelector<HTMLButtonElement>('.catalog-rail-see-all')?.click();
    });

    expect(container.querySelector('.catalog-category-active')?.textContent).toContain('RPG & Adventure');
    const browseTitles = [...container.querySelectorAll('#browse-everything ~ .catalog-grid .card-title')].map(
      (el) => el.textContent,
    );
    expect(browseTitles).toEqual(['Roam Quest']);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.catalog-category-clear')?.click();
    });
    expect(container.querySelector('.catalog-category-active')).toBeNull();

    await act(async () => root.unmount());
  });

  it('fills the featured card with More like this picks from its own shelf', async () => {
    const { container, root } = await renderShelves(shelfEntries, { featuredSlugs: ['arcade-1'] });

    expect(container.querySelector('.featured-game-title')?.textContent).toBe('Pixel Dash');
    const thumbTitles = [...container.querySelectorAll('.more-like-this-thumb span')].map((el) => el.textContent);
    expect(thumbTitles).toEqual(['Kart Brawl']);

    await act(async () => root.unmount());
  });

  it('paginates Browse everything instead of listing every game on one page', async () => {
    const manyEntries = Array.from({ length: 30 }, (_, i) =>
      makeEntry({ slug: `page-game-${i}`, title: `Page Game ${i}`, genre: 'Arcade' }),
    );
    const { container, root } = await renderShelves(manyEntries);

    const gridSelector = '#browse-everything ~ .catalog-grid';
    expect(container.querySelectorAll(`${gridSelector} .catalog-card`)).toHaveLength(24);
    const pager = container.querySelector('.catalog-pager');
    expect(pager).not.toBeNull();

    const scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView');
    await act(async () => {
      [...container.querySelectorAll<HTMLButtonElement>('.catalog-pager button')]
        .find((btn) => btn.textContent === '2')
        ?.click();
    });
    expect(container.querySelectorAll(`${gridSelector} .catalog-card`)).toHaveLength(6);
    // A page change must not strand the reader down at the pager.
    expect(scrollSpy).toHaveBeenCalled();

    // Sort changes reset the page instead of stranding the reader.
    await act(async () => {
      container.querySelector<HTMLButtonElement>('.catalog-sort-trigger')?.click();
    });
    await act(async () => {
      [...container.querySelectorAll<HTMLButtonElement>('.catalog-sort-option')]
        .find((btn) => btn.textContent?.includes('A–Z'))
        ?.click();
    });
    expect(container.querySelectorAll(`${gridSelector} .catalog-card`)).toHaveLength(24);
    expect(container.querySelector('.catalog-pager button.is-active')?.textContent).toBe('1');

    await act(async () => root.unmount());
  });
});

describe('ArcadeCatalog soft-refresh failure', () => {
  beforeEach(async () => {
    installIntersectionObserverMock();
    mockSignedOutAuth();
    sessionStorage.setItem(
      'gdpl.catalogSortSignals',
      JSON.stringify({ viewer: '', items: [], popularity: [], lastPlayed: [], newest: [] }),
    );
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    document.body.innerHTML = '';
    sessionStorage.clear();
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps the grid and shows a retryable banner when ready but catalogError is set', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ items: [] })));
    const onRetryCatalog = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(ArcadeCatalog, {
          catalogStatus: 'ready',
          catalogError: '502 Bad Gateway',
          catalogEntries: entries,
          onPlayGame: vi.fn(),
          onPlayTogether: vi.fn(),
          onRetryCatalog,
        }),
      );
      await flushEffects();
    });

    const banner = container.querySelector('.catalog-refresh-error');
    expect(banner?.textContent).toMatch(/Could not refresh the catalog/);
    expect(banner?.textContent).toContain('502 Bad Gateway');
    expect(container.querySelectorAll('.catalog-card')).toHaveLength(2);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.catalog-refresh-error__retry')?.click();
    });
    expect(onRetryCatalog).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
  });
});

describe('ArcadeCatalog in-progress builds', () => {
  beforeEach(async () => {
    installIntersectionObserverMock();
    mockSignedOutAuth();
    sessionStorage.setItem(
      'gdpl.catalogSortSignals',
      JSON.stringify({ viewer: '', items: [], popularity: [], lastPlayed: [], newest: [] }),
    );
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    document.body.innerHTML = '';
    sessionStorage.clear();
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps in-progress builds out of the grid (Studio chip lives in the header)', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { uid: 'test-user', tier: 'standard' },
      loading: false,
      privateBeta: false,
    } as ReturnType<typeof AuthContextModule.useAuth>);

    let resolveMine: ((value: Response) => void) | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/submissions/mine')) {
        return new Promise<Response>((resolve) => {
          resolveMine = resolve;
        });
      }
      return new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(ArcadeCatalog, {
          catalogStatus: 'ready',
          catalogError: null,
          catalogEntries: entries,
          onPlayGame: vi.fn(),
          onPlayTogether: vi.fn(),
          onRetryCatalog: vi.fn(),
        }),
      );
      await flushEffects();
    });

    // Signed-in paint waits for the shelf so Yours pins land with the grid.
    expect(container.querySelectorAll('.catalog-card')).toHaveLength(0);
    expect(container.querySelector('.catalog-state')?.textContent).toMatch(/Loading/i);

    await act(async () => {
      resolveMine?.(
        new Response(
          JSON.stringify({
            submissions: [
              {
                token: 'tok-build',
                title: 'Building Game',
                createdAt: new Date().toISOString(),
                lastKnownStatus: 'building',
                slug: 'building-game',
              },
              {
                token: 'tok-queued',
                title: 'Queued Game',
                createdAt: new Date(Date.now() - 1000).toISOString(),
                lastKnownStatus: 'queued',
                slug: null,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
      await flushEffects();
    });

    expect(container.querySelectorAll('.catalog-card')).toHaveLength(2);
    expect(container.querySelectorAll('.catalog-build-card')).toHaveLength(0);
    expect(container.querySelector('.studio-chip, .catalog-studio-chip')).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it('does not reshuffle the grid when the network recommendations differ from the cache', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    sessionStorage.setItem(
      'gdpl.catalogSortSignals',
      JSON.stringify({
        viewer: '',
        items: [
          { slug: 'above-fold', reason: 'popular' },
          { slug: 'below-fold', reason: 'popular' },
        ],
        popularity: [],
        lastPlayed: [],
        newest: ['above-fold', 'below-fold'],
      }),
    );

    let resolveSignals: ((value: Response) => void) | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/recommendations')) {
        return new Promise<Response>((resolve) => {
          resolveSignals = resolve;
        });
      }
      return new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(ArcadeCatalog, {
          catalogStatus: 'ready',
          catalogError: null,
          catalogEntries: entries,
          onPlayGame: vi.fn(),
          onPlayTogether: vi.fn(),
          onRetryCatalog: vi.fn(),
        }),
      );
      await flushEffects();
    });

    // Cache is enough for first paint.
    const firstOrder = [...container.querySelectorAll('.card-title')].map((el) => el.textContent);
    expect(firstOrder[0]).toMatch(/Above Fold/);

    await act(async () => {
      resolveSignals?.(
        new Response(
          JSON.stringify({
            items: [
              { slug: 'below-fold', reason: 'popular' },
              { slug: 'above-fold', reason: 'popular' },
            ],
            popularity: [],
            lastPlayed: [],
            newest: ['below-fold', 'above-fold'],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
      await flushEffects();
    });

    const secondOrder = [...container.querySelectorAll('.card-title')].map((el) => el.textContent);
    expect(secondOrder).toEqual(firstOrder);

    await act(async () => {
      root.unmount();
    });
  });
});
