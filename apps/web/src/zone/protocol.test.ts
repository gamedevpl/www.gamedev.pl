import { describe, expect, it } from 'vitest';
import { BRIDGE_NAMESPACE } from '../mp/protocol.js';
import {
  MAX_STATE_BYTES,
  parseZoneBridgeMessage,
  parseZoneServerFrame,
  zoneSocketUrl,
  ZONE_PROTOCOL_VERSION,
} from './protocol.js';

/**
 * Both ends of the zone protocol carry hostile data — a modified client or a broken host
 * on one side, generated game code on the other — so the parsers are the security
 * surface, not a convenience. These tests are mostly about what must be *refused*.
 */

function wire(payload: Record<string, unknown>) {
  return { v: ZONE_PROTOCOL_VERSION, ...payload };
}

function bridge(payload: Record<string, unknown>) {
  return { ns: BRIDGE_NAMESPACE, v: ZONE_PROTOCOL_VERSION, ...payload };
}

describe('parseZoneServerFrame', () => {
  it('accepts the frames a host may send', () => {
    expect(
      parseZoneServerFrame(
        wire({ t: 'welcome', slot: 0, zone: 'ember-watch', slug: 'ember-watch', tickHz: 10, maxPlayers: 4 }),
      ),
    ).toEqual({ t: 'welcome', slot: 0, zone: 'ember-watch', slug: 'ember-watch', tickHz: 10, maxPlayers: 4 });

    expect(parseZoneServerFrame(wire({ t: 'snap', tick: 12, seed: 7, draws: 340, state: '{"t":12}' }))).toEqual({
      t: 'snap',
      tick: 12,
      seed: 7,
      draws: 340,
      state: '{"t":12}',
    });

    expect(parseZoneServerFrame(wire({ t: 'delta', tick: 13, ev: [{ slot: 1, k: 'move', v: 'n' }] }))).toEqual({
      t: 'delta',
      tick: 13,
      ev: [{ slot: 1, k: 'move', v: 'n' }],
    });

    expect(parseZoneServerFrame(wire({ t: 'roster', slots: [{ slot: 0, nick: 'ada' }] }))).toEqual({
      t: 'roster',
      slots: [{ slot: 0, nick: 'ada' }],
    });

    expect(parseZoneServerFrame(wire({ t: 'closed', reason: 'hibernating' }))).toEqual({
      t: 'closed',
      reason: 'hibernating',
    });
  });

  it('drops anything off-version or unrecognized', () => {
    expect(parseZoneServerFrame({ t: 'delta', tick: 1, ev: [] })).toBeNull();
    expect(parseZoneServerFrame(wire({ t: 'nonsense' }))).toBeNull();
    expect(parseZoneServerFrame(null)).toBeNull();
    expect(parseZoneServerFrame([wire({ t: 'delta', tick: 1, ev: [] })])).toBeNull();
  });

  it('refuses a tick rate outside the contract', () => {
    // 60 Hz is the shape of the mistake: a host claiming it would have the client
    // predicting at a rate the sim contract deliberately does not allow.
    for (const tickHz of [0, 1, 30, 60, 10.5, '10']) {
      const frame = wire({ t: 'welcome', slot: 0, zone: 'z', slug: 'z', tickHz, maxPlayers: 2 });
      expect(parseZoneServerFrame(frame), String(tickHz)).toBeNull();
    }
  });

  it('refuses a seat outside the contract, in either field', () => {
    expect(
      parseZoneServerFrame(wire({ t: 'welcome', slot: 16, zone: 'z', slug: 'z', tickHz: 10, maxPlayers: 4 })),
    ).toBeNull();
    expect(
      parseZoneServerFrame(wire({ t: 'welcome', slot: -1, zone: 'z', slug: 'z', tickHz: 10, maxPlayers: 4 })),
    ).toBeNull();
    expect(
      parseZoneServerFrame(wire({ t: 'welcome', slot: 0, zone: 'z', slug: 'z', tickHz: 10, maxPlayers: 17 })),
    ).toBeNull();
    expect(
      parseZoneServerFrame(wire({ t: 'welcome', slot: 0, zone: 'z', slug: 'z', tickHz: 10, maxPlayers: 0 })),
    ).toBeNull();
  });

  it('drops a whole delta when any one event is malformed', () => {
    // All-or-nothing on purpose. Keeping the good events would hand the sim a tick the
    // host never ran, and the client would then diverge without ever being told.
    const frame = wire({
      t: 'delta',
      tick: 4,
      ev: [
        { slot: 0, k: 'move', v: 'n' },
        { slot: 0, k: 'move', v: {} },
      ],
    });
    expect(parseZoneServerFrame(frame)).toBeNull();
  });

  it('drops a delta whose event count no zone could produce', () => {
    const ev = Array.from({ length: 200 }, () => ({ slot: 0, k: 'douse' }));
    expect(parseZoneServerFrame(wire({ t: 'delta', tick: 1, ev }))).toBeNull();
  });

  it('drops a snapshot larger than the contract allows', () => {
    const oversize = 'x'.repeat(MAX_STATE_BYTES + 1);
    expect(parseZoneServerFrame(wire({ t: 'snap', tick: 1, seed: 1, draws: 0, state: oversize }))).toBeNull();
    const legal = 'x'.repeat(1024);
    expect(parseZoneServerFrame(wire({ t: 'snap', tick: 1, seed: 1, draws: 0, state: legal }))).not.toBeNull();
  });

  it('drops a snapshot missing the draw count', () => {
    // Without it a client cannot put its predictor on the sequence the host is on, so a
    // snapshot that omits it is not a snapshot the client can use — it is a desync
    // waiting to be blamed on something else.
    expect(parseZoneServerFrame(wire({ t: 'snap', tick: 1, seed: 1, state: '{}' }))).toBeNull();
    expect(parseZoneServerFrame(wire({ t: 'snap', tick: 1, seed: 1, draws: -3, state: '{}' }))).toBeNull();
  });

  it('carries a checkpoint hash only when it looks like one', () => {
    expect(parseZoneServerFrame(wire({ t: 'delta', tick: 1, ev: [], h: 'deadbeef' }))).toMatchObject({ h: 'deadbeef' });
    expect(parseZoneServerFrame(wire({ t: 'delta', tick: 1, ev: [], h: '<script>' }))).not.toHaveProperty('h');
  });
});

