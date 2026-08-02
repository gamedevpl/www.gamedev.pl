// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n/index.js';

vi.mock('./AuthContext', () => ({
  useAuth: () => ({ user: null, signInWithGoogleToken: vi.fn(), logout: vi.fn() }),
}));

const votesApi = vi.hoisted(() => ({
  fetchVotes: vi.fn(),
  castVote: vi.fn(),
  clearVote: vi.fn(),
}));
vi.mock('./votesApi', () => votesApi);

vi.mock('./gamePlayer', async () => {
  const actual = await vi.importActual<typeof import('./gamePlayer')>('./gamePlayer');
  return {
    ...actual,
    // Keep the real useGamePlayer so bridge pointer messages exercise dismissMore.
    useGameTelemetry: () => undefined,
  };
});

vi.mock('./PublishedGameFrame', () => ({
  PublishedGameFrame: ({ frameRef }: { frameRef?: { current: HTMLIFrameElement | null } }) => (
    <iframe className="game-frame" title="game" ref={frameRef as React.Ref<HTMLIFrameElement>} />
  ),
}));

vi.mock('./useScreenWakeLock', () => ({
  useScreenWakeLock: () => undefined,
}));

import { GameTheater } from './GameTheater.js';
import { setVisitSessionForTesting, VisitSession, type WireVisitEvent } from './visitTelemetry.js';

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  votesApi.fetchVotes.mockReset().mockResolvedValue({ up: 0, down: 0, mine: null });
  votesApi.castVote.mockReset();
  votesApi.clearVote.mockReset();
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

async function draw(props: { controls?: string; onExit?: () => void } = {}) {
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <GameTheater
        title="Brick Storm"
        badge={{ icon: 'sparkle', label: 'AI' }}
        source={{ slug: 'brick-storm' }}
        reportSlug="brick-storm"
        onExit={props.onExit ?? (() => undefined)}
        controls={props.controls}
      />,
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
}

