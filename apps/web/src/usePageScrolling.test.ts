// @vitest-environment jsdom

import { act, createElement, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePageScrolling } from './usePageScrolling.js';

function Probe({
  onChange,
  settleMs,
  thresholdPx,
}: {
  onChange: (scrolling: boolean) => void;
  settleMs?: number;
  thresholdPx?: number;
}) {
  const scrolling = usePageScrolling({ settleMs, thresholdPx });
  useEffect(() => {
    onChange(scrolling);
  }, [scrolling, onChange]);
  return null;
}

function stubMatchMedia(matches: boolean) {
  const listeners = new Set<() => void>();
  const media = {
    matches,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener: (_: string, listener: () => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_: string, listener: () => void) => {
      listeners.delete(listener);
    },
    addListener: (listener: () => void) => {
      listeners.add(listener);
    },
    removeListener: (listener: () => void) => {
      listeners.delete(listener);
    },
    dispatchEvent: () => false,
  };
  vi.stubGlobal('matchMedia', () => media);
  return {
    setMatches(next: boolean) {
      media.matches = next;
      listeners.forEach((listener) => listener());
    },
  };
}

describe('usePageScrolling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stubMatchMedia(false);
    Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 0 });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('stays false until the page actually moves', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const onChange = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(Probe, { onChange, settleMs: 200 }));
    });

    expect(onChange).toHaveBeenLastCalledWith(false);

    await act(async () => {
      window.dispatchEvent(new Event('scroll'));
    });
    // First scroll only seeds lastY — no delta yet.
    expect(onChange).toHaveBeenLastCalledWith(false);

    await act(async () => {
      root.unmount();
    });
  });

  it('turns true on a real scroll delta and settles after the idle window', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const onChange = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(Probe, { onChange, settleMs: 200, thresholdPx: 2 }));
    });

    await act(async () => {
      (window as Window & { scrollY: number }).scrollY = 40;
      window.dispatchEvent(new Event('scroll'));
    });
    expect(onChange).toHaveBeenLastCalledWith(true);

    await act(async () => {
      vi.advanceTimersByTime(199);
    });
    expect(onChange).toHaveBeenLastCalledWith(true);

    await act(async () => {
      vi.advanceTimersByTime(2);
    });
    expect(onChange).toHaveBeenLastCalledWith(false);

    await act(async () => {
      root.unmount();
    });
  });

  it('ignores sub-threshold jitter', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const onChange = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(Probe, { onChange, settleMs: 200, thresholdPx: 5 }));
    });

    await act(async () => {
      (window as Window & { scrollY: number }).scrollY = 3;
      window.dispatchEvent(new Event('scroll'));
    });
    expect(onChange).toHaveBeenLastCalledWith(false);

    await act(async () => {
      root.unmount();
    });
  });

  it('lets slow sub-threshold steps accumulate into a real scroll', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const onChange = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(Probe, { onChange, settleMs: 200, thresholdPx: 3 }));
    });

    // Three 1px steps never each clear the threshold, but together they do —
    // lastY must stay put until the threshold is met, or a trackpad crawl is silent.
    await act(async () => {
      (window as Window & { scrollY: number }).scrollY = 1;
      window.dispatchEvent(new Event('scroll'));
    });
    expect(onChange).toHaveBeenLastCalledWith(false);

    await act(async () => {
      (window as Window & { scrollY: number }).scrollY = 2;
      window.dispatchEvent(new Event('scroll'));
    });
    expect(onChange).toHaveBeenLastCalledWith(false);

    await act(async () => {
      (window as Window & { scrollY: number }).scrollY = 3;
      window.dispatchEvent(new Event('scroll'));
    });
    expect(onChange).toHaveBeenLastCalledWith(true);

    await act(async () => {
      root.unmount();
    });
  });

  it('stays false when prefers-reduced-motion is on', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    stubMatchMedia(true);
    const onChange = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(Probe, { onChange, settleMs: 200 }));
    });

    await act(async () => {
      (window as Window & { scrollY: number }).scrollY = 80;
      window.dispatchEvent(new Event('scroll'));
    });
    expect(onChange).toHaveBeenLastCalledWith(false);

    await act(async () => {
      root.unmount();
    });
  });
});
