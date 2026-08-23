import { describe, expect, it } from 'vitest';
import {
  isValidWorldKey,
  MAX_WORLD_ENTRIES_PER_PLAYER,
  MAX_WORLD_TEXT_LENGTH,
  parseWorldSchema,
  validateWorldEntry,
  MAX_PRESENCE_GRID,
  worldOwnerTag,
  type WorldSchema,
} from './world-schema.js';

/**
 * This file is the boundary between a game's declaration and other players' screens.
 * Almost every test below is a rejection, because the failure that matters here is not
 * "a valid entry was refused" — the game author sees that immediately — but "an invalid
 * one was accepted", which nobody sees until it is already rendering for strangers.
 */

const garden: WorldSchema = {
  maxPerPlayer: 3,
  fields: {
    plant: { type: 'enum', values: ['oak', 'fern', 'rose'] },
    height: { type: 'int', min: 0, max: 9 },
    note: { type: 'text', max: 40 },
    watered: { type: 'bool' },
  },
};

describe('parseWorldSchema', () => {
  it('reads a well-formed declaration', () => {
    const schema = parseWorldSchema({
      maxPerPlayer: 3,
      fields: {
        plant: { type: 'enum', values: ['oak', 'fern'] },
        height: { type: 'int', min: 0, max: 9 },
        lean: { type: 'number', min: -1.5, max: 1.5 },
        note: { type: 'text', max: 40 },
        watered: { type: 'bool' },
      },
    });

    expect(schema?.maxPerPlayer).toBe(3);
    expect(Object.keys(schema!.fields).sort()).toEqual(['height', 'lean', 'note', 'plant', 'watered']);
  });

  it('refuses a declaration with no world at all', () => {
    expect(parseWorldSchema(undefined)).toBeNull();
    expect(parseWorldSchema(null)).toBeNull();
    expect(parseWorldSchema('garden')).toBeNull();
    expect(parseWorldSchema([])).toBeNull();
  });

  it('refuses a missing, zero, or oversized quota', () => {
    const fields = { note: { type: 'text', max: 10 } };
    expect(parseWorldSchema({ fields })).toBeNull();
    expect(parseWorldSchema({ fields, maxPerPlayer: 0 })).toBeNull();
    expect(parseWorldSchema({ fields, maxPerPlayer: 2.5 })).toBeNull();
    expect(parseWorldSchema({ fields, maxPerPlayer: MAX_WORLD_ENTRIES_PER_PLAYER + 1 })).toBeNull();
    // The quota is what bounds a griefer. A world without one is not a world we host.
    expect(parseWorldSchema({ fields, maxPerPlayer: Number.POSITIVE_INFINITY })).toBeNull();
  });

  it('refuses an empty or over-wide field set', () => {
    expect(parseWorldSchema({ maxPerPlayer: 1, fields: {} })).toBeNull();
    const wide: Record<string, unknown> = {};
    for (let index = 0; index < 13; index++) wide[`f${index}`] = { type: 'bool' };
    expect(parseWorldSchema({ maxPerPlayer: 1, fields: wide })).toBeNull();
  });

  it('refuses field names that are not plain lowerCamelCase', () => {
    for (const name of ['Plant', '_plant', 'plant-name', '1st', '', 'x'.repeat(25)]) {
      expect(parseWorldSchema({ maxPerPlayer: 1, fields: { [name]: { type: 'bool' } } })).toBeNull();
    }
  });

  it('refuses an unbounded number, which is how a plot ends up at coordinate 1e30', () => {
    expect(parseWorldSchema({ maxPerPlayer: 1, fields: { x: { type: 'int' } } })).toBeNull();
    expect(parseWorldSchema({ maxPerPlayer: 1, fields: { x: { type: 'int', min: 0 } } })).toBeNull();
    expect(parseWorldSchema({ maxPerPlayer: 1, fields: { x: { type: 'int', min: 5, max: 1 } } })).toBeNull();
    // An int field bounded by fractions would accept nothing its own type allows.
    expect(parseWorldSchema({ maxPerPlayer: 1, fields: { x: { type: 'int', min: 0.5, max: 9.5 } } })).toBeNull();
  });

  it('refuses unbounded or absurd text, the field strangers actually read', () => {
    expect(parseWorldSchema({ maxPerPlayer: 1, fields: { note: { type: 'text' } } })).toBeNull();
    expect(parseWorldSchema({ maxPerPlayer: 1, fields: { note: { type: 'text', max: 0 } } })).toBeNull();
    expect(
      parseWorldSchema({ maxPerPlayer: 1, fields: { note: { type: 'text', max: MAX_WORLD_TEXT_LENGTH + 1 } } }),
    ).toBeNull();
  });

  it('refuses a malformed enum', () => {
    const bad = [
      { type: 'enum' },
      { type: 'enum', values: [] },
      { type: 'enum', values: ['a', 'a'] },
      { type: 'enum', values: ['a', 42] },
      { type: 'enum', values: ['x'.repeat(33)] },
      { type: 'enum', values: Array.from({ length: 17 }, (_, index) => `v${index}`) },
    ];
    for (const spec of bad) {
      expect(parseWorldSchema({ maxPerPlayer: 1, fields: { pick: spec } })).toBeNull();
    }
  });

  it('refuses the whole declaration when one field is bad', () => {
    // Not a partial parse: a schema half-applied is a field nobody is validating, which
    // is the exact outcome the declaration exists to prevent.
    expect(
      parseWorldSchema({
        maxPerPlayer: 1,
        fields: { good: { type: 'bool' }, bad: { type: 'colour' } },
      }),
    ).toBeNull();
  });
});

