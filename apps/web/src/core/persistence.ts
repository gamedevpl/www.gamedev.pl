/**
 * The one place apps/web touches Storage (localStorage/sessionStorage).
 * Private/blocked browsers throw on access instead of returning null;
 * every read/write here degrades to "best effort" instead of throwing.
 */

// Resolved inside each try, not as a parameter default: a bare
// `localStorage` reference throws ReferenceError outside a browser
// (SSR, a plain Node test) — a parameter default evaluates too
// early for that function's own try/catch to catch it.

export function readStorageItem(key: string, storage?: Storage): string | null {
  try {
    return (storage ?? localStorage).getItem(key);
  } catch {
    return null;
  }
}

export function writeStorageItem(key: string, value: string, storage?: Storage): void {
  try {
    (storage ?? localStorage).setItem(key, value);
  } catch {
    // Quota exceeded or storage blocked — best-effort only.
  }
}

export function removeStorageItem(key: string, storage?: Storage): void {
  try {
    (storage ?? localStorage).removeItem(key);
  } catch {
    // Best-effort only.
  }
}

export function readStorageJSON<T>(key: string, storage?: Storage): T | null {
  const raw = readStorageItem(key, storage);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeStorageJSON(key: string, value: unknown, storage?: Storage): void {
  writeStorageItem(key, JSON.stringify(value), storage);
}
