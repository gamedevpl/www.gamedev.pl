// Client for durable per-player game progress (docs/persistent-world-plan.md P1).
//
// Every call needs a session — a save belongs to exactly one person, so unlike votes
// there is no public read. A 401 here is an ordinary state (a signed-out visitor
// playing a game that *can* save), not an error worth surfacing: the bridge turns it
// into "no slot" and the game starts fresh.

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export interface GameSave {
  /** Opaque game-authored JSON, or null when this player has no save yet. */
  data: string | null;
  version: number;
  updatedAt: string | null;
}

/** Thrown for anything that is not "you are not signed in" — see `fetchGameSave`. */
export class GameSaveError extends Error {}

/** A visitor with no session; the bridge keeps their save on this device. */
export const SIGNED_OUT = 'signed_out' as const;

/** Reads this player's save: SIGNED_OUT without a session, null for an unpublished game. */
export async function fetchGameSave(slug: string): Promise<GameSave | typeof SIGNED_OUT | null> {
  const res = await fetch(`${API_BASE}/api/games/${encodeURIComponent(slug)}/save`, {
    credentials: 'include',
  });
  if (res.status === 401) return SIGNED_OUT;
  if (res.status === 404) return null;
  if (!res.ok) throw new GameSaveError(`Save read failed (${res.status})`);
  return (await res.json()) as GameSave;
}

export async function putGameSave(slug: string, data: string, version: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/games/${encodeURIComponent(slug)}/save`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ data, version }),
    // Survives the tab being closed mid-write. A save is written when something good
    // happens in a game, and the very next thing a player does is often to leave —
    // without this the last and most valuable write is the one most likely to be lost.
    keepalive: true,
  });
  if (!res.ok) throw new GameSaveError(`Save write failed (${res.status})`);
}

export async function deleteGameSave(slug: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/games/${encodeURIComponent(slug)}/save`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new GameSaveError(`Save delete failed (${res.status})`);
}
