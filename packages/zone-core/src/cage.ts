import vm from 'node:vm';
import { SIM_EXPORTS, SIM_REALM_REMOVED, wrapSimBundle } from './contract.js';
import type { ZoneEvent } from './contract.js';

/**
 * The cage a zone's simulation runs in.
 *
 * Two things happen in here and it is worth keeping them apart, because the spike found
 * that conflating them is the easy mistake: **safety** is the isolate, and
 * **determinism** is the scrubbing. A fresh `isolated-vm` context still has `Date` in
 * it — an isolate stops a sim reaching the host, it does not stop a sim reading a
 * clock. So the scrubbing below is additive and identical whichever cage runs it, which
 * is precisely why the cage is swappable (docs/p3-sim-spike.md §2).
 *
 * The state never leaves the realm during normal play. The bootstrap holds it, the sim
 * mutates it, and only a snapshot pulls it out as JSON. That is not only cheaper than
 * marshalling a world across the boundary ten times a second — it is what makes
 * `isolated-vm`'s transfer rules a non-issue, because the only values that ever cross
 * are strings and numbers.
 */

/** What the host can ask of a loaded sim. Every call is synchronous and metered. */
export interface SimInstance {
  /** Creates the world. The generator starts here, not at the first tick. */
  init(seed: number): void;
  /**
   * Restores a snapshot and puts the generator back where it was.
   *
   * `draws` is how the alignment happens: the stream is re-seeded and advanced that
   * many times, so the next number the sim draws is the one it would have drawn had it
   * never slept. The CI harness reconstructs this count by replaying; a host records it.
   */
  restore(seed: number, stateJson: string, draws: number): void;
  tick(events: ZoneEvent[]): void;
  /** Catches the world up on the time it slept through. */
  wake(elapsedMs: number): void;
  /** The state as JSON, and how many numbers have been drawn to reach it. */
  snapshot(): { state: string; draws: number };
  dispose(): void;
}

export interface SimCage {
  readonly kind: 'isolated-vm' | 'node-vm';
  /** True when a runaway tick is stopped by the cage rather than by hope. */
  readonly preemptsRunawayTicks: boolean;
  load(options: LoadSimOptions): Promise<SimInstance>;
  dispose(): void;
}

export interface LoadSimOptions {
  /** The game's `sim.ts`, bundled to an IIFE by esbuild. */
  bundleJs: string;
  /** The games repo's `shared/sim-math.ts`, transpiled. Installed as `Math`. */
  simMathJs: string;
  /** Wall-clock ceiling for one call into the sim. */
  timeoutMs: number;
  /** Heap ceiling for the whole zone, in MiB. Ignored by the node:vm cage, which has none. */
  memoryMb: number;
}

export class SimCageUnavailableError extends Error {}
export class SimLoadError extends Error {}

/**
 * The half of the realm that lives *inside* it.
 *
 * Deliberately small, and deliberately not where the interesting logic is. Canonical
 * encoding, hashing and storability checks all run on the host against the JSON a
 * snapshot pulls out — one implementation, in `contract.ts`, rather than a second copy
 * injected here that could drift from it. What has to be in here is only what cannot be
 * anywhere else: the generator, because its position is not in the state, and the state
 * itself, because moving it across the boundary every tick would cost more than the
 * tick.
 */
