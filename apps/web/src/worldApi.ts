// Client for shared asynchronous worlds (docs/persistent-world-plan.md P2).
//
// Unlike saves, the read here is public: a world is worth looking at before you have an
// account, and every visitor gets the same view of what other players built. Writes need
// a session, and the server — not this client and certainly not the game — decides
// whether one is allowed.

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export interface WorldEntry {
  key: string;
  fields: Record<string, string | number | boolean>;
  /** True when this visitor wrote it — the only entries they may change. */
  mine: boolean;
  /** Opaque per-world handle for whoever wrote it. Never an account identity. */
  ownerTag: string;
  updatedAt: string;
}

export interface WorldSnapshot {
  entries: WorldEntry[];
  maxPerPlayer: number;
  /** False for a signed-out or blocked visitor: they see the world but cannot change it. */
  writable: boolean;
}

/** Thrown for a failure worth retrying. A missing world is null, not an error. */
export class WorldError extends Error {}

/**
 * Reads a game's whole world.
 *
 * Null means there is no world here at all — the game declares none, is not published,
 * or its declaration did not parse. A game cannot act differently on those, and
 * distinguishing them would leak whether a slug exists.
 */
export async function fetchWorld(slug: string): Promise<WorldSnapshot | null> {
  const res = await fetch(`${API_BASE}/api/games/${encodeURIComponent(slug)}/world`, {
    credentials: 'include',
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new WorldError(`World read failed (${res.status})`);
  return (await res.json()) as WorldSnapshot;
}

export interface WorldWriteResult {
  ok: boolean;
  /** Present when the write was refused, in words a game can show a player. */
  error?: string;
}

/**
 * Claims or updates one entry.
 *
 * Refusals are returned rather than thrown, because every one of them is an ordinary
 * outcome a game should tell the player about: the plot is taken, the note was rejected,
 * you are holding as many things as you may. Only a broken response is an error.
 */
export async function putWorldEntry(
  slug: string,
  key: string,
  fields: Record<string, unknown>,
): Promise<WorldWriteResult> {
  const res = await fetch(`${API_BASE}/api/games/${encodeURIComponent(slug)}/world/${encodeURIComponent(key)}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fields }),
    // Same reasoning as a save: people leave a game right after doing the thing worth
    // keeping, and without this the last write is the one most likely to be lost.
    keepalive: true,
  });
  if (res.ok) return { ok: true };
  if (res.status >= 500) throw new WorldError(`World write failed (${res.status})`);
  return { ok: false, error: await readError(res) };
}

export async function deleteWorldEntry(slug: string, key: string): Promise<WorldWriteResult> {
  const res = await fetch(`${API_BASE}/api/games/${encodeURIComponent(slug)}/world/${encodeURIComponent(key)}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (res.ok) return { ok: true };
  if (res.status >= 500) throw new WorldError(`World delete failed (${res.status})`);
  return { ok: false, error: await readError(res) };
}

/** The API's own message when there is one, and a plain fallback when there is not. */
async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === 'string' && body.error) return body.error;
  } catch {
    // A non-JSON body from a proxy or an error page. Nothing useful to relay.
  }
  return `refused (${res.status})`;
}
