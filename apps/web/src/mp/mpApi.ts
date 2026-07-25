const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export interface PartySession {
  code: string;
  hostToken: string;
  joinToken: string;
  joinPath: string;
  maxPlayers: number;
  expiresAt: number;
}

export class PartySessionError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'PartySessionError';
    this.status = status;
  }
}

/** Opens a lobby for a game. Requires a signed-in host (cookie credentials). */
export async function createPartySession(slug: string, maxPlayers: number): Promise<PartySession> {
  const response = await fetch(`${API_BASE}/api/mp/sessions`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, maxPlayers }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new PartySessionError(body.error ?? 'failed to open a lobby', response.status);
  }

  return (await response.json()) as PartySession;
}

/** Absolute URL a phone opens after scanning (`/join/<code>#<token>`). */
export function joinUrl(session: PartySession): string {
  return `${window.location.origin}${session.joinPath}`;
}