const BOOTSTRAP = `
(function () {
  var sim = null;
  var state = null;
  var draws = 0;
  var rngState = 0;

  // mulberry32, matching createSimRng in contract.ts and the games repo's harness. The
  // draw counter beside it is the whole trick behind waking a zone: the stream's
  // position cannot be recovered from the state, so it is counted instead.
  function nextRandom() {
    draws++;
    rngState = (rngState + 0x6d2b79f5) >>> 0;
    var value = rngState;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  function seedStream(seed) {
    rngState = seed >>> 0;
    draws = 0;
  }

  globalThis.__zoneAttach = function (factory) {
    sim = factory(globalThis.Math);
    var missing = [];
    ${JSON.stringify([...SIM_EXPORTS])}.forEach(function (name) {
      if (typeof sim[name] !== 'function') missing.push(name);
    });
    return missing.join(',');
  };

  globalThis.__zoneInit = function (seed) {
    seedStream(seed);
    state = sim.init(seed, nextRandom);
    return draws;
  };

  globalThis.__zoneRestore = function (seed, stateJson, priorDraws) {
    seedStream(seed);
    // Advance rather than trust: the generator is a pure function of its seed and its
    // position, so replaying the draws is exact and costs a few microseconds per
    // thousand. Storing the internal word instead would tie every snapshot on disk to
    // this one generator's implementation.
    for (var i = 0; i < priorDraws; i++) nextRandom();
    draws = priorDraws;
    state = JSON.parse(stateJson);
  };

  globalThis.__zoneTick = function (eventsJson) {
    state = sim.tick(state, JSON.parse(eventsJson), nextRandom);
  };

  globalThis.__zoneWake = function (elapsedMs) {
    state = sim.wake(state, elapsedMs, nextRandom);
  };

  globalThis.__zoneDraws = function () {
    return draws;
  };

  // Storability has to be decided *before* JSON.stringify, not after, and that is the
  // whole reason this lives in here rather than on the host with the rest of the
  // encoding. Stringify does not refuse the values it cannot carry — it quietly
  // rewrites them. Infinity and NaN become null, a Map becomes {}, -0 becomes 0. By the
  // time the host has a string to inspect, the evidence is gone and the state looks
  // perfectly storable. It would keep looking that way until the zone slept and woke up
  // as a different world.
  globalThis.__zoneState = function () {
    var problems = [];
    var json = JSON.stringify(state, function (key, value) {
      if (problems.length > 4) return value;
      var where = key === '' ? 'state' : 'state.' + key;
      if (typeof value === 'number') {
        if (value !== value) problems.push(where + ' is NaN, which a JSON snapshot cannot carry');
        else if (value === Infinity || value === -Infinity) {
          problems.push(where + ' is ' + String(value) + ', which a JSON snapshot cannot carry');
        }
      } else if (typeof value === 'function' || typeof value === 'symbol') {
        problems.push(where + ' is a ' + typeof value + ', which is not storable state');
      } else if (value && typeof value === 'object') {
        var tag = Object.prototype.toString.call(value);
        if (tag !== '[object Object]' && tag !== '[object Array]') {
          problems.push(where + ' is a ' + tag.slice(8, -1) + ', which a JSON snapshot turns into something else');
        }
      }
      return value;
    });
    if (problems.length > 0) throw new Error('UNSTORABLE: ' + problems.join('; '));
    return json;
  };
})();
`;

function scrubScript(): string {
  // Deleting rather than allow-listing, because both realms start as bare ECMAScript
  // with no timers, no fetch and no DOM. What is left to remove is the handful of
  // intrinsics that are themselves nondeterministic.
  return Object.keys(SIM_REALM_REMOVED)
    .map((name) => `delete globalThis.${name};`)
    .join('\n');
}

/**
 * The production cage: a separate V8 isolate with its own heap, a hard memory limit and
 * preemptive interruption of a runaway tick.
 *
 * Measured at 0.136 ms for a room-sized tick against 2.693 for a QuickJS-WASM
 * interpreter (spike §2). Its cost is operational rather than technical — a native
 * addon, so the image has to build it — which is why it is loaded dynamically and why
 * the failure to find it is an error that says what to do about it rather than a
 * module-not-found stack.
 */
