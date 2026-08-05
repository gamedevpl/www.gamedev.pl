/**
 * Sims and a math shim for the tests, written the way esbuild would emit them.
 *
 * A real sim reaches the host as `games/<slug>/sim.ts` bundled to an IIFE under
 * `__SIM_BUNDLE__`. These are that shape by hand, so the cage is exercised against
 * exactly what it will be given without the tests needing a bundler.
 *
 * The math shim here is a stand-in on purpose, and the split is worth being explicit
 * about: whether `sin` returns the same bits on every engine is the games repo's
 * question, tested there against 28,603 probes. What is this package's question is
 * whether the shim gets *installed* — whether a sim sees the injected `Math` rather than
 * the host's, and whether `Math.random` is gone. That is what this stands in for.
 */

export const TEST_SIM_MATH_JS = `
globalThis.__SIM_MATH__ = (function () {
  var shim = {};
  ['abs','floor','ceil','round','trunc','sign','min','max','imul','sqrt','pow','sin','cos','atan2','hypot','log','exp']
    .forEach(function (name) { shim[name] = Math[name]; });
  shim.PI = Math.PI;
  shim.E = Math.E;
  shim.__isShim = true;
  shim.random = function () {
    throw new Error('Math.random() is not available in a sim; use the rng passed into tick(state, events, rng)');
  };
  return shim;
})();
`;

/** Wraps sim source the way esbuild's iife+globalName output does. */
export function bundleLike(body: string): string {
  return `var __SIM_BUNDLE__ = (function () {\n${body}\nreturn { init: init, tick: tick, wake: wake };\n})();`;
}

/**
 * A counter world: every tick advances time and draws one random number.
 *
 * Deliberately boring, because the tests that matter are about the platform around a
 * sim rather than the sim. `sum` accumulating draws is what makes a misaligned
 * generator visible — resume on the wrong position and this number goes wrong
 * immediately, which a state that merely counted ticks would not show.
 */
export const COUNTER_SIM = bundleLike(`
  function init(seed, rng) {
    return { t: 0, seed: seed, sum: rng(), players: [], acts: 0, slept: 0 };
  }
  function tick(state, events, rng) {
    state.t++;
    for (var i = 0; i < events.length; i++) {
      var event = events[i];
      if (event.k === 'join') state.players.push(event.slot);
      else if (event.k === 'leave') state.players = state.players.filter(function (s) { return s !== event.slot; });
      else state.acts++;
    }
    state.sum = (state.sum + rng()) % 1000;
    return state;
  }
  function wake(state, elapsedMs, rng) {
    var ticks = Math.min(100, Math.floor(elapsedMs / 100));
    for (var i = 0; i < ticks; i++) { state.t++; state.slept++; state.sum = (state.sum + rng()) % 1000; }
    return state;
  }
`);

/** Reads a clock, which the realm does not have. Should fail on load. */
export const CLOCK_SIM = bundleLike(`
  var born = Date.now();
  function init() { return { born: born }; }
  function tick(state) { return state; }
  function wake(state) { return state; }
`);

/** Reaches for unseeded randomness, which the shim replaces with an explanation. */
export const RANDOM_SIM = bundleLike(`
  function init() { return { x: 0 }; }
  function tick(state) { state.x = Math.random(); return state; }
  function wake(state) { return state; }
`);

/** Keeps part of its world outside the state, which survives a restart and not a sleep. */
export const MODULE_STATE_SIM = bundleLike(`
  var hidden = 0;
  function init() { return { t: 0, hidden: 0 }; }
  function tick(state) { hidden++; state.t++; state.hidden = hidden; return state; }
  function wake(state) { return state; }
`);

/** Grows without bound, to prove the snapshot ceiling is enforced at runtime. */
export const BLOATED_SIM = bundleLike(`
  function init() { return { t: 0, junk: [] }; }
  function tick(state) {
    state.t++;
    for (var i = 0; i < 400; i++) state.junk.push('xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
    return state;
  }
  function wake(state) { return state; }
`);

/**
 * Burns wall clock every tick, to prove the tick budget is enforced at runtime.
 *
 * Sized well past the 8 ms budget rather than just over it. A loop that lands near the
 * line passes or fails depending on whether the JIT has warmed up, which would make the
 * budget test the flakiest thing in the suite — and a flaky test about a limit is worse
 * than no test, because it teaches people to re-run it.
 */
export const SLOW_SIM = bundleLike(`
  function init() { return { t: 0, n: 0 }; }
  function tick(state) {
    state.t++;
    var n = 0;
    for (var i = 0; i < 20000000; i++) n += i % 7;
    state.n = n;
    return state;
  }
  function wake(state) { return state; }
`);

/**
 * Burns wall clock in its *top level* rather than in a tick — the shape A6 2026-08-05 hit,
 * where a cold isolate spent longer building the realm than one tick is allowed to run.
 *
 * Sized past the per-tick budget and nowhere near the load budget, for the reason SLOW_SIM
 * gives, and with the same mistake made once on the way here: at 8M iterations this took
 * 22 ms against a 20 ms budget and passed whichever way the fix went, which is a test that
 * only looks like one. 120M measures ~300 ms on a 2026 laptop, so it has to be decisive in
 * both directions on anything within two orders of magnitude of that.
 */
export const SLOW_LOADING_SIM = bundleLike(`
  var warmed = 0;
  for (var w = 0; w < 120000000; w++) warmed += w % 7;
  function init() { return { t: 0, warmed: warmed }; }
  function tick(state) { state.t++; return state; }
  function wake(state) { return state; }
`);

/** Puts something in its state that JSON cannot carry back. */
export const UNSTORABLE_SIM = bundleLike(`
  function init() { return { t: 0, ratio: 0 }; }
  function tick(state) { state.t++; state.ratio = 1 / 0; return state; }
  function wake(state) { return state; }
`);

/** Throws once it has run a few ticks. */
export const THROWING_SIM = bundleLike(`
  function init() { return { t: 0 }; }
  function tick(state) { state.t++; if (state.t > 3) throw new Error('boom'); return state; }
  function wake(state) { return state; }
`);

/** Missing an export the contract requires. */
export const INCOMPLETE_SIM = `var __SIM_BUNDLE__ = (function () {
  function init() { return {}; }
  return { init: init };
})();`;
