/**
 * Per-round preference: hide the tall MCP connect card so it does not own the
 * thread. Expand restores it; Details also mounts the card when available.
 */

const STORAGE_PREFIX = 'gamedev_connect_collapsed:';

export function isConnectCollapsed(token: string): boolean {
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${token}`) === '1';
  } catch {
    return false;
  }
}

export function setConnectCollapsed(token: string, collapsed: boolean): void {
  try {
    const key = `${STORAGE_PREFIX}${token}`;
    if (collapsed) localStorage.setItem(key, '1');
    else localStorage.removeItem(key);
  } catch {
    // Preference only — a private mode block must not break the thread.
  }
}
