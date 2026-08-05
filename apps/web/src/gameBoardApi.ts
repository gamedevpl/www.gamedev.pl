/**
 * Game board client — the four columns on `/:handle/:slug/board`.
 *
 * Credentialed, unlike the page read: the open column exists only for the game's
 * owner, and the server decides that from the session rather than the client asking.
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export interface BoardOpenTask {
  id: string;
  taskClass: string;
  priority: number;
  /** Platform-computed findings — never player- or game-authored text. */
  findings: string[];
  createdAt: string;
}

export interface BoardWorkItem {
  title: string;
  state: string;
  since: string;
  jobId?: number;
  agentOpened?: boolean;
}

export interface GameBoard {
  open: BoardOpenTask[];
  building: BoardWorkItem[];
  review: BoardWorkItem[];
  released: BoardWorkItem[];
  openVisibility: 'owner' | 'private';
  viewerIsOwner: boolean;
}

export async function fetchGameBoard(slug: string): Promise<GameBoard> {
  const response = await fetch(`${API_BASE}/api/games/${encodeURIComponent(slug)}/board`, {
    credentials: 'include',
  });
  if (response.status === 404) throw Object.assign(new Error('not_found'), { code: 'not_found' });
  if (!response.ok) throw new Error(`game board request failed: ${response.status}`);
  return (await response.json()) as GameBoard;
}

/**
 * Hand an open task to the agent. This is the board's one automation, and it is the
 * suggestion inbox's existing approval endpoint — which charges the improvement
 * quota, captures the measurement baseline, and records who decided.
 */
export async function assignTaskToAgent(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/me/suggestions/${encodeURIComponent(id)}/approve`, {
    method: 'POST',
    credentials: 'include',
  });
  if (response.ok) return;
  const code = await readErrorCode(response);
  throw Object.assign(new Error(code), { code, status: response.status });
}

async function readErrorCode(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    if (typeof body.error === 'string' && body.error.trim()) return body.error;
  } catch {
    // fall through to the status-derived code
  }
  return response.status === 429 ? 'quota_exceeded' : 'unknown';
}
