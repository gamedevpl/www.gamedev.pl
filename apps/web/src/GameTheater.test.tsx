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

async function draw() {
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <GameTheater
        title="Brick Storm"
        badge={{ icon: 'sparkle', label: 'AI' }}
        source={{ slug: 'brick-storm' }}
        reportSlug="brick-storm"
        onExit={() => undefined}
      />,
    );
  });
  await act(async () => {
    await Promise.resolve();
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
});
