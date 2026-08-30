import { readStorageJSON, writeStorageJSON } from './core/persistence.js';

export type SavedSpec = {
  token: string;
  title: string;
  concept?: string;
  createdAt: number;
  /**
   * The game's address, known from submission now. Optional because entries saved
   * before slugs were assigned up front have none, and those still resolve by token.
   */
  slug?: string;
};

const STORAGE_KEY = 'gamedev_saved_specs';

export function getSavedSpecs(): SavedSpec[] {
  const parsed = readStorageJSON<SavedSpec[]>(STORAGE_KEY);
  return Array.isArray(parsed) ? parsed : [];
}

export function saveSpec(spec: SavedSpec): SavedSpec[] {
  const current = getSavedSpecs();
  // Filter out any duplicate token
  const filtered = current.filter((item) => item.token !== spec.token);
  const updated = [spec, ...filtered];
  writeStorageJSON(STORAGE_KEY, updated);
  return updated;
}

export function removeSpec(token: string): SavedSpec[] {
  const current = getSavedSpecs();
  const updated = current.filter((item) => item.token !== token);
  writeStorageJSON(STORAGE_KEY, updated);
  return updated;
}
