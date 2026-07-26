// @vitest-environment jsdom

import { act, createElement, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useInView } from './useInView';

type ObserverInstance = {
  callback: IntersectionObserverCallback;
  options?: IntersectionObserverInit;
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  unobserve: ReturnType<typeof vi.fn>;
};

let observers: ObserverInstance[];

function installIntersectionObserverMock() {
  observers = [];
  class MockIntersectionObserver {
    callback: IntersectionObserverCallback;
    options?: IntersectionObserverInit;
    observe = vi.fn();
    disconnect = vi.fn();
    unobserve = vi.fn();
    root = null;
    rootMargin = '';
    thresholds = [];

    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
      this.callback = callback;
      this.options = options;
      observers.push(this);
    }

    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }

  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
}

function Probe({
  onChange,
  once,
}: {
  onChange: (inView: boolean) => void;
  once?: boolean;
}) {
  const { ref, inView } = useInView({ once });
  useEffect(() => {
    onChange(inView);
  }, [inView, onChange]);
  return createElement('div', { ref, 'data-testid': 'target' });
}

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('useInView', () => {
  beforeEach(() => {
    installIntersectionObserverMock();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('starts false and becomes true when the observed element intersects', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const onChange = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(Probe, { onChange }));
      await flushEffects();
    });

    expect(onChange).toHaveBeenLastCalledWith(false);
    expect(observers).toHaveLength(1);
    expect(observers[0]?.options?.rootMargin).toBe('200px 0px');
    expect(observers[0]?.observe).toHaveBeenCalled();

    await act(async () => {
      observers[0]?.callback(
        [
          {
            isIntersecting: true,
            target: container.querySelector('[data-testid="target"]')!,
            intersectionRatio: 1,
            time: 0,
            boundingClientRect: {} as DOMRectReadOnly,
            intersectionRect: {} as DOMRectReadOnly,
            rootBounds: null,
          },
        ],
        observers[0] as unknown as IntersectionObserver,
      );
      await flushEffects();
    });

    expect(onChange).toHaveBeenLastCalledWith(true);
    expect(observers[0]?.disconnect).toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it('falls back to inView when IntersectionObserver is missing', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal('IntersectionObserver', undefined);
    const onChange = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(Probe, { onChange }));
      await flushEffects();
    });

    expect(onChange).toHaveBeenLastCalledWith(true);

    await act(async () => {
      root.unmount();
    });
  });
});
