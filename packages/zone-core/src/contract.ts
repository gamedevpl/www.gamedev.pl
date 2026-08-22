/**
 * The deterministic sim contract, host side.
 *
 * The authority for all of this is the games repo — `tools/lib/sim-contract.ts` — where
 * it is enforced against every declared sim by Check 23. This file is the server's copy
 * of the same numbers and the same encoding, and the two must move together.
 *
 * The numbers themselves now live once, in `@gamedevpl/contract`, so the host and the
 * browser client cannot drift from each other. What they still mirror is the games repo,
 * which deploys independently and cannot be imported from — and what holds THAT together
 * is a test: `contract.test.ts` pins the encoding against vectors copied verbatim from
 * the games repo's own test, so a change on either side breaks the side that changed
 * rather than desyncing a live zone.
 */

import {
  MAX_PLAYERS_PER_ZONE,
  MAX_STATE_BYTES,
  RESERVED_EVENT_KINDS,
  TICK_HZ_VALUES,
  type TickHz,
  type ZoneEvent,
} from '@gamedevpl/contract';

export { MAX_PLAYERS_PER_ZONE, MAX_STATE_BYTES, RESERVED_EVENT_KINDS, TICK_HZ_VALUES };
export type { TickHz, ZoneEvent };

/**
 * Budgets, mirroring games-repo `MAX_TICK_MS` / `MAX_INIT_MS` / `MAX_WAKE_MS`.
 *
 * In CI these are a gate on a game. Here they are a gate on an *instance*: a zone host
 * runs many zones on one core and meters each, so a tick that runs long is not merely
 * slow — it is a zone taking time away from every other zone on the box.
 */
export const MAX_TICK_MS = 8;
export const MAX_INIT_MS = 50;
export const MAX_WAKE_MS = 50;

/** Mirrors games-repo `SIM_EXPORTS`. */
export const SIM_EXPORTS = ['init', 'tick', 'wake'] as const;

/** Mirrors games-repo `SIM_GLOBAL_NAME` — the name esbuild gives the bundled sim. */
export const SIM_GLOBAL_NAME = '__SIM_BUNDLE__';

/**
 * Globals removed from the sim realm, and why each one would break a zone.
 *
 * Mirrors games-repo `SIM_REALM_REMOVED`. Worth restating what the spike found: a fresh
 * `isolated-vm` context still has `Date` in it. **An isolate buys safety, not
 * determinism.** Scrubbing is a separate, additive job, and it is the same list
 * whichever cage runs it — which is exactly why the cage is swappable.
 */
export const SIM_REALM_REMOVED: Record<string, string> = {
  Date: 'a sim has no wall clock; the platform supplies the tick number, and wake() is told how much time passed',
  Intl: 'locale-dependent formatting differs between hosts, and a sim produces state rather than text',
  Promise: 'a tick is synchronous; microtask ordering against the host is not something a sim can control',
  WeakRef: 'garbage collection is observable through it, so two identical runs can disagree',
  FinalizationRegistry: 'same reason as WeakRef — it makes collection timing visible to the sim',
  Atomics: 'a zone is single-threaded; shared-memory ordering is not reproducible',
  SharedArrayBuffer: 'same reason as Atomics',
  WebAssembly: 'opaque to the determinism gate, and its float semantics are its own',
};

/**
 * Everything needed to bring a sleeping zone back exactly where it stopped.
 *
 * `draws` is the load-bearing field and the least obvious one. A zone's random stream
 * spans its whole life, starting inside `init`, so the generator's position is not in
 * the state — the state is the sim's and the stream is the platform's. Recording how
 * many numbers have been drawn is what lets a woken zone be put back on the sequence it
 * left. The CI harness reconstructs this by replaying and counting
 * (`resumeFromSnapshotWithAlignment`); a host can simply write it down, which is both
 * cheaper and exact.
 */
export interface ZoneSnapshot {
  /** Schema version of this envelope, so a stored zone can outlive a host release. */
  version: number;
  seed: number;
  tick: number;
  draws: number;
  /** The sim's own state, as JSON. Opaque to the host. */
  state: string;
  /** Wall-clock milliseconds when this was taken — the input to `wake`. */
  savedAt: number;
}

export const ZONE_SNAPSHOT_VERSION = 1;

/**
 * The seeded generator, mirroring games-repo `createSimRng`.
 *
 * mulberry32, the same one GameKit's capture mode installs over `Math.random`. Integer
 * arithmetic throughout, so it cannot drift between engines the way a float-based
 * generator could — which matters here more than anywhere, because the server and every
 * predicting client must draw the same numbers in the same order.
 */
