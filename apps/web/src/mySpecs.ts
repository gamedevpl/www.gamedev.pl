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
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedSpec[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSpec(spec: SavedSpec): SavedSpec[] {
  const current = getSavedSpecs();
  // Filter out any duplicate token
  const filtered = current.filter((item) => item.token !== spec.token);
  const updated = [spec, ...filtered];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // ignore quota errors
  }
  return updated;
}

export function removeSpec(token: string): SavedSpec[] {
  const current = getSavedSpecs();
  const updated = current.filter((item) => item.token !== token);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
  return updated;
}
