// @vitest-environment jsdom

import { act, createElement, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dampPull, usePullToRefresh, type PullToRefreshStatus } from './usePullToRefresh.js';

function Probe({
  onChange,
  enabled,
  onRefresh,
  thresholdPx,
  wheelThresholdPx,
}: {
  onChange: (state: { status: PullToRefreshStatus; pullDistance: number }) => void;
  enabled?: boolean;
  onRefresh: () => void | Promise<void>;
  thresholdPx?: number;
  wheelThresholdPx?: number;
}) {
  const state = usePullToRefresh({ enabled, onRefresh, thresholdPx, wheelThresholdPx });
  useEffect(() => {
    onChange(state);
  }, [state, onChange]);
  return null;
}

async function mountProbe(props: {
  onChange: (state: { status: PullToRefreshStatus; pullDistance: number }) => void;
  enabled?: boolean;
  onRefresh: () => void | Promise<void>;
  thresholdPx?: number;
  wheelThresholdPx?: number;
}) {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(Probe, props));
  });
  return { container, root };
}

describe('dampPull', () => {
  it('returns 0 for non-positive input and approaches the max asymptotically', () => {
    expect(dampPull(0, 100)).toBe(0);
    expect(dampPull(-10, 100)).toBe(0);
    expect(dampPull(50, 100)).toBeGreaterThan(0);
    expect(dampPull(50, 100)).toBeLessThan(50);
    // Raw input is capped at 2× max, so the asymptote tops out around 1−e⁻² ≈ 0.86×max.
    expect(dampPull(1000, 100)).toBeLessThan(100);
    expect(dampPull(1000, 100)).toBeGreaterThan(80);
  });
});

describe('usePullToRefresh', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 0 });
    document.body.className = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
    vi.restoreAllMocks();
  });

  it('stays idle until a downward pull starts at the top of the page', async () => {
    const onChange = vi.fn();
    const onRefresh = vi.fn();
    await mountProbe({ onChange, onRefresh, thresholdPx: 60 });

    expect(onChange).toHaveBeenLastCalledWith({ status: 'idle', pullDistance: 0 });

    await act(async () => {
      window.dispatchEvent(new TouchEvent('touchstart', { touches: [{ clientY: 40 } as Touch] }));
      window.dispatchEvent(
        new TouchEvent('touchmove', {
          cancelable: true,
          touches: [{ clientY: 100 } as Touch],
        }),
      );
    });

    const last = onChange.mock.calls.at(-1)?.[0] as { status: PullToRefreshStatus; pullDistance: number };
    expect(last.status).toBe('ready');
    expect(last.pullDistance).toBeGreaterThan(0);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('fires onRefresh when the pull is released past the threshold', async () => {
    const onChange = vi.fn();
    let resolveRefresh!: () => void;
    const onRefresh = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    await mountProbe({ onChange, onRefresh, thresholdPx: 60 });

    await act(async () => {
      window.dispatchEvent(new TouchEvent('touchstart', { touches: [{ clientY: 20 } as Touch] }));
      window.dispatchEvent(
        new TouchEvent('touchmove', {
          cancelable: true,
          touches: [{ clientY: 100 } as Touch],
        }),
      );
      window.dispatchEvent(new TouchEvent('touchend'));
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({ status: 'refreshing' });

    await act(async () => {
      resolveRefresh();
      await Promise.resolve();
    });

    expect(onChange.mock.calls.at(-1)?.[0]).toEqual({ status: 'idle', pullDistance: 0 });
  });

  it('snaps back without refreshing when released below the threshold', async () => {
    const onChange = vi.fn();
    const onRefresh = vi.fn();
    await mountProbe({ onChange, onRefresh, thresholdPx: 80 });

    await act(async () => {
      window.dispatchEvent(new TouchEvent('touchstart', { touches: [{ clientY: 20 } as Touch] }));
      window.dispatchEvent(
        new TouchEvent('touchmove', {
          cancelable: true,
          touches: [{ clientY: 50 } as Touch],
        }),
      );
      window.dispatchEvent(new TouchEvent('touchend'));
    });

    expect(onRefresh).not.toHaveBeenCalled();
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual({ status: 'idle', pullDistance: 0 });
  });

  it('ignores pulls while the page is scrolled away from the top', async () => {
    Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 40 });
    const onChange = vi.fn();
    const onRefresh = vi.fn();
    await mountProbe({ onChange, onRefresh, thresholdPx: 60 });

    await act(async () => {
      window.dispatchEvent(new TouchEvent('touchstart', { touches: [{ clientY: 20 } as Touch] }));
      window.dispatchEvent(
        new TouchEvent('touchmove', {
          cancelable: true,
          touches: [{ clientY: 120 } as Touch],
        }),
      );
      window.dispatchEvent(new TouchEvent('touchend'));
    });

    expect(onRefresh).not.toHaveBeenCalled();
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual({ status: 'idle', pullDistance: 0 });
  });

  it('ignores pulls while a game player has locked the page', async () => {
    document.body.classList.add('player-open');
    const onChange = vi.fn();
    const onRefresh = vi.fn();
    await mountProbe({ onChange, onRefresh, thresholdPx: 60 });

    await act(async () => {
      window.dispatchEvent(new TouchEvent('touchstart', { touches: [{ clientY: 20 } as Touch] }));
      window.dispatchEvent(
        new TouchEvent('touchmove', {
          cancelable: true,
          touches: [{ clientY: 120 } as Touch],
        }),
      );
      window.dispatchEvent(new TouchEvent('touchend'));
    });

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('does nothing when disabled', async () => {
    const onChange = vi.fn();
    const onRefresh = vi.fn();
    await mountProbe({ onChange, onRefresh, enabled: false, thresholdPx: 60 });

    await act(async () => {
      window.dispatchEvent(new TouchEvent('touchstart', { touches: [{ clientY: 20 } as Touch] }));
      window.dispatchEvent(
        new TouchEvent('touchmove', {
          cancelable: true,
          touches: [{ clientY: 120 } as Touch],
        }),
      );
      window.dispatchEvent(new TouchEvent('touchend'));
    });

    expect(onRefresh).not.toHaveBeenCalled();
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual({ status: 'idle', pullDistance: 0 });
  });

  it('refreshes from an upward trackpad wheel burst at the top', async () => {
    const onChange = vi.fn();
    const onRefresh = vi.fn(async () => undefined);
    await mountProbe({ onChange, onRefresh, wheelThresholdPx: 80 });

    await act(async () => {
      window.dispatchEvent(new WheelEvent('wheel', { deltaY: -50, cancelable: true }));
      window.dispatchEvent(new WheelEvent('wheel', { deltaY: -50, cancelable: true }));
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