async function click(element: Element | null) {
  await act(async () => {
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

async function pressEscape() {
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  });
}

describe('GameTheater more menu', () => {
  it('keeps the hamburger icon when open and highlights it instead of turning into an X', async () => {
    await draw();
    const more = container.querySelector('.theater-more-btn') as HTMLButtonElement;
    expect(more).not.toBeNull();

    await act(async () => {
      more.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(more.getAttribute('aria-expanded')).toBe('true');
    expect(more.getAttribute('aria-haspopup')).toBe('menu');
    expect(container.querySelector('.theater-more.is-open')).not.toBeNull();
    expect(container.querySelectorAll('.exit-btn').length).toBe(1);
    expect(more.classList.contains('exit-btn')).toBe(false);
  });

  it('dismisses when the game bridge reports a pointerdown inside the iframe', async () => {
    await draw();
    const more = container.querySelector('.theater-more-btn') as HTMLButtonElement;

    await act(async () => {
      more.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('.theater-more.is-open')).not.toBeNull();

    await act(async () => {
      // Opaque-origin sandboxed frames post with origin "null"; jsdom synthesizes "".
      // useGamePlayer accepts both via the event.source === null test path for synthetics.
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { source: 'gdpl-player', type: 'pointer' },
          origin: 'null',
        }),
      );
    });

    expect(container.querySelector('.theater-more.is-open')).toBeNull();
  });

  it('keeps menu-row icons the same size so labels share one left edge', async () => {
    await draw();
    const panel = container.querySelector('.theater-more-panel') as HTMLElement;
    expect(panel).not.toBeNull();

    const icons = panel.querySelectorAll(
      '.theater-menu-item > svg, .feedback-btn > svg, .share-btn > svg, .report-btn > svg',
    );
    expect(icons.length).toBeGreaterThanOrEqual(3);

    const widths = [...icons].map((icon) => icon.getAttribute('width'));
    expect(new Set(widths).size).toBe(1);
    expect(widths[0]).toBe('13');
  });
});

describe('GameTheater how-to-play', () => {
  const CONTROLS = 'Left/Right to move; Space to fire; M to mute';

  it('offers no how-to-play control for a game with no controls in the catalog', async () => {
    // Generated and draft games have no catalog entry, so the prop is absent entirely.
    await draw();
    expect(container.querySelector('.howto-btn')).toBeNull();

    act(() => {
      root?.unmount();
    });
    root = null;
    // A deep link that rendered before the catalog landed carries an empty string.
    await draw({ controls: '' });
    expect(container.querySelector('.howto-btn')).toBeNull();
  });

  it('opens the panel from the bar control', async () => {
    await draw({ controls: CONTROLS });
    const trigger = container.querySelector('.howto-btn');
    expect(trigger).not.toBeNull();

    await click(trigger);

    // The panel portals to the body, not into the theater's own subtree.
    expect(document.querySelector('.howto-card')).not.toBeNull();
    expect(
      [...document.querySelectorAll('.howto-row')].map((row) => [
        row.querySelector('dt')?.textContent,
        row.querySelector('dd')?.textContent,
      ]),
    ).toEqual([
      ['Left/Right', 'move'],
      ['Space', 'fire'],
      ['M', 'mute'],
    ]);
  });

  it('renders both copies of the control, the bar one and the menu one', async () => {
    // Which one is visible is CSS's job (the bar copy sheds at 900px, earlier than sound
    // and fullscreen, because otherwise the actions row grows until the vote widget
    // overlaps the game title). Both must exist so neither breakpoint leaves it
    // unreachable — jsdom applies no media queries, so this asserts presence, not layout.
    await draw({ controls: CONTROLS });
    expect(container.querySelector('.howto-bar')).not.toBeNull();
    await click(container.querySelector('.theater-more-btn'));
    expect(container.querySelector('.theater-more-panel .howto-menu')).not.toBeNull();
  });

  it('puts focus on the card when opened from the More menu, not on the exit button behind it', async () => {
    // The phone path: the bar trigger is display:none there, so the menu row is the only
    // way in. Opening the menu changes `moreOpen`, which used to re-run the theater's
    // focus effect and pull focus back onto Exit — with the modal card on screen, Enter
    // then left the game.
    await draw({ controls: CONTROLS });
    await click(container.querySelector('.theater-more-btn'));
    const menuItem = container.querySelector('.theater-more-panel .howto-menu');
    expect(menuItem).toBeTruthy();

    await click(menuItem ?? null);

    expect(document.querySelector('.howto-card')).not.toBeNull();
    expect(document.activeElement).toBe(document.querySelector('.howto-close'));
    expect(container.querySelector('.theater-more.is-open')).toBeNull();
  });

  it('closes the card when the game goes fullscreen, since the bar holding both triggers unmounts', async () => {
    await draw({ controls: CONTROLS });
    await click(container.querySelector('.howto-btn'));
    expect(document.querySelector('.howto-card')).not.toBeNull();

    const stage = container.querySelector('.stage') as HTMLElement;
    Object.defineProperty(document, 'fullscreenElement', { value: stage, configurable: true });
    await act(async () => {
      document.dispatchEvent(new Event('fullscreenchange'));
    });

    expect(container.querySelector('.game-theater-bar')).toBeNull();
    expect(document.querySelector('.howto-card')).toBeNull();
    Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });
  });

  it('Escape closes the panel first and only exits the game on a second press', async () => {
    const onExit = vi.fn();
    await draw({ controls: CONTROLS, onExit });
    await click(container.querySelector('.howto-btn'));
    expect(document.querySelector('.howto-card')).not.toBeNull();

    await pressEscape();
    expect(document.querySelector('.howto-card')).toBeNull();
    expect(onExit).not.toHaveBeenCalled();

    await pressEscape();
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('an Escape relayed from inside the sandboxed game also closes the panel first', async () => {
    const onExit = vi.fn();
    await draw({ controls: CONTROLS, onExit });
    await click(container.querySelector('.howto-btn'));

    await act(async () => {
      // Opaque-origin frames post with origin "null"; the bridge relays the key here.
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { source: 'gdpl-player', type: 'key', key: 'Escape' },
          origin: 'null',
        }),
      );
    });

    expect(document.querySelector('.howto-card')).toBeNull();
    expect(onExit).not.toHaveBeenCalled();
  });
});

