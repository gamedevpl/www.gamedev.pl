// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArcadeCatalog } from './ArcadeCatalog.js';
import * as AuthContextModule from './AuthContext.js';
import type { CatalogEntry } from './catalog.js';
import i18n from './i18n/index.js';

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
    orientation: 'any',
    touch: null,
    submittedBy: 'alice',
  },
];

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('ArcadeCatalog lazy media', () => {
  beforeEach(async () => {
    installIntersectionObserverMock();
    sessionStorage.setItem(
      'gdpl.catalogSortSignals',
      JSON.stringify({ items: [], popularity: [], lastPlayed: [], newest: [] }),
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

  it('does not attach image or video sources until a card enters the viewport', async () => {
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
    expect(observers).toHaveLength(2);

    const firstMedia = container.querySelectorAll('.catalog-media')[0]!;
    await act(async () => {
      intersect(observers[0]!, firstMedia, true);
      await flushEffects();
    });

    const preview = container.querySelector<HTMLVideoElement>('video.catalog-preview');
    expect(preview?.getAttribute('src')).toBe('/api/games/above-fold/media/gameplay.mp4');
    expect(preview?.getAttribute('poster')).toBe('/api/games/above-fold/media/opening.png');
    expect(container.querySelectorAll('.catalog-moment')).toHaveLength(2);

    // The second card still has no media srcs — it never intersected.
    expect(container.querySelectorAll('video')).toHaveLength(1);
    expect(container.querySelectorAll('.catalog-moment img')).toHaveLength(2);
    const momentSrcs = [...container.querySelectorAll<HTMLImageElement>('.catalog-moment img')].map((img) => img.src);
    expect(momentSrcs.every((src) => src.includes('/api/games/above-fold/'))).toBe(true);

    await act(async () => {
      root.unmount();
    });
  });
});

describe('ArcadeCatalog shared-world badge', () => {
  beforeEach(async () => {
    installIntersectionObserverMock();
    sessionStorage.setItem(
      'gdpl.catalogSortSignals',
      JSON.stringify({ items: [], popularity: [], lastPlayed: [], newest: [] }),
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
            { ...entries[0]!, slug: 'shared-one', title: 'Shared One', world: 'shared' as const },
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

    await act(async () => {
      root.unmount();
    });
  });
});

describe('ArcadeCatalog soft-refresh failure', () => {
  beforeEach(async () => {
    installIntersectionObserverMock();
    sessionStorage.setItem(
      'gdpl.catalogSortSignals',
      JSON.stringify({ items: [], popularity: [], lastPlayed: [], newest: [] }),
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
    sessionStorage.setItem(
      'gdpl.catalogSortSignals',
      JSON.stringify({ items: [], popularity: [], lastPlayed: [], newest: [] }),
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

  it('passes slug or token to onOpenStatus when opening an in-progress card', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { uid: 'test-user', tier: 'standard' },
      loading: false,
      privateBeta: false,
    } as ReturnType<typeof AuthContextModule.useAuth>);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/submissions/mine')) {
        return new Response(
          JSON.stringify({
            submissions: [
              {
                token: 'token-with-slug',
                title: 'Building Game 1',
                createdAt: new Date().toISOString(),
                lastKnownStatus: 'building',
                slug: 'my-cool-game',
              },
              {
                token: 'token-without-slug',
                title: 'Building Game 2',
                createdAt: new Date(Date.now() - 1000).toISOString(),
                lastKnownStatus: 'queued',
                slug: null,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const onOpenStatus = vi.fn();
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
          onOpenStatus,
        }),
      );
      await flushEffects();
    });

    const openButtons = container.querySelectorAll<HTMLButtonElement>('.catalog-build-card .primary-btn');
    expect(openButtons).toHaveLength(2);

    await act(async () => {
      openButtons[0]?.click();
    });
    expect(onOpenStatus).toHaveBeenLastCalledWith('my-cool-game');

    await act(async () => {
      openButtons[1]?.click();
    });
    expect(onOpenStatus).toHaveBeenLastCalledWith('token-without-slug');

    await act(async () => {
      root.unmount();
    });
  });
});
