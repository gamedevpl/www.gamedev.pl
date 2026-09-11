/**
 * Per-round preference: hide the tall MCP connect card so it does not own the
 * thread. Expand restores it; Details also mounts the card when available.
 */

import { readStorageItem, removeStorageItem, writeStorageItem } from './core/persistence.js';

const STORAGE_PREFIX = 'gamedev_connect_collapsed:';

export function isConnectCollapsed(token: string): boolean {
  return readStorageItem(`${STORAGE_PREFIX}${token}`) === '1';
}

export function setConnectCollapsed(token: string, collapsed: boolean): void {
  const key = `${STORAGE_PREFIX}${token}`;
  if (collapsed) writeStorageItem(key, '1');
  else removeStorageItem(key);
}
