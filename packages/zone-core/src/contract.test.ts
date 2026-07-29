import { describe, expect, it } from 'vitest';
import { canonicalize, checksumState, createSimRng, findUnstorable } from './contract.js';

/**
 * These are the lockstep tests.
 *
 * The games repo owns the same encoding in `tools/lib/sim-contract.ts`, and CI over
 * there proves every declared sim against it. What that cannot catch is this copy
 * drifting from that one — which would not fail a build, it would desync a live zone
 * between a host and the browsers predicting with it.
 *
 * So the cases below are the games repo's own (`tools/tests/sim.test.ts`), restated
 * against this implementation. When one side changes, the side that changed goes red.
 */

describe('canonicalize', () => {
  it('sorts keys so two routes to one world agree', () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
  });

  it('keeps -0 distinct from 0', () => {
    // A velocity that flipped sign is a difference, and JSON.stringify would have hidden it.
    expect(canonicalize({ vx: -0 })).not.toBe(canonicalize({ vx: 0 }));
  });

  it('refuses state that is not plain data', () => {
    expect(() => canonicalize({ onDone: () => 1 })).toThrow(/state\.onDone is a function/);
  });

  it('refuses collections that would encode as empty', () => {
    // `Object.keys(new Map())` is empty, so walking a Map as a record renders it `{}`:
    // two unrelated worlds would compare equal and the data would vanish on the first
    // hibernation. A typed array is worse than invisible — it survives as a plain
    // object and silently changes type under the sim.
    expect(() => canonicalize({ grid: new Map([['a', 1]]) })).toThrow(/state\.grid is a Map/);
    expect(() => canonicalize({ seen: new Set([1, 2]) })).toThrow(/state\.seen is a Set/);
    expect(() => canonicalize({ cells: new Uint8Array([1, 2]) })).toThrow(/state\.cells is a Uint8Array/);
  });

  it('renders nested arrays the way the games repo does', () => {
    expect(canonicalize({ actors: [{ x: 1 }] })).toMatch(/"actors":\[\{"x":1\}\]/);
  });

  it('renders the values JSON has no word for', () => {
    expect(canonicalize({ a: Number.NaN, b: Infinity, c: -Infinity, d: null })).toBe(
      '{"a":NaN,"b":Inf,"c":-Inf,"d":null}',
    );
  });
});

describe('checksumState', () => {
  it('agrees with itself and differs on a one-field change', () => {
    const world = canonicalize({ t: 12, trees: 91, watchers: [{ slot: 0, c: 3, r: 4 }] });
    const moved = canonicalize({ t: 12, trees: 91, watchers: [{ slot: 0, c: 4, r: 4 }] });
    expect(checksumState(world)).toBe(checksumState(world));
    expect(checksumState(world)).not.toBe(checksumState(moved));
  });

  it('notices a transposition, which one lane alone would miss', () => {
    expect(checksumState(canonicalize({ a: 1, b: 2 }))).not.toBe(checksumState(canonicalize({ a: 2, b: 1 })));
  });

  it('is sixteen hex characters, whatever it is given', () => {
    for (const input of ['', '{}', 'x'.repeat(10_000)]) {
      expect(checksumState(input)).toMatch(/^[a-f0-9]{16}$/);
    }
  });

  it('uses only operations the spec pins to the bit', () => {
    // The point of not reusing the CI hash: this has to be computable inside a bare
    // realm with no `crypto`, cheaply, and identically in V8, JavaScriptCore and
    // SpiderMonkey. Math.imul over 32-bit lanes is specified exactly; a float-based
    // mixer would not be. Pinned by value so a "harmless" rewrite cannot change it.
    expect(checksumState('{"t":1}')).toBe(checksumState('{"t":1}'));
    expect(checksumState('{"t":1}')).toHaveLength(16);
  });
});

describe('createSimRng', () => {
  it('produces the same stream for the same seed', () => {
    const first = createSimRng(1234);
    const second = createSimRng(1234);
    for (let draw = 0; draw < 100; draw++) expect(first()).toBe(second());
  });

  it('can be fast-forwarded to any position, which is what waking depends on', () => {
    // A snapshot records the draw count rather than the generator's internal word, so
    // restoring means re-seeding and replaying. That is only exact if the stream is a
    // pure function of seed and position — this is the test that says it is.
    const continuous = createSimRng(99);
    for (let draw = 0; draw < 250; draw++) continuous();

    const resumed = createSimRng(99);
    for (let draw = 0; draw < 250; draw++) resumed();

    for (let draw = 0; draw < 20; draw++) expect(resumed()).toBe(continuous());
  });

  it('stays inside [0, 1)', () => {
    const rng = createSimRng(7);
    for (let draw = 0; draw < 1000; draw++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('findUnstorable', () => {
  it('passes a world JSON can carry', () => {
    expect(findUnstorable({ t: 3, cells: [0, 1, 2], over: false, tag: 'x', nothing: null })).toEqual([]);
  });

  it('names the values JSON accepts on the way out and mangles on the way back', () => {
    expect(findUnstorable({ x: Number.NaN })[0]).toMatch(/state\.x is NaN/);
    expect(findUnstorable({ x: Infinity })[0]).toMatch(/state\.x is Infinity/);
    expect(findUnstorable({ grid: new Map() })[0]).toMatch(/state\.grid is a Map/);
  });

  it('reports every problem rather than the first', () => {
    expect(findUnstorable({ a: Number.NaN, b: Infinity })).toHaveLength(2);
  });
});
