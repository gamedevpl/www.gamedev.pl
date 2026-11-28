// @vitest-environment jsdom

import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogOrientation } from './catalog.js';
import i18n from './i18n/index.js';
import { platform } from './platform/index.js';

vi.mock('./AuthContext', () => ({
  useAuth: () => ({ user: null, signInWithGoogleToken: vi.fn(), logout: vi.fn() }),
}));

vi.mock('./votesApi', () => ({
  fetchVotes: vi.fn().mockResolvedValue({ up: 0, down: 0, mine: null }),
  castVote: vi.fn(),
  clearVote: vi.fn(),
}));

vi.mock('./useScreenWakeLock', () => ({
  useScreenWakeLock: () => undefined,
}));

const frameMock = vi.hoisted(() => ({ reportedOrientation: null as CatalogOrientation | null }));

vi.mock('./PublishedGameFrame', () => ({
  PublishedGameFrame: ({
    frameRef,
    onOrientation,
  }: {
    frameRef?: { current: HTMLIFrameElement | null };
    onOrientation?: (orientation: CatalogOrientation | null) => void;
  }) => {
    useEffect(() => {
      if (frameMock.reportedOrientation) onOrientation?.(frameMock.reportedOrientation);
    }, [onOrientation]);
    return <iframe className="game-frame" title="game" ref={frameRef as React.Ref<HTMLIFrameElement>} />;
  },
}));

import { GameTheater } from './GameTheater.js';

function stubMatchMedia(rules: { coarse?: boolean; landscape?: boolean }) {
  const listeners = new Map<string, Set<() => void>>();
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => {
      const matches =
        query === '(pointer: coarse)'
          ? Boolean(rules.coarse)
          : query === '(orientation: landscape)'
            ? Boolean(rules.landscape)
            : query === '(orientation: portrait)'
              ? !rules.landscape
              : false;
      return {
        matches,
        media: query,
        addEventListener: (_event: string, cb: () => void) => {
          const set = listeners.get(query) ?? new Set();
          set.add(cb);
          listeners.set(query, set);
        },
        removeEventListener: (_event: string, cb: () => void) => {
          listeners.get(query)?.delete(cb);
        },
      };
    }),
  );
}

describe('GameTheater orientation lock', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let requestFullscreenSpy: ReturnType<typeof vi.fn>;
  let exitFullscreenSpy: ReturnType<typeof vi.fn>;
  let canLockSpy: ReturnType<typeof vi.spyOn>;
  let lockSpy: ReturnType<typeof vi.spyOn>;
  let unlockSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    frameMock.reportedOrientation = null;
    container = document.createElement('div');
    document.body.appendChild(container);

    requestFullscreenSpy = vi.fn().mockImplementation(function (this: Element) {
      Object.defineProperty(document, 'fullscreenElement', { value: this, configurable: true });
      document.dispatchEvent(new Event('fullscreenchange'));
      return Promise.resolve();
    });
    exitFullscreenSpy = vi.fn().mockImplementation(() => {
      Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });
      document.dispatchEvent(new Event('fullscreenchange'));
      return Promise.resolve();
    });

    Object.defineProperty(document, 'fullscreenEnabled', { value: true, configurable: true });
    Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });
    Object.defineProperty(document, 'exitFullscreen', { value: exitFullscreenSpy, configurable: true });
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      value: requestFullscreenSpy,
      configurable: true,
    });

    canLockSpy = vi.spyOn(platform.orientation, 'canLock').mockReturnValue(true);
    lockSpy = vi.spyOn(platform.orientation, 'lock').mockResolvedValue(true);
    unlockSpy = vi.spyOn(platform.orientation, 'unlock').mockImplementation(() => undefined);
    vi.spyOn(platform.install, 'isStandalone').mockReturnValue(false);
    stubMatchMedia({ coarse: true, landscape: false });
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container.remove();
    Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });
    Object.defineProperty(document, 'fullscreenEnabled', { value: false, configurable: true });
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function draw(orientation?: CatalogOrientation) {
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <GameTheater
          title="Cozycraft"
          source={{ slug: 'cozycraft' }}
          reportSlug="cozycraft"
          orientation={orientation}
          onExit={() => undefined}
        />,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
  }

  it('auto-enters fullscreen and locks landscape on coarse touch devices', async () => {
    await draw('landscape');

    expect(requestFullscreenSpy).toHaveBeenCalledTimes(1);
    expect(lockSpy).toHaveBeenCalledWith('landscape');

    // Exiting fullscreen unlocks and never yanks the player back into fullscreen.
    const exitFullscreenBtn = container.querySelector('.theater-exit-fullscreen');
    expect(exitFullscreenBtn).not.toBeNull();
    await act(async () => {
      exitFullscreenBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(exitFullscreenSpy).toHaveBeenCalledTimes(1);
    expect(unlockSpy).toHaveBeenCalled();
    expect(requestFullscreenSpy).toHaveBeenCalledTimes(1);
  });

  it('does not auto-fullscreen on desktop pointers or adaptive games', async () => {
    stubMatchMedia({ coarse: false, landscape: true });
    await draw('landscape');
    expect(requestFullscreenSpy).not.toHaveBeenCalled();

    act(() => {
      root?.unmount();
      root = null;
    });
    stubMatchMedia({ coarse: true, landscape: false });
    await draw('adaptive');
    expect(requestFullscreenSpy).not.toHaveBeenCalled();
    expect(lockSpy).not.toHaveBeenCalled();
  });

  it('renders an actionable lock button when auto-fullscreen is rejected in portrait', async () => {
    requestFullscreenSpy.mockRejectedValueOnce(new Error('user gesture required'));
    await draw('landscape');

    const lockBtn = container.querySelector('button.theater-rotate-hint.is-action');
    expect(lockBtn).not.toBeNull();
    expect(lockBtn?.textContent).toContain('Lock landscape');

    await act(async () => {
      lockBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(requestFullscreenSpy).toHaveBeenCalledTimes(2);
    expect(lockSpy).toHaveBeenCalledWith('landscape');
  });

  it('keeps the passive rotate nudge when orientation lock is unavailable', async () => {
    canLockSpy.mockReturnValue(false);
    await draw('landscape');

    expect(requestFullscreenSpy).not.toHaveBeenCalled();
    expect(container.querySelector('button.theater-rotate-hint')).toBeNull();
    const passiveHint = container.querySelector('div.theater-rotate-hint');
    expect(passiveHint).not.toBeNull();
    expect(passiveHint?.textContent).toContain('Turn your phone sideways');
  });

  it('adopts orientation reported by PublishedGameFrame when omitted on props', async () => {
    frameMock.reportedOrientation = 'landscape';
    await draw(undefined);

    expect(requestFullscreenSpy).toHaveBeenCalledTimes(1);
    expect(lockSpy).toHaveBeenCalledWith('landscape');
  });
});
