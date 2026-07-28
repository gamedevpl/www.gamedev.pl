import { describe, expect, it } from 'vitest';
import {
  assertProductionCage,
  createIsolatedVmCage,
  createNodeVmCage,
  SimCageUnavailableError,
  type SimCage,
} from './cage.js';
import { CLOCK_SIM, COUNTER_SIM, INCOMPLETE_SIM, RANDOM_SIM, TEST_SIM_MATH_JS } from './testSims.js';

/**
 * The same suite runs against both cages, which is the actual claim being tested: the
 * scrubbing is portable, so swapping the cage is a safety and cost decision rather than
 * a behaviour one. If these ever diverge, the spike's "cheap to revisit" stops being true.
 */

const CAGES: Array<[string, () => Promise<SimCage> | SimCage]> = [
  ['node:vm', () => createNodeVmCage()],
  ['isolated-vm', () => createIsolatedVmCage()],
];

function load(cage: SimCage, bundleJs: string) {
  return cage.load({ bundleJs, simMathJs: TEST_SIM_MATH_JS, timeoutMs: 2000, memoryMb: 32 });
}

describe.each(CAGES)('%s cage', (_name, make) => {
  it('runs a sim and keeps its world inside the realm', async () => {
    const cage = await make();
    const sim = await load(cage, COUNTER_SIM);
    sim.init(42);
    sim.tick([{ slot: 0, k: 'join' }]);
    sim.tick([{ slot: 0, k: 'douse' }]);

    const { state, draws } = sim.snapshot();
    const parsed = JSON.parse(state) as { t: number; seed: number; players: number[]; acts: number };
    expect(parsed).toMatchObject({ t: 2, seed: 42, players: [0], acts: 1 });
    // init draws once, then one per tick — the count the host writes into the snapshot.
    expect(draws).toBe(3);

    sim.dispose();
    cage.dispose();
  });

  it('has no clock to read', async () => {
    // The purity half of the contract, derived by running the code rather than declared.
    // A fresh isolate still has Date in it — this is the scrubbing, not the cage.
    const cage = await make();
    await expect(load(cage, CLOCK_SIM)).rejects.toThrow(/no Date/);
    cage.dispose();
  });

  it('points a sim reaching for randomness at the generator it was given', async () => {
    const cage = await make();
    const sim = await load(cage, RANDOM_SIM);
    sim.init(1);
    expect(() => sim.tick([])).toThrow(/rng passed into tick/);
    sim.dispose();
    cage.dispose();
  });

  it('installs the injected Math over the host one', async () => {
    const cage = await make();
    const sim = await load(
      cage,
      `var __SIM_BUNDLE__ = (function () {
        function init() { return { shimmed: Math.__isShim === true }; }
        function tick(state) { return state; }
        function wake(state) { return state; }
        return { init: init, tick: tick, wake: wake };
      })();`,
    );
    sim.init(1);
    // An author writes ordinary Math.sin and gets the portable one without knowing this
    // exists. Whether the shim's numbers are right is the games repo's test; whether it
    // is the Math a sim sees is this one.
    expect(JSON.parse(sim.snapshot().state)).toEqual({ shimmed: true });
    sim.dispose();
    cage.dispose();
  });

  it('refuses a sim that is missing an export the contract requires', async () => {
    const cage = await make();
    await expect(load(cage, INCOMPLETE_SIM)).rejects.toThrow(/must export tick and wake/);
    cage.dispose();
  });

  it('restores a snapshot onto the exact generator position it left', async () => {
    // The one behaviour hibernation depends on, at the cage level. A continuous run and
    // a run interrupted by a restore must produce identical worlds — if the stream is
    // even one draw out of step, `sum` diverges on the very next tick.
    const cage = await make();

    const continuous = await load(cage, COUNTER_SIM);
    continuous.init(7);
    for (let tick = 0; tick < 20; tick++) continuous.tick([]);
    const expected = continuous.snapshot();

    const interrupted = await load(cage, COUNTER_SIM);
    interrupted.init(7);
    for (let tick = 0; tick < 12; tick++) interrupted.tick([]);
    const mid = interrupted.snapshot();
    interrupted.dispose();

    // A *fresh* realm, as a woken zone always gets — anything the sim kept outside its
    // state is gone here, which is the whole point of resuming this way.
    const resumed = await load(cage, COUNTER_SIM);
    resumed.restore(7, mid.state, mid.draws);
    for (let tick = 0; tick < 8; tick++) resumed.tick([]);

    expect(resumed.snapshot()).toEqual(expected);

    continuous.dispose();
    resumed.dispose();
    cage.dispose();
  });
});

describe('isolated-vm cage specifics', () => {
  it('stops a runaway tick instead of hanging the instance', async () => {
    const cage = await createIsolatedVmCage();
    const sim = await cage.load({
      bundleJs: `var __SIM_BUNDLE__ = (function () {
        function init() { return { t: 0 }; }
        function tick(state) { while (true) { state.t++; } }
        function wake(state) { return state; }
        return { init: init, tick: tick, wake: wake };
      })();`,
      simMathJs: TEST_SIM_MATH_JS,
      timeoutMs: 100,
      memoryMb: 32,
    });
    sim.init(1);
    // This is the line node:vm cannot hold, and the reason it is not the production
    // cage: an infinite loop there takes the event loop with it.
    expect(() => sim.tick([])).toThrow();
    sim.dispose();
    cage.dispose();
  }, 15_000);

  it('reports itself as preemptive, which the host checks before hosting anything', () => {
    expect(createNodeVmCage().preemptsRunawayTicks).toBe(false);
  });
});

describe('assertProductionCage', () => {
  it('refuses node:vm in production', async () => {
    // The whole P3 safety story is that the sim isolate is the iframe's server-side
    // twin. node:vm passes every test in this package and none of that promise, and the
    // failure would be silent — so it is caught at startup, where it is loud.
    expect(() => assertProductionCage(createNodeVmCage(), 'production')).toThrow(SimCageUnavailableError);
    expect(() => assertProductionCage(createNodeVmCage(), 'production')).toThrow(/not a security boundary/);
  });

  it('allows node:vm anywhere else, because that is what development is', () => {
    expect(() => assertProductionCage(createNodeVmCage(), 'test')).not.toThrow();
    expect(() => assertProductionCage(createNodeVmCage(), undefined)).not.toThrow();
  });

  it('allows the isolate in production', async () => {
    const cage = await createIsolatedVmCage();
    expect(() => assertProductionCage(cage, 'production')).not.toThrow();
    cage.dispose();
  });
});
