/**
 * Shared "is the catalog viewport scrolling?" signal so card hover handlers can
 * ignore hover that only happens because cards slide under a stationary pointer.
 *
 * Also exposes `whenCatalogScrollIdle` so a hover that started during scroll can
 * still arm once the viewport settles (without needing another mouseenter).
 */

let scrolling = false;
let idleTimer: number | null = null;
let listenersAttached = false;
/** Callbacks waiting for the next idle edge. */
let idleWaiters: Array<() => void> = [];

const IDLE_MS = 140;

function flushIdleWaiters(): void {
  if (idleWaiters.length === 0) return;
  const waiters = idleWaiters;
  idleWaiters = [];
  for (const fn of waiters) fn();
}

function onScroll(): void {
  scrolling = true;
  if (idleTimer != null) window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => {
    scrolling = false;
    idleTimer = null;
    flushIdleWaiters();
  }, IDLE_MS);
}

function ensureListeners(): void {
  if (listenersAttached || typeof window === 'undefined') return;
  listenersAttached = true;
  window.addEventListener('scroll', onScroll, { passive: true, capture: true });
}

/** Call once from the catalog mount so scroll tracking is live before first hover. */
export function watchCatalogScrollIdle(): () => void {
  ensureListeners();
  return () => {
    // Keep the listener for the session — multiple ArcadeCatalog mounts would
    // otherwise thrash add/remove. Tests call {@link resetCatalogScrollIdleForTests}.
  };
}

/** True while a catalog scroll gesture is in flight (plus a short settle window). */
export function isCatalogScrolling(): boolean {
  ensureListeners();
  return scrolling;
}

/**
 * Run `fn` now if the catalog is idle, otherwise once scrolling settles.
 * Returns a cancel function for the pending waiter (no-op if `fn` already ran).
 */
export function whenCatalogScrollIdle(fn: () => void): () => void {
  ensureListeners();
  if (!scrolling) {
    fn();
    return () => undefined;
  }
  idleWaiters.push(fn);
  return () => {
    const i = idleWaiters.indexOf(fn);
    if (i >= 0) idleWaiters.splice(i, 1);
  };
}

/** Test-only: clear scroll state between cases. */
export function resetCatalogScrollIdleForTests(): void {
  scrolling = false;
  idleWaiters = [];
  if (idleTimer != null) {
    window.clearTimeout(idleTimer);
    idleTimer = null;
  }
}

/** Test-only: force the scrolling flag (and flush waiters when clearing). */
export function setCatalogScrollingForTests(next: boolean): void {
  scrolling = next;
  if (!next) {
    if (idleTimer != null) {
      window.clearTimeout(idleTimer);
      idleTimer = null;
    }
    flushIdleWaiters();
  }
}
