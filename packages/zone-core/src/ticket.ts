import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Admission to a zone (docs/p3-zone-host-infra.md §2).
 *
 * The zone host is a separate Cloud Run service on its own origin, so the session cookie
 * that authenticates everything else on this platform does not reach it. The main API
 * stays the front door: an authenticated request here mints a short-lived HMAC ticket,
 * the shell presents it in the socket's first frame, and the host verifies it without
 * ever seeing a cookie, a session, or a user record.
 *
 * That is the same shape party mode's room tokens take, for the same reason, and the two
 * are kept apart by their scope string: both are keyed off `SESSION_SECRET`, and a ticket
 * that could be replayed as a room token (or a session) would make one secret's blast
 * radius the whole platform.
 *
 * What a ticket carries is deliberately minimal. It names the zone, the game, and who is
 * arriving — and `who` is a **per-zone hash**, never the uid. The host is a place where
 * untrusted game code runs; handing it durable identity would make the sim isolate a
 * privacy boundary as well as a safety one, and one cage should not have two jobs. The
 * hash is stable for one person in one zone (so a reconnect returns to the same seat)
 * and uncorrelatable across zones, which is exactly the `ownerTag` design P2 landed on.
 */

/** Ten minutes: long enough to survive a slow load and a reconnect, short enough that a
 *  leaked ticket is a nuisance rather than a standing key to somebody's seat. */
export const ZONE_TICKET_TTL_MS = 10 * 60_000;

const SCOPE = 'zone-ticket-v1';
const GUEST_PREFIX = 'guest:';

export class InvalidZoneTicketError extends Error {
  constructor(message = 'invalid zone ticket') {
    super(message);
    this.name = 'InvalidZoneTicketError';
  }
}

export interface ZoneTicketClaims {
  zone: string;
  slug: string;
  /** Per-zone pseudonymous identity. Stable for one person in one zone, nowhere else. */
  player: string;
  expiresAt: number;
}

/**
 * The identity the host is told about, derived rather than passed through.
 *
 * Salted with the zone id so the same person is a different string in every zone — no
 * game, and no compromised host, can correlate its visitors against another zone's. The
 * secret is in the hash as well, so the mapping cannot be recomputed by anyone holding
 * only a uid and a zone name.
 */
export function zonePlayerTag(uid: string, zone: string, secret: string): string {
  return createHmac('sha256', secret).update(`zone-player-v1:${zone}:${uid}`).digest('hex').slice(0, 24);
}

/** A guest's tag, which is per-connection rather than per-person: they have no identity
 *  to be stable against, and inventing one would be the opposite of the guest ethos. */
export function guestPlayerTag(nonce: string): string {
  return `${GUEST_PREFIX}${nonce.slice(0, 24)}`;
}

export function isGuestTag(player: string): boolean {
  return player.startsWith(GUEST_PREFIX);
}

function sign(zone: string, slug: string, player: string, expiresAt: number, secret: string): string {
  return createHmac('sha256', secret).update(`${SCOPE}:${zone}:${slug}:${player}:${expiresAt}`).digest('hex');
}

export function mintZoneTicket(claims: ZoneTicketClaims, secret: string): string {
  const { zone, slug, player, expiresAt } = claims;
  const signature = sign(zone, slug, player, expiresAt, secret);
  return Buffer.from(`${zone}.${slug}.${player}.${expiresAt}.${signature}`, 'utf8').toString('base64url');
}

/**
 * Verifies a ticket presented on the socket. Throws rather than returning null, so a
 * caller cannot forget to check — the party token code made the same call.
 */
export function verifyZoneTicket(ticket: string, secret: string, now: number = Date.now()): ZoneTicketClaims {
  if (typeof ticket !== 'string' || ticket.length > 512) throw new InvalidZoneTicketError();

  let decoded: string;
  try {
    decoded = Buffer.from(ticket, 'base64url').toString('utf8');
  } catch {
    throw new InvalidZoneTicketError();
  }

  const parts = decoded.split('.');
  if (parts.length !== 5) throw new InvalidZoneTicketError();
  const [zone, slug, player, expiresAtRaw, signature] = parts;
  if (!zone || !slug || !player || !/^\d+$/.test(expiresAtRaw) || !/^[a-f0-9]{64}$/i.test(signature)) {
    throw new InvalidZoneTicketError();
  }

  const expiresAt = Number.parseInt(expiresAtRaw, 10);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) throw new InvalidZoneTicketError();

  const expected = sign(zone, slug, player, expiresAt, secret);
  const actualBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw new InvalidZoneTicketError();
  }

  return { zone, slug, player, expiresAt };
}
