/**
 * Follow client. Credentialed: the count is the same for everyone, but whether *you*
 * follow is a fact about the session, and the server decides it.
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export interface GameFollowState {
  slug: string;
  followers: number;
  /** Null when signed out — the count still shows. */
  following: boolean | null;
}

export async function fetchGameFollow(slug: string): Promise<GameFollowState> {
  const response = await fetch(`${API_BASE}/api/games/${encodeURIComponent(slug)}/follow`, {
    credentials: 'include',
  });
  if (!response.ok) throw new Error(`follow state request failed: ${response.status}`);
  return (await response.json()) as GameFollowState;
}

export async function setGameFollow(slug: string, following: boolean): Promise<GameFollowState> {
  const response = await fetch(`${API_BASE}/api/games/${encodeURIComponent(slug)}/follow`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ following }),
  });
  if (response.status === 401) throw Object.assign(new Error('unauthorized'), { code: 'unauthorized' });
  if (!response.ok) throw new Error(`follow request failed: ${response.status}`);
  return (await response.json()) as GameFollowState;
}