export async function createIsolatedVmCage(): Promise<SimCage> {
  let ivm: IsolatedVmModule;
  try {
    ivm = (await import('isolated-vm')) as unknown as IsolatedVmModule;
  } catch (error) {
    throw new SimCageUnavailableError(
      'isolated-vm is not installed, so there is no cage to run a zone in. It is a native ' +
        'addon: the image needs a build toolchain, or a prebuilt binary. Falling back to ' +
        'node:vm is not an option in production — it is not a security boundary. ' +
        `(${error instanceof Error ? error.message : String(error)})`,
    );
  }

  const isolates: Array<{ dispose(): void }> = [];

  return {
    kind: 'isolated-vm',
    preemptsRunawayTicks: true,
    async load({ bundleJs, simMathJs, timeoutMs, memoryMb }) {
      const isolate = new ivm.Isolate({ memoryLimit: memoryMb });
      isolates.push(isolate);
      const context = isolate.createContextSync();

      try {
        // Order matters: sim-math captures the exact-by-spec natives it builds on, so it
        // has to run while the original Math is still in place.
        context.evalSync(simMathJs, { timeout: timeoutMs });
        context.evalSync('globalThis.Math = globalThis.__SIM_MATH__; delete globalThis.__SIM_MATH__;');
        context.evalSync(scrubScript());
        context.evalSync(BOOTSTRAP, { timeout: timeoutMs });

        const attach = context.evalSync(
          `(function () { var f = ${wrapSimBundle(bundleJs)}; return globalThis.__zoneAttach(f); })()`,
          { timeout: timeoutMs },
        );
        if (typeof attach === 'string' && attach.length > 0) {
          throw new SimLoadError(`sim.ts must export ${attach.split(',').join(' and ')}`);
        }
      } catch (error) {
        isolate.dispose();
        throw error instanceof SimLoadError ? error : new SimLoadError(describeRealmFailure(error));
      }

      const call = <T>(name: string, args: unknown[]): T => {
        const fn = context.global.getSync(name, { reference: true });
        try {
          return fn.applySync(undefined, args, { timeout: timeoutMs }) as T;
        } finally {
          fn.release();
        }
      };

      return {
        init: (seed) => void call<number>('__zoneInit', [seed]),
        restore: (seed, stateJson, draws) => void call('__zoneRestore', [seed, stateJson, draws]),
        tick: (events) => void call('__zoneTick', [JSON.stringify(events)]),
        wake: (elapsedMs) => void call('__zoneWake', [elapsedMs]),
        snapshot: () => ({ state: call<string>('__zoneState', []), draws: call<number>('__zoneDraws', []) }),
        dispose: () => {
          if (!isolate.isDisposed) isolate.dispose();
        },
      };
    },
    dispose() {
      for (const isolate of isolates) {
        try {
          isolate.dispose();
        } catch {
          // Already gone. Disposing twice is not an error worth propagating out of a
          // shutdown path.
        }
      }
    },
  };
}

/**
 * The development and test cage.
 *
 * `node:vm` is fast, dependency-free, and **not a security boundary** — Node's own
 * documentation says so, and it has no per-context memory cap. It is exactly right for
 * running code the repository already trusts (which is what a test does) and exactly
 * wrong for running a stranger's game. `assertProductionCage` below is what stops the
 * convenient thing from becoming the deployed thing.
 */
