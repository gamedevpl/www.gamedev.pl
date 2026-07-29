const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

/**
 * Admission to a zone, from the shell (docs/persistent-world-plan.md P3).
 *
 * One call, answered by the main API on the real origin with the session cookie
 * attached. The ticket it returns is what the shell presents to the zone host, which is
 * a different service on a different origin and never sees that cookie.
 */

export interface ZoneInputSpec {
  k: string;
  type: 'none' | 'int' | 'enum';
  min?: number;
  max?: number;
  values?: string[];
}

export interface ZoneAdmission {
  zone: string;
  hostUrl: string;
  ticket: string;
  expiresAt: number;
  tickHz: number;
  maxPlayers: number;
  inputs: ZoneInputSpec[];
  durable: boolean;
}

/**
 * Asks for a seat. Returns null when this game has no zone or zones are not running.
 *
 * Null rather than a throw for the 404, because "this game has no zone" is the ordinary
 * case for 87 of 88 games and not a failure of anything. A network error still throws,
 * so the caller can tell "there is nothing here" from "I could not find out", which is
 * the distinction the save bridge had to learn the hard way.
 */
export async function fetchZoneAdmission(slug: string): Promise<ZoneAdmission | null> {
  const response = await fetch(`${API_BASE}/api/games/${encodeURIComponent(slug)}/zone/ticket`, {
    method: 'POST',
    credentials: 'include',
  });
  if (response.status === 404 || response.status === 401) return null;
  if (!response.ok) throw new Error(`zone admission failed: ${response.status}`);

  const body = (await response.json()) as Partial<ZoneAdmission>;
  if (
    typeof body.zone !== 'string' ||
    typeof body.hostUrl !== 'string' ||
    typeof body.ticket !== 'string' ||
    typeof body.tickHz !== 'number' ||
    typeof body.maxPlayers !== 'number'
  ) {
    throw new Error('zone admission returned an unusable answer');
  }
  return {
    zone: body.zone,
    hostUrl: body.hostUrl,
    ticket: body.ticket,
    expiresAt: typeof body.expiresAt === 'number' ? body.expiresAt : 0,
    tickHz: body.tickHz,
    maxPlayers: body.maxPlayers,
    inputs: Array.isArray(body.inputs) ? body.inputs : [],
    durable: body.durable === true,
  };
}
