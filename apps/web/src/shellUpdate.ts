/**
 * Catch "a new shell is ready" before React has mounted the banner.
 *
 * The worker posts `{ type: 'shell-updated' }` from `activate` the moment it replaces
 * an earlier build. `AppUpdateBanner` only mounts after auth + the beta gate, so on a
 * phone Home Screen reopen the message can land while the loading splash is still up
 * and vanish — no banner, stale shell, no way to reload. Listening here (same pattern
 * as `watchInstallPrompt`) parks the revision in sessionStorage until the banner can
 * show it, and `registration.update()` on foreground is what makes iOS actually check
 * for a new worker when the user comes back.
 */

const PENDING_KEY = 'gamedev_shell_update_pending';
export const SHELL_UPDATED_EVENT = 'gamedev:shell-updated';

function readSession(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSession(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    /* private mode — banner simply will not resurface after a race */
  }
}

function clearSession(key: string): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function notePending(revision: string): void {
  writeSession(PENDING_KEY, revision);
  window.dispatchEvent(new CustomEvent(SHELL_UPDATED_EVENT, { detail: { revision } }));
}

/** Pending build revision, if the worker announced a replacement this session. */
export function pendingShellUpdate(): string | null {
  const value = readSession(PENDING_KEY);
  return value && value.length > 0 ? value : null;
}

/** Call when the user reloads or dismisses so a fresh session does not re-nag. */
export function clearPendingShellUpdate(): void {
  clearSession(PENDING_KEY);
}

/**
 * Attach the early listener and ask the browser to look for a newer worker.
 * Safe to call once at boot; no-ops where service workers do not exist.
 */
export function watchShellUpdates(): void {
  if (!('serviceWorker' in navigator)) return;

  let serviceWorker: ServiceWorkerContainer;
  try {
    serviceWorker = navigator.serviceWorker;
  } catch {
    // A sandboxed context throws on access; treat it as unsupported.
    return;
  }

  serviceWorker.addEventListener('message', (event: MessageEvent) => {
    const data = event.data as { type?: string; revision?: string } | null;
    if (data?.type === 'shell-updated') {
      notePending(typeof data.revision === 'string' && data.revision ? data.revision : 'updated');
      return;
    }
    // Hashed shell asset missing (eviction / deploy race). One guarded reload is
    // enough to pick up a fresh worker; looping would need a new miss after that.
    if (data?.type === 'shell-asset-miss') {
      const guardKey = 'gamedev_shell_asset_reload';
      if (readSession(guardKey)) return;
      writeSession(guardKey, '1');
      window.location.reload();
    }
  });

  const requestUpdate = () => {
    void serviceWorker
      .getRegistration('/sw.js')
      .then((registration) => registration?.update())
      .catch(() => {
        /* offline / blocked — the next foreground will try again */
      });
  };

  // `load` is when main.tsx registers the worker; updating immediately after that is
  // what catches a deploy that landed while the installed app was closed.
  if (document.readyState === 'complete') {
    requestUpdate();
  } else {
    window.addEventListener('load', requestUpdate, { once: true });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') requestUpdate();
  });
}
