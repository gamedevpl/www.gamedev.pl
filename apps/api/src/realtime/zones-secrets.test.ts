import { describe, expect, it } from 'vitest';
import { verifyZoneTicket, zonePlayerTag, type ZoneSchema } from '@gamedevpl/zone-core';
import { buildApp } from '../platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import { InMemoryStore } from '../platform/store.js';

describe('zone signing keys', () => {
  it('uses separate keys for the ticket and the player tag', async () => {
    const sessionSecret = 'session-key';
    const ticketSecret = 'ticket-key';
    const playerTagSecret = 'player-key';
    const schema: ZoneSchema = { tickHz: 10, maxPlayers: 4, inputs: [] };
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:ada' });
    const app = await buildApp({
      store,
      sessionSecret,
      zoneRoutes: {
        hostUrl: 'https://world.example.test',
        zones: { getSchema: async () => schema },
        ticketSecret,
        playerTagSecret,
      },
    });
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/games/ember-watch/zone/ticket',
        headers: { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken('g:ada', sessionSecret)}` },
      });
      expect(response.statusCode).toBe(200);
      const ticket = response.json().ticket as string;
      const claims = verifyZoneTicket(ticket, ticketSecret);
      expect(claims.player).toBe(zonePlayerTag('g:ada', 'ember-watch', playerTagSecret));
      expect(claims.player).not.toBe(zonePlayerTag('g:ada', 'ember-watch', ticketSecret));
      expect(() => verifyZoneTicket(ticket, playerTagSecret)).toThrow();
    } finally {
      await app.close();
    }
  });
});