describe('parseZoneBridgeMessage', () => {
  it('accepts the three things a game may say', () => {
    expect(parseZoneBridgeMessage(bridge({ t: 'zone:hello' }), BRIDGE_NAMESPACE)).toEqual({ t: 'zone:hello' });
    expect(parseZoneBridgeMessage(bridge({ t: 'zone:resync' }), BRIDGE_NAMESPACE)).toEqual({ t: 'zone:resync' });
    expect(parseZoneBridgeMessage(bridge({ t: 'zone:send', k: 'move', d: 'n' }), BRIDGE_NAMESPACE)).toEqual({
      t: 'zone:send',
      k: 'move',
      d: 'n',
    });
    expect(parseZoneBridgeMessage(bridge({ t: 'zone:send', k: 'douse' }), BRIDGE_NAMESPACE)).toEqual({
      t: 'zone:send',
      k: 'douse',
    });
  });

  it('carries an input value under `d`, because `v` is the version', () => {
    // Party mode learned this on a key-release of 0 and named the field `d` for it. A
    // zone would have learned it on the first enum input — `{v:'n'}` overwriting the
    // protocol version, the frame dropped as a version mismatch, and the symptom an
    // intermittent desync nobody would trace back to a field name.
    const collided = { ns: BRIDGE_NAMESPACE, v: 'n', t: 'zone:send', k: 'move' };
    expect(parseZoneBridgeMessage(collided, BRIDGE_NAMESPACE)).toBeNull();
    expect(parseZoneBridgeMessage(bridge({ t: 'zone:send', k: 'move', d: 'n' }), BRIDGE_NAMESPACE)).toMatchObject({
      d: 'n',
    });
  });

  it('refuses the reserved kinds, which are the platform speaking', () => {
    // The one authority rule the shell enforces itself. A client that could send `join`
    // could conjure a player into the world; one that could send `leave` could evict a
    // real one. Everything else about validity is the host's job.
    expect(parseZoneBridgeMessage(bridge({ t: 'zone:send', k: 'join' }), BRIDGE_NAMESPACE)).toBeNull();
    expect(parseZoneBridgeMessage(bridge({ t: 'zone:send', k: 'leave', d: 3 }), BRIDGE_NAMESPACE)).toBeNull();
  });

  it('never lets a game name its own slot', () => {
    // A slot is assigned by the host and attached there. Anything a game sends under
    // that name is ignored rather than trusted — the parsed message has no slot at all.
    const parsed = parseZoneBridgeMessage(bridge({ t: 'zone:send', k: 'move', d: 'n', slot: 3 }), BRIDGE_NAMESPACE);
    expect(parsed).toEqual({ t: 'zone:send', k: 'move', d: 'n' });
    expect(parsed).not.toHaveProperty('slot');
  });

  it('drops values a declared input could never legally hold', () => {
    for (const d of [{}, [], null, 'x'.repeat(33), Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(parseZoneBridgeMessage(bridge({ t: 'zone:send', k: 'move', d }), BRIDGE_NAMESPACE), String(d)).toBeNull();
    }
  });

  it('drops a kind no declaration could have named', () => {
    for (const k of ['', 'x'.repeat(17), 42, null, undefined]) {
      expect(parseZoneBridgeMessage(bridge({ t: 'zone:send', k }), BRIDGE_NAMESPACE), String(k)).toBeNull();
    }
  });

  it('drops traffic outside the namespace or protocol version', () => {
    expect(parseZoneBridgeMessage({ t: 'zone:hello' }, BRIDGE_NAMESPACE)).toBeNull();
    expect(
      parseZoneBridgeMessage({ ns: 'other', v: ZONE_PROTOCOL_VERSION, t: 'zone:hello' }, BRIDGE_NAMESPACE),
    ).toBeNull();
    expect(parseZoneBridgeMessage({ ns: BRIDGE_NAMESPACE, v: 99, t: 'zone:hello' }, BRIDGE_NAMESPACE)).toBeNull();
  });
});

describe('zoneSocketUrl', () => {
  it('dials the host it was given rather than deriving one', () => {
    // The zone host is a separate service on its own origin, and this is the seam the
    // zone directory slots into when one instance stops being enough.
    expect(zoneSocketUrl('https://world.example.run.app')).toBe('wss://world.example.run.app/zone/ws');
    expect(zoneSocketUrl('http://localhost:8081/')).toBe('ws://localhost:8081/zone/ws');
  });
});
