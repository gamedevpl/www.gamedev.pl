import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Zone admission tickets carry a zone, game, per-zone player tag, and expiry.
 * The API mints them; the separate host verifies them without a session.
 * Ticket and player-tag keys are separate from the session key.
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
 * playerTagSecret is separate from the ticket signing key, so the mapping cannot be
 * recomputed by anyone holding only a uid and a zone name.
 */
export function zonePlayerTag(uid: string, zone: string, playerTagSecret: string): string {
  return createHmac('sha256', playerTagSecret).update(`zone-player-v1:${zone}:${uid}`).digest('hex').slice(0, 24);
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

export function mintZoneTicket(claims: ZoneTicketClaims, ticketSecret: string): string {
  const { zone, slug, player, expiresAt } = claims;
  const signature = sign(zone, slug, player, expiresAt, ticketSecret);
  return Buffer.from(`${zone}.${slug}.${player}.${expiresAt}.${signature}`, 'utf8').toString('base64url');
}

/**
 * Verifies a ticket presented on the socket. Throws rather than returning null, so a
 * caller cannot forget to check — the party token code made the same call.
 */
export function verifyZoneTicket(
  ticket: string,
  ticketSecret: string,
  now: number = Date.now(),
  prevTicketSecret?: string,
): ZoneTicketClaims {
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

  const actualBuffer = Buffer.from(signature, 'utf8');
  const matches = (secret: string) => {
    const expectedBuffer = Buffer.from(sign(zone, slug, player, expiresAt, secret), 'utf8');
    return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
  };
  if (!matches(ticketSecret) && (!prevTicketSecret || !matches(prevTicketSecret))) {
    throw new InvalidZoneTicketError();
  }

  return { zone, slug, player, expiresAt };
}
