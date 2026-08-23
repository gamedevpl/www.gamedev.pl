import { MAX_WORLD_ENTRY_BYTES, MAX_WORLD_FIELDS, MAX_WORLD_KEY_LENGTH } from '@gamedevpl/contract';
import { createHash } from 'node:crypto';

/**
 * The typed shape of a shared world (docs/persistent-world-plan.md, phase P2).
 *
 * A world is a keyed document set that every player of one game reads and writes. That
 * makes it the first place on the platform where one player's input reaches another
 * player's screen without a human in between, which is the whole reason the platform —
 * not the game — owns the storage and the rules.
 *
 * The rules are deliberately **generic**. The server knows nothing about gardens, guild
 * halls or notice boards; it knows that a field declared `{"type":"int","min":0,"max":9}`
 * must hold an integer in that range, that text is bounded and moderated, that the first
 * writer of a key owns it, and that one player may only hold so many entries. Anything
 * beyond that is game logic, and game logic stays in the game — see the plan's option B.
 * A player who edits their own entry to claim a hundred apples will be believed, which
 * is why worlds are for cooperative play.
 *
 * The schema itself comes from the game's `GAME.json`, which reaches us through the
 * games repo — human-reviewed, but parsed here as untrusted input anyway. A malformed
 * declaration yields no world at all rather than a world with no rules: the routes 404,
 * the module reports `unavailable`, and the game stays playable. Failing open would mean
 * an unvalidated free-text field shown to strangers, which is exactly the outcome the
 * declaration exists to prevent.
 *
 * The games repo mirrors these limits in validate.ts Check 22 so an author hears about a
 * bad declaration in review. This file is the authority; that check is the early warning.
 */

/** Fields one entry may declare. More than this and it is a database, not a world. */
export { MAX_WORLD_FIELDS };
export const MAX_WORLD_TEXT_LENGTH = 240;
export const MAX_WORLD_ENUM_VALUES = 16;
/** Ceiling on what a game may set as its own per-player quota. */
export const MAX_WORLD_ENTRIES_PER_PLAYER = 64;
export { MAX_WORLD_KEY_LENGTH };
/**
 * Bytes of stored JSON for one entry's fields. Generous next to the declared field
 * limits above — it is a backstop against a pathological declaration, not the primary
 * bound, which is the per-field one.
 */
export { MAX_WORLD_ENTRY_BYTES };
/**
 * Entries in one world, across every player. A quota bounds any single griefer; this
 * bounds a popular game, and more importantly bounds the read that returns the whole
 * world to every visitor. A world larger than this needs P3's spatial partitioning
 * rather than a bigger number here.
 */
export const MAX_WORLD_ENTRIES = 2000;
/**
 * Ceiling on the tile grid a world may declare for presence (P2.5).
 *
 * This is the number that keeps ambient co-presence ambient. A game that could declare a
 * 4096×4096 grid would be reporting one player's position to every other player at
 * roughly pixel resolution, which is not "somebody is over there by the north hedge" —
 * it is a movement trace of a real person, published live to strangers, from a feature
 * nobody would have described that way. 64×64 is coarse enough that a tile is a place
 * rather than a location, and generous enough for any board a game can actually draw.
 */
export const MAX_PRESENCE_GRID = 64;

/** Keys are game-chosen (`plot.3.4`, `stall-17`) and land in a document path. */
const KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/;
const FIELD_NAME_PATTERN = /^[a-z][a-zA-Z0-9]{0,23}$/;
/** C0/C1 controls, and the bidi overrides that let text lie about its own order. */
// eslint-disable-next-line no-control-regex
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/;

export type WorldFieldSpec =
  | { type: 'text'; max: number }
  | { type: 'int'; min: number; max: number }
  | { type: 'number'; min: number; max: number }
  | { type: 'enum'; values: string[] }
  | { type: 'bool' };

/** The coordinate space presence positions are reported and clamped in. */
export interface PresenceGrid {
  cols: number;
  rows: number;
}

export interface WorldSchema {
  fields: Record<string, WorldFieldSpec>;
  maxPerPlayer: number;
  /**
   * Null for the ordinary world, which has entries but no roster.
   *
   * Presence is opt-in per world rather than on for every world, because it is the one
   * part of this system that reports something about a person *while they are still
   * there*. A world that stores what strangers built has not thereby agreed to announce
   * who is standing in it, and the difference should be a decision somebody made in a
   * reviewed manifest rather than a side effect of having a world at all.
   */
  presence: PresenceGrid | null;
}