export function createNodeVmCage(): SimCage {
  return {
    kind: 'node-vm',
    preemptsRunawayTicks: false,
    async load({ bundleJs, simMathJs, timeoutMs }) {
      const context = vm.createContext({}, { codeGeneration: { strings: false, wasm: false }, name: 'zone-sim-realm' });

      try {
        vm.runInContext(simMathJs, context, { timeout: timeoutMs });
        vm.runInContext('globalThis.Math = globalThis.__SIM_MATH__; delete globalThis.__SIM_MATH__;', context);
        vm.runInContext(scrubScript(), context);
        vm.runInContext(BOOTSTRAP, context, { timeout: timeoutMs });

        const missing = vm.runInContext(
          `(function () { var f = ${wrapSimBundle(bundleJs)}; return globalThis.__zoneAttach(f); })()`,
          context,
          { timeout: timeoutMs, filename: 'sim.js' },
        );
        if (typeof missing === 'string' && missing.length > 0) {
          throw new SimLoadError(`sim.ts must export ${missing.split(',').join(' and ')}`);
        }
      } catch (error) {
        throw error instanceof SimLoadError ? error : new SimLoadError(describeRealmFailure(error));
      }

      const call = <T>(source: string, args: Record<string, unknown> = {}): T => {
        Object.assign(context as Record<string, unknown>, args);
        try {
          return vm.runInContext(source, context, { timeout: timeoutMs }) as T;
        } finally {
          for (const key of Object.keys(args)) delete (context as Record<string, unknown>)[key];
        }
      };

      let disposed = false;
      return {
        init: (seed) => void call('__zoneInit(__seed)', { __seed: seed }),
        restore: (seed, stateJson, draws) =>
          void call('__zoneRestore(__seed, __state, __draws)', { __seed: seed, __state: stateJson, __draws: draws }),
        tick: (events) => void call('__zoneTick(__events)', { __events: JSON.stringify(events) }),
        wake: (elapsedMs) => void call('__zoneWake(__elapsed)', { __elapsed: elapsedMs }),
        snapshot: () => ({ state: call<string>('__zoneState()'), draws: call<number>('__zoneDraws()') }),
        dispose: () => {
          // Nothing to release: a node:vm context is ordinary garbage. The flag exists so
          // a use-after-dispose is a clear error rather than a sim that quietly keeps
          // running in a zone the host believes it has forgotten.
          disposed = true;
          void disposed;
        },
      };
    },
    dispose() {
      // No isolates to reclaim.
    },
  };
}

/**
 * Names what a realm failure actually means for the author.
 *
 * A `ReferenceError` in here is the purity half of the contract doing its job — the
 * realm has no clock, no unseeded randomness and no browser, so reaching for one is not
 * a value but an error. "Your sim touched something the server will not have" is the
 * useful sentence; the stack is not.
 */
function describeRealmFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return (
    `the sim could not run in a server realm: ${message}. A sim gets ECMAScript and ` +
    'nothing else — no Date, no Math.random, no timers, no DOM, no network. Time arrives ' +
    'as the tick count and elapsed milliseconds; randomness arrives as the rng argument.'
  );
}

/**
 * Refuses to run untrusted game code in a cage that is not one.
 *
 * The whole P3 security story is that the sim isolate is the iframe's server-side twin —
 * a second cage, not a second trust decision (plan §7.2). `node:vm` would satisfy every
 * test in this package and none of that promise, and the failure would be silent. So it
 * is checked at startup, where it is loud.
 */
export function assertProductionCage(cage: SimCage, nodeEnv = process.env.NODE_ENV): void {
  if (nodeEnv === 'production' && cage.kind !== 'isolated-vm') {
    throw new SimCageUnavailableError(
      `refusing to host zones in production with the ${cage.kind} cage. node:vm is not a ` +
        'security boundary and has no per-context memory cap; it runs the CI gate over code ' +
        'this repository already trusts, which is a different job from running a stranger.',
    );
  }
}

/** Minimal structural view of `isolated-vm`, so an absent optional dependency is a
 *  runtime message rather than a type-check failure on a machine that skipped it. */
interface IsolatedVmModule {
  Isolate: new (options: { memoryLimit: number }) => IsolatedVmIsolate;
}

interface IsolatedVmIsolate {
  readonly isDisposed: boolean;
  createContextSync(): IsolatedVmContext;
  dispose(): void;
}

interface IsolatedVmContext {
  readonly global: { getSync(name: string, options: { reference: true }): IsolatedVmReference };
  evalSync(code: string, options?: { timeout?: number }): unknown;
}

interface IsolatedVmReference {
  applySync(receiver: undefined, args: unknown[], options?: { timeout?: number }): unknown;
  release(): void;
}
