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
  PublishedGameFrame: ({
    frameRef,
    remixOpenNonce,
    initialRemixRequest,
    theaterChromeHidden,
  }: {
    frameRef?: { current: HTMLIFrameElement | null };
    remixOpenNonce?: number;
    initialRemixRequest?: string;
    theaterChromeHidden?: boolean;
  }) => (
    <iframe
      className="game-frame"
      title="game"
      ref={frameRef as React.Ref<HTMLIFrameElement>}
      data-remix-open={remixOpenNonce ?? 0}
      data-remix-request={initialRemixRequest ?? ''}
      data-chrome-hidden={theaterChromeHidden ? '1' : '0'}
    />
  ),
}));

vi.mock('./useScreenWakeLock', () => ({
  useScreenWakeLock: () => undefined,
}));

import { GameTheater, PLAYER_CHROME_IDLE_MS } from './GameTheater.js';
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

async function draw(
  props: { controls?: string; onExit?: () => void; initialRemixOpen?: boolean; initialRemixRequest?: string } = {},
) {
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <GameTheater
        title="Brick Storm"
        badge={{ icon: 'sparkle', label: 'AI' }}
        source={{ slug: 'brick-storm' }}
        reportSlug="brick-storm"
        editor="content"
        onExit={props.onExit ?? (() => undefined)}
        controls={props.controls}
        initialRemixOpen={props.initialRemixOpen}
        initialRemixRequest={props.initialRemixRequest}
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
  it('opens the remix surface with the request entered on the game page', async () => {
    await draw({ initialRemixOpen: true, initialRemixRequest: 'make it faster' });
    expect(container.querySelector('.game-frame')?.getAttribute('data-remix-open')).toBe('1');
    expect(container.querySelector('.game-frame')?.getAttribute('data-remix-request')).toBe('make it faster');
  });

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

  it('stops exiting on Escape once the game reports its own shell menu', async () => {
    const onExit = vi.fn();
    await draw({ controls: CONTROLS, onExit });

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', { data: { source: 'gdpl-player', type: 'shell-menu' }, origin: 'null' }),
      );
    });
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', { data: { source: 'gdpl-player', type: 'key', key: 'Escape' }, origin: 'null' }),
      );
    });

    expect(onExit).not.toHaveBeenCalled();
  });

  it("exits on the pause menu's Quit Game signal even after the game reported a shell menu", async () => {
    const onExit = vi.fn();
    await draw({ controls: CONTROLS, onExit });

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', { data: { source: 'gdpl-player', type: 'shell-menu' }, origin: 'null' }),
      );
    });
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', { data: { source: 'gdpl-player', type: 'exit-game' }, origin: 'null' }),
      );
    });

    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('resumes exiting on Escape once a swapped-in document (a new loadId) reports no shell menu', async () => {
    const onExit = vi.fn();
    await draw({ controls: CONTROLS, onExit });

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { source: 'gdpl-player', type: 'shell-menu', loadId: 'game-a' },
          origin: 'null',
        }),
      );
    });
    // A different loadId simulates a remix swapping the document underneath.
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { source: 'gdpl-player', type: 'key', key: 'Escape', loadId: 'game-b' },
          origin: 'null',
        }),
      );
    });

    expect(onExit).toHaveBeenCalledTimes(1);
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

  it('stays visible until gameplay begins, then fades after an inactivity grace period', async () => {
    vi.useFakeTimers();
    try {
      await draw();
      const bar = container.querySelector('.game-theater-bar') as HTMLElement;
      expect(bar.classList.contains('is-idle')).toBe(false);
      await act(async () => {
        vi.advanceTimersByTime(12_000);
      });
      expect(bar.classList.contains('is-idle')).toBe(false);

      await act(async () => {
        (container.querySelector('iframe') as HTMLIFrameElement).focus();
        window.dispatchEvent(
          new MessageEvent('message', {
            data: { source: 'gdpl-player', type: 'pointer' },
            origin: 'null',
          }),
        );
      });
      await act(async () => {
        vi.advanceTimersByTime(PLAYER_CHROME_IDLE_MS - 1);
      });
      expect(bar.classList.contains('is-idle')).toBe(false);
      await act(async () => {
        vi.advanceTimersByTime(1);
      });
      expect(bar.classList.contains('is-idle')).toBe(true);
      expect(bar.getAttribute('aria-hidden')).toBe('true');
      const reveal = container.querySelector('.theater-reveal-btn') as HTMLButtonElement | null;
      expect(reveal).not.toBeNull();
      expect(reveal!.getAttribute('aria-label')).toBe('Show controls');

      await act(async () => {
        reveal!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(bar.classList.contains('is-idle')).toBe(false);
      expect(container.querySelector('.theater-reveal-btn')).toBeNull();
      await act(async () => {
        vi.advanceTimersByTime(PLAYER_CHROME_IDLE_MS);
      });
      expect(bar.classList.contains('is-idle')).toBe(true);
      expect(container.querySelector('.theater-reveal-btn')).not.toBeNull();

      // Play activity must not un-fade the bar — mouse-aim games move the pointer
      // constantly, and a click-heavy tactics game would flap the chrome on every tap.
      await act(async () => {
        window.dispatchEvent(
          new MessageEvent('message', {
            data: { source: 'gdpl-player', type: 'activity' },
            origin: 'null',
          }),
        );
      });
      expect(bar.classList.contains('is-idle')).toBe(true);
      expect(container.querySelector('.theater-reveal-btn')).not.toBeNull();

      await act(async () => {
        window.dispatchEvent(
          new MessageEvent('message', {
            data: { source: 'gdpl-player', type: 'pointer' },
            origin: 'null',
          }),
        );
      });
      expect(bar.classList.contains('is-idle')).toBe(true);

      // The report path (DSA art. 16) stays reachable once the peek brings the bar
      // back — without remounting or moving controls.
      await act(async () => {
        (container.querySelector('.theater-reveal-btn') as HTMLButtonElement).click();
      });
      expect(bar.classList.contains('is-idle')).toBe(false);
      expect(container.querySelector('a.report-btn')).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not postpone the hide clock when gameplay repeats input', async () => {
    vi.useFakeTimers();
    try {
      await draw();
      const frame = container.querySelector('iframe') as HTMLIFrameElement;
      const bar = container.querySelector('.game-theater-bar') as HTMLElement;

      await act(async () => {
        frame.focus();
        window.dispatchEvent(
          new MessageEvent('message', {
            data: { source: 'gdpl-player', type: 'activity' },
            origin: 'null',
          }),
        );
      });
      await act(async () => {
        vi.advanceTimersByTime(Math.floor(PLAYER_CHROME_IDLE_MS / 2));
      });
      expect(bar.classList.contains('is-idle')).toBe(false);

      await act(async () => {
        window.dispatchEvent(
          new MessageEvent('message', {
            data: { source: 'gdpl-player', type: 'activity' },
            origin: 'null',
          }),
        );
        vi.advanceTimersByTime(Math.ceil(PLAYER_CHROME_IDLE_MS / 2));
      });

      expect(bar.classList.contains('is-idle')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps controls hidden after an explicit hide until the player reveals them', async () => {
    await draw();
    const bar = container.querySelector('.game-theater-bar') as HTMLElement;
    const hide = container.querySelector('.theater-hide-btn') as HTMLButtonElement;

    expect(hide.getAttribute('aria-label')).toBe('Hide controls');
    expect(hide.querySelector('[data-icon="chevronUp"]')).not.toBeNull();
    await click(hide);
    expect(bar.classList.contains('is-idle')).toBe(true);
    expect(container.querySelector('.theater-reveal-btn')).not.toBeNull();
    expect(container.querySelector('iframe')?.getAttribute('data-chrome-hidden')).toBe('1');

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { source: 'gdpl-player', type: 'end', outcome: 'lost' },
          origin: 'null',
        }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { source: 'gdpl-player', type: 'activity' },
          origin: 'null',
        }),
      );
    });
    expect(bar.classList.contains('is-idle')).toBe(true);

    await click(container.querySelector('.theater-reveal-btn'));
    expect(bar.classList.contains('is-idle')).toBe(false);
  });

  it('pins the bar while one of its controls is focused', async () => {
    vi.useFakeTimers();
    try {
      await draw();
      const frame = container.querySelector('iframe') as HTMLIFrameElement;
      const more = container.querySelector('.theater-more-btn') as HTMLButtonElement;
      const bar = container.querySelector('.game-theater-bar') as HTMLElement;

      await act(async () => {
        frame.focus();
        window.dispatchEvent(
          new MessageEvent('message', {
            data: { source: 'gdpl-player', type: 'pointer' },
            origin: 'null',
          }),
        );
        more.focus();
      });
      await act(async () => {
        vi.advanceTimersByTime(PLAYER_CHROME_IDLE_MS * 2);
      });
      expect(bar.classList.contains('is-idle')).toBe(false);

      await act(async () => frame.focus());
      await act(async () => {
        vi.advanceTimersByTime(PLAYER_CHROME_IDLE_MS);
      });
      expect(bar.classList.contains('is-idle')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reveals and pins the bar at game over until the next gameplay input', async () => {
    vi.useFakeTimers();
    try {
      await draw();
      const frame = container.querySelector('iframe') as HTMLIFrameElement;
      const bar = container.querySelector('.game-theater-bar') as HTMLElement;

      await act(async () => {
        frame.focus();
        window.dispatchEvent(
          new MessageEvent('message', {
            data: { source: 'gdpl-player', type: 'pointer' },
            origin: 'null',
          }),
        );
      });
      await act(async () => {
        vi.advanceTimersByTime(PLAYER_CHROME_IDLE_MS);
      });
      expect(bar.classList.contains('is-idle')).toBe(true);

      await act(async () => {
        window.dispatchEvent(
          new MessageEvent('message', {
            data: { source: 'gdpl-player', type: 'end', outcome: 'lost' },
            origin: 'null',
          }),
        );
      });
      expect(bar.classList.contains('is-idle')).toBe(false);
      await act(async () => {
        vi.advanceTimersByTime(PLAYER_CHROME_IDLE_MS * 2);
      });
      expect(bar.classList.contains('is-idle')).toBe(false);

      await act(async () => {
        window.dispatchEvent(
          new MessageEvent('message', {
            data: { source: 'gdpl-player', type: 'activity' },
            origin: 'null',
          }),
        );
      });
      await act(async () => {
        vi.advanceTimersByTime(PLAYER_CHROME_IDLE_MS);
      });
      expect(bar.classList.contains('is-idle')).toBe(true);
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

  it('records the remix entry as offered on sight and opened with the control that was pressed', async () => {
    await draw();
    session.flush();
    let steps = batches.flatMap((batch) => batch.events).filter((event) => event.type === 'remix_step');
    // Shown it, has not touched it. This is the denominator the whole move to a
    // quieter entry has to be judged against.
    expect(steps).toEqual([expect.objectContaining({ type: 'remix_step', step: 'offered' })]);

    await click(container.querySelector('.remix-btn'));
    session.flush();
    steps = batches.flatMap((batch) => batch.events).filter((event) => event.type === 'remix_step');
    expect(steps).toContainEqual(expect.objectContaining({ type: 'remix_step', step: 'opened', control: 'bar' }));
  });

  it('does not offer a remix entry on a theater with no published slug', async () => {
    // Same rule as how-to-play: drafts and generated playtests share the chrome
    // but must not enter a numerator whose denominator is published plays.
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <GameTheater
          title="Draft"
          badge={{ icon: 'wrench', label: 'Draft' }}
          source={{ html: '<html><body>draft</body></html>' }}
          onExit={() => {}}
        />,
      );
    });
    session.flush();
    expect(batches.flatMap((batch) => batch.events).filter((event) => event.type === 'remix_step')).toEqual([]);
    expect(container.querySelector('.remix-btn')).toBeNull();
  });

  it('records no_lane and hides remix for games without an editor', async () => {
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <GameTheater
          title="No editor"
          badge={{ icon: 'star', label: 'Play' }}
          source={{ slug: 'no-editor' }}
          reportSlug="no-editor"
          editor={null}
          onExit={() => undefined}
        />,
      );
    });
    session.flush();
    expect(batches.flatMap((batch) => batch.events).filter((event) => event.type === 'remix_step')).toEqual([
      expect.objectContaining({ type: 'remix_step', step: 'no_lane' }),
    ]);
    expect(container.querySelector('.remix-btn')).toBeNull();
  });

  it('hides remix chrome and telemetry when remixable is false', async () => {
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <GameTheater
          title="Review play"
          badge={{ icon: 'star', label: 'Try play' }}
          source={{ slug: 'sky-dodge' }}
          onExit={() => {}}
          remixable={false}
        />,
      );
    });
    session.flush();
    expect(batches.flatMap((batch) => batch.events).filter((event) => event.type === 'remix_step')).toEqual([]);
    expect(container.querySelector('.remix-btn')).toBeNull();
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
