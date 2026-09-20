// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCreatorShelf } from './useCreatorShelf.js';
import { loadCreatorGames } from '../../creatorGames.js';

const mockedLoad = vi.hoisted(() => vi.fn());

vi.mock('../../creatorGames.js', async () => {
  const actual = await vi.importActual<typeof import('../../creatorGames.js')>('../../creatorGames.js');
  return { ...actual, loadCreatorGames: mockedLoad };
});

let hidden = false;

function stubVisibility() {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  });
}

async function show(hiddenNow: boolean) {
  hidden = hiddenNow;
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

async function mountShelf(): Promise<{ root: Root; setCount: (count: number) => Promise<void> }> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const render = async (activeBuildCount: number) => {
    await act(async () => {
      root.render(
        createElement(function Probe() {
          useCreatorShelf({ authLoading: false, viewerUid: 'g:creator', locale: 'en', creatorGamesRefreshKey: 0, activeBuildCount });
          return null;
        }),
      );
    });
  };
  await render(0);
  return { root, setCount: render };
}

describe('useCreatorShelf', () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    hidden = false;
    stubVisibility();
    mockedLoad.mockReset();
    mockedLoad.mockResolvedValue([]);
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('converges a visible tab on the floor, not on the old 30s cadence', async () => {
    const { root } = await mountShelf();

    expect(mockedLoad).toHaveBeenCalledTimes(1);

    // The old interval would have read 40 times over this stretch.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20 * 60_000);
    });

    expect(mockedLoad).toHaveBeenCalledTimes(5);
    await act(async () => root.unmount());
  });

  it('reads nothing while the tab stays hidden', async () => {
    hidden = true;
    const { root } = await mountShelf();

    expect(mockedLoad).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20 * 60_000);
    });

    expect(mockedLoad).not.toHaveBeenCalled();

    // Mounted in a background tab; the first read waits for the way back.
    await show(false);
    expect(mockedLoad).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });

  it('re-reads when a build starts or finishes', async () => {
    const { root, setCount } = await mountShelf();
    mockedLoad.mockClear();

    await setCount(1);
    expect(mockedLoad).toHaveBeenCalledTimes(1);

    await setCount(0);
    expect(mockedLoad).toHaveBeenCalledTimes(2);
    await act(async () => root.unmount());
  });

  it('re-reads on the way back to the tab, but not inside the floor', async () => {
    const { root } = await mountShelf();
    mockedLoad.mockClear();

    await show(true);
    await show(false);
    expect(mockedLoad).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6 * 60_000);
    });
    await show(true);
    await show(false);

    expect(mockedLoad).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });

  it('drives the same symbol the hook imports', () => {
    expect(loadCreatorGames).toBe(mockedLoad);
  });

  it('asks for nothing while signed out', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(function Probe() {
          useCreatorShelf({ authLoading: false, viewerUid: null, locale: 'en', creatorGamesRefreshKey: 0, activeBuildCount: 0 });
          return null;
        }),
      );
    });

    expect(mockedLoad).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });
});