describe('GameTheater controls reported by the game', () => {
  const CATALOG_CONTROLS = 'Left/Right to move; Space to fire; M to mute';

  /** Relay a bridge message the way an opaque-origin frame does. */
  async function report(payload: Record<string, unknown>) {
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { source: 'gdpl-player', type: 'controls', ...payload },
          origin: 'null',
        }),
      );
    });
  }

  it('offers how-to-play on a deep link, where the catalog never arrives', async () => {
    // The gap this closes: /play/<slug> renders from a placeholder entry whose `controls`
    // is empty, because the catalog is fetched on the home route only. The game document
    // is the only source of truth there — and it is always present, because it is the
    // thing being played.
    await draw({ controls: '' });
    expect(container.querySelector('.howto-btn')).toBeNull();

    await report({ rows: [{ keys: 'Z/X', action: 'Rotate' }] });

    const trigger = container.querySelector('.howto-btn');
    expect(trigger).not.toBeNull();
    await click(trigger);
    expect(
      [...document.querySelectorAll('.howto-row')].map((row) => [
        row.querySelector('dt')?.textContent,
        row.querySelector('dd')?.textContent,
      ]),
    ).toEqual([['Z/X', 'Rotate']]);
  });

  it('lets the game overrule the catalog, which is a spec claim about it', async () => {
    await draw({ controls: CATALOG_CONTROLS });
    await report({ rows: [{ keys: 'A/D', action: 'Skręt' }] });
    await click(container.querySelector('.howto-btn'));
    expect([...document.querySelectorAll('.howto-row dd')].map((cell) => cell.textContent)).toEqual(['Skręt']);
  });

  it('keeps the catalog rows when a later report says nothing', async () => {
    // The bridge re-sends after i18n and after GameKit wires input. An empty re-send
    // must not blank a card that already had content.
    await draw({ controls: CATALOG_CONTROLS });
    await report({ rows: [], kit: [], hint: '' });
    await click(container.querySelector('.howto-btn'));
    expect(document.querySelectorAll('.howto-row').length).toBe(3);
  });

  it('ignores a controls report that did not come from this game frame', async () => {
    await draw({ controls: '' });
    await act(async () => {
      // Same shape, wrong origin — another window trying to put text on our card.
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { source: 'gdpl-player', type: 'controls', rows: [{ keys: 'X', action: 'Spoofed' }] },
          origin: 'https://evil.example',
        }),
      );
    });
    expect(container.querySelector('.howto-btn')).toBeNull();
  });
});

