# P3 spike — can agent-written sims hold a determinism gate?

Status: **spike complete, 2026-07-28. P3 itself is still unscheduled.**
This answers the question [`persistent-world-plan.md`](./persistent-world-plan.md) §10.3
asked before anything else was allowed to start:

> pick the isolate technology and write the determinism CI check against an existing
> captured game — _before_ designing anything else, because if agent-written sims can't
> reliably pass the determinism gate, P3's premise fails and we should know early.

**Short answer: the premise holds, and by a wider margin than expected.** The catalog is
already almost entirely free of the thing that would have killed it, one determinism
hazard nobody had named turned out to be real and measurable, and the fix for it is
ninety lines. What P3 actually costs is infrastructure, not authorship.

Nothing here builds a zone host. What shipped is the contract, the gate, the evidence,
and one game split across it.

---

## 1. What shipped

All of it in the games repo, all of it inert for the other 86 games.

| Piece                    | Where                                                                               |
| ------------------------ | ----------------------------------------------------------------------------------- |
| The contract             | `tools/lib/sim-contract.ts` — entry shape, event stream, budgets, canonical hashing |
| The bare realm + harness | `tools/lib/sim-harness.ts` — loads a sim with no ambient authority and plays it     |
| Cross-engine math        | `shared/sim-math.ts` — a `Math` that returns the same bits on every engine          |
| The gate                 | `tools/validate.ts` **Check 23**                                                    |
| Evidence                 | `npm run sim:audit` — how far the catalog already is                                |
| The proof                | `games/ember-watch/` — first game whose rules are a pure sim                        |
| Tests                    | `tools/tests/sim.test.ts` — 19, most of them sims built to fail one specific way    |

### The shape

```ts
// games/<slug>/sim.ts — the rules, and nothing else
export function init(seed: number, rng: () => number): ZoneState;
export function tick(state: ZoneState, events: ZoneEvent[], rng: () => number): ZoneState;
export function wake(state: ZoneState, elapsedMs: number, rng: () => number): ZoneState;
```

Four things must agree, the same pattern Checks 12, 21 and 22 already use: the
`zone: authoritative` key in SPEC.md frontmatter, a `zone` block in GAME.json, a
`sim.ts` on disk, and a game that imports it. The last is the interesting one — the client
running the very same simulation the server arbitrates with is what stops the rules
drifting between what a player sees and what is true.

One deviation from the plan's sketch, and it matters: **`init` takes the generator too,
not just the seed.** One random stream spans the zone's whole lifetime. That is what
makes waking tractable — the platform can put a restored sim back on the sequence it
left by counting draws, which is impossible if `init` has a private generator.

---

## 2. The isolate decision

Measured rather than argued. A room-sized workload (200 actors integrating and
colliding, 60 ticks, 5 repeats) run in each candidate:

|                 | cold start | ms/tick   | memory cap | CPU interrupt        | security boundary |
| --------------- | ---------- | --------- | ---------- | -------------------- | ----------------- |
| **isolated-vm** | 1.86 ms    | **0.136** | yes        | yes, preemptive      | yes               |
| quickjs-wasm    | 2.52 ms    | 2.693     | yes        | yes, fuel/handler    | yes               |
| node:vm         | 0.59 ms    | 0.172     | **no**     | sync only, escapable | **no**            |

**Decision: `isolated-vm` in production, `node:vm` for the CI gate.**

- `isolated-vm` wins on every axis that matters and is 20× cheaper per tick than the
  WASM interpreter. A separate V8 isolate has its own heap and stack, `memoryLimit` is
  enforced, and a runaway tick is interrupted preemptively. Its cost is operational: a
  native addon, so Cloud Run images need it built or prebuilt, and it is a dependency
  with a history of quiet periods.
- `node:vm` is right for CI and wrong for production, and it is worth being blunt about
  why: it is not a security boundary — Node's own documentation says so — and it has no
  per-context memory cap. In CI it is guarding code the repository already trusts, so
  what is wanted there is a _correctness_ gate that is fast and dependency-free. It is
  that.
- **quickjs-wasm is a real fallback, not a straw man.** At 2.7 ms/tick it is still only
  ~2.7% of a core per zone at 10 Hz, it installs as ordinary JavaScript with no build
  toolchain, and having no JIT removes a tier of float-behaviour risk. If `isolated-vm`
  becomes an operational problem, switching costs CPU and nothing else.

