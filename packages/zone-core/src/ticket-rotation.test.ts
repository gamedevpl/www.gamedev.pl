import { describe, expect, it } from 'vitest';
import { InvalidZoneTicketError, mintZoneTicket, verifyZoneTicket } from './ticket.js';

const NOW = 1_800_000_000_000;
const OLD_KEY = 'old-ticket-key';
const ticketFor = (expiresAt = NOW + 60_000) =>
  mintZoneTicket({ zone: 'ember-watch', slug: 'ember-watch', player: 'abc123', expiresAt }, OLD_KEY);

describe('zone ticket key rotation', () => {
  it('accepts a ticket signed by the previous key', () => {
    expect(verifyZoneTicket(ticketFor(), 'new-ticket-key', NOW, OLD_KEY)).toMatchObject({ zone: 'ember-watch' });
  });

  it('rejects a wrong previous key and an expired ticket', () => {
    expect(() => verifyZoneTicket(ticketFor(), 'new-ticket-key', NOW, 'wrong-key')).toThrow(InvalidZoneTicketError);
    expect(() => verifyZoneTicket(ticketFor(NOW - 1), 'new-ticket-key', NOW, OLD_KEY)).toThrow(InvalidZoneTicketError);
  });
});