export function createSimRng(seed: number): () => number {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Renders a state as one canonical string. Mirrors games-repo `canonicalize`.
 *
 * Keys sorted, so two routes to the same world compare equal — the server and a client
 * are allowed to arrive at the same state by different paths. Numbers through `String`,
 * whose output ECMAScript specifies exactly. `-0` kept distinct from `0`, because a
 * velocity that flipped sign is a difference. Anything that is not plain data throws by
 * name rather than being silently dropped the way `JSON.stringify` drops a function.
 */
export function canonicalize(value: unknown, path = 'state'): string {
  if (value === null) return 'null';
  const type = typeof value;
  if (type === 'boolean') return value ? 'true' : 'false';
  if (type === 'string') return JSON.stringify(value);
  if (type === 'number') {
    const number = value as number;
    if (number !== number) return 'NaN';
    if (number === Infinity) return 'Inf';
    if (number === -Infinity) return '-Inf';
    if (number === 0 && 1 / number < 0) return '-0';
    return String(number);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry, index) => canonicalize(entry, `${path}[${index}]`)).join(',')}]`;
  }
  if (type === 'object') {
    const tag = Object.prototype.toString.call(value);
    if (tag !== '[object Object]') {
      throw new Error(`sim state must be plain data, but ${path} is a ${tag.slice(8, -1)}`);
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(record[key], `${path}.${key}`)}`).join(',')}}`;
  }
  throw new Error(`sim state must be plain data, but ${path} is a ${type}`);
}

/**
 * A drift checkpoint over a canonical state string — **not** the games repo's `hashState`.
 *
 * The difference is deliberate and worth stating, because the obvious move is to reuse
 * the CI hash and it would be wrong. `hashState` is sha256 and answers "did two runs of
 * this sim in Node agree?" — it runs once per tick on a build machine and cryptographic
 * strength costs nothing there. This answers a different question: "has this browser's
 * prediction drifted from the host?" It has to be computed inside a bare realm with no
 * `crypto`, cheaply enough to run beside a 10 Hz tick, and identically in V8,
 * JavaScriptCore and SpiderMonkey.
 *
 * So it is FNV-1a over 32-bit lanes with `Math.imul`, which the spec pins to the bit.
 * A drift checkpoint is a liveness signal, not a security control — a client that forges
 * one only lies to itself, because the host's state is the one that is true.
 */
export function checksumState(canonical: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index++) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  // A second lane over the reversed string, so a transposition inside one object cannot
  // land on the same 32 bits. Sixteen hex characters is far past what a drift check
  // needs and still cheap to compute and to put on the wire.
  let tail = 0x811c9dc5;
  for (let index = canonical.length - 1; index >= 0; index--) {
    tail ^= canonical.charCodeAt(index);
    tail = Math.imul(tail, 0x01000193);
  }
  return ((hash >>> 0).toString(16).padStart(8, '0') + (tail >>> 0).toString(16).padStart(8, '0')).slice(0, 16);
}

/**
 * Reports the reasons a state could not survive a round trip through storage.
 * Mirrors games-repo `findUnstorable`.
 *
 * A snapshot is written to Firestore as JSON and read back on wake, so anything JSON
 * cannot carry is a world that quietly changes shape the first time its zone sleeps.
 */
export function findUnstorable(value: unknown, path = 'state', found: string[] = []): string[] {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return found;
  if (typeof value === 'number') {
    if (value !== value || value === Infinity || value === -Infinity) {
      found.push(`${path} is ${value !== value ? 'NaN' : String(value)}, which a JSON snapshot cannot carry`);
    }
    return found;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => findUnstorable(entry, `${path}[${index}]`, found));
    return found;
  }
  if (typeof value === 'object') {
    const tag = Object.prototype.toString.call(value);
    if (tag !== '[object Object]') {
      found.push(`${path} is a ${tag.slice(8, -1)}, which a JSON snapshot turns into something else`);
      return found;
    }
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      findUnstorable(entry, `${path}.${key}`, found);
    }
    return found;
  }
  found.push(`${path} is a ${typeof value}, which is not storable state`);
  return found;
}

/**
 * Wraps a bundled sim so its `Math` is the portable one. Mirrors games-repo
 * `wrapSimBundle`.
 *
 * esbuild emits `var __SIM_BUNDLE__ = (() => { … })()`, which inside this function
 * expression is an ordinary local. Shadowing `Math` as a parameter means an author
 * writes `Math.sin(angle)` and gets the cross-engine implementation without knowing any
 * of this exists.
 */
export function wrapSimBundle(bundleJs: string): string {
  return `(function (Math) {\n${bundleJs}\nreturn ${SIM_GLOBAL_NAME};\n})`;
}
