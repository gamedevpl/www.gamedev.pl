// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isCatalogScrolling,
  resetCatalogScrollIdleForTests,
  setCatalogScrollingForTests,
  watchCatalogScrollIdle,
  whenCatalogScrollIdle,
} from './catalogScrollIdle.js';

describe('catalogScrollIdle', () => {
  afterEach(() => {
    resetCatalogScrollIdleForTests();
    vi.useRealTimers();
  });

  it('marks scrolling during scroll events and clears after idle', () => {
    vi.useFakeTimers();
    watchCatalogScrollIdle();
    expect(isCatalogScrolling()).toBe(false);

    window.dispatchEvent(new Event('scroll'));
    expect(isCatalogScrolling()).toBe(true);

    vi.advanceTimersByTime(139);
    expect(isCatalogScrolling()).toBe(true);
    vi.advanceTimersByTime(2);
    expect(isCatalogScrolling()).toBe(false);
  });

  it('allows tests to force the flag', () => {
    setCatalogScrollingForTests(true);
    expect(isCatalogScrolling()).toBe(true);
    setCatalogScrollingForTests(false);
    expect(isCatalogScrolling()).toBe(false);
  });

  it('runs whenCatalogScrollIdle immediately when idle', () => {
    const fn = vi.fn();
    whenCatalogScrollIdle(fn);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('defers whenCatalogScrollIdle until scrolling settles', () => {
    vi.useFakeTimers();
    watchCatalogScrollIdle();
    window.dispatchEvent(new Event('scroll'));

    const fn = vi.fn();
    whenCatalogScrollIdle(fn);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(140);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('lets callers cancel a pending idle waiter', () => {
    vi.useFakeTimers();
    watchCatalogScrollIdle();
    window.dispatchEvent(new Event('scroll'));

    const fn = vi.fn();
    const cancel = whenCatalogScrollIdle(fn);
    cancel();
    vi.advanceTimersByTime(140);
    expect(fn).not.toHaveBeenCalled();
  });
});
