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
