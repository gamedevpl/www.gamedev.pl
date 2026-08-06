import { describe, expect, it } from 'vitest';
import {
  assertProductionCage,
  createIsolatedVmCage,
  createNodeVmCage,
  isSimTimeoutError,
  SimCageUnavailableError,
  SimLoadError,
  unwrapNativeModule,
  type SimCage,
} from './cage.js';
import {
  CLOCK_SIM,
  COUNTER_SIM,
  INCOMPLETE_SIM,
  RANDOM_SIM,
  SLOW_LOADING_SIM,
  TEST_SIM_MATH_JS,
} from './testSims.js';

/**
 * The same suite runs against both cages, which is the actual claim being tested: the
 * scrubbing is portable, so swapping the cage is a safety and cost decision rather than
 * a behaviour one. If these ever diverge, the spike's "cheap to revisit" stops being true.
 *
 * `isolated-vm` is a native addon and an optional dependency, so it is genuinely absent on
 * some machines — a plain `npm ci` on a runner without a working C++ toolchain skips it.
 * Its suites are skipped there rather than failed, because a red build on a contributor's
 * laptop for a dependency only the world service needs would teach people to ignore red
 * builds. Two things stop that skip from quietly becoming permanent: the absence is
 * announced rather than silent, and the tests that encode the *safety* half of this —
 * that a missing isolate is a refusal to start rather than a downgrade — run either way.
 * The addon itself is built and exercised where it has to work, in `apps/world/Dockerfile`.
 */

const isolate = await probeIsolate();
if (!isolate) {
  console.warn(
    '[zone-core] isolated-vm is not installed; its cage suites are skipped. ' +
      'The production refusal path is still covered below.',
  );
}

async function probeIsolate(): Promise<SimCage | null> {
  try {
    const cage = await createIsolatedVmCage();
    cage.dispose();
    return cage;
  } catch {
    return null;
  }
}

const CAGES: Array<[string, () => Promise<SimCage> | SimCage]> = [
  ['node:vm', () => createNodeVmCage()],
  ...(isolate ? ([['isolated-vm', () => createIsolatedVmCage()]] as Array<[string, () => Promise<SimCage>]>) : []),
];

function load(cage: SimCage, bundleJs: string) {
  return cage.load({ bundleJs, simMathJs: TEST_SIM_MATH_JS, timeoutMs: 2000, memoryMb: 32 });
}

describe('isSimTimeoutError', () => {
  it('recognises isolated-vm and node:vm timeout messages', () => {
    expect(isSimTimeoutError(new Error('Script execution timed out.'))).toBe(true);
    expect(isSimTimeoutError(new Error('Script execution timed out after 200ms'))).toBe(true);
    expect(isSimTimeoutError(new Error('zone is closed'))).toBe(false);
  });
});

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

  it('builds the realm on the startup budget, not the per-tick one', async () => {
    // A6 2026-08-05. A bundle whose top level outlasts a tick is not a runaway bundle —
    // on a cold isolate that is an ordinary one — and refusing it costs a join that the
    // shell then hides behind silent solo play. `startupTimeoutMs` is what separates the
    // two budgets; without it this load is priced at 30 ms and the sim never gets to run.
    const cage = await make();
    const sim = await cage.load({
      bundleJs: SLOW_LOADING_SIM,
      simMathJs: TEST_SIM_MATH_JS,
      timeoutMs: 30,
      startupTimeoutMs: 20_000,
      memoryMb: 32,
    });
    sim.init(1);
    expect(sim.snapshot().state).toContain('warmed');
    sim.dispose();
    cage.dispose();
  }, 30_000);

  it('restores on the startup budget, not the per-tick one', async () => {
    // A6 2026-08-06, the third of these. Widening the load budget alone left `restore` on
    // the per-tick one, and the next cold start put the timeout straight back — in
    // `nextRandom`, which `__zoneRestore` calls once per recorded draw to walk the
    // generator back to its position. That replay is the honest way to make this call
    // expensive on demand, so it is what the test uses.
    const cage = await make();
    const sim = await cage.load({
      bundleJs: COUNTER_SIM,
      simMathJs: TEST_SIM_MATH_JS,
      timeoutMs: 30,
      startupTimeoutMs: 20_000,
      memoryMb: 32,
    });
    sim.init(7);
    const { state } = sim.snapshot();

    expect(() => sim.restore(7, state, 20_000_000)).not.toThrow();
    sim.dispose();
    cage.dispose();
  }, 30_000);

  it('still bounds coming up, on the startup budget', async () => {
    // The other half of widening it: a bigger number, not an absent one. Same bundle, same
    // cage, budgets swapped — so this fails if `startupTimeoutMs` is ignored in either
    // direction, which the pair above cannot show on its own.
    const cage = await make();
    await expect(
      cage.load({
        bundleJs: SLOW_LOADING_SIM,
        simMathJs: TEST_SIM_MATH_JS,
        timeoutMs: 20_000,
        startupTimeoutMs: 30,
        memoryMb: 32,
      }),
    ).rejects.toThrow(SimLoadError);
    cage.dispose();
  }, 30_000);

});

describe.skipIf(!isolate)('isolated-vm cage specifics', () => {
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

  it('stops a bundle whose top level never returns, however wide the startup budget', async () => {
    // The other half of widening the startup budget: a bigger number, not an absent one.
    // Lives here rather than in the shared suite for the same reason the runaway tick
    // does — node:vm is the cage that cannot be trusted to take an infinite loop back.
    const cage = await createIsolatedVmCage();
    await expect(
      cage.load({
        bundleJs: 'var __SIM_BUNDLE__ = (function () { while (true) {} })();',
        simMathJs: TEST_SIM_MATH_JS,
        timeoutMs: 20,
        startupTimeoutMs: 250,
        memoryMb: 32,
      }),
    ).rejects.toThrow(SimLoadError);
    cage.dispose();
  }, 20_000);

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

  it.skipIf(!isolate)('allows the isolate in production', async () => {
    const cage = await createIsolatedVmCage();
    expect(() => assertProductionCage(cage, 'production')).not.toThrow();
    cage.dispose();
  });

  it('says what to do about a missing isolate rather than falling back to one that is not a cage', async () => {
    // Runs whether or not the addon is installed, because this is the half that matters
    // when it is not: the service must refuse to start, and the message must name the
    // reason. A downgrade to node:vm here would be silent and would be the whole P3
    // safety story quietly deleted.
    if (isolate) {
      expect(() => assertProductionCage(createNodeVmCage(), 'production')).toThrow(/not a security boundary/);
      return;
    }
    await expect(createIsolatedVmCage()).rejects.toThrow(SimCageUnavailableError);
    await expect(createIsolatedVmCage()).rejects.toThrow(/native addon|not installed/);
  });
});

describe('unwrapNativeModule', () => {
  /**
   * This is the shape `await import('isolated-vm')` actually returns, and getting it wrong
   * cost a live deploy: the host booted, reported the isolate cage, served /health, and
   * answered every join with `zone_unavailable` because `namespace.Isolate` was undefined.
   * The suites above cannot catch it — they are skipped wherever the optional addon is
   * absent, which is every machine except the world image.
   */
  it('reads a CJS addon out of the interop namespace it arrives in', () => {
    const Isolate = class {};
    expect(unwrapNativeModule<{ Isolate: unknown }>({ default: { Isolate } }).Isolate).toBe(Isolate);
  });

  it('leaves a real module with named exports alone', () => {
    const namespace = { Isolate: class {}, default: {} };
    expect(unwrapNativeModule<{ Isolate: unknown }>(namespace)).toBe(namespace);
  });
});
