import { describe, expect, it } from 'vitest';
import {
  guestPlayerTag,
  InvalidZoneTicketError,
  isGuestTag,
  mintZoneTicket,
  verifyZoneTicket,
  zonePlayerTag,
} from './zone-ticket.js';

/**
 * A zone ticket is the only thing that crosses from the API — which knows who you are —
 * to the zone host, which runs untrusted game code and should learn as little as
 * possible. So these tests are about two things: that it cannot be forged, and that it
 * does not carry an identity.
 */

const SECRET = 'test-secret-not-a-real-one';
const NOW = 1_800_000_000_000;

function ticketFor(overrides: Partial<Parameters<typeof mintZoneTicket>[0]> = {}) {
  return mintZoneTicket(
    { zone: 'ember-watch', slug: 'ember-watch', player: 'abc123', expiresAt: NOW + 60_000, ...overrides },
    SECRET,
  );
}

describe('zone tickets', () => {
  it('round-trips the claims it was minted with', () => {
    expect(verifyZoneTicket(ticketFor(), SECRET, NOW)).toEqual({
      zone: 'ember-watch',
      slug: 'ember-watch',
      player: 'abc123',
      expiresAt: NOW + 60_000,
    });
  });

  it('refuses a ticket signed with a different secret', () => {
    expect(() => verifyZoneTicket(ticketFor(), 'other-secret', NOW)).toThrow(InvalidZoneTicketError);
  });

  it('refuses a ticket whose claims were edited', () => {
    // The shape of the attack: take your own ticket for a zone you may enter and
    // rewrite the zone, the game, or who you are.
    const decoded = Buffer.from(ticketFor(), 'base64url').toString('utf8');
    const parts = decoded.split('.');
    for (const index of [0, 1, 2, 3]) {
      const tampered = [...parts];
      tampered[index] = index === 3 ? String(NOW + 999_000) : 'elsewhere';
      const forged = Buffer.from(tampered.join('.'), 'utf8').toString('base64url');
      expect(() => verifyZoneTicket(forged, SECRET, NOW), `field ${index}`).toThrow(InvalidZoneTicketError);
    }
  });

  it('refuses an expired ticket', () => {
    const ticket = ticketFor({ expiresAt: NOW - 1 });
    expect(() => verifyZoneTicket(ticket, SECRET, NOW)).toThrow(InvalidZoneTicketError);
  });

  it('refuses malformed input without throwing anything but its own error', () => {
    for (const value of ['', 'not-base64url!!', 'YWJj', 'a'.repeat(600)]) {
      expect(() => verifyZoneTicket(value, SECRET, NOW), JSON.stringify(value)).toThrow(InvalidZoneTicketError);
    }
  });

  it('is not interchangeable with a party room token', () => {
    // Both are keyed off SESSION_SECRET. A ticket that could be replayed as a room
    // token would make one secret's blast radius the whole platform, so the scope
    // string is what keeps them apart — a room-shaped payload must not verify here.
    const roomShaped = Buffer.from(`ABC123.${NOW + 60_000}.${'0'.repeat(64)}`, 'utf8').toString('base64url');
    expect(() => verifyZoneTicket(roomShaped, SECRET, NOW)).toThrow(InvalidZoneTicketError);
  });
});

describe('player tags', () => {
  it('gives one person the same seat in one zone across reconnects', () => {
    expect(zonePlayerTag('g:123', 'ember-watch', SECRET)).toBe(zonePlayerTag('g:123', 'ember-watch', SECRET));
  });

  it('gives one person a different tag in every zone', () => {
    // The P2 ownerTag design, applied to a cage: no game and no compromised host can
    // correlate its visitors against another zone's.
    expect(zonePlayerTag('g:123', 'ember-watch', SECRET)).not.toBe(zonePlayerTag('g:123', 'other-zone', SECRET));
  });

  it('never contains the uid it was derived from', () => {
    const tag = zonePlayerTag('g:1234567890', 'ember-watch', SECRET);
    expect(tag).not.toContain('1234567890');
    expect(tag).toMatch(/^[a-f0-9]{24}$/);
  });

  it('cannot be recomputed without the secret', () => {
    expect(zonePlayerTag('g:123', 'ember-watch', SECRET)).not.toBe(zonePlayerTag('g:123', 'ember-watch', 'guessed'));
  });

  it('marks a guest as one, so the host can tell durable from not', () => {
    const guest = guestPlayerTag('a'.repeat(32));
    expect(isGuestTag(guest)).toBe(true);
    expect(isGuestTag(zonePlayerTag('g:123', 'ember-watch', SECRET))).toBe(false);
  });
});
