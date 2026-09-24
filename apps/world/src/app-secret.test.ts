import { afterEach, expect, it, vi } from 'vitest';
import { createNodeVmCage, mintZoneTicket } from '@gamedevpl/zone-core';
import { buildWorldApp, type WorldAppOptions } from './app.js';

afterEach(() => vi.unstubAllEnvs());

it('requires a zone ticket key even when a session key is present', async () => {
  vi.stubEnv('ZONE_TICKET_SECRET', undefined);
  vi.stubEnv('SESSION_SECRET', 'session-key');
  await expect(buildWorldApp({} as WorldAppOptions)).rejects.toThrow('ZONE_TICKET_SECRET is required');
});

it('passes an explicit previous ticket key to the host', async () => {
  vi.stubEnv('ZONE_TICKET_SECRET_PREV', undefined);
  const built = await buildWorldApp({
    cage: createNodeVmCage(),
    source: { load: async () => null },
    store: { load: async () => null, save: async () => {} },
    schemas: { getSchema: async () => null },
    secret: 'new-ticket-key',
    prevSecret: 'previous-ticket-key',
  });
  try {
    const ticket = mintZoneTicket(
      { zone: 'test-zone', slug: 'test-game', player: 'player-a', expiresAt: Date.now() + 60_000 },
      'previous-ticket-key',
    );
    await expect(built.host.admit(ticket, { send: () => {}, close: () => {} })).rejects.toMatchObject({
      reason: 'zone_not_found',
    });
  } finally {
    await built.app.close();
  }
});
