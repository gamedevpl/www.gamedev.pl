const RELOAD_KEY = 'gamedev_chunk_reload';
const CHUNK_ERROR =
  /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|unable to preload css/i;

async function reloadFreshShell(build: string): Promise<void> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 5000);
  let stale: boolean;
  try {
    const response = await fetch('/', { cache: 'reload', signal: controller.signal });
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) return;
    const html = await response.text();
    stale = !html.includes(new URL(build).pathname);
  } catch {
    return;
  } finally {
    window.clearTimeout(timeout);
  }
  try {
    if (stale && 'caches' in window) {
      const names = await window.caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith('gamedevpl-shell-'))
          .map(async (name) => {
            const cache = await window.caches.open(name);
            await cache.delete('/index.html');
          }),
      );
    }
  } catch {
    // Cache Storage can be blocked even when service workers are available.
  }
  window.location.reload();
}

export function watchChunkRecovery(build = import.meta.url): () => void {
  const guardKey = `${RELOAD_KEY}:${build}`;
  const onPreloadError = (event: Event) => {
    const error: unknown = (event as Event & { payload?: unknown }).payload;
    if (!(error instanceof Error) || !CHUNK_ERROR.test(error.message) || !navigator.onLine) return;
    try {
      // Persist before reloading; blocked storage must never create a reload loop.
      if (window.sessionStorage.getItem(guardKey)) return;
      window.sessionStorage.setItem(guardKey, '1');
    } catch {
      return;
    }
    void reloadFreshShell(build);
  };
  window.addEventListener('vite:preloadError', onPreloadError);
  return () => window.removeEventListener('vite:preloadError', onPreloadError);
}
