/**
 * The declared shape of an authoritative zone (docs/persistent-world-plan.md P3).
 *
 * A game that wants a server-arbitrated world declares a `zone` block in its `GAME.json`
 * naming its tick rate, its seat count, and — the load-bearing part — the vocabulary of
 * events a client may send. The server accepts nothing outside that vocabulary, which is
 * the same stance P2's world schema takes for entries: generic validation of a declared
 * shape, with no knowledge of what the events mean.
 *
 * The games repo mirrors these limits in `tools/validate.ts` Check 23 and
 * `tools/lib/sim-contract.ts`, so an author hears about a bad declaration in review.
 * This file is the authority; that check is the early warning. Both must move together.
 *
 * A declaration that does not fully parse yields **no zone at all**, not a zone with the
 * good inputs and no rules for the bad ones. That is the P2 lesson repeated: failing open
 * here would mean an undeclared event kind reaching a sim the platform is arbitrating
 * with, which is the exact outcome the declaration exists to prevent.
 */

import { MAX_PLAYERS_PER_ZONE, RESERVED_EVENT_KINDS, TICK_HZ_VALUES, type TickHz } from './contract.js';

/** Mirrors games-repo `MAX_ZONE_INPUT_KINDS` in validate.ts Check 23. */
export const MAX_ZONE_INPUT_KINDS = 12;
export const MAX_ZONE_ENUM_VALUES = 16;
export const MAX_ZONE_ENUM_VALUE_LENGTH = 16;

const KIND_PATTERN = /^[a-z][a-zA-Z0-9]{0,15}$/;
const ENUM_VALUE_PATTERN = /^[a-zA-Z0-9_-]{1,16}$/;

export type ZoneInputSpec =
  | { k: string; type: 'none' }
  | { k: string; type: 'int'; min: number; max: number }
  | { k: string; type: 'enum'; values: string[] };

export interface ZoneSchema {
  tickHz: TickHz;
  maxPlayers: number;
  inputs: ZoneInputSpec[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseInputSpec(raw: unknown, seen: Set<string>): ZoneInputSpec | null {
  if (!isRecord(raw)) return null;
  const kind = raw.k;
  if (typeof kind !== 'string' || !KIND_PATTERN.test(kind)) return null;
  if (RESERVED_EVENT_KINDS.some((reserved) => reserved === kind)) return null;
  if (seen.has(kind)) return null;
  seen.add(kind);

  if (raw.type === 'none') return { k: kind, type: 'none' };

  if (raw.type === 'int') {
    const { min, max } = raw;
    if (typeof min !== 'number' || typeof max !== 'number') return null;
    if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) return null;
    // Bounded so a declared range cannot itself be the attack: an int input is a
    // discrete choice (a lane, a card, a direction), and a sim handed 2^53 has been
    // handed something its author never sized for.
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)) return null;
    return { k: kind, type: 'int', min, max };
  }

  if (raw.type === 'enum') {
    const values = raw.values;
    if (!Array.isArray(values) || values.length === 0 || values.length > MAX_ZONE_ENUM_VALUES) return null;
    const unique = new Set<string>();
    for (const value of values) {
      if (typeof value !== 'string' || !ENUM_VALUE_PATTERN.test(value)) return null;
      if (unique.has(value)) return null;
      unique.add(value);
    }
    return { k: kind, type: 'enum', values: [...values] as string[] };
  }

  return null;
}

/** Parses a `GAME.json` `zone` block. Null for anything that does not fully check out. */
export function parseZoneSchema(raw: unknown): ZoneSchema | null {
  if (!isRecord(raw)) return null;

  const tickHz = TICK_HZ_VALUES.find((hz) => hz === raw.tickHz);
  if (tickHz === undefined) return null;

  const maxPlayers = raw.maxPlayers;
  if (typeof maxPlayers !== 'number' || !Number.isInteger(maxPlayers)) return null;
  if (maxPlayers < 1 || maxPlayers > MAX_PLAYERS_PER_ZONE) return null;

  const inputs = raw.inputs;
  if (!Array.isArray(inputs) || inputs.length === 0 || inputs.length > MAX_ZONE_INPUT_KINDS) return null;

  const seen = new Set<string>();
  const parsed: ZoneInputSpec[] = [];
  for (const entry of inputs) {
    const spec = parseInputSpec(entry, seen);
    if (!spec) return null;
    parsed.push(spec);
  }

  return { tickHz, maxPlayers, inputs: parsed };
}

/**
 * Coerces one client-sent event to a value the sim may legally receive, or null.
 *
 * This is the server edge of "the server accepts nothing outside the declared
 * vocabulary". It runs on the zone host for every input from every client, so it is
 * written to be cheap and to have exactly one way of saying no.
 *
 * Note what it does *not* do: it never clamps. An out-of-range int is rejected, not
 * pulled to the nearest bound — a client that sent 999 for a 0–8 lane meant something,
 * and quietly turning that into 8 would make the sim act on an intent nobody had. The
 * same reasoning as the world schema's field validation, which also refuses rather than
 * repairs.
 */
export function validateZoneInput(
  schema: ZoneSchema,
  kind: unknown,
  value: unknown,
): { k: string; v?: number | string } | null {
  if (typeof kind !== 'string') return null;
  const spec = schema.inputs.find((candidate) => candidate.k === kind);
  if (!spec) return null;

  if (spec.type === 'none') {
    // A value on a valueless kind is refused rather than dropped: it means the client
    // and the declaration disagree about what this event is, and guessing which of them
    // is right is how a sim ends up fed something its author never wrote a branch for.
    return value === undefined ? { k: spec.k } : null;
  }

  if (spec.type === 'int') {
    if (typeof value !== 'number' || !Number.isInteger(value)) return null;
    if (value < spec.min || value > spec.max) return null;
    return { k: spec.k, v: value };
  }

  return typeof value === 'string' && spec.values.includes(value) ? { k: spec.k, v: value } : null;
}