describe('validateWorldEntry', () => {
  it('accepts and canonicalizes a good entry', () => {
    const result = validateWorldEntry(garden, {
      plant: 'oak',
      height: 3,
      note: '  hello neighbour  ',
      watered: true,
    });

    expect(result).toEqual({
      ok: true,
      fields: { plant: 'oak', height: 3, note: 'hello neighbour', watered: true },
      texts: ['hello neighbour'],
    });
  });

  it('requires every declared field', () => {
    // A partial entry leaves the game rendering a hole for some plots and not others —
    // a bug that only shows up once strangers' data is on screen.
    const result = validateWorldEntry(garden, { plant: 'oak', height: 1, watered: false });
    expect(result).toMatchObject({ ok: false });
    expect((result as { error: string }).error).toMatch(/note/);
  });

  it('refuses a field the schema never declared', () => {
    const result = validateWorldEntry(garden, {
      plant: 'oak',
      height: 1,
      note: 'hi',
      watered: false,
      secretPower: 99,
    });
    expect(result).toMatchObject({ ok: false });
    expect((result as { error: string }).error).toMatch(/secretPower/);
  });

  it('holds numbers to their declared type and range', () => {
    const base = { plant: 'oak', note: 'hi', watered: false };
    for (const height of [-1, 10, 2.5, '3', Number.NaN, Number.POSITIVE_INFINITY, null]) {
      expect(validateWorldEntry(garden, { ...base, height })).toMatchObject({ ok: false });
    }
    expect(validateWorldEntry(garden, { ...base, height: 0 })).toMatchObject({ ok: true });
    expect(validateWorldEntry(garden, { ...base, height: 9 })).toMatchObject({ ok: true });
  });

  it('holds an enum to its declared values', () => {
    const base = { height: 1, note: 'hi', watered: false };
    expect(validateWorldEntry(garden, { ...base, plant: 'triffid' })).toMatchObject({ ok: false });
    expect(validateWorldEntry(garden, { ...base, plant: 'ROSE' })).toMatchObject({ ok: false });
    expect(validateWorldEntry(garden, { ...base, plant: 'rose' })).toMatchObject({ ok: true });
  });

  it('will not take a truthy value in place of a boolean', () => {
    const base = { plant: 'oak', height: 1, note: 'hi' };
    expect(validateWorldEntry(garden, { ...base, watered: 1 })).toMatchObject({ ok: false });
    expect(validateWorldEntry(garden, { ...base, watered: 'yes' })).toMatchObject({ ok: false });
  });

  it('bounds text and refuses a blank one', () => {
    const base = { plant: 'oak', height: 1, watered: false };
    expect(validateWorldEntry(garden, { ...base, note: 'x'.repeat(41) })).toMatchObject({ ok: false });
    expect(validateWorldEntry(garden, { ...base, note: '   ' })).toMatchObject({ ok: false });
    expect(validateWorldEntry(garden, { ...base, note: 'x'.repeat(40) })).toMatchObject({ ok: true });
  });

  it('refuses control characters and bidi overrides in text', () => {
    // Neither is something a player typed on purpose, and both are standard ways to
    // make a string render as something other than what it is — which matters far more
    // here than in a save, because this string is displayed to other people.
    const base = { plant: 'oak', height: 1, watered: false };
    // Written as escapes on purpose: as literal characters these are invisible in
    // review and one careless reformat away from silently becoming a plain string.
    for (const note of ['hello\u0000there', 'line\u001bbreak', 'flip\u202eehtot', 'iso\u2066late', 'zero\u200bwidth']) {
      expect(validateWorldEntry(garden, { ...base, note })).toMatchObject({ ok: false });
    }
  });

  it('collects every text field for the moderator, and none when there is no text', () => {
    const twoNotes: WorldSchema = {
      maxPerPlayer: 1,
      fields: { a: { type: 'text', max: 20 }, b: { type: 'text', max: 20 }, n: { type: 'int', min: 0, max: 1 } },
    };
    const result = validateWorldEntry(twoNotes, { a: 'first', b: 'second', n: 1 });
    expect(result).toMatchObject({ ok: true, texts: ['first', 'second'] });

    const noText: WorldSchema = { maxPerPlayer: 1, fields: { n: { type: 'int', min: 0, max: 1 } } };
    expect(validateWorldEntry(noText, { n: 1 })).toMatchObject({ ok: true, texts: [] });
  });

  it('refuses anything that is not an object of fields', () => {
    for (const raw of [null, undefined, 'oak', 42, ['oak']]) {
      expect(validateWorldEntry(garden, raw)).toMatchObject({ ok: false });
    }
  });
});

