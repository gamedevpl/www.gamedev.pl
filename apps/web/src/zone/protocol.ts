/**
 * Wire + bridge protocol for authoritative real-time zones
 * (docs/persistent-world-plan.md P3, docs/p3-zone-host-infra.md).
 *
 * Two channels meet here, exactly as they do for party mode:
 *  - the WEBSOCKET to the zone host, which owns the authoritative simulation;
 *  - the POSTMESSAGE bridge into the sandboxed game iframe, which predicts with it.
 *
 * The game never touches either. It runs in `sandbox="allow-scripts"` with a CSP that
 * has no `connect-src`, so the socket lives out here in the trusted shell and the game
 * reaches it only through typed, size-capped bridge messages. That invariant is the
 * whole reason this file exists in `apps/web` rather than in the games repo.
 *
 * ## What travels down: snapshots, and events as deltas
 *
 * The obvious design is to diff the state and send the difference. This does not, for a
 * reason that only holds because of the sim contract: **every client runs the same
 * deterministic `sim.ts` the server arbitrates with**, so the events the server applied
 * to a tick are sufficient to reproduce that tick's state exactly. A delta is therefore
 * the authoritative event list — usually empty, occasionally a handful of tiny objects —
 * rather than a state diff, which would be larger, would need a diff format the contract
 * does not define, and would let the shell grow opinions about the shape of game state.
 *
 * A snapshot is the fallback and the entry point: it is sent on join, and again whenever
 * a client says it has lost the thread. Between them the server periodically attaches a
 * state hash to a delta, so a client that has drifted finds out within a second or two
 * instead of playing an increasingly private version of the world.
 *
 * ## What travels up: declared inputs, and nothing else
 *
 * A client sends event *kinds*, never a slot — the server tags every event with the slot
 * it arrived on, because a client that could name its own slot could act as another
 * player. `join` and `leave` are reserved for the same reason (games-repo
 * `sim-contract.ts` `RESERVED_EVENT_KINDS`): arrivals and departures are facts the
 * server knows and the sim is told, not claims a client may make.
 *
 * State is carried as an opaque JSON *string* in both directions. That is the P1 save
 * lesson applied again: the thing measured is then the thing stored and forwarded, and
 * the shell never has to have an opinion about a shape that belongs to the game.
 */

import { ZONE_PROTOCOL_VERSION } from '@gamedevpl/contract';
export { ZONE_PROTOCOL_VERSION };

/** Bridge namespace, shared with every other bridge so a game's own traffic can't pose as ours. */
export { BRIDGE_NAMESPACE } from '../mp/protocol.js';

/** Mirrors games-repo `sim-contract.ts` `RESERVED_EVENT_KINDS`. */
export const RESERVED_EVENT_KINDS = ['join', 'leave'] as const;

/** Mirrors games-repo `MAX_PLAYERS_PER_ZONE`. */
export const MAX_PLAYERS_PER_ZONE = 16;

/** Mirrors games-repo `TICK_HZ_VALUES`. */
export const TICK_HZ_VALUES = [5, 10, 15, 20] as const;

/**
 * Mirrors games-repo `MAX_STATE_BYTES`, with the same job it has there: a snapshot
 * shares a Firestore document with the event log. Checked on the way into the frame so
 * a host that somehow oversends cannot make the game's `JSON.parse` the place it fails.
 */
export const MAX_STATE_BYTES = 192 * 1024;

/**
 * Longest an input kind may be, matching the games-repo validator's 16-character rule
 * for `zone.inputs[].k`. A kind longer than the server can possibly accept is dropped at
 * the bridge rather than spent on a frame.
 */
export const MAX_INPUT_KIND_LENGTH = 16;

/** Longest a string input value may be — enum values are declared short by Check 23. */
const MAX_INPUT_VALUE_LENGTH = 32;

/**
 * Inputs a client may send per second before the host disconnects it.
 *
 * Above the fastest tick rate the contract allows (20 Hz) with room for a burst, and
 * well under party mode's 40: a zone input is a discrete intent ("step north"), not a
 * key-state stream, so a client sending more than a couple per tick is either broken or
 * trying something.
 */
export const MAX_INPUTS_PER_SECOND = 30;

/** One event in the ordered stream a tick is fed. Slots are assigned by the host. */
export interface ZoneEvent {
  slot: number;
  k: string;
  v?: number | string | boolean;
}

export interface ZoneRosterEntry {
  slot: number;
  /** Present for signed-in players who chose one; always already moderated server-side. */
  nick: string | null;
}