describe('GameTheater how-to-play reachability', () => {
  /**
   * jsdom implements no matchMedia, so a breakpoint has to be stated to be tested.
   * `width` here is the viewport the component should believe it is on.
   */
  function stubViewport(width: number) {
    const listeners = new Set<() => void>();
    (window as unknown as Record<string, unknown>).matchMedia = (query: string) => {
      const limit = Number(/max-width:\s*(\d+)px/.exec(query)?.[1] ?? 0);
      return {
        matches: width <= limit,
        addEventListener: (_: string, fn: () => void) => listeners.add(fn),
        removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
      };
    };
    return () => delete (window as unknown as Record<string, unknown>).matchMedia;
  }

  async function drawDraft() {
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <GameTheater
          title="Draft"
          badge={{ icon: 'rocket', label: 'AI' }}
          source={{ html: '<canvas></canvas>' }}
          onExit={() => undefined}
        />,
      );
    });
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { source: 'gdpl-player', type: 'controls', rows: [{ keys: 'W', action: 'Jump' }] },
          origin: 'null',
        }),
      );
    });
  }

  it('renders the More menu for a slug-less game at a width where the bar copy is hidden', async () => {
    // The bar copy sheds at 900px but the menu only existed below 768px, so between the
    // two a game with no `reportSlug` — a draft or a generated game, which have no catalog
    // entry but do report their own controls over the bridge — had the bar copy hidden by
    // CSS and no menu to fall back to, and the control vanished. Unreachable while the
    // catalog was the only source; reachable the moment the game itself became one.
    const restore = stubViewport(820);
    try {
      await drawDraft();
      expect(container.querySelector('.theater-more')).not.toBeNull();
      const menuItems = [...container.querySelectorAll('.theater-more-panel .theater-menu-item')];
      expect(menuItems.some((el) => el.textContent?.includes('How to play'))).toBe(true);
    } finally {
      restore();
    }
  });

  it('does not grow a More menu on a wide screen, where the bar copy is the route', async () => {
    // The menu must not appear just because a game has controls: on a wide screen the bar
    // copy is visible, and an otherwise-empty overflow menu is the thing `isNarrow` was
    // introduced to avoid.
    const restore = stubViewport(1280);
    try {
      await drawDraft();
      expect(container.querySelector('.howto-btn')).not.toBeNull();
      expect(container.querySelector('.theater-more')).toBeNull();
    } finally {
      restore();
    }
  });
});

describe('GameTheater how-to-play visit telemetry', () => {
  let batches: Array<{ events: WireVisitEvent[] }>;
  let session: VisitSession;

  beforeEach(() => {
    batches = [];
    session = new VisitSession('visit-howto', Date.now(), (body) => {
      batches.push(body);
    });
    setVisitSessionForTesting(session);
  });

  afterEach(() => {
    setVisitSessionForTesting(null);
  });

  it('hides the bar during play and restores it from the peek pill by keyboard', async () => {
    vi.useFakeTimers();
    try {
      await draw();
      // The grace window: the bar is still there while the title registers.
      expect(container.querySelector('.game-theater-bar')).not.toBeNull();
      await act(async () => {
        vi.advanceTimersByTime(3100);
      });
      // Play owns the screen; the pill is the way back.
      expect(container.querySelector('.game-theater-bar')).toBeNull();
      const pill = container.querySelector('.theater-peek-pill') as HTMLButtonElement | null;
      expect(pill).not.toBeNull();

      // Enter/Space on a focused button emit `click` and no pointer events at
      // all — a pointerdown-only pill would strand a keyboard-only player with
      // no route back to mute or exit.
      await act(async () => {
        pill!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(container.querySelector('.game-theater-bar')).not.toBeNull();
      // And the bar it brings back is the whole bar: the report path (DSA art.
      // 16) lives in the More panel, so an auto-hide is only allowed to make it
      // one tap deeper — never to make it unreachable.
      expect(container.querySelector('a.report-btn')).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('records via and same-card reopen for a published play', async () => {
    await draw({ controls: 'Arrow keys to move' });
    await click(container.querySelector('.howto-btn'));
    await click(container.querySelector('.howto-close'));
    await click(container.querySelector('.howto-btn'));
    session.flush();

    const opens = batches.flatMap((batch) => batch.events).filter((event) => event.type === 'how_to_play_opened');
    expect(opens).toEqual([
      expect.objectContaining({ type: 'how_to_play_opened', via: 'bar' }),
      expect.objectContaining({ type: 'how_to_play_opened', via: 'bar', reopen: true }),
    ]);
    expect(opens[0]).not.toHaveProperty('reopen');
  });

  it('does not record how_to_play_opened for a draft theater', async () => {
    // Draft / generated theaters share the card UI but must not enter the open-rate
    // numerator against a denominator that only counts published plays.
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <GameTheater
          title="Draft"
          badge={{ icon: 'rocket', label: 'AI' }}
          source={{ html: '<canvas></canvas>' }}
          onExit={() => undefined}
          controls="Space to jump"
        />,
      );
    });
    await click(container.querySelector('.howto-btn'));
    session.flush();
    expect(batches.flatMap((batch) => batch.events)).toEqual([]);
  });
});
