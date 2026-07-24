/**
 * Wire + bridge protocol for multiplayer party sessions (docs/multiplayer-plan.md).
 *
 * Two channels meet in this app:
 *  - the WEBSOCKET to our room relay, carrying controller input from phones;
 *  - the POSTMESSAGE bridge into the sandboxed game iframe.
 *
 * Both carry untrusted data (a guest's phone on one side, generated game code on
 * the other), so every frame is narrowed by the guards below before it is used.
 */

export const PROTOCOL_VERSION = 1;
/** Namespace on the bridge, so a game's own postMessage traffic can't be confused for ours. */
export const BRIDGE_NAMESPACE = 'gdp';

export const INPUT_KEYS = ['up', 'down', 'left', 'right', 'a'] as const;
export type InputKey = (typeof INPUT_KEYS)[number];

export type RoomPhase = 'lobby' | 'playing' | 'ended';

export interface RosterSlot {
  slot: number;
  color: string;
  nick: string | null;
  connected: boolean;
}

export type ServerFrame =
  | { t: 'ready'; code: string; slug: string; phase: RoomPhase }
  | { t: 'welcome'; slot: number; color: string; nick: string; phase: RoomPhase }
  | { t: 'roster'; slots: RosterSlot[] }
  | { t: 'input'; slot: number; k: InputKey; d: 0 | 1 }
  | { t: 'phase'; phase: RoomPhase }
  | { t: 'closed'; reason: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPhase(value: unknown): value is RoomPhase {
  return value === 'lobby' || value === 'playing' || value === 'ended';
}

function isInputKey(value: unknown): value is InputKey {
  return INPUT_KEYS.some((key) => key === value);
}

function parseRoster(value: unknown): RosterSlot[] | null {
  if (!Array.isArray(value)) return null;
  const slots: RosterSlot[] = [];
  for (const entry of value) {
    if (!isObject(entry) || typeof entry.slot !== 'number') return null;
    slots.push({
      slot: entry.slot,
      color: typeof entry.color === 'string' ? entry.color : '#00e4ac',
      nick: typeof entry.nick === 'string' ? entry.nick : null,
      connected: entry.connected === true,
    });
  }
  return slots;
}

/** Narrows one relay frame. Returns null for anything unrecognized — never throws. */
export function parseServerFrame(raw: unknown): ServerFrame | null {
  if (!isObject(raw) || raw.v !== PROTOCOL_VERSION) return null;

  switch (raw.t) {
    case 'ready':
      return typeof raw.code === 'string' && typeof raw.slug === 'string' && isPhase(raw.phase)
        ? { t: 'ready', code: raw.code, slug: raw.slug, phase: raw.phase }
        : null;
    case 'welcome':
      return typeof raw.slot === 'number' && typeof raw.color === 'string' && isPhase(raw.phase)
        ? {
            t: 'welcome',
            slot: raw.slot,
            color: raw.color,
            nick: typeof raw.nick === 'string' ? raw.nick : '',
            phase: raw.phase,
          }
        : null;
    case 'roster': {
      const slots = parseRoster(raw.slots);
      return slots ? { t: 'roster', slots } : null;
    }
    case 'input':
      // `d` carries the key state; `v` is the protocol version on every frame.
      return typeof raw.slot === 'number' && isInputKey(raw.k) && (raw.d === 0 || raw.d === 1)
        ? { t: 'input', slot: raw.slot, k: raw.k, d: raw.d }
        : null;
    case 'phase':
      return isPhase(raw.phase) ? { t: 'phase', phase: raw.phase } : null;
    case 'closed':
      return { t: 'closed', reason: typeof raw.reason === 'string' ? raw.reason : 'closed' };
    default:
      return null;
  }
}

/** A message coming OUT of the game iframe. Hostile by assumption. */
export type GameBridgeMessage = { t: 'hello'; slots: number } | { t: 'phase'; phase: RoomPhase };

export function parseGameBridgeMessage(raw: unknown): GameBridgeMessage | null {
  if (!isObject(raw) || raw.ns !== BRIDGE_NAMESPACE || raw.v !== PROTOCOL_VERSION) return null;
  if (raw.t === 'hello') {
    // A game claiming a silly slot count must not size our UI.
    const slots = typeof raw.slots === 'number' && raw.slots >= 1 && raw.slots <= 8 ? raw.slots : 1;
    return { t: 'hello', slots };
  }
  if (raw.t === 'phase' && isPhase(raw.phase)) {
    return { t: 'phase', phase: raw.phase };
  }
  return null;
}

/**
 * The websocket URL for the relay. In production the API is same-origin; in dev
 * VITE_API_BASE_URL points at the separate Fastify port.
 */
export function roomSocketUrl(): string {
  const base = import.meta.env.VITE_API_BASE_URL;
  const origin = base && base.length > 0 ? base : window.location.origin;
  return `${origin.replace(/^http/, 'ws')}/api/mp/ws`;
}