/** A frame from the zone host. Hostile until parsed. */
export type ZoneServerFrame =
  | {
      t: 'welcome';
      slot: number;
      zone: string;
      slug: string;
      tickHz: number;
      maxPlayers: number;
    }
  /**
   * The authoritative state at `tick`. `draws` is how many numbers the zone's generator
   * has produced up to and including that tick — the one part of the generator's
   * position a snapshot cannot record, and what lets a client seed a predictor that
   * lands on the same sequence the host is on (games-repo
   * `resumeFromSnapshotWithAlignment`).
   */
  | { t: 'snap'; tick: number; seed: number; draws: number; state: string }
  /** The events the host applied at `tick`. `h` is a checkpoint hash when present. */
  | { t: 'delta'; tick: number; ev: ZoneEvent[]; h?: string }
  | { t: 'roster'; slots: ZoneRosterEntry[] }
  | { t: 'closed'; reason: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSlot(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < MAX_PLAYERS_PER_ZONE;
}

function isTick(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isInputKind(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_INPUT_KIND_LENGTH;
}

/**
 * Narrows one event out of a delta.
 *
 * `join` and `leave` are accepted *here* and refused on the way up: downward they are
 * the host telling the sim who arrived, which is exactly what the reserved kinds are
 * for. Upward they would be a client claiming it.
 */
function parseEvent(raw: unknown): ZoneEvent | null {
  if (!isObject(raw) || !isSlot(raw.slot) || !isInputKind(raw.k)) return null;
  if (raw.v === undefined) return { slot: raw.slot, k: raw.k };
  if (typeof raw.v === 'number') {
    return Number.isFinite(raw.v) ? { slot: raw.slot, k: raw.k, v: raw.v } : null;
  }
  if (typeof raw.v === 'string') {
    return raw.v.length <= MAX_INPUT_VALUE_LENGTH ? { slot: raw.slot, k: raw.k, v: raw.v } : null;
  }
  if (typeof raw.v === 'boolean') return { slot: raw.slot, k: raw.k, v: raw.v };
  return null;
}

/**
 * Narrows a whole delta's event list.
 *
 * All-or-nothing on purpose. Dropping one malformed event and keeping the rest would
 * hand the sim a tick the host never ran, and the client would then diverge silently —
 * a desync is recoverable, a *quietly wrong* world is not. A null here makes the client
 * ask for a snapshot instead.
 */
function parseEvents(raw: unknown): ZoneEvent[] | null {
  if (!Array.isArray(raw)) return null;
  // A tick's events are bounded by the roster and the per-second input cap; far more
  // than this is not a zone doing its job.
  if (raw.length > MAX_PLAYERS_PER_ZONE * 4) return null;
  const events: ZoneEvent[] = [];
  for (const entry of raw) {
    const event = parseEvent(entry);
    if (!event) return null;
    events.push(event);
  }
  return events;
}

function parseRoster(raw: unknown): ZoneRosterEntry[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_PLAYERS_PER_ZONE) return null;
  const slots: ZoneRosterEntry[] = [];
  for (const entry of raw) {
    if (!isObject(entry) || !isSlot(entry.slot)) return null;
    slots.push({ slot: entry.slot, nick: typeof entry.nick === 'string' ? entry.nick : null });
  }
  return slots;
}

/** Narrows one host frame. Returns null for anything unrecognized — never throws. */
export function parseZoneServerFrame(raw: unknown): ZoneServerFrame | null {
  if (!isObject(raw) || raw.v !== ZONE_PROTOCOL_VERSION) return null;

  switch (raw.t) {
    case 'welcome': {
      const maxPlayers = raw.maxPlayers;
      const legalMax =
        typeof maxPlayers === 'number' &&
        Number.isInteger(maxPlayers) &&
        maxPlayers >= 1 &&
        maxPlayers <= MAX_PLAYERS_PER_ZONE;
      if (!isSlot(raw.slot) || typeof raw.zone !== 'string' || typeof raw.slug !== 'string' || !legalMax) return null;
      const tickHz = TICK_HZ_VALUES.find((hz) => hz === raw.tickHz);
      if (tickHz === undefined) return null;
      return { t: 'welcome', slot: raw.slot, zone: raw.zone, slug: raw.slug, tickHz, maxPlayers };
    }
    case 'snap': {
      if (!isTick(raw.tick) || typeof raw.state !== 'string') return null;
      if (typeof raw.seed !== 'number' || !Number.isInteger(raw.seed)) return null;
      if (!isTick(raw.draws)) return null;
      // Measured before the game sees it, for the same reason the save bridge measures
      // a save: past the contract's ceiling this is not a state the host could have
      // legitimately produced, and handing it on would make the game's JSON.parse the
      // place a too-large world fails.
      if (raw.state.length > MAX_STATE_BYTES) return null;
      return { t: 'snap', tick: raw.tick, seed: raw.seed, draws: raw.draws, state: raw.state };
    }
    case 'delta': {
      if (!isTick(raw.tick)) return null;
      const events = parseEvents(raw.ev);
      if (!events) return null;
      const hash = typeof raw.h === 'string' && /^[a-f0-9]{1,64}$/.test(raw.h) ? raw.h : undefined;
      return hash ? { t: 'delta', tick: raw.tick, ev: events, h: hash } : { t: 'delta', tick: raw.tick, ev: events };
    }
    case 'roster': {
      const slots = parseRoster(raw.slots);
      return slots ? { t: 'roster', slots } : null;
    }
    case 'closed':
      return { t: 'closed', reason: typeof raw.reason === 'string' ? raw.reason : 'closed' };
    default:
      return null;
  }
}

/**
 * A message coming OUT of the game iframe. Hostile by assumption — this is generated
 * code the platform deliberately does not audit (docs/security-model.md).
 */
export type ZoneBridgeMessage =
  /** The game announces it wants the zone for its slug. Nothing happens before this. */
  | { t: 'zone:hello' }
  /** One declared input. No slot: the host tags it with the one it arrived on. */
  | { t: 'zone:send'; k: string; d?: number | string | boolean }
  /** The game believes it has lost the thread and wants a fresh snapshot. */
  | { t: 'zone:resync' };

/**
 * Narrows one message out of the game frame.
 *
 * The value field is `d`, not `v`, on every *flat* frame — bridge and upward wire alike.
 * Every frame already carries `v` as the protocol version, so an input whose value
 * happened to be a string would overwrite it and be dropped as a version mismatch. Party
 * mode learned this on a key-release of 0; a zone would have learned it on the first
 * enum input, which is worse because it would have looked like an intermittent desync.
 *
 * Inside a `delta` the events keep `v`, because there they are nested objects with no
 * version field of their own — and that is also the shape `sim-contract.ts` defines, so
 * the sim receives exactly what it expects without the shell rewriting anything.
 */
export function parseZoneBridgeMessage(raw: unknown, namespace: string): ZoneBridgeMessage | null {
  if (!isObject(raw) || raw.ns !== namespace || raw.v !== ZONE_PROTOCOL_VERSION) return null;
  if (raw.t === 'zone:hello') return { t: 'zone:hello' };
  if (raw.t === 'zone:resync') return { t: 'zone:resync' };
  if (raw.t === 'zone:send') {
    if (!isInputKind(raw.k)) return null;
    // The one rule the shell enforces about *which* events may go up. The rest — is this
    // kind declared, is this enum value legal — is the host's job, where a modified
    // client cannot reach it. This one is here as well because it is not a validity
    // question but an authority one: a client that could send `join` could conjure a
    // player, and a client that could send `leave` could evict one.
    if (RESERVED_EVENT_KINDS.some((reserved) => reserved === raw.k)) return null;
    if (raw.d === undefined) return { t: 'zone:send', k: raw.k };
    if (typeof raw.d === 'number') return Number.isFinite(raw.d) ? { t: 'zone:send', k: raw.k, d: raw.d } : null;
    if (typeof raw.d === 'string') {
      return raw.d.length <= MAX_INPUT_VALUE_LENGTH ? { t: 'zone:send', k: raw.k, d: raw.d } : null;
    }
    if (typeof raw.d === 'boolean') return { t: 'zone:send', k: raw.k, d: raw.d };
    return null;
  }
  return null;
}

/**
 * The websocket URL for a zone host.
 *
 * Takes the host origin from the admission response rather than deriving it, because
 * the zone host is a *separate service on its own origin*
 * (docs/p3-zone-host-infra.md) — and because that is the seam the zone directory slots
 * into when one instance stops being enough: the API answers "zone Z lives at U" and
 * the shell dials U, with nothing here to change.
 */
export function zoneSocketUrl(hostUrl: string): string {
  return `${hostUrl.replace(/\/+$/, '').replace(/^http/, 'ws')}/zone/ws`;
}
