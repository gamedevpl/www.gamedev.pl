import { describe, expect, it } from 'vitest';
import {
  createNodeVmCage,
  guestPlayerTag,
  mintZoneTicket,
  parseZoneSchema,
  ZONE_TICKET_TTL_MS,
  type SimSource,
  type ZoneOutboundFrame,
  type ZoneSchema,
  type ZoneSnapshotStore,
} from '@gamedevpl/zone-core';
import { ZoneHost, type ZoneConnection } from './host.js';

const SECRET = 'dev-session-secret-change-me';
const SCHEMA = parseZoneSchema({
  tickHz: 10,
  maxPlayers: 3,
  inputs: [{ k: 'douse', type: 'none' }],
}) as ZoneSchema;
const SIM = `var __SIM_BUNDLE__ = (function () {
  function init() { return {}; }
  function tick(state) { return state; }
  function wake(state) { return state; }
  return { init: init, tick: tick, wake: wake };
})();`;
const SIM_MATH = `globalThis.__SIM_MATH__ = {};`;

function ticketFor(player: string): string {
  return mintZoneTicket(
    { zone: 'ember-watch', slug: 'ember-watch', player, expiresAt: Date.now() + ZONE_TICKET_TTL_MS },
    SECRET,
  );
}

function connection(): ZoneConnection & { frames: Array<ZoneOutboundFrame | unknown> } {
  const result = {
    frames: [] as Array<ZoneOutboundFrame | unknown>,
    send(frame: ZoneOutboundFrame | unknown) {
      result.frames.push(frame);
    },
    close() {},
  };
  return result;
}

describe('guest authority', () => {
  it('lets guests observe the world but drops their inputs', async () => {
    let now = 5_000_000;
    const source: SimSource = { load: async () => ({ bundleJs: SIM, simMathJs: SIM_MATH }) };
    const store: ZoneSnapshotStore = { load: async () => null, save: async () => {} };
    const host = new ZoneHost({
      cage: createNodeVmCage(),
      source,
      store,
      schemas: { getSchema: async () => SCHEMA },
      secret: SECRET,
      now: () => now,
    });
    const guest = connection();
    const member = connection();
    const guestSeat = await host.admit(ticketFor(guestPlayerTag('guest-nonce')), guest);
    const memberSeat = await host.admit(ticketFor('member'), member);

    now += 100;
    host.pump(now);
    guest.frames.length = 0;

    host.input('ember-watch', guestSeat.slot, 'douse', undefined);
    host.input('ember-watch', memberSeat.slot, 'douse', undefined);
    now += 100;
    host.pump(now);

    const delta = guest.frames.find(
      (frame): frame is { t: 'delta'; ev: Array<{ slot: number; k: string }> } =>
        typeof frame === 'object' && frame !== null && 't' in frame && frame.t === 'delta',
    );
    expect(delta?.ev).toEqual([{ slot: memberSeat.slot, k: 'douse' }]);

    await host.shutdown();
  });
});