The decision is cheap to revisit because **the realm-scrubbing code is portable across
all three.** That is the other finding here: a fresh `isolated-vm` context still has
`Date` in it. An isolate buys safety, not determinism. Determinism is a separate,
additive job — deleting the nondeterministic intrinsics and installing the math shim —
and it is the same code whichever cage runs it.

---

## 3. The hazard nobody had named

ECMAScript specifies `+ - * /`, `sqrt`, the comparisons and the integer-ish helpers to
the bit. It explicitly does **not** specify `sin`, `cos`, `tan`, `atan`, `atan2`, `asin`,
`acos`, `exp`, `log`, `pow` or `hypot` — those are "implementation-approximated". Since a
sim runs authoritatively on the server _and_ speculatively in every player's browser,
any disagreement between those engines is a desync.

This is not theoretical. Probing V8 against QuickJS over the same inputs:

|                      | probes | values that differ |
| -------------------- | ------ | ------------------ |
| native `Math`        | 28,603 | **2,057 (7.19%)**  |
| `shared/sim-math.ts` | 28,603 | **0**              |

Concretely: `cos(0.1)` — an ordinary rotation, the kind of thing a game does every
frame — is `0.9950041652780257` on V8 and `0.9950041652780258` on QuickJS.

And the catalog leans on exactly this set: `hypot` 162 calls, `sin` 105, `cos` 64,
`atan2` 37, `exp` 9, `tan` and `pow` 1 each.

So `shared/sim-math.ts` reimplements each of them using only operations the spec pins
down. The goal is **not** to match the host's `Math` — it is to be identical everywhere,
which is a different and much more achievable target. Accuracy came out at one to two
ulp of native across the board, far past what a 10 Hz simulation can notice:

```
sin 2.22e-16   cos 2.22e-16   tan 4.39e-16   atan 2.21e-16
exp 1.63e-16   log 2.22e-16   asin 4.41e-16  acos 4.42e-16   pow 9.32e-16
```

The sim bundle receives it as a parameter named `Math`, shadowing the global, so an
author writes ordinary `Math.sin(angle)` and portability is simply the default. Anything
genuinely nondeterministic throws with an explanation instead of returning a plausible
wrong answer — `Math.random` in particular points at the injected generator.

---

## 4. What the gate actually does

Check 23 plays a declared sim for a simulated minute (600 ticks at 10 Hz) with a seeded,
reproducible event stream built from the game's own declared input vocabulary, then
asserts three things.

1. **Determinism.** Two runs over the same events must produce identical per-tick state
   hashes. Hashing is canonical — keys sorted, `-0` kept distinct from `0`, numbers
   rendered through the spec-exact `String` — so two routes to the same world compare
   equal while a flipped velocity does not.
2. **Hibernation fidelity.** The run is snapshotted halfway, restored into a _fresh
   realm_, and continued; it must land on the same hashes as the run that was never
   interrupted. This is the one the plan did not spell out and the one that earns its
   keep: it catches state kept in a module-level variable, which is perfectly
   reproducible run-to-run and vanishes the moment a zone empties and the process moves
   on. A plain twice-and-compare cannot see it.
3. **Purity and budget.** The realm has no `Date`, no unseeded randomness, no timers, no
   DOM and no network, so reaching for one is a `ReferenceError` rather than a value.
   Ticks are metered against 8 ms at p99, `init` against 50 ms, and state against a
   192 KiB snapshot ceiling (a Firestore document shares that budget with the event log).

This is the touch-support precedent applied to netcode: server-runnability is _derived_
by running the code in the environment the server will provide, not declared in a
manifest and hoped for.

### What it does not prove

Worth stating plainly, because a gate people over-trust is worse than none.

- **It does not prove cross-engine agreement.** Both runs happen in the same V8. The
  math shim is what addresses that, and the shim is verified separately (§3) rather
  than by this gate. A per-commit V8-versus-QuickJS replay would close the loop and is
  not built.
- **It does not prove the sim is a good game**, only that it is reproducible. A sim that
  deterministically does nothing passes.
