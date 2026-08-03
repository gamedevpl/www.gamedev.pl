/**
 * True while the page (or any nested scroller) is mid-scroll.
 * Catalog cards use this so hover-intent cannot arm videos / moment strips
 * while the pointer is merely sweeping the grid during a scroll.
 */

let scrolling = false;
let idleTimer: number | null = null;
let listenersAttached = false;

const IDLE_MS = 140;

function onScroll() {
  scrolling = true;
  if (idleTimer != null) window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => {
    scrolling = false;
    idleTimer = null;
  }, IDLE_MS);
}

function ensureListeners() {
  if (listenersAttached || typeof window === 'undefined') return;
  listenersAttached = true;
  window.addEventListener('scroll', onScroll, { passive: true, capture: true });
}

/** Call once from the arcade mount so scroll tracking is live before first hover. */
export function watchCatalogScrollIdle(): () => void {
  ensureListeners();
  return () => {
    // Keep the listener for the session — multiple ArcadeCatalog mounts would
    // otherwise thrash add/remove. Tests call {@link resetCatalogScrollIdleForTests}.
  };
}

export function isCatalogScrolling(): boolean {
  ensureListeners();
  return scrolling;
}

/** Test-only: clear scroll state between cases. */
export function resetCatalogScrollIdleForTests(): void {
  scrolling = false;
  if (idleTimer != null) {
    window.clearTimeout(idleTimer);
    idleTimer = null;
  }
}

/** Test-only: force the scrolling flag. */
export function setCatalogScrollingForTests(value: boolean): void {
  scrolling = value;
}