describe('isValidWorldKey', () => {
  it('accepts the shapes a game actually uses', () => {
    for (const key of ['plot.3.4', 'stall-17', 'a', 'Tile_9:2', 'x'.repeat(64)]) {
      expect(isValidWorldKey(key)).toBe(true);
    }
  });

  it('refuses anything that could escape a document path or is not a string', () => {
    for (const key of ['', '../escape', 'has space', '/leading', '.hidden', 'x'.repeat(65), 42, null, undefined]) {
      expect(isValidWorldKey(key)).toBe(false);
    }
  });
});

describe('parseWorldSchema presence block', () => {
  const base = { maxPerPlayer: 3, fields: { plant: { type: 'enum', values: ['oak'] } } };

  it('leaves presence null when a world declares none', () => {
    // The ordinary world, unchanged by P2.5. Storing what strangers built is not the
    // same decision as announcing who is standing in it, so one does not imply the other.
    expect(parseWorldSchema(base)?.presence).toBeNull();
  });

  it('reads a declared grid', () => {
    expect(parseWorldSchema({ ...base, presence: { cols: 15, rows: 9 } })?.presence).toEqual({ cols: 15, rows: 9 });
  });

  it('takes the whole world down when the presence block does not parse', () => {
    // Same stance as a bad field spec, for a related reason: failing open would leave a
    // game reporting positions into a coordinate space nobody agreed to bound.
    expect(parseWorldSchema({ ...base, presence: {} })).toBeNull();
    expect(parseWorldSchema({ ...base, presence: { cols: 15 } })).toBeNull();
    expect(parseWorldSchema({ ...base, presence: { cols: 15, rows: 0 } })).toBeNull();
    expect(parseWorldSchema({ ...base, presence: { cols: 15, rows: 2.5 } })).toBeNull();
    expect(parseWorldSchema({ ...base, presence: { cols: '15', rows: '9' } })).toBeNull();
    expect(parseWorldSchema({ ...base, presence: true })).toBeNull();
    expect(parseWorldSchema({ ...base, presence: [15, 9] })).toBeNull();
  });

  it('refuses a grid fine enough to be a movement trace', () => {
    // The cap is what keeps ambient presence ambient: a 4096-wide grid would publish a
    // real person's position to strangers at roughly pixel resolution.
    expect(
      parseWorldSchema({ ...base, presence: { cols: MAX_PRESENCE_GRID, rows: MAX_PRESENCE_GRID } }),
    ).not.toBeNull();
    expect(parseWorldSchema({ ...base, presence: { cols: MAX_PRESENCE_GRID + 1, rows: 9 } })).toBeNull();
    expect(parseWorldSchema({ ...base, presence: { cols: 9, rows: MAX_PRESENCE_GRID + 1 } })).toBeNull();
  });
});

describe('worldOwnerTag', () => {
  it('is stable for one player in one world', () => {
    expect(worldOwnerTag('g:alice', 'lantern-depths')).toBe(worldOwnerTag('g:alice', 'lantern-depths'));
  });

  it('separates players, and separates one player across worlds', () => {
    // The second half is the privacy property: a game cannot correlate its visitors
    // against another game's world, because the same person is a different tag in each.
    expect(worldOwnerTag('g:alice', 'w')).not.toBe(worldOwnerTag('g:bob', 'w'));
    expect(worldOwnerTag('g:alice', 'w1')).not.toBe(worldOwnerTag('g:alice', 'w2'));
  });

  it('never leaks the uid it was built from', () => {
    const tag = worldOwnerTag('g:alice@example.com', 'w');
    expect(tag).toMatch(/^[0-9a-f]{12}$/);
    expect(tag).not.toContain('alice');
  });
});