export function isValidWorldKey(key: unknown): key is string {
  return typeof key === 'string' && key.length > 0 && key.length <= MAX_WORLD_KEY_LENGTH && KEY_PATTERN.test(key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseField(raw: unknown): WorldFieldSpec | null {
  if (!isRecord(raw)) return null;
  if (raw.type === 'bool') return { type: 'bool' };
  if (raw.type === 'text') {
    const max = raw.max;
    if (!Number.isInteger(max) || (max as number) < 1 || (max as number) > MAX_WORLD_TEXT_LENGTH) return null;
    return { type: 'text', max: max as number };
  }
  if (raw.type === 'int' || raw.type === 'number') {
    const { min, max } = raw;
    if (typeof min !== 'number' || typeof max !== 'number') return null;
    if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return null;
    if (raw.type === 'int' && (!Number.isInteger(min) || !Number.isInteger(max))) return null;
    return { type: raw.type, min, max };
  }
  if (raw.type === 'enum') {
    const values = raw.values;
    if (!Array.isArray(values) || values.length === 0 || values.length > MAX_WORLD_ENUM_VALUES) return null;
    if (!values.every((value) => typeof value === 'string' && value.length > 0 && value.length <= 32)) return null;
    if (new Set(values).size !== values.length) return null;
    return { type: 'enum', values: values as string[] };
  }
  return null;
}

/**
 * Reads a `world` block off a game's manifest. Returns null for anything it cannot make
 * complete sense of — see the note above on why a partial parse is not an option.
 */
export function parseWorldSchema(raw: unknown): WorldSchema | null {
  if (!isRecord(raw)) return null;

  const quota = raw.maxPerPlayer;
  if (!Number.isInteger(quota) || (quota as number) < 1 || (quota as number) > MAX_WORLD_ENTRIES_PER_PLAYER) {
    return null;
  }
  if (!isRecord(raw.fields)) return null;

  const names = Object.keys(raw.fields);
  if (names.length === 0 || names.length > MAX_WORLD_FIELDS) return null;

  const fields: Record<string, WorldFieldSpec> = {};
  for (const name of names) {
    if (!FIELD_NAME_PATTERN.test(name)) return null;
    const spec = parseField(raw.fields[name]);
    if (!spec) return null;
    fields[name] = spec;
  }

  // Absent is the ordinary answer and means no roster. Present-but-unparseable takes the
  // whole world down with it, exactly as a bad field spec does — see the note at the top
  // on why a partial parse is not an option. Here the stake is a little different and no
  // smaller: failing open would mean a game reporting positions into a coordinate space
  // nobody agreed to bound.
  let presence: PresenceGrid | null = null;
  if (raw.presence !== undefined) {
    presence = parsePresence(raw.presence);
    if (!presence) return null;
  }

  return { fields, maxPerPlayer: quota as number, presence };
}

function parsePresence(raw: unknown): PresenceGrid | null {
  if (!isRecord(raw)) return null;
  const { cols, rows } = raw;
  for (const size of [cols, rows]) {
    if (!Number.isInteger(size) || (size as number) < 1 || (size as number) > MAX_PRESENCE_GRID) return null;
  }
  return { cols: cols as number, rows: rows as number };
}

export type WorldEntryValidation =
  | {
      ok: true;
      /** The canonical value to store: exactly the declared fields, coerced and trimmed. */
      fields: Record<string, string | number | boolean>;
      /** Every text field's value, for the moderator. Empty when the schema has no text. */
      texts: string[];
    }
  | { ok: false; error: string };

/**
 * Checks one entry against its world's schema and returns what should be stored.
 *
 * Every declared field must be present. A partial write would leave the game rendering
 * a field that is simply missing for some entries and not others — a class of bug that
 * only appears once strangers' data is on screen, which is far too late.
 */
export function validateWorldEntry(schema: WorldSchema, raw: unknown): WorldEntryValidation {
  if (!isRecord(raw)) return { ok: false, error: 'entry fields must be an object' };

  const declared = Object.keys(schema.fields);
  for (const name of Object.keys(raw)) {
    if (!declared.includes(name)) return { ok: false, error: `unknown field "${name}"` };
  }

  const fields: Record<string, string | number | boolean> = {};
  const texts: string[] = [];

  for (const name of declared) {
    const spec = schema.fields[name];
    const value = raw[name];
    if (value === undefined || value === null) return { ok: false, error: `missing field "${name}"` };

    if (spec.type === 'bool') {
      if (typeof value !== 'boolean') return { ok: false, error: `field "${name}" must be true or false` };
      fields[name] = value;
      continue;
    }

    if (spec.type === 'text') {
      if (typeof value !== 'string') return { ok: false, error: `field "${name}" must be text` };
      const text = value.trim();
      if (text.length === 0) return { ok: false, error: `field "${name}" must not be blank` };
      if (text.length > spec.max) return { ok: false, error: `field "${name}" is longer than ${spec.max} characters` };
      // Controls and bidi overrides are never something a player typed on purpose, and
      // both are standard tools for making a string render as something it is not.
      if (UNSAFE_TEXT.test(text)) return { ok: false, error: `field "${name}" contains unsupported characters` };
      fields[name] = text;
      texts.push(text);
      continue;
    }

    if (spec.type === 'enum') {
      if (typeof value !== 'string' || !spec.values.includes(value)) {
        return { ok: false, error: `field "${name}" must be one of: ${spec.values.join(', ')}` };
      }
      fields[name] = value;
      continue;
    }

    // int / number. NaN and the infinities are excluded by isFinite, which matters:
    // both survive JSON round-trips through some clients and neither compares usefully.
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return { ok: false, error: `field "${name}" must be a number` };
    }
    if (spec.type === 'int' && !Number.isInteger(value)) {
      return { ok: false, error: `field "${name}" must be a whole number` };
    }
    if (value < spec.min || value > spec.max) {
      return { ok: false, error: `field "${name}" must be between ${spec.min} and ${spec.max}` };
    }
    fields[name] = value;
  }

  if (Buffer.byteLength(JSON.stringify(fields), 'utf8') > MAX_WORLD_ENTRY_BYTES) {
    return { ok: false, error: 'entry is too large' };
  }
  return { ok: true, fields, texts };
}

/**
 * A short handle for whoever wrote an entry, stable per player per world.
 *
 * Games get this instead of any account identity, so one can tell that three plots
 * belong to the same stranger — enough to render a neighbourhood — without learning who
 * that stranger is. Salted per world so the same player is a different tag in each,
 * which stops a game correlating its visitors against another game's world.
 *
 * Not a secret and not doing security work: uids never leave the server regardless. It
 * is a privacy default, so the obvious lazy implementation (send the uid) is not the
 * one anybody reaches for.
 */
const OWNER_TAG_SALT = 'gdp.world.ownerTag.v1';

export function worldOwnerTag(uid: string, worldId: string): string {
  return createHash('sha256').update(`${OWNER_TAG_SALT}:${worldId}:${uid}`).digest('hex').slice(0, 12);
}
