import { describe, expect, it } from 'vitest';
import { parseZoneSchema, validateZoneInput, type ZoneSchema } from './zone-schema.js';

/**
 * A zone declaration is the vocabulary the server will accept and feed to a simulation
 * it is arbitrating with, so the parser fails closed: anything it cannot make complete
 * sense of yields no zone at all. That is P2's lesson, and it matters more here — a
 * half-understood declaration would mean admitting an event the sim was never written
 * to receive.
 */

const emberWatch = {
  tickHz: 10,
  maxPlayers: 4,
  inputs: [
    { k: 'move', type: 'enum', values: ['n', 's', 'e', 'w'] },
    { k: 'douse', type: 'none' },
  ],
};

describe('parseZoneSchema', () => {
  it('parses the reference game s declaration', () => {
    expect(parseZoneSchema(emberWatch)).toEqual({
      tickHz: 10,
      maxPlayers: 4,
      inputs: [
        { k: 'move', type: 'enum', values: ['n', 's', 'e', 'w'] },
        { k: 'douse', type: 'none' },
      ],
    });
  });

  it('refuses a tick rate outside the contract', () => {
    // The latency tolerance P3 rests on comes from slow ticks. A game asking for 60 Hz
    // has designed that tolerance away, and the contract says so rather than coping.
    for (const tickHz of [1, 3, 30, 60, 10.5, '10', null, undefined]) {
      expect(parseZoneSchema({ ...emberWatch, tickHz }), String(tickHz)).toBeNull();
    }
  });

  it('refuses a seat count no zone could hold', () => {
    for (const maxPlayers of [0, -1, 17, 2.5, '4', null]) {
      expect(parseZoneSchema({ ...emberWatch, maxPlayers }), String(maxPlayers)).toBeNull();
    }
  });

  it('refuses a declaration that claims a reserved kind', () => {
    // `join` and `leave` are how the platform tells a sim who arrived. A game declaring
    // one would make an arrival something a client could assert.
    for (const k of ['join', 'leave']) {
      expect(parseZoneSchema({ ...emberWatch, inputs: [{ k, type: 'none' }] }), k).toBeNull();
    }
  });

  it('refuses a duplicate kind rather than picking one', () => {
    const inputs = [
      { k: 'move', type: 'enum', values: ['n'] },
      { k: 'move', type: 'none' },
    ];
    expect(parseZoneSchema({ ...emberWatch, inputs })).toBeNull();
  });

  it('refuses an empty or over-long vocabulary', () => {
    expect(parseZoneSchema({ ...emberWatch, inputs: [] })).toBeNull();
    const many = Array.from({ length: 13 }, (_unused, index) => ({ k: `act${index}`, type: 'none' }));
    expect(parseZoneSchema({ ...emberWatch, inputs: many })).toBeNull();
  });

  it('refuses an int range that is not a range', () => {
    expect(parseZoneSchema({ ...emberWatch, inputs: [{ k: 'lane', type: 'int', min: 5, max: 1 }] })).toBeNull();
    expect(parseZoneSchema({ ...emberWatch, inputs: [{ k: 'lane', type: 'int', min: 0 }] })).toBeNull();
    expect(parseZoneSchema({ ...emberWatch, inputs: [{ k: 'lane', type: 'int', min: 0.5, max: 3 }] })).toBeNull();
    expect(parseZoneSchema({ ...emberWatch, inputs: [{ k: 'lane', type: 'int', min: 0, max: 8 }] })).not.toBeNull();
  });

  it('refuses enum values that are not short plain tokens', () => {
    for (const values of [[], ['n', 'n'], ['a b'], ['<script>'], ['x'.repeat(17)], 'n', [42]]) {
      const inputs = [{ k: 'move', type: 'enum', values }];
      expect(parseZoneSchema({ ...emberWatch, inputs }), JSON.stringify(values)).toBeNull();
    }
  });

  it('yields no zone at all when one input is bad, not a zone with the good ones', () => {
    const inputs = [
      { k: 'move', type: 'enum', values: ['n'] },
      { k: 'douse', type: 'wat' },
    ];
    expect(parseZoneSchema({ ...emberWatch, inputs })).toBeNull();
  });

  it('refuses anything that is not an object', () => {
    for (const raw of [null, undefined, 'zone', 42, [emberWatch]]) {
      expect(parseZoneSchema(raw), String(raw)).toBeNull();
    }
  });
});

describe('validateZoneInput', () => {
  const schema = parseZoneSchema({
    tickHz: 10,
    maxPlayers: 4,
    inputs: [
      { k: 'move', type: 'enum', values: ['n', 's'] },
      { k: 'douse', type: 'none' },
      { k: 'lane', type: 'int', min: 0, max: 8 },
    ],
  }) as ZoneSchema;

  it('accepts exactly what was declared', () => {
    expect(validateZoneInput(schema, 'move', 'n')).toEqual({ k: 'move', v: 'n' });
    expect(validateZoneInput(schema, 'douse', undefined)).toEqual({ k: 'douse' });
    expect(validateZoneInput(schema, 'lane', 3)).toEqual({ k: 'lane', v: 3 });
  });

  it('refuses an undeclared kind', () => {
    expect(validateZoneInput(schema, 'teleport', undefined)).toBeNull();
    expect(validateZoneInput(schema, 'join', undefined)).toBeNull();
  });

  it('refuses rather than clamps an out-of-range int', () => {
    // Clamping would make the sim act on an intent nobody had: a client that sent 999
    // for a 0-8 lane meant something, and quietly turning it into 8 is a decision the
    // server has no business making. The world schema refuses rather than repairs too.
    expect(validateZoneInput(schema, 'lane', 999)).toBeNull();
    expect(validateZoneInput(schema, 'lane', -1)).toBeNull();
    expect(validateZoneInput(schema, 'lane', 2.5)).toBeNull();
  });

  it('refuses an enum value outside the declared set', () => {
    expect(validateZoneInput(schema, 'move', 'e')).toBeNull();
    expect(validateZoneInput(schema, 'move', 0)).toBeNull();
    expect(validateZoneInput(schema, 'move', undefined)).toBeNull();
  });

  it('refuses a value on a valueless kind', () => {
    // The client and the declaration disagree about what this event is; guessing which
    // one is right is how a sim gets fed something no branch was written for.
    expect(validateZoneInput(schema, 'douse', 1)).toBeNull();
    expect(validateZoneInput(schema, 'douse', 'now')).toBeNull();
  });
});
