// Client for ambient co-presence in a shared world (docs/persistent-world-plan.md P2.5).
//
// Like the world read and unlike a save, looking is public: "12 wanderers here now" is
// most of why a shared world is worth walking into, and gating it behind a sign-in would
// show an empty field to precisely the visitor deciding whether an account is worth
// having. *Appearing* needs a session, and the server decides that, not this client.

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export interface PresencePeer {
  /** Opaque per-world, per-process handle. Never an account identity. */
  tag: string;
  col: number;
  row: number;
}

export interface PresenceSnapshot {
  /** Everybody in the world, this visitor included when `visible`. */
  count: number;
  /** The others. Capped server-side, so this can be shorter than `count` implies. */
  peers: PresencePeer[];
  /** False for a signed-out or blocked visitor: they see the world but are not in it. */
  visible: boolean;
  /** How long a reported position stays fresh, as the server defines it. */
  ttlMs: number;
  /** The cadence the server expects. The shell follows it rather than picking its own. */
  heartbeatMs: number;
}

/** Thrown for a failure worth another beat. No presence at all is null, not an error. */
export class PresenceError extends Error {}

async function parse(res: Response, what: string): Promise<PresenceSnapshot | null> {
  // 404 means there is no roster here — not published, no world, or a world that
  // declares no presence. 401 means "you may look but not appear", which the GET below
  // answers anyway; either way the game is told the same thing and plays on.
  if (res.status === 404) return null;
  if (!res.ok) throw new PresenceError(`${what} (${res.status})`);
  return (await res.json()) as PresenceSnapshot;
}

export async function fetchPresence(slug: string): Promise<PresenceSnapshot | null> {
  const res = await fetch(`${API_BASE}/api/games/${encodeURIComponent(slug)}/presence`, {
    credentials: 'include',
  });
  return parse(res, 'Presence read failed');
}

/**
 * One heartbeat: says this player is still here, and returns the world as they see it.
 *
 * Both halves in one request on purpose. Presence is the only feature on the platform
 * that needs a periodic request at all, so the difference between one call and two is the
 * difference between doubling that cost and not.
 */
export async function beatPresence(
  slug: string,
  position: { col: number; row: number } | null,
): Promise<PresenceSnapshot | null> {
  const res = await fetch(`${API_BASE}/api/games/${encodeURIComponent(slug)}/presence`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(position ?? {}),
  });
  // A signed-out visitor cannot beat, but can still look — and should, because the count
  // is the thing most likely to make them want an account. Falling back rather than
  // giving up is what makes "sign in to be seen here" a sentence the game can say while
  // showing the player what they are missing.
  if (res.status === 401 || res.status === 403) return fetchPresence(slug);
  return parse(res, 'Presence beat failed');
}

/**
 * Withdraw from the roster.
 *
 * Not strictly needed — a slot expires on its own — but the gap between closing a game
 * and expiring is the whole TTL, and during it every other player is looking at somebody
 * who is not there. `keepalive` because this fires as the theater unmounts.
 */
export async function leavePresence(slug: string): Promise<void> {
  await fetch(`${API_BASE}/api/games/${encodeURIComponent(slug)}/presence`, {
    method: 'DELETE',
    credentials: 'include',
    keepalive: true,
  }).catch(() => undefined);
}