- **The event stream is synthetic**, not a recorded human session. It is seeded and
  reproducible, and it visits far more of the state space than a captured playthrough,
  but it is generated from the declared vocabulary rather than observed.
- **`node:vm` is not a cage.** Everything above is about correctness. Safety is the
  production isolate's job.

---

## 5. How far the catalog already is

`npm run sim:audit`, over 87 games and 261 modules (41,575 lines):

```
  no kit, no canvas             90 modules  ( 4,567 lines)
  calls the kit but paints not  80 modules  (20,697 lines)
  paints                        91 modules  (16,311 lines)

  read a clock                   2 of 261
  reach the DOM or network       0 of 261
  call Math.random              53 of 261   (mechanical: the rng is passed in)
  call engine-defined Math      74 of 261   (380 calls; the shim covers these)
```

**Two modules in the entire catalog read a clock, and one of them is a cosmetic pulse
inside a renderer** (`party-karts/game/render.ts:97`, `performance.now()` driving a
brightness wobble — the view is entitled to a clock). The only genuine instance is a
`setTimeout` driving a delayed reveal in `courtroom-contradiction/game/runtime.ts:83`.
Nothing anywhere touches the DOM or the network.

This is not luck. Check 6 (offline rules) and Check 17 (no DOM leaks) have been quietly
enforcing most of the sim contract for years, for entirely unrelated reasons. The
hardest-sounding clause — no ambient authority — turns out to be **already satisfied by
259 of 261 modules**.

What is genuinely left is a _structural_ job, and the audit is honest that it is
untouched: 16,311 lines still sit beside a draw call, and pulling rules out of the
modules that render them is the actual work of adopting the contract. That is an
ordinary refactor, not a rewrite, and it is per-game rather than platform-wide.

Read the numbers as an upper bound on how easy P3 is, never as a certificate. A
reference scan cannot tell whether an author separated rules from rendering in spirit.
The gate that runs the code is the one that knows.

---

## 6. The proof: Ember Watch

`games/ember-watch/` — a night pine stand, two embers, and a bucket. Walk the firebreak
and douse them before the fire eats the wood; the watch is held if anything is still
standing when the last ember dies.

It is in the catalog as an ordinary published game and passes all 23 checks. Three
things about it are worth copying rather than just reading.

- **Its rules are a pure sim and its view is everything else.** `sim.ts` has no canvas,
  no input, no sound and no clock. `game/zone.ts` is deliberately quarantined as the
  local stand-in for a zone host — the seeding, the tick clock, the event queue — so it
  is obvious which code gets deleted when a real host exists. The sim does not change
  at all when that happens.
- **Fire spreads through `wake()`.** A zone that burned differently while nobody was in
  it would mean the world had two sets of rules, one of them untested, so `tick` and
  `wake` share the same fire step. It is also the most direct demonstration of what
  capability 3 actually means: the world moves while you are gone.
- **Its seed is in the snapshot.** A zone is reproducible from its seed, so a trace that
  records it can be replayed exactly — including the one that failed in CI.

Multiplayer is deliberately not wired up. What exists is a sim that is ready for a host,
running locally in slot zero, and a gate that will not let it rot.

---

## 7. What this changes about P3

The spike was meant to be able to kill the phase. It did not, and it moved the cost
estimate in a specific direction: **authorship is cheaper than assumed, infrastructure
is not.**

The three things P3 now needs, in order:

1. **Inject the math shim into the client bundle.** Today `sim.ts` gets the portable
   `Math` in the CI realm and would get the browser's native one when the game runs — a
   gap that is invisible until a Safari player predicts differently from a V8 server.
   Ember Watch is unaffected because its rules are integer grid arithmetic, which is
   exactly why the reference game was written that way, but this is the first real task
   of P3 and §3 is its justification.
2. **A zone host.** `--max-instances 1` has to fall first
   ([§8 of the plan](./persistent-world-plan.md#8-infrastructure-reality)). This is the
   bulk of the cost and the spike says nothing new about it.
3. **A cross-engine replay in CI**, closing the gap §4 names.

Not needed, and worth saying so: no author-facing instructions were added to the games
repo's agent contract. Telling agents to write sims before a host exists would produce
games nothing can run. Check 23 is inert unless a game opts in, and that is the right
posture until item 2 lands.
