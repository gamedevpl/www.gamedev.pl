import { describe, expect, it } from 'vitest';
import {
  createNodeVmCage,
  guestPlayerTag,
  IDLE_SEAT_MS,
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
  function init() { return { acts: 0 }; }
  function tick(state, events) {
    for (var i = 0; i < events.length; i++) if (events[i].k === 'douse') state.acts++;
    return state;
  }
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

function connection(): ZoneConnection & { frames: Array<ZoneOutboundFrame | unknown>; closedWith?: string } {
  const result: ZoneConnection & { frames: Array<ZoneOutboundFrame | unknown>; closedWith?: string } = {
    frames: [] as Array<ZoneOutboundFrame | unknown>,
    send(frame: ZoneOutboundFrame | unknown) {
      result.frames.push(frame);
    },
    close(reason: string) {
      result.closedWith = reason;
    },
  };
  return result;
}

function makeHost(clock: { now: number }) {
  const source: SimSource = { load: async () => ({ bundleJs: SIM, simMathJs: SIM_MATH }) };
  const store: ZoneSnapshotStore = { load: async () => null, save: async () => {} };
  return new ZoneHost({
    cage: createNodeVmCage(),
    source,
    store,
    schemas: { getSchema: async () => SCHEMA },
    secret: SECRET,
    now: () => clock.now,
  });
}

function lastState(frames: Array<ZoneOutboundFrame | unknown>): { acts: number } {
  const snaps = frames.filter(
    (frame): frame is { t: 'snap'; state: string } =>
      typeof frame === 'object' && frame !== null && 't' in frame && frame.t === 'snap',
  );
  return JSON.parse(snaps[snaps.length - 1]!.state) as { acts: number };
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

  // Dropped input must still count as presence, or every guest times out.
  it('keeps a guest who keeps sending seated past the idle limit, still powerless', async () => {
    const clock = { now: 5_000_000 };
    const host = makeHost(clock);
    const guest = connection();
    const member = connection();
    const guestSeat = await host.admit(ticketFor(guestPlayerTag('guest-nonce')), guest);
    const memberSeat = await host.admit(ticketFor('member'), member);

    let memberActs = 0;
    for (let elapsed = 0; elapsed <= IDLE_SEAT_MS + 60_000; elapsed += 1_000) {
      if (elapsed % 10_000 === 0) {
        host.input('ember-watch', guestSeat.slot, 'douse', undefined);
        host.input('ember-watch', memberSeat.slot, 'douse', undefined);
        memberActs++;
      }
      clock.now += 1_000;
      host.pump(clock.now);
    }

    expect(guest.closedWith).toBeUndefined();
    expect(member.closedWith).toBeUndefined();
    host.resync('ember-watch', guestSeat.slot);
    expect(lastState(guest.frames).acts).toBe(memberActs);

    await host.shutdown();
  });

  it('still reaps a guest who sends nothing, or only undeclared frames', async () => {
    const clock = { now: 5_000_000 };
    const host = makeHost(clock);
    const guest = connection();
    const guestSeat = await host.admit(ticketFor(guestPlayerTag('guest-quiet')), guest);

    for (let elapsed = 0; elapsed <= IDLE_SEAT_MS + 1_000; elapsed += 1_000) {
      if (elapsed % 10_000 === 0) host.input('ember-watch', guestSeat.slot, 'teleport', 1);
      clock.now += 1_000;
      host.pump(clock.now);
    }

    expect(guest.closedWith).toBe('idle');
    await host.shutdown();
  });
});
